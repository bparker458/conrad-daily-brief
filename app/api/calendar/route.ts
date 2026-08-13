import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { calendarPanel } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/calendar — today plus the next 24 to 36 hours, from every
 * connected calendar, de-duped across accounts, prep flags included.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  const store = await getStore();
  return NextResponse.json(await calendarPanel(store));
}
