import z from "zod/v4";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { providers } from "~/shared/api-providers";
import { encrypt, decrypt } from "~/lib/encryption";

export const apiKeyRouter = createTRPCRouter({
  getApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const apiKeys = await ctx.db.apiKey.findMany({
      where: {
        userId: ctx.session.user.id,
      },
    });

    const openaiKey = apiKeys.find((key) => key.provider === "openai");
    const googleKey = apiKeys.find((key) => key.provider === "google");
    const openrouterKey = apiKeys.find((key) => key.provider === "openrouter");

    return {
      openai: openaiKey ? decrypt(openaiKey.key) : "",
      google: googleKey ? decrypt(googleKey.key) : "",
      openrouter: openrouterKey ? decrypt(openrouterKey.key) : "",
    };
  }),
  upsertApiKey: protectedProcedure
    .input(
      z.object({
        provider: z.enum(providers),
        key: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updatedKey = await ctx.db.apiKey.upsert({
        where: {
          provider_userId: {
            provider: input.provider,
            userId: ctx.session.user.id,
          },
        },
        update: {
          key: encrypt(input.key),
        },
        create: {
          key: encrypt(input.key),
          provider: input.provider,
          userId: ctx.session.user.id,
        },
      });

      return {
        [input.provider]: decrypt(updatedKey.key),
      } as { [key in typeof input.provider]: string };
    }),
  deleteApiKey: protectedProcedure
    .input(z.object({ provider: z.enum(providers) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.apiKey.delete({
        where: {
          provider_userId: {
            provider: input.provider,
            userId: ctx.session.user.id,
          },
        },
      });

      return {
        [input.provider]: "",
      } as { [key in typeof input.provider]: string };
    }),
});
