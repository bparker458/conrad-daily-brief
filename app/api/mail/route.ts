import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { mailPanel } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mail — mail that is actually waiting on Brad, from every
 * connected account, merged. Flagged, unread from a priority sender, or
 * unread more than a day. A provider that fails is named in `error`
 * rather than quietly dropped.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  const store = await getStore();
  return NextResponse.json(await mailPanel(store));
}
