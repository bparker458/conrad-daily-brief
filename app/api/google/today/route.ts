import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { fetchTodayEvents, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/google/today — today's Google Calendar events, read-only.
 * Honest states only: configured+working → events; not configured → the
 * section stays off; configured but failing → "unavailable", never stale
 * or fake data (Section 11, Phase 3).
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  if (!googleConfigured()) {
    return NextResponse.json({ available: false, reason: "not_configured" });
  }
  try {
    const events = await fetchTodayEvents();
    return NextResponse.json({ available: true, events });
  } catch (e) {
    console.error("[/api/google/today]", e);
    return NextResponse.json({ available: false, reason: "unavailable" });
  }
}
