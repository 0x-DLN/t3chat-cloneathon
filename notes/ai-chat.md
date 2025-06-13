# Resumable Message Streaming with Convex Sync Engine - Implementation Plan

## Overview

This implementation plan details how to build a resumable message streaming system for LLM interactions using a **hybrid architecture**:

- **Prisma + PostgreSQL** for authentication and user management (Better Auth)
- **Convex** as the real-time sync engine for chat/streaming features

This approach gives you the stability of SQL-based auth with the real-time capabilities of Convex for chat.

## Architecture

### Core Components

1. **Prisma + PostgreSQL** - User auth, API keys, and user settings
2. **Convex** - Real-time chat, streaming, and message persistence
3. **Vercel AI SDK** - LLM streaming and text generation
4. **tRPC (Optional)** - Type-safe API layer bridging both databases
5. **React Frontend** - Client-side streaming consumption

### Data Flow

```
Auth: Browser → Better Auth → Prisma/PostgreSQL
Chat: LLM Stream → Convex → Real-time Sync → Client
```

## Implementation Steps

### Step 1: Enhanced Prisma Schema

We'll keep your existing auth tables and remove any chat-specific settings since all settings will be provided per message.

```prisma
// Add to your existing prisma/schema.prisma

model User {
  id            String    @id
  name          String
  email         String
  emailVerified Boolean
  image         String?
  createdAt     DateTime
  updatedAt     DateTime
  sessions      Session[]
  accounts      Account[]

  ApiKeys       ApiKey[]

  @@unique([email])
  @@map("user")
}
```

This keeps your user model clean and focused on authentication. All chat settings will be provided when sending messages, giving users maximum flexibility.

### Step 2: Convex Schema for Chat Features

Convex uses a different approach than Prisma - instead of migrations, you define your schema declaratively and Convex handles the database structure automatically.

```typescript
// convex/schema.ts
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
    settings: v.optional(
      v.object({
        model: v.string(),
        maxTokens: v.number(),
        temperature: v.number(),
        systemPrompt: v.optional(v.string()),
      })
    ),
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
        apiKeyProvider: v.optional(v.string()),
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
        delta: v.optional(v.string()),
      })
    ),
  })
    .index("by_message", ["messageId"])
    .index("by_stream_and_index", ["streamId", "chunkIndex"]),
});
```

This schema defines four main tables:

**conversations**: Stores chat conversations with their current status. The `settings` field captures what model/parameters were used for that conversation.

**messages**: Individual messages within conversations. Each message tracks whether it's complete and can optionally have a `streamId` if it's being streamed.

**streamChunks**: The key to resumable streaming - each chunk of streamed text gets stored with its position and timestamp. This is what makes resumption possible.

**userProfiles**: A lightweight copy of user data from Prisma, synced for convenience in Convex queries.

**Understanding the `delta` field:**

- **`content`**: The full accumulated text from the start of the stream up to this chunk
- **`delta`**: The incremental piece of text that was added in this specific chunk

For example, if an AI is generating "Hello world":

- Chunk 0: `content: "Hello"`, `delta: "Hello"`
- Chunk 1: `content: "Hello wo"`, `delta: " wo"`
- Chunk 2: `content: "Hello world"`, `delta: "rld"`

This dual storage allows you to reconstruct the full message from any point while also tracking exactly what each chunk contributed for smooth UI animations.

### Step 3: Conversation Management Functions

Before handling streaming, we need functions to manage conversations.

```typescript
// convex/conversations.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    title: v.string(),
    userId: v.string(),
    settings: v.object({
      model: v.string(),
      maxTokens: v.number(),
      temperature: v.number(),
      systemPrompt: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title,
      userId: args.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "idle",
      settings: args.settings,
    });

    return conversationId;
  },
});

export const getUserConversations = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const getConversationWithMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    return { ...conversation, messages };
  },
});

export const setError = mutation({
  args: {
    conversationId: v.id("conversations"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, {
      status: "error",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
```

### Step 4: Core Streaming Functions

These functions handle the actual streaming infrastructure - creating streams, appending chunks, and marking completion.

