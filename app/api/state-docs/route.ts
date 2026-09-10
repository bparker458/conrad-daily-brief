import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { listStateDocs, NotConfiguredError } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/state-docs — every rendered state document (no bodies). */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    return NextResponse.json(await listStateDocs());
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/state-docs GET]", e);
    return apiError(`state docs read failed: ${(e as Error).message}`, 500);
  }
}
