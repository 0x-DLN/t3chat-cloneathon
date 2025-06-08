import "server-only"; // <-- ensure this file cannot be imported from the client

import { env } from "~/env";
import { db } from "~/server/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { baseUrl } from "../url";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  url: baseUrl,
  secret: env.BETTER_AUTH_SECRET,
  plugins: [nextCookies()], // make sure nextCookies is the last plugin in the array
});
