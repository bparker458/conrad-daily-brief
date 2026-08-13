import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { mailPanel } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/google/inbox — kept for anything still calling the old path.
 * Returns merged attention mail in the old `{ available, items }`
 * envelope. New callers should use /api/mail.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  const store = await getStore();
  const panel = await mailPanel(store);
  if (panel.status === "not_configured") {
    return NextResponse.json({ available: false, reason: "not_configured" });
  }
  if (panel.status === "unavailable") {
    return NextResponse.json({ available: false, reason: "unavailable" });
  }
  return NextResponse.json({ available: true, items: panel.data });
}
