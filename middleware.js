// middleware.js

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// define which routes you want protected
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/account(.*)",
  "/transaction(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Clerk logic
  const { userId, redirectToSignIn, isAuthenticated } = await auth();

  // If route is a protected route and user not authenticated → redirect
  if (!isAuthenticated && isProtectedRoute(req)) {
    return redirectToSignIn();
  }

  // Otherwise, proceed
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
