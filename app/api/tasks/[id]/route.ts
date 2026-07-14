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

/**
 * PATCH /api/tasks/:id — partial update.
 * The "never repeats" business logic lives here, in exactly one place,
 * for both faces:
 *   - status -> 'done'  sets done_at = now()
 *   - status leaves 'done' clears done_at
 *   - delegatedTo set (non-empty) also sets status = 'waiting'
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

    if (body.delegatedTo !== undefined) {
      if (body.delegatedTo === null || body.delegatedTo === "") {
        patch.delegatedTo = null;
      } else if (typeof body.delegatedTo === "string") {
        patch.delegatedTo = body.delegatedTo.trim();
      } else {
        return apiError("invalid delegatedTo", 400);
      }
    }

    if (body.note !== undefined) {
      if (typeof body.note !== "string") return apiError("invalid note", 400);
      patch.note = body.note;
    }

    if (body.unsure !== undefined) {
      if (typeof body.unsure !== "boolean") return apiError("invalid unsure", 400);
      patch.unsure = body.unsure;
    }

    if (body.conradNote !== undefined) {
      if (typeof body.conradNote !== "string") return apiError("invalid conradNote", 400);
      patch.conradNote = body.conradNote;
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

    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === "") {
        patch.dueDate = null;
      } else if (
        typeof body.dueDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
      ) {
        patch.dueDate = body.dueDate;
      } else {
        return apiError("invalid dueDate", 400);
      }
    }

    if (Object.keys(patch).length === 0) {
      return apiError("empty patch", 400);
    }

    // Business rules — one place, both faces.
    if (patch.delegatedTo && patch.status === undefined) {
      patch.status = "waiting";
    }
    if (patch.status !== undefined) {
      patch.doneAt = patch.status === "done" ? new Date().toISOString() : null;
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
