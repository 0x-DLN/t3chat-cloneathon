import "server-only"; // <-- ensure this file cannot be imported from the client

import { env } from "~/env";
import { db } from "~/server/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { baseUrl } from "../url";
import { jwt } from "better-auth/plugins";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  url: baseUrl,
  secret: env.BETTER_AUTH_SECRET,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [
    jwt({
      jwks: {
        keyPairConfig: {
          alg: "RS256",
        },
      },
      jwt: {
        expirationTime: "1h",
        audience: "convex",
      },
    }),
    nextCookies(),
  ], // make sure nextCookies is the last plugin in the array
});
