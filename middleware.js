import { NextResponse } from "next/server";

// Only match protected routes
const PROTECTED_ROUTES = ["/dashboard/:path*", "/account/:path*", "/transaction/:path*"];

export const config = {
  matcher: PROTECTED_ROUTES,
};

export async function middleware(req) {
  // Dynamically import heavy libraries at runtime
  const [{ default: arcjet, createMiddleware: createArcjetMiddleware, detectBot, shield }, 
         { clerkMiddleware, createRouteMatcher }] = await Promise.all([
    import("@arcjet/next"),
    import("@clerk/nextjs/server"),
  ]);

  // Setup route matcher
  const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTES);

  // Arcjet middleware
  const aj = arcjet({
    key: process.env.ARCJET_KEY,
    rules: [
      shield({ mode: "LIVE" }),
      detectBot({
        mode: "LIVE",
        allow: ["CATEGORY:SEARCH_ENGINE", "GO_HTTP"],
      }),
    ],
  });

  // Clerk middleware
  const clerk = clerkMiddleware(async (auth, req) => {
    const { userId } = await auth();

    if (!userId && isProtectedRoute(req)) {
      const { redirectToSignIn } = await auth();
      return redirectToSignIn();
    }

    return NextResponse.next();
  });

  // Run Arcjet first, then Clerk
  const ajResponse = await aj(req);
  if (ajResponse) return ajResponse;

  const clerkResponse = await clerk(req);
  if (clerkResponse) return clerkResponse;

  return NextResponse.next();
}
