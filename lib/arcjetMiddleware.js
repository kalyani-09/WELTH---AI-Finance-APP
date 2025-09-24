// lib/arcjetMiddleware.js

import arcjet, { shield, detectBot } from "@arcjet/next";
import { NextResponse } from "next/server";

export async function arcjetMiddleware(req) {
  // ✅ arcjet is default export, so we import it directly above
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

  // Arcjet recommends using protect()
  const result = await aj.protect(req);

  if (result.isDenied && result.isDenied()) {
    // Blocked request → return a 403
    return NextResponse.json({ error: "Blocked by Arcjet" }, { status: 403 });
  }

  // If not blocked, just return undefined so Clerk middleware continues
  return undefined;
}