```typescript
// convex/streaming.ts
import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const createStreamingMessage = mutation({
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

export const appendStreamChunk = mutation({
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

    const message = await ctx.db.get(args.messageId);
    if (message) {
      await ctx.db.patch(args.messageId, {
        content: args.content,
      });
    }

    return { success: true, chunkIndex: args.chunkIndex };
  },
});

export const completeStream = mutation({
  args: {
    messageId: v.id("messages"),
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
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    await ctx.db.patch(args.messageId, {
      content: args.finalContent,
      isComplete: true,
      metadata: args.metadata,
    });

    await ctx.db.patch(message.conversationId, {
      status: "completed",
    });

    return { success: true };
  },
});

export const addUserMessage = mutation({
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
    fromChunkIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
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
```

This file contains the core streaming logic:

**createStreamingMessage**: Initializes a new streaming message and marks the conversation as "streaming". Returns both the message ID and a unique stream ID.

**appendStreamChunk**: Adds each chunk of streamed text to the database. This is called repeatedly as the AI generates text, creating the resumable stream.

**completeStream**: Marks a stream as finished and stores final metadata like token usage.

**addUserMessage**: Adds a new user message to the database.

**getStreamChunks**: Retrieves chunks for resumption - you can optionally start from a specific chunk index.

**subscribeToStream**: A query that returns the current state of a stream. Since it's a query, Convex will automatically re-run it when the underlying data changes, giving you real-time updates.

### Step 5: AI Streaming Action

Actions in Convex are special functions that can call external APIs (like OpenAI) and run other Convex functions.

```typescript
// convex/aiStreaming.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { api } from "./_generated/api";

export const streamAIResponse = action({
  args: {
    conversationId: v.id("conversations"),
    userMessage: v.string(),
    userId: v.string(),
    apiKey: v.string(),
    apiKeyProvider: v.string(),
    settings: v.object({
      model: v.string(),
      maxTokens: v.number(),
      temperature: v.number(),
      systemPrompt: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    try {
      const { messageId, streamId } = await ctx.runMutation(
        api.streaming.createStreamingMessage,
        {
          conversationId: args.conversationId,
          role: "assistant",
          initialContent: "",
        }
      );

      let accumulatedContent = "";
      let chunkIndex = 0;

      const conversation = await ctx.runQuery(
        api.conversations.getConversationWithMessages,
        { conversationId: args.conversationId }
      );

      const messages = [
        ...(args.settings.systemPrompt
          ? [{ role: "system" as const, content: args.settings.systemPrompt }]
          : []),
        ...(conversation?.messages || []).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user" as const, content: args.userMessage },
      ];

      // Create AI client based on provider and user's API key
      let aiModel;
      if (args.apiKeyProvider === "openai") {
        const openaiClient = openai({
          apiKey: args.apiKey,
        });
        aiModel = openaiClient(args.settings.model);
      } else if (args.apiKeyProvider === "google") {
        const googleClient = google({
          apiKey: args.apiKey,
        });
        aiModel = googleClient(args.settings.model);
      } else if (args.apiKeyProvider === "anthropic") {
        const anthropicClient = anthropic({
          apiKey: args.apiKey,
        });
        aiModel = anthropicClient(args.settings.model);
      } else {
        throw new Error(`Unsupported API provider: ${args.apiKeyProvider}`);
      }

      const result = streamText({
        model: aiModel,
        messages,
        maxTokens: args.settings.maxTokens,
        temperature: args.settings.temperature,
        onFinish: async ({ text, finishReason, usage }) => {
          await ctx.runMutation(api.streaming.completeStream, {
            messageId,
            finalContent: accumulatedContent,
            metadata: {
              model: args.settings.model,
              tokens: usage?.totalTokens,
              finishReason,
              apiKeyProvider: args.apiKeyProvider,
            },
          });
        },
      });

      for await (const textPart of result.textStream) {
        accumulatedContent += textPart;

        await ctx.runMutation(api.streaming.appendStreamChunk, {
          messageId,
          streamId,
          chunkIndex,
          content: accumulatedContent,
          delta: textPart,
        });

        chunkIndex++;
      }

      return { messageId, streamId, success: true };
    } catch (error) {
      console.error("AI Streaming error:", error);

      // Mark conversation as error state
      await ctx.runMutation(api.conversations.setError, {
        conversationId: args.conversationId,
        error: error.message,
      });

      throw error;
    }
  },
});
```

This action orchestrates the entire streaming process:

1. **Creates a streaming message** using our mutation
2. **Builds the conversation context** by fetching previous messages
3. **Streams from the AI SDK** using the provided settings
4. **Stores each chunk** as it arrives via `appendStreamChunk`
5. **Marks completion** when the stream ends

