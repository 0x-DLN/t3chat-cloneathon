import { api } from "@convex/_generated/api";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { z } from "zod/v4";
import { env } from "~/env";
import type { Id } from "@convex/_generated/dataModel";
import { decrypt } from "~/lib/encryption";

export const chatRouter = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
        message: z.string(),
        model: z.string(),
        provider: z.enum(["openai", "google"]),
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
        provider: z.enum(["openai", "google"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = await ctx.db.apiKey.findFirstOrThrow({
        where: {
          userId: ctx.session.user.id,
          provider: input.provider,
        },
      });

      const { model, provider, conversationId } = input;

      await ctx.convex.mutation(api.ai.generateBlocks, {
        model,
        provider,
        apiKey: decrypt(apiKey.key),
        conversationId: conversationId as Id<"conversations">,
        userId: ctx.session.user.id,
        secret: env.CONVEX_SECRET,
      });
    }),
});
