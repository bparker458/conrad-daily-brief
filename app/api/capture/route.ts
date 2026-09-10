import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import {
  createCapture,
  listCaptures,
  NotConfiguredError,
} from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/capture — the fast lane.
 *
 * Brad speaks into his phone, this row lands, the request returns. No model is
 * called on this path and nothing is classified in the moment: that is the
 * whole point. Conrad drains pending captures on his own schedule and files
 * them into the journal, the person log, and the area state doc.
 *
 * Body: { body: string, person?: string, areaId?: string }
 */
export async function POST(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }

    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    if (!body) return apiError("body is required", 400);
    if (body.length > 20000) return apiError("body too long", 400);

    const capture = await createCapture({
      body,
      person: typeof payload.person === "string" ? payload.person.trim() || null : null,
      areaId: typeof payload.areaId === "string" ? payload.areaId.trim() || null : null,
    });
    return NextResponse.json(capture, { status: 201 });
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      return apiError("capture store not configured", 503);
    }
    console.error("[/api/capture POST]", e);
    return apiError("capture failed", 500);
  }
}

/**
 * GET /api/capture?status=pending — what Conrad still has to file.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const status = new URL(req.url).searchParams.get("status");
    const filter =
      status === "pending" || status === "filed" ? (status as "pending" | "filed") : undefined;
    return NextResponse.json(await listCaptures(filter));
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      return apiError("capture store not configured", 503);
    }
    console.error("[/api/capture GET]", e);
    return apiError("captures read failed", 500);
  }
}