The key insight is that actions can call mutations (via `ctx.runMutation`) and queries (via `ctx.runQuery`), letting you compose complex operations from simpler building blocks.

### Step 6: tRPC Router Bridging Both Databases

This router provides a unified API that works with both your Prisma auth data and Convex chat data.

**Note**: You should create a shared helper function in `~/shared/model-utils.ts` to avoid duplicating the `getProviderForModel` logic across files:

```typescript
// shared/model-utils.ts
export function getProviderForModel(model: string): string {
  if (
    [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
    ].includes(model)
  ) {
    return "openai";
  } else if (
    [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-thinking",
      "gemini-2.5-pro",
    ].includes(model)
  ) {
    return "google";
  } else {
    throw new Error(`Unsupported model: ${model}`);
  }
}
```

Then import it in both the API route and tRPC router instead of duplicating the function.

```typitten
// server/api/routers/chat.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { ConvexHttpClient } from "convex/browser";
import { api } from "~/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Helper function to determine provider based on model (matching api-providers.ts)
function getProviderForModel(model: string): string {
  if (
    [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
    ].includes(model)
  ) {
    return "openai";
  } else if (
    [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-thinking",
      "gemini-2.5-pro",
    ].includes(model)
  ) {
    return "google";
  } else {
    throw new Error(`Unsupported model: ${model}`);
  }
}

export const chatRouter = createTRPCRouter({
  startConversation: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        userMessage: z.string(),
        settings: z.object({
          model: z.string(),
          maxTokens: z.number(),
          temperature: z.number(),
          systemPrompt: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Determine required provider based on model
      let requiredProvider: string;
      try {
        requiredProvider = getProviderForModel(input.settings.model);
      } catch (error) {
        throw new Error(error.message);
      }

      // Check if user has the required API key
      const apiKey = await ctx.db.apiKey.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: requiredProvider,
        },
      });

      if (!apiKey) {
        throw new Error(
          `No ${requiredProvider} API key found. Please add one in settings.`
        );
      }

      const conversationId = await convex.mutation(api.conversations.create, {
        title: input.title,
        userId: ctx.session.user.id,
        settings: input.settings,
      });

      return {
        conversationId,
        hasApiKey: true,
        requiredProvider,
      };
    }),

  getUserConversations: protectedProcedure.query(async ({ ctx }) => {
    return await convex.query(api.conversations.getUserConversations, {
      userId: ctx.session.user.id,
    });
  }),

  getApiKeyInfo: protectedProcedure.query(async ({ ctx }) => {
    const apiKeys = await ctx.db.apiKey.findMany({
      where: { userId: ctx.session.user.id },
      select: { provider: true, id: true, createdAt: true },
    });

    return apiKeys;
  }),

  validateModelSupport: protectedProcedure
    .input(z.object({ model: z.string() }))
    .query(async ({ input, ctx }) => {
      let requiredProvider: string;

      try {
        requiredProvider = getProviderForModel(input.model);
      } catch (error) {
        return { supported: false, error: error.message };
      }

      const hasApiKey = await ctx.db.apiKey.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: requiredProvider,
        },
      });

      return {
        supported: true,
        hasApiKey: !!hasApiKey,
        requiredProvider,
      };
    }),
});
```

This router acts as a bridge between your two databases:

**startConversation**: Checks for API keys in Prisma, then creates a conversation in Convex. Notice how it uses both database systems in a single operation.

**getUserConversations**: Fetches conversations from Convex for the authenticated user.

**getApiKeyInfo**: Gets API key metadata from Prisma without exposing the actual keys.

The `ConvexHttpClient` lets you call Convex functions from your tRPC endpoints, effectively bridging the two systems.

### Step 7: Secure API Route for Streaming

Since API keys are sensitive, the actual streaming needs to happen in a secure server environment where you can access the keys.

