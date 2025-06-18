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

export function calculateOrder(prevOrder?: number, nextOrder?: number) {
  if (prevOrder && nextOrder) {
    return (prevOrder + nextOrder) / 2;
  } else if (prevOrder) {
    return prevOrder + 1;
  } else if (nextOrder) {
    return nextOrder - 1;
  } else {
    return 1;
  }
}
