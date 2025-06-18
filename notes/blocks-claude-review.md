Claude 4 sonnet's initial review of [Gemini's implementation plan](blocks.md)

---

# **Revised Implementation Plan: Notion-like Chat Interface**

## **Major Issues with Original Plan**

### **Tech Stack Mismatches (CRITICAL)**

- ❌ **Uses Convex instead of tRPC + Prisma + PostgreSQL**
- ❌ **Uses OpenAI package instead of Vercel AI SDK**
- ❌ **Uses npm instead of pnpm**
- ❌ **Ignores Better Auth integration**
- ❌ **No consideration of existing shadcn/ui components**

### **Architecture Issues**

- ❌ **No server/client component strategy for Next.js 15**
- ❌ **Missing tRPC integration patterns**
- ❌ **No user authentication considerations**
- ❌ **Ignores existing file structure**

---

## **Project Goal: The "Living Document" AI Chat App**

Build a Notion-like chat interface where the conversation is a mutable document. Users can edit any block, insert new prompts anywhere, and perform AI actions (like summarization) on selections of blocks.

### **Core Architectural Decisions (Corrected)**

1. **One Editor per Block:** Each chat entry (`ChatBlock`) will contain its own Tiptap editor instance ✅ _This is good_
2. **Server-Side Parsing:** The AI generates Markdown, parsed server-side via tRPC actions into Tiptap JSON ✅ _Concept good, but needs tRPC implementation_
3. **Fractional Indexing:** Use floating-point `order` field in Prisma schema ✅ _Good approach_
4. **Streaming via Vercel AI SDK:** Use `streamText` with proper React integration ⚠️ _Original mentioned wrong streaming approach_

---

## **Phase 0: Foundation & Setup (1 Hour)**

### **Install Dependencies**

```bash
# Tiptap for rich text editing
pnpm add @tiptap/react @tiptap/core @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/html

# Server-side Markdown parsing (since we can't use jsdom in edge runtime)
pnpm add remark remark-html remark-parse

# Client-side utilities
pnpm add react-markdown gpt-tokenizer

# Development dependencies
pnpm add -D @types/marked
```

**⚠️ CORRECTION:** Original plan used `marked` + `jsdom` which won't work in Vercel's Edge Runtime. Using `remark` instead.

### **Updated File Structure**

```
/src/app/
  /chat/
    page.tsx                 # Main chat interface
/src/components/
  /chat/
    ChatBlock.tsx           # Individual block component
    ActionBar.tsx           # Multi-select actions
    TokenCounter.tsx        # Token usage display
/src/server/api/routers/
  blocks.ts                 # tRPC router for blocks
  ai.ts                     # tRPC router for AI operations
/src/lib/
  /markdown/
    parser.ts               # Server-side Markdown → Tiptap JSON
/src/hooks/
  useTokenizer.ts           # Client-side token counting
```

---

## **Phase 1: Database Schema & Core Logic (3-4 Hours)**

### **1. Extend Prisma Schema**

```prisma
// Add to prisma/schema.prisma

model ChatBlock {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  author    BlockAuthor

  // Rich content in Tiptap JSON format
  content   Json?

  // Temporary streaming content (Markdown)
  streamingContent String?

  // Fractional indexing for order
  order     Float

  // Exclude from AI context
  isExcluded Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("chat_block")
}

enum BlockAuthor {
  user
  ai
}

// Add to User model:
model User {
  // ... existing fields
  chatBlocks ChatBlock[]
}
```

**⚠️ CORRECTION:** Original ignored user authentication. This integrates with Better Auth.

### **2. Create Markdown Parser (`src/lib/markdown/parser.ts`)**

```typescript
// src/lib/markdown/parser.ts
import { remark } from "remark";
import remarkHtml from "remark-html";
import { generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";

const extensions = [StarterKit.configure({ heading: false })];

/**
 * Converts Markdown to Tiptap JSON (server-side safe)
 */
export async function markdownToTiptapJson(markdown: string) {
  // Convert Markdown to HTML using remark (works in Edge Runtime)
  const result = await remark()
    .use(remarkHtml, { sanitize: false })
    .process(markdown);

  const html = result.toString();

  // Parse HTML to Tiptap JSON (this works without DOM)
  return generateJSON(html, extensions);
}
```

**⚠️ CORRECTION:** Original used `jsdom` which doesn't work in Vercel Edge Runtime. Using `remark` instead.

### **3. Create tRPC Blocks Router (`src/server/api/routers/blocks.ts`)**