```typescript
// app/api/chat/stream/route.ts
import { auth } from "~/lib/auth/server";
import { db } from "~/server/db";
import { ConvexHttpClient } from "convex/browser";
import { api } from "~/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Helper function to determine provider based on model (matching api-providers.ts)
function getProviderForModel(model: string): string {
  if (
    [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
    ].includes(model)
  ) {
    return "openai";
  } else if (
    [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-flash-thinking",
      "gemini-2.5-pro",
    ].includes(model)
  ) {
    return "google";
  } else {
    throw new Error(`Unsupported model: ${model}`);
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { conversationId, userMessage, settings } = await request.json();

  // Determine provider based on model using our helper function
  let provider: string;
  try {
    provider = getProviderForModel(settings.model);
  } catch (error) {
    return new Response(error.message, { status: 400 });
  }

  // Fetch the appropriate API key
  const userApiKey = await db.apiKey.findFirst({
    where: {
      userId: session.user.id,
      provider: provider,
    },
  });

  if (!userApiKey) {
    return new Response(
      `No ${provider} API key found. Please add one in settings.`,
      {
        status: 400,
      }
    );
  }

  try {
    // Store user message first
    await convex.mutation(api.messages.addUserMessage, {
      conversationId,
      content: userMessage,
    });

    // Start AI streaming
    const result = await convex.action(api.aiStreaming.streamAIResponse, {
      conversationId,
      userMessage,
      userId: session.user.id,
      apiKey: userApiKey.apiKey,
      apiKeyProvider: provider,
      settings,
    });

    return Response.json(result);
  } catch (error) {
    console.error("Streaming error:", error);
    return new Response(`Streaming failed: ${error.message}`, { status: 500 });
  }
}
```

This API route handles the secure aspects:

1. **Authenticates the user** using Better Auth
2. **Fetches the user's API key** from Prisma (the sensitive part)
3. **Calls the Convex action** to handle the streaming
4. **Returns the result** to the client

This separation keeps API keys secure in your Prisma database while leveraging Convex for the streaming infrastructure.

### Step 8: React Component Integration

Finally, we create a React component that ties everything together using familiar hooks.

