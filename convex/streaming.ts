// convex/streaming.ts
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkAuth } from "./utils";

export const createStreamingMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    initialContent: v.string(),
  },
  handler: async (ctx, args) => {
    const streamId = crypto.randomUUID();

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.initialContent,
      streamId,
      isComplete: false,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.conversationId, {
      status: "streaming",
    });

    return { messageId, streamId };
  },
});

export const appendStreamChunk = internalMutation({
  args: {
    messageId: v.id("messages"),
    streamId: v.string(),
    chunkIndex: v.number(),
    content: v.string(),
    delta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("streamChunks", {
      messageId: args.messageId,
      streamId: args.streamId,
      chunkIndex: args.chunkIndex,
      content: args.content,
      timestamp: Date.now(),
      metadata: args.delta ? { delta: args.delta } : undefined,
    });

    await ctx.db.patch(args.messageId, {
      content: args.content,
    });

    return { success: true, chunkIndex: args.chunkIndex };
  },
});

export const completeStream = internalMutation({
  args: {
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    finalContent: v.string(),
    metadata: v.optional(
      v.object({
        model: v.string(),
        tokens: v.optional(v.number()),
        finishReason: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.finalContent,
      isComplete: true,
      metadata: args.metadata,
    });

    await ctx.db.patch(args.conversationId, {
      status: "completed",
    });

    return { success: true };
  },
});

export const addUserMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
      isComplete: true,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.conversationId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

export const getStreamChunks = query({
  args: {
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    fromChunkIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation?.userId !== identity.subject) {
      throw new Error("Unauthorized: Conversation does not belong to user");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    const chunks = await ctx.db
      .query("streamChunks")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .order("asc")
      .collect();

    const filteredChunks = args.fromChunkIndex
      ? chunks.filter((chunk) => chunk.chunkIndex >= args.fromChunkIndex!)
      : chunks;

    return {
      message,
      chunks: filteredChunks,
      isComplete: message.isComplete,
      totalChunks: chunks.length,
    };
  },
});

export const subscribeToStream = query({
  args: { messageId: v.id("messages"), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await checkAuth(ctx.auth);
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation?.userId !== identity.subject) {
      throw new Error("Unauthorized: Conversation does not belong to user");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    const chunks = await ctx.db
      .query("streamChunks")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .order("asc")
      .collect();

    return {
      messageId: args.messageId,
      content: message.content,
      isComplete: message.isComplete,
      chunkCount: chunks.length,
      lastUpdated: Math.max(
        ...chunks.map((c) => c.timestamp),
        message.createdAt
      ),
    };
  },
});
