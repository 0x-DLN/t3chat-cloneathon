import type { Auth } from "convex/server";

export async function checkAuth(auth: Auth) {
  const identity = await auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated: No identity found");
  }
  return identity;
}

export function checkSecret(secret: string) {
  const expectedSecret = process.env.CONVEX_SECRET!;

  if (secret !== expectedSecret) {
    throw new Error("Unauthorized: Invalid secret.");
  }
}