```tsx
// components/ChatInterface.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQuery as useConvexQuery } from "convex/react";
import { api as convexApi } from "~/convex/_generated/api";
import { api as trpcApi } from "~/utils/api";
import { useSession } from "~/lib/auth/client";
import { useStreamingMessage } from "~/hooks/useStreamingMessage";
import { API_PROVIDERS } from "~/shared/api-providers";

export function ChatInterface() {
  const { data: session } = useSession();
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4o");

  const { data: conversations } = trpcApi.chat.getUserConversations.useQuery();
  const { data: apiKeys } = trpcApi.chat.getApiKeyInfo.useQuery();
  const { data: modelSupport } = trpcApi.chat.validateModelSupport.useQuery(
    { model: selectedModel },
    { enabled: !!selectedModel }
  );
  const startConversation = trpcApi.chat.startConversation.useMutation();

  const handleNewChat = async () => {
    if (!input.trim() || !modelSupport?.hasApiKey) return;

    const settings = {
      model: selectedModel,
      maxTokens: 4000,
      temperature: 0.7,
      systemPrompt: "You are a helpful assistant.",
    };

    try {
      const result = await startConversation.mutateAsync({
        title: input.slice(0, 50),
        userMessage: input,
        settings,
      });

      setCurrentConversationId(result.conversationId);

      await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: result.conversationId,
          userMessage: input,
          settings,
        }),
      });

      setInput("");
    } catch (error) {
      console.error("Failed to start chat:", error);
      alert(error.message || "Failed to start chat");
    }
  };

  if (!session) {
    return (
      <div className="p-4">
        <p>Please sign in to start chatting.</p>
      </div>
    );
  }

  // Build available models from API_PROVIDERS
  const availableModels = Object.entries(API_PROVIDERS).flatMap(
    ([providerId, provider]) =>
      provider.models.map((model) => ({
        ...model,
        provider: providerId,
      }))
  );

  const userProviders = new Set(apiKeys?.map((key) => key.provider) || []);

  return (
    <div className="flex h-screen">
      <div className="w-1/4 border-r">
        <h2 className="p-4 font-bold">Conversations</h2>
        {conversations?.map((conv) => (
          <div
            key={conv._id}
            className="p-2 cursor-pointer hover:bg-gray-100"
            onClick={() => setCurrentConversationId(conv._id)}
          >
            {conv.title}
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {currentConversationId ? (
          <ConversationView
            conversationId={currentConversationId}
            user={session.user}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="max-w-md w-full p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Select Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  {Object.entries(API_PROVIDERS).map(
                    ([providerId, provider]) => (
                      <optgroup key={providerId} label={provider.name}>
                        {provider.models.map((model) => (
                          <option
                            key={model.id}
                            value={model.id}
                            disabled={!userProviders.has(providerId)}
                          >
                            {model.label}{" "}
                            {!userProviders.has(providerId) && "(No API key)"}
                          </option>
                        ))}
                      </optgroup>
                    )
                  )}
                </select>
                {modelSupport && !modelSupport.hasApiKey && (
                  <p className="text-sm text-red-600 mt-1">
                    Please add a {modelSupport.requiredProvider} API key to use
                    this model.
                  </p>
                )}
              </div>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNewChat()}
                placeholder="Start a new conversation..."
                className="w-full p-2 border rounded-md mb-2"
              />
              <button
                onClick={handleNewChat}
                disabled={!input.trim() || !modelSupport?.hasApiKey}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-md disabled:bg-gray-300"
              >
                Start Chat
              </button>

              {apiKeys?.length === 0 && (
                <p className="text-sm text-gray-600 mt-2">
                  Add API keys in settings to start chatting.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

This component demonstrates the complete flow:

1. **Checks for authentication** before allowing chat
2. **Dynamic model selection** with real-time API key validation using `API_PROVIDERS`
3. **Provider-grouped UI** - organizes models by provider (OpenAI, Google) with clear groupings
4. **Enhanced error handling** - clear messages when API keys are missing
5. **Uses tRPC** to interact with both databases seamlessly
6. **Creates conversations** with user-selected models and settings
7. **Calls the streaming API** to initiate AI responses with proper API keys
8. **Provides a clean UI** for managing conversations and model selection

The beauty of this architecture is that it feels like using a single system even though you're working with two databases. tRPC provides the unified API layer, while Convex handles the real-time aspects automatically.

The component now uses the centralized `API_PROVIDERS` configuration, making it easy to add new models and providers without updating multiple files.

## Key Benefits of Hybrid Approach

1. **Auth Stability** - Keep your working Better Auth + Prisma setup
2. **Real-time Chat** - Get Convex's real-time capabilities for streaming
3. **Clean Data Separation** - Auth data in SQL, chat data in Convex (no duplication)
4. **Best of Both Worlds** - SQL for complex queries, Convex for real-time
5. **Flexible Settings** - Users provide their own API keys and settings per message
6. **Simple Architecture** - No data syncing between databases required

**This hybrid approach gives you the stability of SQL-based auth with the real-time capabilities of Convex for chat, while keeping the architecture clean and avoiding data duplication.**

## Detailed Message Flow Examples and Performance Optimizations

### Message Flow Walkthrough

Here's a detailed walkthrough of how messages flow through the system, showing the differences between first, second, and third messages:

#### **First Message Flow**

**User sends their first message: "What is React?"**

1. **Client-Side (React Component)**:

   ```tsx
   // User clicks send button in chat interface
   const sendMessage = () => {
     // Optimistic update - immediately show user message
     setMessages((prev) => [
       ...prev,
       {
         id: tempId,
         content: "What is React?",
         role: "user",
         status: "sending",
       },
     ]);

     // Start streaming AI response placeholder
     setMessages((prev) => [
       ...prev,
       {
         id: tempId + 1,
         content: "",
         role: "assistant",
         status: "streaming",
       },
     ]);

     // Trigger Convex mutation
     sendMessageMutation({ content: "What is React?", chatId });
   };
   ```

2. **Convex Mutation (Server-Side)**:

   ```ts
   // convex/messages.ts
   export const sendMessage = mutation({
     args: { content: v.string(), chatId: v.id("chats") },
     handler: async (ctx, { content, chatId }) => {
       // Store user message in database
       const userMessage = await ctx.db.insert("messages", {
         chatId,
         content,
         role: "user",
         timestamp: Date.now(),
       });

       // Create AI response placeholder
       const aiMessageId = await ctx.db.insert("messages", {
         chatId,
         content: "",
         role: "assistant",
         timestamp: Date.now(),
         status: "streaming",
       });

       // Schedule AI response generation
       await ctx.scheduler.runAfter(0, internal.ai.generateResponse, {
         messageId: aiMessageId,
         prompt: content,
         chatId,
       });

       return { userMessage, aiMessageId };
     },
   });
   ```

3. **Convex Action (AI Processing)**:

   ```ts
   // convex/ai.ts
   export const generateResponse = internalAction({
     args: {
       messageId: v.id("messages"),
       prompt: v.string(),
       chatId: v.id("chats"),
     },
     handler: async (ctx, { messageId, prompt, chatId }) => {
       // Stream response from AI service
       const stream = await openai.chat.completions.create({
         model: "gpt-4",
         messages: [{ role: "user", content: prompt }],
         stream: true,
       });

       let fullResponse = "";

       for await (const chunk of stream) {
         const content = chunk.choices[0]?.delta?.content || "";
         fullResponse += content;

         // Update message in real-time via mutation
         await ctx.runMutation(internal.messages.updateStreamingMessage, {
           messageId,
           content: fullResponse,
           isComplete: false,
         });
       }

       // Mark as complete
       await ctx.runMutation(internal.messages.updateStreamingMessage, {
         messageId,
         content: fullResponse,
         isComplete: true,
       });
     },
   });
   ```

4. **Real-time Updates (Convex Subscription)**:

   ```tsx
   // Client subscribes to chat messages
   const messages = useQuery(api.messages.getMessages, { chatId });

   // Convex automatically pushes updates as they happen
   // Each streaming chunk triggers a re-render with new content
   ```

**Key characteristics of first message:**

- **Cold start**: No previous context or conversation history
- **Database creation**: New chat session may be created
- **Full AI model initialization**: First API call to AI service
- **Optimistic UI**: Immediate feedback before server confirmation

#### **Second Message Flow**

**User sends: "Can you give me a code example?"**

1. **Client-Side**:

   ```tsx
   const sendMessage = () => {
     // Optimistic update with existing conversation context
     setMessages((prev) => [
       ...prev,
       {
         id: tempId,
         content: "Can you give me a code example?",
         role: "user",
         status: "sending",
       },
     ]);

     // Start new AI response in same conversation
     setMessages((prev) => [
       ...prev,
       {
         id: tempId + 1,
         content: "",
         role: "assistant",
         status: "streaming",
       },
     ]);

     sendMessageMutation({
       content: "Can you give me a code example?",
       chatId,
     });
   };
   ```

2. **Convex Mutation** (same as before but with context):

   ```ts
   export const sendMessage = mutation({
     args: { content: v.string(), chatId: v.id("chats") },
     handler: async (ctx, { content, chatId }) => {
       // Get conversation history for context
       const previousMessages = await ctx.db
         .query("messages")
         .withIndex("by_chat", (q) => q.eq("chatId", chatId))
         .order("desc")
         .take(10);

       const userMessage = await ctx.db.insert("messages", {
         chatId,
         content,
         role: "user",
         timestamp: Date.now(),
       });

       const aiMessageId = await ctx.db.insert("messages", {
         chatId,
         content: "",
         role: "assistant",
         timestamp: Date.now(),
         status: "streaming",
       });

       // Pass conversation history to AI
       await ctx.scheduler.runAfter(
         0,
         internal.ai.generateResponseWithContext,
         {
           messageId: aiMessageId,
           prompt: content,
           chatId,
           previousMessages: previousMessages.reverse(),
         }
       );

       return { userMessage, aiMessageId };
     },
   });
   ```

3. **Enhanced AI Processing**:

   ```ts
   export const generateResponseWithContext = internalAction({
     handler: async (ctx, { messageId, prompt, chatId, previousMessages }) => {
       // Build conversation history for AI
       const conversation = previousMessages.map((msg) => ({
         role: msg.role,
         content: msg.content,
       }));

       conversation.push({ role: "user", content: prompt });

       const stream = await openai.chat.completions.create({
         model: "gpt-4",
         messages: conversation, // Now includes context!
         stream: true,
       });

       // Same streaming logic as before
       let fullResponse = "";
       for await (const chunk of stream) {
         const content = chunk.choices[0]?.delta?.content || "";
         fullResponse += content;

         await ctx.runMutation(internal.messages.updateStreamingMessage, {
           messageId,
           content: fullResponse,
           isComplete: false,
         });
       }

       await ctx.runMutation(internal.messages.updateStreamingMessage, {
         messageId,
         content: fullResponse,
         isComplete: true,
       });
     },
   });
   ```

**Key differences from first message:**

- **Warm context**: Includes previous conversation history
- **Faster processing**: Chat session already exists
- **Enhanced AI responses**: Better context awareness
- **Optimized queries**: Leverages existing chat data

#### **Third Message Flow**

**User sends: "Make it shorter please"**

1. **Client-Side** (similar optimistic updates)

2. **Enhanced Context Management**:

   ```ts
   export const sendMessage = mutation({
     handler: async (ctx, { content, chatId }) => {
       // More sophisticated context retrieval
       const recentMessages = await ctx.db
         .query("messages")
         .withIndex("by_chat", (q) => q.eq("chatId", chatId))
         .order("desc")
         .take(20); // Larger context window

       // Analyze message for intent (reference to previous response)
       const needsContext =
         content.toLowerCase().includes("it") ||
         content.toLowerCase().includes("that") ||
         content.toLowerCase().includes("shorter");

       const userMessage = await ctx.db.insert("messages", {
         chatId,
         content,
         role: "user",
         timestamp: Date.now(),
         requiresContext: needsContext,
       });

       const aiMessageId = await ctx.db.insert("messages", {
         chatId,
         content: "",
         role: "assistant",
         timestamp: Date.now(),
         status: "streaming",
       });

       await ctx.scheduler.runAfter(0, internal.ai.generateContextualResponse, {
         messageId: aiMessageId,
         prompt: content,
         chatId,
         recentMessages: recentMessages.reverse(),
         requiresContext: needsContext,
       });

       return { userMessage, aiMessageId };
     },
   });
   ```

3. **Advanced AI Processing**:

   ```ts
   export const generateContextualResponse = internalAction({
     handler: async (
       ctx,
       { messageId, prompt, chatId, recentMessages, requiresContext }
     ) => {
       // Smart context selection
       let contextMessages = recentMessages;

       if (requiresContext) {
         // Include more context for reference-based requests
         contextMessages = recentMessages.slice(-15);
       } else {
         // Standard context window
         contextMessages = recentMessages.slice(-8);
       }

       const conversation = contextMessages.map((msg) => ({
         role: msg.role,
         content: msg.content,
       }));

       // Add system message for context-aware responses
       if (requiresContext) {
         conversation.unshift({
           role: "system",
           content:
             "The user is referring to your previous response. Provide a more concise version.",
         });
       }

       conversation.push({ role: "user", content: prompt });

       // Same streaming logic with enhanced context
       const stream = await openai.chat.completions.create({
         model: "gpt-4",
         messages: conversation,
         stream: true,
         max_tokens: requiresContext ? 200 : 1000, // Shorter for refinements
       });

       let fullResponse = "";
       for await (const chunk of stream) {
         const content = chunk.choices[0]?.delta?.content || "";
         fullResponse += content;

         await ctx.runMutation(internal.messages.updateStreamingMessage, {
           messageId,
           content: fullResponse,
           isComplete: false,
         });
       }

       await ctx.runMutation(internal.messages.updateStreamingMessage, {
         messageId,
         content: fullResponse,
         isComplete: true,
       });
     },
   });
   ```

**Key differences from second message:**

- **Intelligent context**: Detects references and adjusts context accordingly
- **Advanced intent recognition**: Understands refinement requests
- **Optimized responses**: Adjusts response length/style based on request type
- **Enhanced system prompts**: Provides better instructions to AI

---

### React Rendering Optimizations for Streaming Chat

To prevent unnecessary re-renders while maintaining a giant flowing document (instead of individual chat bubbles), here are the key optimization strategies:

#### **1. Virtualized Message Streaming**

```tsx
// components/StreamingChatDocument.tsx
import { memo, useMemo, useCallback } from "react";
import { FixedSizeList as List } from "react-window";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  status: "complete" | "streaming";
}

