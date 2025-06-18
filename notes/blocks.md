Implementation plan after brainstorming with Gemini 2.5 pro

---

### **Project Goal: The "Living Document" AI Chat App**

Build a Notion-like chat interface where the conversation is a mutable document. Users can edit any block, insert new prompts anywhere, and perform AI actions (like summarization) on selections of blocks.

### **Core Architectural Decisions (For the LLM's Context)**

1.  **One Editor per Block:** Each chat entry (`ChatBlock`) will contain its own independent Tiptap editor instance. This isolates state, provides independent undo/redo history, and ensures high performance by preventing full-page re-renders on keystrokes.
2.  **Server-Side Parsing:** The AI generates Markdown. The Convex backend is responsible for parsing this Markdown into Tiptap's structured JSON format. The frontend only ever deals with the final JSON for rendering rich content.
3.  **Fractional Indexing:** To allow insertion of blocks anywhere, we will use floating-point numbers for an `order` field. This avoids costly re-indexing of the entire document on every insertion.
4.  **Dual-Content Streaming:** To provide a real-time streaming experience, AI blocks will temporarily store incoming text as a simple Markdown string (`streamingContent`). Once the stream is complete, the final Markdown is converted to Tiptap JSON (`content`) on the server, and the block switches to its rich, editable state.

---

### **Phase 0: Foundation & Setup (1 Hour)**

**Goal:** Prepare the project with all necessary dependencies and file structures.

1.  **Install Dependencies:**

    ```bash
    # Tiptap for the editor
    npm install @tiptap/react @tiptap/core @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/html

    # Convex + Vercel AI SDK
    # (Assuming these are already set up, but listed for completeness)
    # npm install convex ai

    # Server-side parsing utilities
    npm install marked jsdom

    # Frontend utilities
    npm install lucide-react react-markdown gpt-tokenizer clsx tailwind-merge
    ```

2.  **Initial File Structure:**
    ```
    /app
      /notion-chat
        page.tsx
    /components
      ChatBlock.tsx
      ActionBar.tsx
    /convex
      schema.ts
      blocks.ts
      ai.ts
      lib/
        parsing.ts
    /hooks
      useTokenizer.ts
    ```

---

### **Phase 1: Backend Schema & Core Logic (4-5 Hours)**

**Goal:** Define the data model in Convex and create the fundamental server-side utilities.

1.  **Define the Convex Schema (`convex/schema.ts`):**

    ```typescript
    // convex/schema.ts
    import { defineSchema, defineTable } from "convex/server";
    import { v } from "convex/values";

    export default defineSchema({
      blocks: defineTable({
        author: v.union(v.literal("user"), v.literal("ai")),
        // Final, rich content in Tiptap's JSON format.
        // Optional because it won't exist during AI streaming.
        content: v.optional(v.any()),
        // Temporary field for raw Markdown during AI streaming.
        streamingContent: v.optional(v.string()),
        // Fractional indexing key for ordering.
        order: v.number(),
        // Flag for excluding from AI context.
        isExcluded: v.boolean(),
      }).index("by_order", ["order"]), // Index for fast, sorted queries.
    });
    ```

2.  **Create the Server-Side Parsing Utility (`convex/lib/parsing.ts`):**

    - **Rationale:** This function is the core of our "Server-Side Parsing" strategy. It takes raw Markdown and returns the structured JSON that Tiptap requires, using `jsdom` to create a necessary virtual DOM environment.

    ```typescript
    // convex/lib/parsing.ts
    import { JSDOM } from "jsdom";
    import { marked } from "marked";
    import { generateJSON } from "@tiptap/html";
    import StarterKit from "@tiptap/starter-kit";

    // Configure Tiptap extensions to match your frontend editor.
    const extensions = [StarterKit.configure({ heading: false })];

    /**
     * Converts a Markdown string into Tiptap's JSON format.
     * @param markdown The raw Markdown string from the AI.
     * @returns Tiptap-compatible JSON object.
     */
    export function markdownToTiptapJson(markdown: string) {
      // Convert Markdown to an HTML string.
      const html = marked.parse(markdown, { breaks: true });

      // Create a JSDOM instance to simulate a browser environment for the parser.
      const dom = new JSDOM(`<body>${html}</body>`);

      // Generate Tiptap JSON from the HTML within the JSDOM context.
      return generateJSON(dom.window.document.body, extensions);
    }
    ```

