import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import {
  TASK_FLAGS,
  TASK_STATUSES,
  type TaskFlag,
  type TaskPatch,
  type TaskStatus,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PATCH /api/tasks/:id — partial update.
 * The business logic lives here, in exactly one place, for both faces:
 *   - status -> 'done'                  sets done_at = now()
 *   - status leaves 'done'              clears done_at
 *   - delegatedTo set (non-empty)       also sets status = 'waiting' and waiting_on
 *   - status candidate -> anything live sets confirmed_at = now(), confidence = 'user'
 *   - evidence on done                  kept forever with the row
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!authenticate(req)) return unauthorized();
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }

    const patch: TaskPatch = {};

    if (body.status !== undefined) {
      if (
        typeof body.status !== "string" ||
        !(TASK_STATUSES as string[]).includes(body.status)
      ) {
        return apiError("invalid status", 400);
      }
      patch.status = body.status as TaskStatus;
    }

    if (body.flag !== undefined) {
      if (
        typeof body.flag !== "string" ||
        !(TASK_FLAGS as string[]).includes(body.flag)
      ) {
        return apiError("invalid flag", 400);
      }
      patch.flag = body.flag as TaskFlag;
    }

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return apiError("invalid title", 400);
      }
      patch.title = body.title.trim();
    }

    const nullableString = (key: keyof TaskPatch, raw: unknown): string | null | undefined => {
      if (raw === undefined) return undefined;
      if (raw === null || raw === "") return null;
      if (typeof raw === "string") return raw.trim();
      throw new Error(`invalid ${String(key)}`);
    };

    try {
      const d = nullableString("delegatedTo", body.delegatedTo);
      if (d !== undefined) patch.delegatedTo = d;
      const w = nullableString("waitingOn", body.waitingOn);
      if (w !== undefined) patch.waitingOn = w;
      const sa = nullableString("sourceAccount", body.sourceAccount);
      if (sa !== undefined) patch.sourceAccount = sa;
      const sl = nullableString("sourceLink", body.sourceLink);
      if (sl !== undefined) patch.sourceLink = sl;
    } catch (e) {
      return apiError((e as Error).message, 400);
    }

    if (body.note !== undefined) {
      if (typeof body.note !== "string") return apiError("invalid note", 400);
      patch.note = body.note;
    }

    if (body.evidence !== undefined) {
      if (typeof body.evidence !== "string") return apiError("invalid evidence", 400);
      patch.evidence = body.evidence;
    }

    if (body.unsure !== undefined) {
      if (typeof body.unsure !== "boolean") return apiError("invalid unsure", 400);
      patch.unsure = body.unsure;
    }

    if (body.conradNote !== undefined) {
      if (typeof body.conradNote !== "string") return apiError("invalid conradNote", 400);
      patch.conradNote = body.conradNote;
    }

    if (body.confidence !== undefined) {
      if (body.confidence !== "ai" && body.confidence !== "user") {
        return apiError("invalid confidence", 400);
      }
      patch.confidence = body.confidence;
    }

    if (body.areaId !== undefined) {
      if (typeof body.areaId !== "string" || !body.areaId) {
        return apiError("invalid areaId", 400);
      }
      const store = await getStore();
      const areas = await store.listAreas();
      if (!areas.some((a) => a.id === body.areaId)) {
        return apiError("unknown areaId", 400);
      }
      patch.areaId = body.areaId;
    }

    if (body.projectId !== undefined) {
      if (body.projectId === null || body.projectId === "") {
        patch.projectId = null;
      } else if (typeof body.projectId === "string") {
        patch.projectId = body.projectId;
      } else {
        return apiError("invalid projectId", 400);
      }
    }

    const dateField = (key: "dueDate" | "startAfter" | "nextReviewAt") => {
      const raw = body[key];
      if (raw === undefined) return true;
      if (raw === null || raw === "") {
        patch[key] = null;
        return true;
      }
      if (typeof raw === "string" && YMD.test(raw)) {
        patch[key] = raw;
        return true;
      }
      return false;
    };
    if (!dateField("dueDate")) return apiError("invalid dueDate", 400);
    if (!dateField("startAfter")) return apiError("invalid startAfter", 400);
    if (!dateField("nextReviewAt")) return apiError("invalid nextReviewAt", 400);

    if (Object.keys(patch).length === 0) {
      return apiError("empty patch", 400);
    }

    // Business rules: one place, both faces.
    if (patch.delegatedTo && patch.status === undefined) {
      patch.status = "waiting";
    }
    if (patch.delegatedTo && patch.waitingOn === undefined) {
      patch.waitingOn = patch.delegatedTo;
    }
    if (patch.status !== undefined) {
      patch.doneAt = patch.status === "done" ? new Date().toISOString() : null;
      if (patch.status !== "candidate") {
        // Any move off candidate is Brad (or Conrad on his word) confirming it.
        const store = await getStore();
        const current = (await store.listTasks({ areaId: "all", includeDone: true })).find(
          (t) => t.id === params.id
        );
        if (current && current.status === "candidate") {
          patch.confirmedAt = new Date().toISOString();
          if (patch.confidence === undefined) patch.confidence = "user";
          // Legacy rows carried the candidate marker in the title; drop it.
          if (patch.title === undefined && /^CANDIDATE:\s*/i.test(current.title)) {
            patch.title = current.title.replace(/^CANDIDATE:\s*/i, "");
          }
        }
      }
    }

    const store = await getStore();
    const updated = await store.updateTask(params.id, patch);
    if (!updated) return apiError("task not found", 404);
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[/api/tasks/:id PATCH]", e);
    return apiError("task update failed", 500);
  }
}