const StreamingChatDocument = memo(({ messages }: { messages: Message[] }) => {
  // Memoize the combined document content
  const documentContent = useMemo(() => {
    return messages.map((msg) => ({
      id: msg.id,
      content: msg.content,
      role: msg.role,
      isStreaming: msg.status === "streaming",
    }));
  }, [messages]);

  // Only re-render when content actually changes
  const renderMessage = useCallback(
    ({ index, style }) => {
      const message = documentContent[index];

      return (
        <div style={style} key={message.id}>
          <MessageContent
            content={message.content}
            role={message.role}
            isStreaming={message.isStreaming}
          />
        </div>
      );
    },
    [documentContent]
  );

  return (
    <List
      height={600}
      itemCount={documentContent.length}
      itemSize={100}
      itemData={documentContent}
    >
      {renderMessage}
    </List>
  );
});
```

#### **2. Smart Content Diffing**

```tsx
// components/MessageContent.tsx
import { memo } from "react";

interface MessageContentProps {
  content: string;
  role: "user" | "assistant";
  isStreaming: boolean;
}

const MessageContent = memo(
  ({ content, role, isStreaming }: MessageContentProps) => {
    return (
      <div className={`message ${role}`}>
        <StreamingText text={content} isStreaming={isStreaming} />
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if content actually changed
    return (
      prevProps.content === nextProps.content &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.role === nextProps.role
    );
  }
);

// Optimized text streaming component
const StreamingText = memo(
  ({ text, isStreaming }: { text: string; isStreaming: boolean }) => {
    return (
      <div className="streaming-text">
        {text}
        {isStreaming && <span className="cursor">▊</span>}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Only re-render if text changed significantly (batch small changes)
    const contentChanged = prevProps.text !== nextProps.text;
    const streamingChanged = prevProps.isStreaming !== nextProps.isStreaming;

    return !contentChanged && !streamingChanged;
  }
);
```

#### **3. Debounced Stream Updates**

```tsx
// hooks/useStreamingOptimization.ts
import { useCallback, useRef } from "react";
import { debounce } from "lodash";

export const useStreamingOptimization = () => {
  const pendingUpdates = useRef<Map<string, string>>(new Map());

  // Debounce rapid streaming updates
  const debouncedUpdate = useCallback(
    debounce((messageId: string, content: string, updateFn: Function) => {
      updateFn(messageId, content);
      pendingUpdates.current.delete(messageId);
    }, 50), // Update every 50ms instead of every character
    []
  );

  const queueStreamingUpdate = useCallback(
    (messageId: string, content: string, updateFn: Function) => {
      pendingUpdates.current.set(messageId, content);
      debouncedUpdate(messageId, content, updateFn);
    },
    [debouncedUpdate]
  );

  return { queueStreamingUpdate };
};
```

#### **4. Context-Based State Management**

```tsx
// context/ChatContext.tsx
import { createContext, useContext, useReducer, memo } from "react";

interface ChatState {
  messages: Message[];
  streamingMessageId: string | null;
  isGenerating: boolean;
}

const ChatContext = createContext<{
  state: ChatState;
  dispatch: React.Dispatch<ChatAction>;
} | null>(null);

const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    case "UPDATE_STREAMING_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId
            ? { ...msg, content: action.content }
            : msg
        ),
      };
    case "COMPLETE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId ? { ...msg, status: "complete" } : msg
        ),
        streamingMessageId: null,
      };
    default:
      return state;
  }
};

