import { NextRequest, NextResponse } from "next/server";
import { actorOf, authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { SIGNAL_STATUSES, type SignalStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/signals/:id
 *
 * Two things happen here, and only here:
 *   { status: 'dismissed' }  — Brad decided it needs nothing. It stops
 *                              coming back on every pull, permanently.
 *   { convertTo: { area, title?, dueDate?, flag? } }
 *                            — turn it into a real task. The task keeps
 *                              a link home (originSignalId) and a plain
 *                              English sourceRef, and the signal is
 *                              marked converted so it never double-lists.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = authenticate(req);
  if (!caller) return unauthorized();
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }

    const store = await getStore();
    const signal = await store.getSignal(params.id);
    if (!signal) return apiError("signal not found", 404);

    /* Convert to a task. */
    if (body.convertTo && typeof body.convertTo === "object") {
      const c = body.convertTo as Record<string, unknown>;
      const areas = await store.listAreas();
      const requested = typeof c.area === "string" ? c.area : "";
      const areaId = areas.some((a) => a.id === requested) ? requested : "inbox";
      const title =
        typeof c.title === "string" && c.title.trim() ? c.title.trim() : signal.title;
      const dueDate =
        typeof c.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.dueDate)
          ? c.dueDate
          : null;

      const task = await store.createTask({
        areaId,
        title,
        note: signal.detail,
        flag: c.flag === "red" || c.flag === "amber" ? c.flag : "none",
        dueDate,
        source: "signal",
        sourceRef: describe(signal),
        originSignalId: signal.id,
      });
      await store.appendEvent(task.id, "converted", actorOf(caller), describe(signal));
      const updated = await store.updateSignal(signal.id, {
        status: "converted",
        convertedTaskId: task.id,
      });
      return NextResponse.json({ signal: updated, task });
    }

    /* Plain status or filing change. */
    const patch: { status?: SignalStatus; areaId?: string | null } = {};
    if (body.status !== undefined) {
      if (
        typeof body.status !== "string" ||
        !(SIGNAL_STATUSES as string[]).includes(body.status)
      ) {
        return apiError("invalid status", 400);
      }
      patch.status = body.status as SignalStatus;
    }
    if (body.areaId !== undefined) {
      patch.areaId = typeof body.areaId === "string" ? body.areaId : null;
    }
    if (Object.keys(patch).length === 0) return apiError("empty patch", 400);

    const updated = await store.updateSignal(params.id, patch);
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[/api/signals/:id PATCH]", e);
    return apiError("signal update failed", 500);
  }
}

/** Plain English provenance, the thing Brad reads on the task later. */
function describe(s: { kind: string; source: string; person: string; occurredAt: string }): string {
  const when = new Date(s.occurredAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const who = s.person ? ` from ${s.person}` : "";
  const what =
    s.kind === "mail" ? "Email" : s.kind === "calendar" ? "Meeting" : s.kind === "chat" ? "Message" : "Note";
  return `${what}${who}, ${when} (${s.source})`;
}
