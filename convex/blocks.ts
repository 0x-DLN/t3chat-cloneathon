import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { calculateOrder, checkAuth } from "./utils";

export const getBlocksUser = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);

    // Verify user owns this conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_conversation_and_order", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    // Parse stringified JSON content back to objects for frontend
    return blocks.map((block) => ({
      ...block,
      content: block.content ? JSON.parse(block.content) : undefined,
    }));
  },
});

export const getBlocksAssistant = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_conversation_and_inclusion", (q) =>
        q.eq("conversationId", args.conversationId).eq("isExcluded", false)
      )
      .order("asc")
      .collect();

    // Parse stringified JSON content back to objects for internal use
    return blocks.map((block) => ({
      ...block,
      content: block.content ? JSON.parse(block.content) : undefined,
    }));
  },
});

export const createUserBlock = mutation({
  args: {
    conversationId: v.id("conversations"),
    author: v.literal("user"),
    content: v.optional(v.any()),
    afterOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    let newOrder: number;

    if (args.afterOrder === undefined) {
      // Creating the first block or at the end
      const lastBlock = await ctx.db
        .query("blocks")
        .withIndex("by_conversation_and_order", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("desc")
        .first();

      newOrder = lastBlock ? lastBlock.order + 1 : 1;
    } else {
      // Find the next block after the specified order
      const nextBlock = await ctx.db
        .query("blocks")
        .withIndex("by_conversation_and_order", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .filter((q) => q.gt(q.field("order"), args.afterOrder!))
        .order("asc")
        .first();

      if (nextBlock) {
        // Insert between afterOrder and nextBlock.order using fractional indexing
        newOrder = calculateOrder(args.afterOrder, nextBlock.order);
      } else {
        // No next block, just add 1 to the afterOrder
        newOrder = args.afterOrder + 1;
      }
    }

    const defaultContent = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };

    // Stringify content before storing
    const contentToStore = args.content
      ? JSON.stringify(args.content)
      : JSON.stringify(defaultContent);

    return await ctx.db.insert("blocks", {
      conversationId: args.conversationId,
      author: args.author,
      content: contentToStore,
      order: newOrder,
      isExcluded: false,
      isStreaming: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteBlock = mutation({
  args: {
    blockId: v.id("blocks"),
  },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);
    const block = await ctx.db.get(args.blockId);
    if (!block) {
      throw new Error("Block not found");
    }
    const conversation = await ctx.db.get(block.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (
      block.conversationId !== conversation._id ||
      conversation.userId !== identity.subject
    ) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.blockId);

    return {
      blockId: args.blockId,
    };
  },
});

export const createAssistantBlock = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    afterOrder: v.optional(v.number()),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    let newOrder: number;

    if (args.afterOrder === undefined) {
      // Creating at the end
      const lastBlock = await ctx.db
        .query("blocks")
        .withIndex("by_conversation_and_order", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("desc")
        .first();

      newOrder = lastBlock ? lastBlock.order + 1 : 1;
    } else {
      // Find the next block after the specified order
      const nextBlock = await ctx.db
        .query("blocks")
        .withIndex("by_conversation_and_order", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .filter((q) => q.gt(q.field("order"), args.afterOrder!))
        .order("asc")
        .first();

      if (nextBlock) {
        // Insert between afterOrder and nextBlock.order using fractional indexing
        newOrder = calculateOrder(args.afterOrder, nextBlock.order);
      } else {
        // No next block, just add 1 to the afterOrder
        newOrder = args.afterOrder + 1;
      }
    }

    const streamId = crypto.randomUUID();

    const blockId = await ctx.db.insert("blocks", {
      conversationId: args.conversationId,
      author: "assistant",
      isExcluded: false,
      streamId,
      isStreaming: false,
      order: newOrder,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        model: args.model,
      },
    });

    return {
      blockId,
      streamId,
    };
  },
});

export const updateBlockUser = mutation({
  args: {
    blockId: v.id("blocks"),
    content: v.any(),
  },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);

    const block = await ctx.db.get(args.blockId);
    if (!block) {
      throw new Error("Block not found");
    }
    const conversation = await ctx.db.get(block.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (
      block.conversationId !== conversation._id ||
      conversation.userId !== identity.subject
    ) {
      throw new Error("Unauthorized");
    }

    // Stringify content before storing
    const contentToStore = JSON.stringify(args.content);

    await ctx.db.patch(args.blockId, {
      content: contentToStore,
      updatedAt: Date.now(),
    });
  },
});

export const updateBlockAssistant = internalMutation({
  args: {
    blockId: v.id("blocks"),
    streamingContent: v.string(),
    streamId: v.string(),
    isStreaming: v.boolean(),
    metadata: v.optional(
      v.object({
        finishReason: v.optional(v.string()),
        tokens: v.optional(v.number()),
        model: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.blockId, {
      streamingContent: args.streamingContent,
      streamId: args.streamId,
      isStreaming: args.isStreaming,
      updatedAt: Date.now(),
      metadata: args.metadata,
    });
  },
});

export const completeBlockAssistant = internalMutation({
  args: {
    blockId: v.id("blocks"),
    content: v.any(),
    streamId: v.string(),
    metadata: v.optional(
      v.object({
        finishReason: v.optional(v.string()),
        tokens: v.optional(v.number()),
        model: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Stringify content before storing
    const contentToStore = JSON.stringify(args.content);

    await ctx.db.patch(args.blockId, {
      content: contentToStore,
      isStreaming: false,
      streamId: undefined,
      streamingContent: undefined,
      updatedAt: Date.now(),
      metadata: args.metadata,
    });
  },
});

export const toggleExclusion = mutation({
  args: {
    blockId: v.id("blocks"),
    isExcluded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);
    const block = await ctx.db.get(args.blockId);
    if (!block) {
      throw new Error("Block not found");
    }
    const conversation = await ctx.db.get(block.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (
      block.conversationId !== conversation._id ||
      conversation.userId !== identity.subject
    ) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.blockId, {
      isExcluded: args.isExcluded,
      updatedAt: Date.now(),
    });
  },
});
