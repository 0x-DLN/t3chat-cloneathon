"use client";

import { useCallback, useMemo } from "react";
import { authClient } from "./client";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { env } from "~/env";

export function ConvexProviderWithBetterAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromBetterAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

function useAuthFromBetterAuth() {
  const { data: session, isPending } = authClient.useSession();

  const getSession = useCallback((forceRefreshToken: boolean) => {
    if (!forceRefreshToken && typeof window !== "undefined") {
      const jwt = localStorage.getItem("auth-jwt");
      if (jwt) {
        return jwt;
      }
    }
    return getToken();
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      return await getSession(forceRefreshToken);
    },
    [getSession]
  );
  return useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated: !!session,
      fetchAccessToken,
    }),
    [isPending, session, fetchAccessToken]
  );
}

async function getToken() {
  return new Promise<string | null>((resolve, reject) => {
    authClient.getSession({
      fetchOptions: {
        onSuccess: (ctx) => {
          const newJwt = ctx.response.headers.get("set-auth-jwt");
          if (newJwt) {
            localStorage.setItem("auth-jwt", newJwt);
            resolve(newJwt);
          } else {
            localStorage.removeItem("auth-jwt");
            resolve(null);
          }
        },
        onError: (err) => {
          console.error("Failed to get session token:", err);
          localStorage.removeItem("auth-jwt");
          reject(null);
        },
      },
    });
  });
}