3.  **Create Core Block Mutations (`convex/blocks.ts`):**

    ```typescript
    // convex/blocks.ts
    import { v } from "convex/values";
    import { internal } from "./_generated/api";
    import { internalMutation, mutation, query } from "./_generated/server";
    import { markdownToTiptapJson } from "./lib/parsing";

    // Query to get all blocks, sorted correctly.
    export const getBlocks = query({
      handler: async (ctx) => {
        return await ctx.db.query("blocks").order("asc").collect();
      },
    });

    // Mutation for inserting a new block using fractional indexing.
    export const insertBlock = mutation({
      args: {
        prevOrder: v.optional(v.number()),
        nextOrder: v.optional(v.number()),
      },
      handler: async (ctx, args) => {
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

        await ctx.db.insert("blocks", {
          author: "user",
          content: { type: "doc", content: [{ type: "paragraph" }] },
          order: newOrder,
          isExcluded: false,
        });
      },
    });

    // Mutation to update a block's content after user edits.
    export const updateBlockContent = mutation({
      args: { blockId: v.id("blocks"), newContent: v.any() },
      handler: async (ctx, args) => {
        await ctx.db.patch(args.blockId, { content: args.newContent });
      },
    });

    // Mutation to toggle the exclusion flag.
    export const updateBlockExclusion = mutation({
      args: { blockId: v.id("blocks"), isExcluded: v.boolean() },
      handler: async (ctx, args) => {
        await ctx.db.patch(args.blockId, { isExcluded: args.isExcluded });
      },
    });
    ```

---

### **Phase 2: Core UI & User Interaction (6-7 Hours)**

**Goal:** Render the blocks, allow users to edit them, and insert new blocks anywhere.

1.  **Create the `ChatBlock` Component (`components/ChatBlock.tsx`):**

    - **Rationale:** This component encapsulates a single Tiptap editor. It handles its own state, saving content `onBlur` to avoid excessive database writes. It also displays visual states for selection and exclusion.

    ```typescript
    // components/ChatBlock.tsx
    "use client";
    import { useEditor, EditorContent } from "@tiptap/react";
    import StarterKit from "@tiptap/starter-kit";
    import { useMutation } from "convex/react";
    import { api } from "@/convex/_generated/api";
    import { Id } from "@/convex/_generated/dataModel";
    import ReactMarkdown from "react-markdown";
    import { EyeOff } from "lucide-react";
    import clsx from "clsx";

    type Block = {
      _id: Id<"blocks">;
      author: "user" | "ai";
      content?: any;
      streamingContent?: string;
      isExcluded: boolean;
    };

    type ChatBlockProps = {
      block: Block;
      isSelected: boolean;
      onSelect: (id: Id<"blocks">) => void;
      isStreaming?: boolean;
    };

    export const ChatBlock = ({
      block,
      isSelected,
      onSelect,
      isStreaming = false,
    }: ChatBlockProps) => {
      const updateContent = useMutation(api.blocks.updateBlockContent);
      const updateExclusion = useMutation(api.blocks.updateBlockExclusion);

      const editor = useEditor({
        extensions: [StarterKit.configure({ heading: false })],
        content: block.content,
        editable: !isStreaming,
        onBlur: ({ editor }) => {
          updateContent({
            blockId: block._id,
            newContent: editor.getJSON(),
          });
        },
      });

      // Handle the streaming state
      if (isStreaming) {
        return (
          <div className="p-4 my-2 border rounded-lg prose prose-sm animate-pulse bg-blue-50">
            <ReactMarkdown>{block.streamingContent + "▍"}</ReactMarkdown>
          </div>
        );
      }

      return (
        <div
          className={clsx(
            "relative group p-4 my-2 border rounded-lg transition-all",
            isSelected && "border-blue-500 ring-2 ring-blue-500",
            block.isExcluded && "opacity-40 bg-gray-50"
          )}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(block._id)}
            className="absolute top-2 left-2 z-10 h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
          />
          <button
            onClick={() =>
              updateExclusion({
                blockId: block._id,
                isExcluded: !block.isExcluded,
              })
            }
            className="absolute top-2 right-2 z-10 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity"
            title={
              block.isExcluded ? "Include in context" : "Exclude from context"
            }
          >
            <EyeOff className="w-4 h-4" />
          </button>
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none focus:outline-none"
          />
        </div>
      );
    };
    ```

