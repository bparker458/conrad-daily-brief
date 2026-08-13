import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events?limit=100 — the durable log of what actually happened
 * to tasks: finished, reopened, delegated, planned, noted, converted.
 *
 * This is what Conrad reads to know a thing was resolved, so it stops
 * resurfacing in the morning sweep, and what Brad's weekly review reads
 * to answer "what did I actually get done".
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("limit") || "100");
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 500) : 100;
    const store = await getStore();
    return NextResponse.json(await store.listEvents(limit));
  } catch (e) {
    console.error("[/api/events]", e);
    return apiError("events read failed", 500);
  }
}