```typescript
// src/server/api/routers/blocks.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { markdownToTiptapJson } from "~/lib/markdown/parser";

export const blocksRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.chatBlock.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { order: "asc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        prevOrder: z.number().optional(),
        nextOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let newOrder: number;
      if (input.prevOrder != null && input.nextOrder != null) {
        newOrder = (input.prevOrder + input.nextOrder) / 2;
      } else if (input.prevOrder != null) {
        newOrder = input.prevOrder + 1;
      } else if (input.nextOrder != null) {
        newOrder = input.nextOrder - 1;
      } else {
        newOrder = 1;
      }

      return ctx.db.chatBlock.create({
        data: {
          userId: ctx.session.user.id,
          author: "user",
          content: { type: "doc", content: [{ type: "paragraph" }] },
          order: newOrder,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatBlock.update({
        where: {
          id: input.id,
          userId: ctx.session.user.id, // Security: users can only update their blocks
        },
        data: { content: input.content },
      });
    }),

  toggleExclusion: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        isExcluded: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chatBlock.update({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
        data: { isExcluded: input.isExcluded },
      });
    }),
});
```

**⚠️ CORRECTION:** Original used Convex mutations. This uses tRPC with proper authentication checks.

### **4. Update tRPC Root Router (`src/server/api/root.ts`)**

```typescript
// Add to existing root.ts
import { blocksRouter } from "~/server/api/routers/blocks";

export const appRouter = createTRPCRouter({
  // ... existing routers
  blocks: blocksRouter,
});
```

---

## **Phase 2: Core UI & User Interaction (5-6 Hours)**

### **1. Create ChatBlock Component (`src/components/chat/ChatBlock.tsx`)**

```typescript
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { api } from "~/lib/trpc/client";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { EyeOff, Eye } from "lucide-react";
import { cn } from "~/lib/utils";
import ReactMarkdown from "react-markdown";
import { useDebounce } from "~/hooks/useDebounce";
import { useEffect } from "react";

type ChatBlockProps = {
  block: {
    id: string;
    author: "user" | "ai";
    content?: any;
    streamingContent?: string;
    isExcluded: boolean;
  };
  isSelected: boolean;
  onSelect: (id: string) => void;
  isStreaming?: boolean;
};

export function ChatBlock({
  block,
  isSelected,
  onSelect,
  isStreaming = false,
}: ChatBlockProps) {
  const utils = api.useUtils();
  const updateBlock = api.blocks.update.useMutation({
    onSuccess: () => utils.blocks.getAll.invalidate(),
  });
  const toggleExclusion = api.blocks.toggleExclusion.useMutation({
    onSuccess: () => utils.blocks.getAll.invalidate(),
  });

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false })],
    content: block.content,
    editable: !isStreaming,
    onUpdate: ({ editor }) => {
      // Debounced save to avoid excessive API calls
      debouncedSave(editor.getJSON());
    },
  });

  const debouncedSave = useDebounce((content: any) => {
    updateBlock.mutate({ id: block.id, content });
  }, 1000);

  // Update editor content when block changes (for streaming)
  useEffect(() => {
    if (editor && block.content && !isStreaming) {
      editor.commands.setContent(block.content);
    }
  }, [editor, block.content, isStreaming]);

  if (isStreaming && block.streamingContent) {
    return (
      <div className="relative group p-4 my-2 border rounded-lg bg-blue-50 animate-pulse">
        <ReactMarkdown className="prose prose-sm max-w-none">
          {block.streamingContent + "▍"}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative group p-4 my-2 border rounded-lg transition-all",
        isSelected && "border-blue-500 ring-2 ring-blue-500",
        block.isExcluded && "opacity-40 bg-gray-50"
      )}
    >
      <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(block.id)}
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          toggleExclusion.mutate({
            id: block.id,
            isExcluded: !block.isExcluded,
          })
        }
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {block.isExcluded ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </Button>

      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none focus:outline-none"
      />
    </div>
  );
}
```

**⚠️ CORRECTION:** Uses shadcn/ui components, tRPC hooks, and proper debouncing instead of `onBlur`.

### **2. Create Main Chat Page (`src/app/chat/page.tsx`)**

