import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { LZB_DAILY_NUMBERS } from "@/lib/numbers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/numbers — La-Z-Boy daily numbers for the brief (read-only). */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  return NextResponse.json(LZB_DAILY_NUMBERS);
}
