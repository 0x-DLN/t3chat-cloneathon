import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from auth page
  if (sessionCookie && pathname === "/auth") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Redirect unauthenticated users to auth page for protected routes
  if (!sessionCookie && pathname.startsWith("/settings")) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/settings/:path*", "/auth"],
};
