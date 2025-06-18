import { api } from "@convex/_generated/api";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { z } from "zod/v4";
import { env } from "~/env";
import type { Id } from "@convex/_generated/dataModel";
import { decrypt } from "~/lib/encryption";
import { providers, type ApiProviderId } from "~/shared/api-providers";
import { TRPCError } from "@trpc/server";

export const chatRouter = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        message: z.string(),
        model: z.string(),
        provider: z.enum(providers),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = await ctx.db.apiKey.findFirstOrThrow({
        where: {
          userId: ctx.session.user.id,
          provider: input.provider,
        },
      });

      const result = await ctx.convex.mutation(api.ai.sendMessage, {
        conversationId: input.conversationId as Id<"conversations">,
        message: input.message,
        model: input.model,
        provider: input.provider,
        apiKey: decrypt(apiKey.key),
        userId: ctx.session.user.id,
        secret: env.CONVEX_SECRET,
      });

      return result;
    }),
  sendBlockMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        model: z.string(),
        provider: z.enum(providers),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = await ctx.db.apiKey.findFirst({
        where: {
          userId: ctx.session.user.id,
          provider: input.provider,
        },
      });

      const { model, provider, conversationId } = input;

      const keyToUse = apiKey ? decrypt(apiKey.key) : getApiKey(provider);

      await ctx.convex.mutation(api.ai.generateBlocks, {
        model,
        provider,
        apiKey: keyToUse,
        conversationId: conversationId as Id<"conversations">,
        userId: ctx.session.user.id,
        secret: env.CONVEX_SECRET,
      });
    }),
});

function getApiKey(provider: ApiProviderId) {
  switch (provider) {
    case "openrouter":
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Free tier OpenRouter API key is not supported",
      });
    case "openai":
      return env.OPENAI_API_KEY;
    case "google":
      return env.GOOGLE_API_KEY;
    default:
      return "";
  }
}
