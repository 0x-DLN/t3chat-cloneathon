Claude's improved implementation plan based on [Gemini's initial plan](blocks.md) and [Claude's initial review](blocks-claude-review.md)

---

# **Revised Implementation Plan: Notion-like Living Document Chat**

## **Understanding Your Current Architecture**

✅ **What's Already Working:**

- JWT-based auth for Convex + session-based auth for tRPC
- Full AI streaming pipeline with Vercel AI SDK
- Real-time message updates via Convex
- User management with Prisma + Better Auth
- Complete UI with shadcn/ui components

## **Project Goal: Transform Linear Chat into Living Document**

Convert your existing linear chat interface into a Notion-like document where users can:

- Edit any message/response after it's sent
- Insert new prompts anywhere in the conversation
- Select multiple blocks for AI operations (summarization, expansion, etc.)
- Exclude blocks from AI context
- See real-time token usage

---

## **Phase 1: Extend Convex Schema for Blocks (1-2 Hours)**

### **Add Blocks Schema to Convex**

```typescript
// convex/schema.ts - ADD to existing schema
export default defineSchema({
  // ... existing tables (conversations, messages, streamChunks)

  // New block-based structure
  blocks: defineTable({
    conversationId: v.id("conversations"),
    author: v.union(v.literal("user"), v.literal("assistant")),

    // Rich text content (Tiptap JSON format)
    content: v.optional(v.any()),

    // For streaming (temporary Markdown content)
    streamingContent: v.optional(v.string()),
    streamId: v.optional(v.string()),
    isStreaming: v.boolean(),

    // Fractional indexing for insertion anywhere
    order: v.number(),

    // Context control
    isExcluded: v.boolean(),

    // Metadata
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(
      v.object({
        tokens: v.optional(v.number()),
        model: v.optional(v.string()),
      })
    ),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_and_order", ["conversationId", "order"]),
});
```

### **Create Block Operations**

```typescript
// convex/blocks.ts - NEW FILE
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { checkAuth, checkSecret } from "./utils";

export const getBlocks = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);

    // Verify user owns this conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("blocks")
      .withIndex("by_conversation_and_order", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});

export const createBlock = mutation({
  args: {
    conversationId: v.id("conversations"),
    author: v.union(v.literal("user"), v.literal("assistant")),
    content: v.optional(v.any()),
    prevOrder: v.optional(v.number()),
    nextOrder: v.optional(v.number()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret);

    // Calculate fractional order
    let newOrder: number;
    if (args.prevOrder != null && args.nextOrder != null) {
      newOrder = (args.prevOrder + args.nextOrder) / 2;
    } else if (args.prevOrder != null) {
      newOrder = args.prevOrder + 1;
    } else if (args.nextOrder != null) {
      newOrder = args.nextOrder - 1;
    } else {
      newOrder = 1;
    }

    return await ctx.db.insert("blocks", {
      conversationId: args.conversationId,
      author: args.author,
      content: args.content || {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
      order: newOrder,
      isExcluded: false,
      isStreaming: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateBlock = mutation({
  args: {
    blockId: v.id("blocks"),
    content: v.any(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret);

    await ctx.db.patch(args.blockId, {
      content: args.content,
      updatedAt: Date.now(),
    });
  },
});

export const toggleExclusion = mutation({
  args: {
    blockId: v.id("blocks"),
    isExcluded: v.boolean(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret);

    await ctx.db.patch(args.blockId, {
      isExcluded: args.isExcluded,
      updatedAt: Date.now(),
    });
  },
});

// Migration helper: convert existing messages to blocks
export const migrateMessagesToBlocks = mutation({
  args: {
    conversationId: v.id("conversations"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret);

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]!;
      await ctx.db.insert("blocks", {
        conversationId: args.conversationId,
        author: message.role,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: message.content }],
            },
          ],
        },
        order: i + 1,
        isExcluded: false,
        isStreaming: false,
        createdAt: message.createdAt,
        updatedAt: Date.now(),
      });
    }
  },
});
```

---

## **Phase 2: Install Tiptap and Create Block Component (2-3 Hours)**

### **Install Dependencies**

```bash
pnpm add @tiptap/react @tiptap/core @tiptap/starter-kit @tiptap/extension-placeholder
pnpm add remark remark-html  # For server-side Markdown parsing
pnpm add gpt-tokenizer      # For token counting
```

### **Create Markdown Parser**

```typescript
// src/lib/markdown/parser.ts - NEW FILE
import { remark } from "remark";
import remarkHtml from "remark-html";

/**
 * Convert Markdown to Tiptap JSON (server-safe)
 * Note: We'll implement this step-by-step, starting with basic parsing
 */
export async function markdownToTiptapJson(markdown: string) {
  // For now, return simple paragraph structure
  // TODO: Implement full Markdown → Tiptap JSON conversion
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: markdown }],
      },
    ],
  };
}
```

### **Create EditableBlock Component**

```typescript
// src/components/chat/EditableBlock.tsx - NEW FILE
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { EyeOff, Eye, Plus } from "lucide-react";
import { cn } from "~/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "~/convex/_generated/api";
import { env } from "~/env";
import type { Id } from "~/convex/_generated/dataModel";

type BlockData = {
  _id: Id<"blocks">;
  author: "user" | "assistant";
  content?: any;
  streamingContent?: string;
  isStreaming: boolean;
  isExcluded: boolean;
  order: number;
};

type EditableBlockProps = {
  block: BlockData;
  isSelected: boolean;
  onSelect: (id: Id<"blocks">) => void;
  onInsertBefore: (order: number) => void;
  onInsertAfter: (order: number) => void;
};

export function EditableBlock({
  block,
  isSelected,
  onSelect,
  onInsertBefore,
  onInsertAfter,
}: EditableBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateBlock = useMutation(api.blocks.updateBlock);
  const toggleExclusion = useMutation(api.blocks.toggleExclusion);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder:
          block.author === "user" ? "Ask a question..." : "AI response...",
      }),
    ],
    content: block.content,
    editable: !block.isStreaming,
    onUpdate: ({ editor }) => {
      if (isEditing) {
        // Debounce updates - only save on blur or after delay
        setHasUnsavedChanges(true);
      }
    },
    onFocus: () => setIsEditing(true),
    onBlur: ({ editor }) => {
      if (hasUnsavedChanges) {
        updateBlock({
          blockId: block._id,
          content: editor.getJSON(),
          secret: env.NEXT_PUBLIC_CONVEX_SECRET!,
        });
        setHasUnsavedChanges(false);
      }
      setIsEditing(false);
    },
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Update content when block changes (for streaming)
  useEffect(() => {
    if (editor && block.content && !isEditing) {
      editor.commands.setContent(block.content);
    }
  }, [editor, block.content, isEditing]);

  const handleToggleExclusion = useCallback(() => {
    toggleExclusion({
      blockId: block._id,
      isExcluded: !block.isExcluded,
      secret: env.NEXT_PUBLIC_CONVEX_SECRET!,
    });
  }, [block._id, block.isExcluded, toggleExclusion]);

  // Streaming display
  if (block.isStreaming && block.streamingContent) {
    return (
      <div className="group relative p-4 my-2 border rounded-lg bg-blue-50 animate-pulse">
        <div className="prose prose-sm max-w-none">
          {block.streamingContent}
          <span className="animate-pulse">▍</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative p-4 my-2 border rounded-lg transition-all hover:border-gray-300",
        isSelected && "border-blue-500 ring-2 ring-blue-500",
        block.isExcluded && "opacity-50 bg-gray-50",
        block.author === "assistant" && "bg-slate-50"
      )}
    >
      {/* Insert buttons */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onInsertBefore(block.order)}
        className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
      >
        <Plus className="w-3 h-3" />
      </Button>

      {/* Selection checkbox */}
      <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(block._id)}
        />
      </div>

      {/* Exclusion toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleExclusion}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
        title={block.isExcluded ? "Include in context" : "Exclude from context"}
      >
        {block.isExcluded ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </Button>

      {/* Author indicator */}
      <div className="absolute top-2 left-8 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
        {block.author}
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none focus:outline-none mt-2"
      />

      {/* Insert after button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onInsertAfter(block.order)}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
      >
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
}
```

---

## **Phase 3: Update tRPC Router for Block Operations (1 Hour)**

```typescript
// src/server/api/routers/blocks.ts - NEW FILE
import { z } from "zod/v4";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { api } from "~/convex/_generated/api";
import { env } from "~/env";
import type { Id } from "~/convex/_generated/dataModel";

export const blocksRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        author: z.enum(["user", "assistant"]),
        prevOrder: z.number().optional(),
        nextOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.convex.mutation(api.blocks.createBlock, {
        conversationId: input.conversationId as Id<"conversations">,
        author: input.author,
        prevOrder: input.prevOrder,
        nextOrder: input.nextOrder,
        secret: env.CONVEX_SECRET,
      });
    }),

  // Migration utility - convert existing conversation to blocks
  migrateConversation: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.convex.mutation(api.blocks.migrateMessagesToBlocks, {
        conversationId: input.conversationId as Id<"conversations">,
        secret: env.CONVEX_SECRET,
      });
    }),
});

// Add to src/server/api/root.ts
import { blocksRouter } from "./routers/blocks";

export const appRouter = createTRPCRouter({
  // ... existing routers
  blocks: blocksRouter,
});
```

---

## **Phase 4: Create Living Document Chat Interface (3-4 Hours)**

```typescript
// src/components/chat/LivingDocumentChat.tsx - NEW FILE
"use client";

import { useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "~/convex/_generated/api";
import { useTRPC } from "~/lib/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { EditableBlock } from "./EditableBlock";
import { ActionBar } from "./ActionBar";
import { TokenCounter } from "./TokenCounter";
import { Button } from "~/components/ui/button";
import { Migrate, FileText } from "lucide-react";
import type { Id } from "~/convex/_generated/dataModel";

type LivingDocumentChatProps = {
  conversationId: string;
};

export function LivingDocumentChat({
  conversationId,
}: LivingDocumentChatProps) {
  const trpc = useTRPC();
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<Id<"blocks">>>(
    new Set()
  );

  // Fetch blocks instead of messages
  const blocks = useQuery(api.blocks.getBlocks, {
    conversationId: conversationId as Id<"conversations">,
  });

  // Check if we need to migrate from messages to blocks
  const conversation = useQuery(api.conversations.getConversationWithMessages, {
    conversationId: conversationId as Id<"conversations">,
  });

  const migrateConversation = useMutation(
    trpc.blocks.migrateConversation.mutationOptions()
  );

  const createBlock = useMutation(trpc.blocks.create.mutationOptions());

  const handleSelectBlock = useCallback((blockId: Id<"blocks">) => {
    setSelectedBlockIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(blockId)) {
        newSet.delete(blockId);
      } else {
        newSet.add(blockId);
      }
      return newSet;
    });
  }, []);

  const handleInsertBlock = useCallback(
    (author: "user" | "assistant", prevOrder?: number, nextOrder?: number) => {
      createBlock.mutate({
        conversationId,
        author,
        prevOrder,
        nextOrder,
      });
    },
    [conversationId, createBlock]
  );

  const handleMigrate = useCallback(() => {
    migrateConversation.mutate({ conversationId });
  }, [conversationId, migrateConversation]);

  // Show migration prompt if no blocks but has messages
  if (
    conversation &&
    conversation.messages.length > 0 &&
    (!blocks || blocks.length === 0)
  ) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <FileText className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          Transform to Living Document
        </h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          Convert this conversation into an editable document where you can
          modify any part and insert new content anywhere.
        </p>
        <Button
          onClick={handleMigrate}
          disabled={migrateConversation.isPending}
        >
          <Migrate className="w-4 h-4 mr-2" />
          {migrateConversation.isPending
            ? "Converting..."
            : "Convert to Living Document"}
        </Button>
      </div>
    );
  }

  if (!blocks) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading blocks...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-h-screen overflow-hidden">
      {/* Header with token counter */}
      <div className="border-b p-4 bg-background">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">Living Document</h1>
          <TokenCounter blocks={blocks} />
        </div>
      </div>

      {/* Scrollable blocks area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-2">
          {blocks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                Your living document is empty
              </p>
              <Button onClick={() => handleInsertBlock("user")}>
                Add First Block
              </Button>
            </div>
          ) : (
            blocks.map((block) => (
              <EditableBlock
                key={block._id}
                block={block}
                isSelected={selectedBlockIds.has(block._id)}
                onSelect={handleSelectBlock}
                onInsertBefore={(order) =>
                  handleInsertBlock("user", undefined, order)
                }
                onInsertAfter={(order) => handleInsertBlock("user", order)}
              />
            ))
          )}
        </div>
      </div>

      {/* Action bar for selected blocks */}
      <ActionBar
        selectedIds={selectedBlockIds}
        blocks={blocks || []}
        conversationId={conversationId}
        onClear={() => setSelectedBlockIds(new Set())}
      />
    </div>
  );
}
```

---

## **Phase 5: AI Integration for Block Operations (4-5 Hours)**

### **Extend AI Router for Block-Based Operations**

```typescript
// convex/ai.ts - ADD these mutations to existing file

export const sendBlockMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    blockId: v.id("blocks"),
    model: v.string(),
    provider: v.union(v.literal("openai"), v.literal("google")),
    apiKey: v.string(),
    userId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret);

    // Get all non-excluded blocks for context
    const contextBlocks = await ctx.db
      .query("blocks")
      .withIndex("by_conversation_and_order", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    const contextMessages = contextBlocks
      .filter((block) => !block.isExcluded && block.content)
      .map((block) => ({
        role: block.author as "user" | "assistant",
        content: extractTextFromTiptap(block.content), // Helper function needed
      }));

    // Create AI response block
    const aiBlockId = await ctx.db.insert("blocks", {
      conversationId: args.conversationId,
      author: "assistant",
      streamingContent: "",
      isStreaming: true,
      order: (await getLastBlockOrder(ctx, args.conversationId)) + 1,
      isExcluded: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Schedule streaming response
    await ctx.scheduler.runAfter(0, internal.ai.streamBlockResponse, {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        ...contextMessages,
      ],
      model: args.model,
      provider: args.provider,
      apiKey: args.apiKey,
      conversationId: args.conversationId,
      blockId: aiBlockId,
    });

    return { blockId: aiBlockId };
  },
});

export const streamBlockResponse = internalAction({
  async handler(ctx, args) {
    // Similar to existing streamResponse but updates block instead of message
    const aiModel = getAiModel(args.provider, args.model, args.apiKey);
    let accumulatedContent = "";

    const result = streamText({
      model: aiModel,
      messages: args.messages,
    });

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta": {
            accumulatedContent += part.textDelta;
            await ctx.runMutation(internal.blocks.updateStreamingContent, {
              blockId: args.blockId,
              content: accumulatedContent,
            });
            break;
          }
          case "finish": {
            // Convert to Tiptap JSON and finalize
            const tiptapContent = await markdownToTiptapJson(
              accumulatedContent
            );
            await ctx.runMutation(internal.blocks.finalizeStreamingBlock, {
              blockId: args.blockId,
              content: tiptapContent,
            });
            break;
          }
          case "error": {
            // Handle error
            break;
          }
        }
      }
    } catch (error) {
      console.error("Block streaming error:", error);
    }
  },
});

// Helper mutations for streaming
export const updateStreamingContent = internalMutation({
  args: {
    blockId: v.id("blocks"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.blockId, {
      streamingContent: args.content,
      updatedAt: Date.now(),
    });
  },
});

export const finalizeStreamingBlock = internalMutation({
  args: {
    blockId: v.id("blocks"),
    content: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.blockId, {
      content: args.content,
      streamingContent: undefined,
      isStreaming: false,
      updatedAt: Date.now(),
    });
  },
});
```

---

## **Phase 6: Action Bar and Advanced Features (2-3 Hours)**

### **Token Counter Component**

```typescript
// src/components/chat/TokenCounter.tsx - NEW FILE
"use client";

import { useMemo } from "react";
import { getEncoding } from "gpt-tokenizer";
import { Badge } from "~/components/ui/badge";

const tokenizer = getEncoding("cl100k_base");

// Helper to extract text from Tiptap JSON
function extractTextFromTiptap(content: any): string {
  if (!content || !content.content) return "";

  return content.content
    .map((node: any) => {
      if (node.type === "paragraph" && node.content) {
        return node.content
          .map((textNode: any) => textNode.text || "")
          .join("");
      }
      return "";
    })
    .join("\n");
}

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
      .map((b) => extractTextFromTiptap(b.content))
      .join("\n");

    if (!text) return 0;
    return tokenizer.encode(text).length;
  }, [blocks]);

  return (
    <Badge variant="secondary">{tokenCount.toLocaleString()} tokens</Badge>
  );
}
```

### **Action Bar Component**

```typescript
// src/components/chat/ActionBar.tsx - NEW FILE
"use client";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Sparkles, Trash2, Copy } from "lucide-react";
import type { Id } from "~/convex/_generated/dataModel";

type ActionBarProps = {
  selectedIds: Set<Id<"blocks">>;
  blocks: Array<{
    _id: Id<"blocks">;
    content?: any;
    order: number;
  }>;
  conversationId: string;
  onClear: () => void;
};

export function ActionBar({
  selectedIds,
  blocks,
  conversationId,
  onClear,
}: ActionBarProps) {
  if (selectedIds.size === 0) return null;

  const handleSummarize = () => {
    // TODO: Implement summarization
    console.log("Summarize selected blocks");
  };

  const handleDelete = () => {
    // TODO: Implement deletion
    console.log("Delete selected blocks");
  };

  const handleCopy = () => {
    // TODO: Implement copy to clipboard
    console.log("Copy selected blocks");
  };

  return (
    <Card className="fixed bottom-4 left-1/2 -translate-x-1/2 p-3 shadow-lg z-50 mx-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {selectedIds.size} block{selectedIds.size === 1 ? "" : "s"} selected
        </span>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSummarize}>
            <Sparkles className="w-4 h-4 mr-1" />
            Summarize
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-1" />
            Copy
          </Button>
          <Button size="sm" variant="outline" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </Card>
  );
}
```

---

## **Phase 7: Update Main Chat Route (30 minutes)**

```typescript
// src/app/(main)/chat/[conversationId]/page.tsx - UPDATE
import { LivingDocumentChat } from "~/components/chat/LivingDocumentChat";

export default async function Page({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return <LivingDocumentChat conversationId={conversationId} />;
}
```

---

## **Implementation Timeline**

**Total Estimated Time: 12-16 hours** ⏱️

- **Phase 1:** Schema & Convex operations (1-2h)
- **Phase 2:** Tiptap setup & EditableBlock (2-3h)
- **Phase 3:** tRPC integration (1h)
- **Phase 4:** Main interface (3-4h)
- **Phase 5:** AI streaming for blocks (4-5h)
- **Phase 6:** Action bar & advanced features (2-3h)
- **Phase 7:** Route updates (30min)

## **Key Features Delivered**

✅ **Editable blocks** with Tiptap rich text editing
✅ **Insert anywhere** with fractional ordering
✅ **Multi-select** with action bar
✅ **Context control** (include/exclude blocks)
✅ **Real-time streaming** AI responses
✅ **Token counting**
✅ **Migration** from existing linear chats
✅ **Built on your existing architecture**

## **Next Steps After MVP**

1. **Enhanced Markdown parsing** (Tiptap JSON conversion)
2. **Block summarization** and expansion
3. **Drag & drop reordering**
4. **Block templates** (code, math, etc.)
5. **Export to various formats**
6. **Collaborative editing**

This plan leverages your existing sophisticated architecture and creates a truly unique "living document" chat experience! 🚀