2.  **Build the Main Page (`app/notion-chat/page.tsx`):**

    - **Rationale:** This component fetches all blocks, maps over them to render `ChatBlock` components, and implements the UI for inserting new blocks between existing ones.

    ```typescript
    // app/notion-chat/page.tsx
    "use client";
    import { useQuery, useMutation } from "convex/react";
    import { api } from "@/convex/_generated/api";
    import { ChatBlock } from "@/components/ChatBlock";
    import { Plus } from "lucide-react";
    import { useState } from "react";
    import { Id } from "@/convex/_generated/dataModel";

    export default function NotionChatPage() {
      const blocks = useQuery(api.blocks.getBlocks) || [];
      const insertBlock = useMutation(api.blocks.insertBlock);
      const [selectedBlockIds, setSelectedBlockIds] = useState<
        Set<Id<"blocks">>
      >(new Set());

      const handleSelectBlock = (blockId: Id<"blocks">) => {
        setSelectedBlockIds((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(blockId)) newSet.delete(blockId);
          else newSet.add(blockId);
          return newSet;
        });
      };

      return (
        <div className="max-w-3xl mx-auto p-8">
          {blocks.map((block, index) => {
            const prevOrder = index === 0 ? null : blocks[index - 1].order;
            const nextOrder = block.order;

            return (
              <div key={block._id} className="group relative">
                <button
                  onClick={() => insertBlock({ prevOrder, nextOrder })}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 p-1 bg-white border rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Insert block here"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <ChatBlock
                  block={block}
                  isSelected={selectedBlockIds.has(block._id)}
                  onSelect={handleSelectBlock}
                />
              </div>
            );
          })}
          {/* TODO: Add AI Streaming Logic, Action Bar, and Token Counter here */}
        </div>
      );
    }
    ```

---

### **Phase 3: The AI Magic - Streaming & Summarization (7-8 Hours)**

**Goal:** Implement real-time AI response streaming and the multi-block summarization feature.

1.  **Add AI-related Mutations (`convex/blocks.ts`):**

    ```typescript
    // convex/blocks.ts (add these to the existing file)

    // Creates a temporary block for streaming.
    export const createStreamingAiBlock = mutation({
      args: { order: v.number() },
      handler: async (ctx, args) => {
        return await ctx.db.insert("blocks", {
          author: "ai",
          streamingContent: "",
          order: args.order,
          isExcluded: false,
        });
      },
    });

    // Updates the streaming content.
    export const updateStreamingContent = internalMutation({
      args: { blockId: v.id("blocks"), chunk: v.string() },
      handler: async (ctx, args) => {
        const block = await ctx.db.get(args.blockId);
        if (block) {
          await ctx.db.patch(args.blockId, {
            streamingContent: (block.streamingContent ?? "") + args.chunk,
          });
        }
      },
    });

    // Finalizes the block by converting Markdown to Tiptap JSON.
    export const finalizeAiBlock = mutation({
      args: { blockId: v.id("blocks"), finalMarkdown: v.string() },
      handler: async (ctx, args) => {
        const tiptapJson = markdownToTiptapJson(args.finalMarkdown);
        await ctx.db.patch(args.blockId, {
          content: tiptapJson,
          streamingContent: undefined, // Clear the temporary field
        });
      },
    });
    ```

    - **Pro Tip:** The streaming updates should be `internalMutation`s called from a server action to avoid exposing them directly to the client, which improves security and control.

2.  **Implement the Summarization Action (`convex/ai.ts`):**

    - **Rationale:** This action uses a carefully crafted prompt to instruct the AI to use a specific delimiter. It then splits the response by this delimiter to create multiple, distinct blocks.

    ```typescript
    // convex/ai.ts
    import { action } from "./_generated/server";
    import { internal } from "./_generated/api";
    import { v } from "convex/values";
    import { markdownToTiptapJson } from "./lib/parsing";
    // Assume OpenAI is configured

    const BLOCK_SEPARATOR = "\n---BLOCK_SEPARATOR---\n";

    export const summarizeAndCreateBlocks = action({
      args: {
        contentToSummarize: v.string(),
        idsToDelete: v.array(v.id("blocks")),
        order: v.number(),
      },
      handler: async (ctx, args) => {
        const systemPrompt = `You are an expert technical summarizer... You MUST separate distinct logical sections with the delimiter: ${BLOCK_SEPARATOR}`;

        const response = await openai.chat.completions.create({
          model: "gpt-4-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: args.contentToSummarize },
          ],
        });
        const rawResponse = response.choices[0].message.content ?? "";
        const markdownChunks = rawResponse
          .split(BLOCK_SEPARATOR)
          .filter(Boolean);
        const newBlocksData = markdownChunks.map((chunk) =>
          markdownToTiptapJson(chunk.trim())
        );

        await ctx.runMutation(internal.blocks.replaceSelectionWithMultiple, {
          idsToDelete: args.idsToDelete,
          newBlocksData: newBlocksData,
          startOrder: args.order,
        });
      },
    });
    ```