// Provider component
export const ChatProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    const [state, dispatch] = useReducer(chatReducer, {
      messages: [],
      streamingMessageId: null,
      isGenerating: false,
    });

    return (
      <ChatContext.Provider value={{ state, dispatch }}>
        {children}
      </ChatContext.Provider>
    );
  }
);
```

#### **5. Intersection Observer for Lazy Rendering**

```tsx
// components/LazyMessageRenderer.tsx
import { memo, useEffect, useRef, useState } from "react";

const LazyMessageRenderer = memo(
  ({ message, index }: { message: Message; index: number }) => {
    const [isVisible, setIsVisible] = useState(false);
    const elementRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => setIsVisible(entry.isIntersecting),
        { threshold: 0.1 }
      );

      if (elementRef.current) {
        observer.observe(elementRef.current);
      }

      return () => observer.disconnect();
    }, []);

    return (
      <div ref={elementRef} className="message-container">
        {isVisible ? (
          <MessageContent {...message} />
        ) : (
          <div className="message-placeholder" style={{ height: "100px" }} />
        )}
      </div>
    );
  }
);
```

#### **6. RAF-based Smooth Streaming**

```tsx
// hooks/useSmoothStreaming.ts
import { useCallback, useRef } from "react";

export const useSmoothStreaming = () => {
  const rafId = useRef<number>();
  const updateQueue = useRef<Array<() => void>>([]);

  const scheduleUpdate = useCallback((updateFn: () => void) => {
    updateQueue.current.push(updateFn);

    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        // Process all queued updates in a single frame
        updateQueue.current.forEach((fn) => fn());
        updateQueue.current = [];
        rafId.current = undefined;
      });
    }
  }, []);

  return { scheduleUpdate };
};
```

#### **Key Benefits of This Approach:**

1. **Minimal Re-renders**: Only streaming messages update, completed messages stay static
2. **Batched Updates**: Multiple character updates are debounced into single renders
3. **Memory Efficient**: Virtualization handles large conversation histories
4. **Smooth Performance**: RAF ensures updates happen at optimal times
5. **Lazy Loading**: Off-screen messages don't render until needed
6. **Giant Document Feel**: All messages flow together seamlessly without individual bubble re-renders

This optimization strategy ensures your AI chat maintains excellent performance even with long conversations and rapid streaming updates, while preserving the smooth, document-like user experience you want to achieve.
