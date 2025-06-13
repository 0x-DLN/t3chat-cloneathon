import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { apiKeyRouter } from "~/server/api/routers/api-key";
import { chatRouter } from "~/server/api/routers/chat";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  apiKey: apiKeyRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
