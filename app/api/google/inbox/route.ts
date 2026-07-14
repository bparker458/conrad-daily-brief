import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { fetchFlaggedInbox, googleConfigured } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/google/inbox — flagged Gmail from the last 2 days, read-only.
 * Keywords: closing, escrow, insurance, refi, title, tax, farm, lease.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  if (!googleConfigured()) {
    return NextResponse.json({ available: false, reason: "not_configured" });
  }
  try {
    const items = await fetchFlaggedInbox();
    return NextResponse.json({ available: true, items });
  } catch (e) {
    console.error("[/api/google/inbox]", e);
    return NextResponse.json({ available: false, reason: "unavailable" });
  }
}
