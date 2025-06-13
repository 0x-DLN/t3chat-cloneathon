import z from "zod/v4";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { type ApiProviderId } from "~/shared/api-providers";
import { encrypt, decrypt } from "~/lib/encryption";

export const apiKeyRouter = createTRPCRouter({
  getApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const apiKeys = await ctx.db.apiKey.findMany({
      where: {
        userId: ctx.session.user.id,
      },
    });

    return apiKeys.reduce((acc, key) => {
      acc[key.provider] = decrypt(key.key);
      return acc;
    }, {} as Record<ApiProviderId, string>);
  }),
  upsertApiKeys: protectedProcedure
    .input(
      z.object({
        openai: z.string(),
        google: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const providerKeys = Object.entries(input) as [ApiProviderId, string][];

      const updatedKeys = await Promise.all(
        providerKeys.map(([provider, key]) => {
          return ctx.db.apiKey.upsert({
            where: {
              provider_userId: { provider, userId: ctx.session.user.id },
            },
            update: {
              key: encrypt(key),
              provider,
            },
            create: {
              key: encrypt(key),
              provider,
              userId: ctx.session.user.id,
            },
          });
        })
      );

      return updatedKeys.reduce((acc, key) => {
        acc[key.provider] = decrypt(key.key);
        return acc;
      }, {} as Record<ApiProviderId, string>);
    }),
});