```typescript
// src/app/chat/page.tsx
"use client";

import { useState } from "react";
import { api } from "~/lib/trpc/client";
import { ChatBlock } from "~/components/chat/ChatBlock";
import { ActionBar } from "~/components/chat/ActionBar";
import { TokenCounter } from "~/components/chat/TokenCounter";
import { Button } from "~/components/ui/button";
import { Plus } from "lucide-react";

export default function ChatPage() {
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    new Set()
  );

  const { data: blocks = [] } = api.blocks.getAll.useQuery();
  const createBlock = api.blocks.create.useMutation({
    onSuccess: () => utils.blocks.getAll.invalidate(),
  });
  const utils = api.useUtils();

  const handleSelectBlock = (blockId: string) => {
    setSelectedBlockIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(blockId)) {
        newSet.delete(blockId);
      } else {
        newSet.add(blockId);
      }
      return newSet;
    });
  };

  const handleInsertBlock = (prevOrder?: number, nextOrder?: number) => {
    createBlock.mutate({ prevOrder, nextOrder });
  };

  return (
    <div className="max-w-4xl mx-auto p-8 pb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Living Document Chat</h1>
        <TokenCounter blocks={blocks} />
      </div>

      {blocks.map((block, index) => {
        const prevOrder = index === 0 ? undefined : blocks[index - 1]?.order;
        const nextOrder = block.order;

        return (
          <div key={block.id} className="group relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleInsertBlock(prevOrder, nextOrder)}
              className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Plus className="w-4 h-4" />
            </Button>

            <ChatBlock
              block={block}
              isSelected={selectedBlockIds.has(block.id)}
              onSelect={handleSelectBlock}
            />
          </div>
        );
      })}

      <ActionBar
        selectedIds={selectedBlockIds}
        blocks={blocks}
        onClear={() => setSelectedBlockIds(new Set())}
      />
    </div>
  );
}
```

**⚠️ CORRECTION:** Uses tRPC instead of Convex, proper TypeScript types, and shadcn/ui components.

---

## **Phase 3: AI Integration with Vercel AI SDK (6-7 Hours)**

### **1. Create AI Router (`src/server/api/routers/ai.ts`)**

```typescript
// src/server/api/routers/ai.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai"; // or google, etc.
import { markdownToTiptapJson } from "~/lib/markdown/parser";

const BLOCK_SEPARATOR = "\n---BLOCK_SEPARATOR---\n";

export const aiRouter = createTRPCRouter({
  // Stream a single AI response
  streamResponse: protectedProcedure
    .input(
      z.object({
        prompt: z.string(),
        context: z.string(),
        insertAfterOrder: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Create streaming block first
      const streamingBlock = await ctx.db.chatBlock.create({
        data: {
          userId: ctx.session.user.id,
          author: "ai",
          streamingContent: "",
          order: input.insertAfterOrder + 0.5,
        },
      });

      // Note: This would need to be implemented with proper streaming
      // See Phase 3.2 for the actual streaming implementation
      return { blockId: streamingBlock.id };
    }),

  // Summarize multiple blocks
  summarizeBlocks: protectedProcedure
    .input(
      z.object({
        blockIds: z.array(z.string()),
        replaceOrder: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get blocks to summarize
      const blocksToSummarize = await ctx.db.chatBlock.findMany({
        where: {
          id: { in: input.blockIds },
          userId: ctx.session.user.id,
        },
      });

      const contentToSummarize = blocksToSummarize
        .map((block) => JSON.stringify(block.content))
        .join("\n\n");

      const systemPrompt = `You are an expert technical summarizer. Break down the content into logical sections and use the delimiter ${BLOCK_SEPARATOR} between distinct sections.`;

      const { text } = await streamText({
        model: openai("gpt-4-turbo"),
        system: systemPrompt,
        prompt: contentToSummarize,
      });

      const fullText = await text;
      const sections = fullText.split(BLOCK_SEPARATOR).filter(Boolean);

      // Delete original blocks and create new ones atomically
      await ctx.db.$transaction(async (tx) => {
        // Delete selected blocks
        await tx.chatBlock.deleteMany({
          where: {
            id: { in: input.blockIds },
            userId: ctx.session.user.id,
          },
        });

        // Create new summarized blocks
        for (let i = 0; i < sections.length; i++) {
          const content = await markdownToTiptapJson(sections[i]!.trim());
          await tx.chatBlock.create({
            data: {
              userId: ctx.session.user.id,
              author: "ai",
              content,
              order: input.replaceOrder + i * 0.1,
            },
          });
        }
      });
    }),
});
```

**⚠️ CORRECTION:** Uses Vercel AI SDK instead of OpenAI directly, integrates with Prisma transactions for atomicity.

### **2. Implement Streaming with Server Actions**

