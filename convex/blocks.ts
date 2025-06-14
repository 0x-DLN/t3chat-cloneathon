import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { calculateOrder, checkAuth, checkSecret } from "./utils";

export const getBlocksUser = query({
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

export const getBlocksAssistant = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("blocks")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();
  },
});

export const createUserBlock = mutation({
  args: {
    conversationId: v.id("conversations"),
    author: v.literal("user"),
    content: v.optional(v.any()),
    prevOrder: v.optional(v.number()),
    nextOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    const newOrder = calculateOrder(args.prevOrder, args.nextOrder);

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

export const createAssistantBlock = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    prevOrder: v.optional(v.number()),
    nextOrder: v.optional(v.number()),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const newOrder = calculateOrder(args.prevOrder, args.nextOrder);
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
    conversationId: v.id("conversations"),
    content: v.any(),
  },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);

    const block = await ctx.db.get(args.blockId);
    const conversation = await ctx.db.get(args.conversationId);
    if (
      !block ||
      !conversation ||
      block.conversationId !== args.conversationId ||
      conversation.userId !== identity.subject
    ) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.blockId, {
      content: args.content,
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
    await ctx.db.patch(args.blockId, {
      content: args.content,
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
