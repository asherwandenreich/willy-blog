import { createHash } from "node:crypto";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import dbConnect from "@/lib/mongoose";

// Counts page views and unique visitors per day for the Backend page. A visitor is a hash of IP + browser +
// day + secret, so nobody is stored or trackable across days. The write happens after the response is sent.
const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|headless|lighthouse/i;

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const ua = request.headers.get("user-agent") ?? "";
  // Full page loads only. Link prefetches would otherwise count: on AWS, OpenNext ignores the matcher's `missing`
  // and Next hides the prefetch headers from proxy, but a browser marks a real page load with Sec-Fetch-Dest.
  // ponytail: in-site client navigations aren't counted either; views = pages opened directly or refreshed.
  const pageLoad = request.headers.get("sec-fetch-dest") === "document";
  // production only: local dev shares the same database and would skew the numbers
  if (process.env.NODE_ENV === "production" && request.method === "GET" && pageLoad && !BOT.test(ua)) {
    const day = new Date().toISOString().slice(0, 10); // UTC day
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
    const page = "/" + (request.nextUrl.pathname.split("/")[1] ?? "").replace(/[.$]/g, "_"); // top-level section, so /blogs/<id> counts as /blogs
    const visitor = createHash("sha256").update(`${ip}|${ua}|${day}|${process.env.BETTER_AUTH_SECRET}`).digest("base64url").slice(0, 16);
    event.waitUntil(
      dbConnect()
        // ponytail: one doc per day with a visitor array; fine to ~100k visitors/day (16MB doc cap)
        .then((m) => m.connection.db!.collection("visits").updateOne({ day }, { $inc: { views: 1, [`pages.${page}`]: 1 }, $addToSet: { visitors: visitor } }, { upsert: true }))
        .catch(() => {}), // analytics must never break a page
    );
  }
  return NextResponse.next();
}

export const config = {
  // pages only: no assets, API, images or the standalone SAT page, and not link prefetches
  matcher: [{
    source: "/((?!_next/|api/|images/|sat|models/|favicon.ico|manifest.webmanifest|.*\\.[a-z0-9]+$).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
  }],
};