3.  **Add the Atomic Replacement Mutation (`convex/blocks.ts`):**

    ```typescript
    // convex/blocks.ts (add this internal mutation)
    export const replaceSelectionWithMultiple = internalMutation({
      args: {
        idsToDelete: v.array(v.id("blocks")),
        newBlocksData: v.array(v.any()),
        startOrder: v.number(),
      },
      handler: async (ctx, args) => {
        for (const id of args.idsToDelete) {
          await ctx.db.delete(id);
        }
        let currentOrder = args.startOrder;
        for (const content of args.newBlocksData) {
          await ctx.db.insert("blocks", {
            author: "ai",
            content: content,
            order: currentOrder,
            isExcluded: false,
          });
          currentOrder += 1;
        }
      },
    });
    ```

4.  **Integrate Vercel AI SDK on the Client (`app/notion-chat/page.tsx`):**
    - This is a conceptual integration. You will need to adapt your existing `useChat` or `useCompletion` flow. The key is to call your Convex mutations at the right lifecycle points.

---

### **Phase 4: Final Features & Polish (2-3 Hours)**

**Goal:** Add the action bar, token counter, and final touches.

1.  **Create the Tokenizer Hook (`hooks/useTokenizer.ts`):**

    ```typescript
    // hooks/useTokenizer.ts
    import { useMemo } from "react";
    import { getEncoding } from "gpt-tokenizer";

    const tokenizer = getEncoding("cl100k_base");

    export const useTokenizer = (blocks: any[]) => {
      const tokenCount = useMemo(() => {
        if (!blocks || blocks.length === 0) return 0;
        const content = blocks
          .filter((b) => !b.isExcluded && b.content)
          .map((b) => JSON.stringify(b.content)) // Rough text extraction
          .join("\n");
        return tokenizer.encode(content).length;
      }, [blocks]);
      return { tokenCount };
    };
    ```

2.  **Create the `ActionBar` Component (`components/ActionBar.tsx`):**

    ```typescript
    // components/ActionBar.tsx
    "use client";
    import { useAction } from "convex/react";
    import { api } from "@/convex/_generated/api";
    import { Id } from "@/convex/_generated/dataModel";

    type ActionBarProps = {
      selectedIds: Set<Id<"blocks">>;
      allBlocks: any[];
      onClear: () => void;
    };

    export const ActionBar = ({
      selectedIds,
      allBlocks,
      onClear,
    }: ActionBarProps) => {
      const summarize = useAction(api.ai.summarizeAndCreateBlocks);

      const handleSummarize = async () => {
        const selectedBlocks = allBlocks.filter((b) => selectedIds.has(b._id));
        const contentToSummarize = selectedBlocks
          .map((b) => JSON.stringify(b.content))
          .join("\n\n");
        const lastSelectedBlock = selectedBlocks[selectedBlocks.length - 1];

        await summarize({
          contentToSummarize,
          idsToDelete: Array.from(selectedIds),
          order: lastSelectedBlock.order,
        });
        onClear();
      };

      if (selectedIds.size === 0) return null;

      return (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-lg p-2 flex gap-2 border z-20">
          <div className="p-2 text-sm">{selectedIds.size} blocks selected</div>
          <button
            onClick={handleSummarize}
            className="p-2 bg-blue-500 text-white rounded text-sm"
          >
            Summarize
          </button>
          <button onClick={onClear} className="p-2 bg-gray-200 rounded text-sm">
            Clear
          </button>
        </div>
      );
    };
    ```

3.  **Finalize the Main Page (`app/notion-chat/page.tsx`):**
    - Import and use `useTokenizer`.
    - Import and render `ActionBar`.
    - Add a fixed element to display the `tokenCount`.

This comprehensive plan provides a clear path from zero to a highly functional and impressive hackathon project. Good luck