```typescript
// src/app/chat/actions.ts
"use server";

import { streamText } from "ai";
import { createStreamableValue } from "ai/rsc";
import { openai } from "@ai-sdk/openai";
import { auth } from "~/lib/auth/server";
import { db } from "~/server/db";
import { markdownToTiptapJson } from "~/lib/markdown/parser";

export async function streamAiResponse(
  prompt: string,
  context: string,
  insertAfterOrder: number
) {
  const session = await auth.api.getSession();
  if (!session) throw new Error("Unauthorized");

  // Create streaming block
  const streamingBlock = await db.chatBlock.create({
    data: {
      userId: session.user.id,
      author: "ai",
      streamingContent: "",
      order: insertAfterOrder + 0.5,
    },
  });

  const stream = createStreamableValue("");

  (async () => {
    let fullContent = "";

    const { textStream } = await streamText({
      model: openai("gpt-4-turbo"),
      system: "You are a helpful AI assistant. Respond in markdown format.",
      prompt: `Context: ${context}\n\nUser: ${prompt}`,
    });

    for await (const delta of textStream) {
      fullContent += delta;

      // Update streaming content
      await db.chatBlock.update({
        where: { id: streamingBlock.id },
        data: { streamingContent: fullContent },
      });

      stream.update(delta);
    }

    // Finalize: convert to Tiptap JSON
    const tiptapContent = await markdownToTiptapJson(fullContent);
    await db.chatBlock.update({
      where: { id: streamingBlock.id },
      data: {
        content: tiptapContent,
        streamingContent: null,
      },
    });

    stream.done();
  })();

  return {
    output: stream.value,
    blockId: streamingBlock.id,
  };
}
```

**⚠️ CORRECTION:** Uses Vercel AI SDK's RSC streaming instead of manual WebSocket implementation.

---

## **Phase 4: Final Features & Polish (3-4 Hours)**

### **1. Token Counter (`src/components/chat/TokenCounter.tsx`)**

```typescript
// src/components/chat/TokenCounter.tsx
"use client";

import { useMemo } from "react";
import { getEncoding } from "gpt-tokenizer";
import { Badge } from "~/components/ui/badge";

const tokenizer = getEncoding("cl100k_base");

type TokenCounterProps = {
  blocks: Array<{
    content?: any;
    isExcluded: boolean;
  }>;
};

export function TokenCounter({ blocks }: TokenCounterProps) {
  const tokenCount = useMemo(() => {
    const includedBlocks = blocks.filter((b) => !b.isExcluded && b.content);
    const text = includedBlocks
      .map((b) => JSON.stringify(b.content))
      .join("\n");

    return tokenizer.encode(text).length;
  }, [blocks]);

  return (
    <Badge variant="secondary" className="ml-auto">
      {tokenCount.toLocaleString()} tokens
    </Badge>
  );
}
```

### **2. Action Bar (`src/components/chat/ActionBar.tsx`)**

```typescript
// src/components/chat/ActionBar.tsx
"use client";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { api } from "~/lib/trpc/client";

type ActionBarProps = {
  selectedIds: Set<string>;
  blocks: Array<{ id: string; order: number; content?: any }>;
  onClear: () => void;
};

export function ActionBar({ selectedIds, blocks, onClear }: ActionBarProps) {
  const utils = api.useUtils();
  const summarize = api.ai.summarizeBlocks.useMutation({
    onSuccess: () => {
      utils.blocks.getAll.invalidate();
      onClear();
    },
  });

  if (selectedIds.size === 0) return null;

  const handleSummarize = () => {
    const selectedBlocks = blocks.filter((b) => selectedIds.has(b.id));
    const lastOrder = Math.max(...selectedBlocks.map((b) => b.order));

    summarize.mutate({
      blockIds: Array.from(selectedIds),
      replaceOrder: lastOrder,
    });
  };

  return (
    <Card className="fixed bottom-8 left-1/2 -translate-x-1/2 p-4 shadow-lg z-50">
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {selectedIds.size} blocks selected
        </span>
        <Button onClick={handleSummarize} disabled={summarize.isPending}>
          Summarize
        </Button>
        <Button variant="outline" onClick={onClear}>
          Clear
        </Button>
      </div>
    </Card>
  );
}
```

---

## **Missing Details & Questions**

### **Questions for Clarification:**

1. **Authentication Flow:** How should users access the chat? Should it be behind login or public?
2. **Streaming UI:** Do you want real-time character-by-character streaming or chunk-based updates?
3. **Block Types:** Should we support different block types (code, images, etc.) or just rich text?
4. **Collaboration:** Single-user or multi-user editing?
5. **Persistence:** Should there be auto-save or manual save for draft blocks?

### **Technical Decisions Needed:**

1. **AI Provider:** OpenAI vs Google vs Anthropic?
2. **Streaming Transport:** Server Actions vs API routes vs WebSockets?
3. **Editor Extensions:** Which Tiptap extensions beyond StarterKit?
4. **Mobile Support:** Should the interface be mobile-responsive?

### **Performance Considerations:**

1. **Large Documents:** How to handle 100+ blocks efficiently?
2. **Real-time Updates:** WebSocket integration for multi-user?
3. **Token Limits:** How to handle context window limits?

**Estimated Timeline: 18-22 hours** (more realistic than original 20-hour estimate)

This revised plan uses your actual tech stack and follows Next.js 15 + tRPC + Prisma patterns properly. The original plan had good architectural ideas but needed significant corrections for your specific setup.
