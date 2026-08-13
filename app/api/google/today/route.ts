import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { calendarPanel } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/google/today — kept for anything still calling the old path.
 * It now returns the merged calendar (Outlook + Google) in the old
 * `{ available, events }` envelope. New callers should use /api/calendar,
 * which carries the full per-source status.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  const store = await getStore();
  const panel = await calendarPanel(store);
  if (panel.status === "not_configured") {
    return NextResponse.json({ available: false, reason: "not_configured" });
  }
  if (panel.status === "unavailable") {
    return NextResponse.json({ available: false, reason: "unavailable" });
  }
  return NextResponse.json({ available: true, events: panel.data });
}
