// middleware.js
import arcjet, { detectBot, shield } from "@arcjet/next";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/account(.*)",
  "/transaction(.*)",
]);

// Configure Arcjet
const aj = arcjet({
  key: process.env.ARCJET_KEY,
  characteristics: ["ip", "userId"], // ✅ tell Arcjet we will provide ip + userId
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE", "GO_HTTP"],
    }),
  ],
});

// Main middleware
export default clerkMiddleware(async (auth, req) => {
  // Get userId from Clerk (even if not logged in, it's null)
  const { userId, redirectToSignIn } = await auth();

  // Build characteristics for Arcjet
  const characteristics = {
    ip: req.ip ?? "127.0.0.1", // fallback for local dev
    userId: userId ?? "anonymous",
  };

  // Run Arcjet first
  const decision = await aj.protect(req, { characteristics });
  if (decision.isDenied && decision.isDenied()) {
    return NextResponse.json({ error: "Blocked by Arcjet" }, { status: 403 });
  }

  // Run Clerk auth check
  if (!userId && isProtectedRoute(req)) {
    return redirectToSignIn();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
