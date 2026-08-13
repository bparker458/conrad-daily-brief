import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { SIGNAL_KINDS, SIGNAL_STATUSES, type SignalKind, type SignalStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/signals?status=open,acknowledged&days=30
 * The durable record of everything a source said wanted attention.
 *
 * POST /api/signals — Conrad writes one directly (a phone call worth
 * remembering, something said in a meeting). Upserts on (source,
 * externalId) so re-running a sweep never duplicates.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") || "open";
    const statuses = statusParam
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is SignalStatus => (SIGNAL_STATUSES as string[]).includes(s));
    const days = Number(url.searchParams.get("days") || "30");
    const store = await getStore();
    const signals = await store.listSignals({
      statuses: statusParam === "all" ? undefined : statuses,
      sinceDays: Number.isFinite(days) && days > 0 ? days : 30,
    });
    return NextResponse.json(signals);
  } catch (e) {
    console.error("[/api/signals GET]", e);
    return apiError("signals read failed", 500);
  }
}

export async function POST(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return apiError("title is required", 400);

    const kindRaw = typeof body.kind === "string" ? body.kind : "note";
    const kind: SignalKind = (SIGNAL_KINDS as string[]).includes(kindRaw)
      ? (kindRaw as SignalKind)
      : "note";

    const source = typeof body.source === "string" && body.source ? body.source : "conrad";
    const externalId =
      typeof body.externalId === "string" && body.externalId
        ? body.externalId
        : `${source}-${Date.now()}`;

    const store = await getStore();
    const signal = await store.upsertSignal({
      kind,
      source,
      externalId,
      title,
      detail: typeof body.detail === "string" ? body.detail : "",
      person: typeof body.person === "string" ? body.person : "",
      personEmail: typeof body.personEmail === "string" ? body.personEmail : "",
      url: typeof body.url === "string" ? body.url : "",
      occurredAt:
        typeof body.occurredAt === "string" ? body.occurredAt : new Date().toISOString(),
      areaId: typeof body.areaId === "string" ? body.areaId : null,
    });
    return NextResponse.json(signal, { status: 201 });
  } catch (e) {
    console.error("[/api/signals POST]", e);
    return apiError("signal write failed", 500);
  }
}
