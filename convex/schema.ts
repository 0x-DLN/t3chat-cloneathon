import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    title: v.string(),
    userId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.union(
      v.literal("idle"),
      v.literal("streaming"),
      v.literal("completed"),
      v.literal("error")
    ),
    model: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_user_and_updated", ["userId", "updatedAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    streamId: v.optional(v.string()),
    isComplete: v.boolean(),
    createdAt: v.number(),
    metadata: v.optional(
      v.object({
        model: v.string(),
        tokens: v.optional(v.number()),
        finishReason: v.optional(v.string()),
      })
    ),
  }).index("by_conversation", ["conversationId"]),

  streamChunks: defineTable({
    messageId: v.id("messages"),
    streamId: v.string(),
    chunkIndex: v.number(),
    content: v.string(),
    timestamp: v.number(),
    metadata: v.optional(
      v.object({
        tokens: v.optional(v.number()),
        finishReason: v.optional(v.string()),
        delta: v.optional(v.string()),
      })
    ),
  })
    .index("by_message", ["messageId"])
    .index("by_stream_and_index", ["streamId", "chunkIndex"]),

  blocks: defineTable({
    conversationId: v.id("conversations"),
    author: v.union(v.literal("user"), v.literal("assistant")),

    // Rich text content (Tiptap JSON format stored as stringified JSON)
    content: v.optional(v.string()),

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
        finishReason: v.optional(v.string()),
      })
    ),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_and_order", ["conversationId", "order"])
    .index("by_conversation_and_inclusion", ["conversationId", "isExcluded"]),
});
