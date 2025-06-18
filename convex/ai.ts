import { v } from "convex/values";
import { internalAction, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { checkSecret } from "./utils";
import { internal } from "./_generated/api";
import { getAiModel } from "~/lib/ai/models";
import { type CoreMessage, streamText } from "ai";
import type { ApiProvider } from "@prisma/client";
import {
  convertTiptapJsonToMarkdown,
  markdownToTiptapJson,
} from "~/lib/markdown/parser";

export const generateBlocks = mutation({
  args: {
    conversationId: v.id("conversations"),
    model: v.string(),
    provider: v.union(v.literal("openai"), v.literal("google")),
    apiKey: v.string(),
    userId: v.string(),
    secret: v.string(),
    afterOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    checkSecret(args.secret);
    const { model, userId, provider, apiKey, conversationId, afterOrder } =
      args;

    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const conversationBlocks = await ctx.runQuery(
      internal.blocks.getBlocksAssistant,
      {
        conversationId,
      }
    );

    const aiBlock = await ctx.runMutation(
      internal.blocks.createAssistantBlock,
      {
        conversationId,
        model,
        afterOrder,
      }
    );

    const blocksToUse: CoreMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      ...conversationBlocks
        .map((block) => ({
          role: block.author,
          content: convertTiptapJsonToMarkdown(block.content),
        }))
        .filter((block) => block.content.length),
    ];

    // If the last message is from the assistant, we need to add a user block to tell it to continue.
    if (blocksToUse[blocksToUse.length - 1].role === "assistant") {
      blocksToUse.push({
        role: "user",
        content: "Continue",
      });
    }

    await ctx.scheduler.runAfter(0, internal.ai.streamBlockResponse, {
      messages: blocksToUse,
      model,
      provider,
      apiKey,
      conversationId,
      blockId: aiBlock.blockId,
      streamId: aiBlock.streamId,
    });
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    message: v.string(),
    model: v.string(),
    provider: v.union(v.literal("openai"), v.literal("google")),
    apiKey: v.string(),
    userId: v.string(),
    secret: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ conversationId: Id<"conversations"> }> => {
    checkSecret(args.secret);
    const { message, model, userId, provider, apiKey } = args;

    let conversationId: Id<"conversations"> | undefined = args.conversationId;

    if (!conversationId) {
      conversationId = await ctx.runMutation(internal.conversations.create, {
        userId,
        model,
      });
    }

    await ctx.runMutation(internal.streaming.addUserMessage, {
      conversationId,
      content: message,
    });

    const conversationMessages = await ctx.runQuery(
      internal.conversations.getMessagesByConversationId,
      {
        conversationId,
      }
    );

    const aiMessage = await ctx.runMutation(
      internal.streaming.createStreamingMessage,
      {
        conversationId,
        role: "assistant",
        initialContent: "",
      }
    );

    const messages: CoreMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      ...conversationMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];

    await ctx.scheduler.runAfter(0, internal.ai.streamResponse, {
      messages,
      model,
      provider,
      apiKey,
      conversationId,
      messageId: aiMessage.messageId,
      streamId: aiMessage.streamId,
    });

    return {
      conversationId,
    };
  },
});

type StreamBlockResponseArgs = {
  messages: CoreMessage[];
  model: string;
  provider: ApiProvider;
  apiKey: string;
  conversationId: Id<"conversations">;
  blockId: Id<"blocks">;
  streamId: string;
};

export const streamBlockResponse = internalAction({
  async handler(
    ctx,
    {
      messages,
      model,
      provider,
      apiKey,
      conversationId,
      blockId,
      streamId,
    }: StreamBlockResponseArgs
  ) {
    const aiModel = getAiModel(provider, model, apiKey);

    let accumulatedContent = "";

    const result = streamText({
      model: aiModel,
      messages,
    });

    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta": {
            accumulatedContent += part.textDelta;

            await ctx.runMutation(internal.blocks.updateBlockAssistant, {
              blockId,
              streamingContent: accumulatedContent,
              streamId,
              isStreaming: true,
            });
            break;
          }
          case "finish": {
            const tiptapJson = await markdownToTiptapJson(accumulatedContent);
            await ctx.runMutation(internal.blocks.completeBlockAssistant, {
              blockId,
              content: tiptapJson,
              streamId,
              metadata: {
                model: aiModel.modelId,
                finishReason: part.finishReason,
                tokens: part.usage?.totalTokens,
              },
            });
            break;
          }
          case "error": {
            console.error("stream error", part.error);
            await ctx.runMutation(internal.conversations.setError, {
              conversationId,
              error:
                part.error instanceof Error
                  ? part.error.message
                  : JSON.stringify(part.error),
            });
            break;
          }
          // Handle other part types if needed (step-start, step-finish, tool-call, tool-result, etc.)
          default: {
            console.log("unhandled part type", part.type);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Stream consumption error:", error);
      await ctx.runMutation(internal.conversations.setError, {
        conversationId,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
  },
});

type StreamResponseArgs = {
  messages: CoreMessage[];
  model: string;
  provider: ApiProvider;
  apiKey: string;
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  streamId: string;
};

export const streamResponse = internalAction({
  async handler(
    ctx,
    {
      messages,
      model,
      provider,
      apiKey,
      conversationId,
      messageId,
      streamId,
    }: StreamResponseArgs
  ) {
    const aiModel = getAiModel(provider, model, apiKey);

    let chunkIndex = 0;
    let accumulatedContent = "";

    const result = streamText({
      model: aiModel,
      messages,
    });

    // Consume the stream and handle all events directly
    try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta": {
            accumulatedContent += part.textDelta;

            await ctx.runMutation(internal.streaming.appendStreamChunk, {
              messageId: messageId,
              content: accumulatedContent,
              streamId: streamId,
              delta: part.textDelta,
              chunkIndex: chunkIndex++,
            });
            break;
          }
          case "finish": {
            await ctx.runMutation(internal.streaming.completeStream, {
              conversationId,
              finalContent: accumulatedContent,
              messageId: messageId,
              metadata: {
                model: aiModel.modelId,
                tokens: part.usage?.totalTokens,
                finishReason: part.finishReason,
              },
            });
            break;
          }
          case "error": {
            console.error("stream error", part.error);
            await ctx.runMutation(internal.conversations.setError, {
              conversationId,
              error:
                part.error instanceof Error
                  ? part.error.message
                  : JSON.stringify(part.error),
            });
            break;
          }
          // Handle other part types if needed (step-start, step-finish, tool-call, tool-result, etc.)
          default: {
            console.log("unhandled part type", part.type);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Stream consumption error:", error);
      await ctx.runMutation(internal.conversations.setError, {
        conversationId,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
    }
  },
});
