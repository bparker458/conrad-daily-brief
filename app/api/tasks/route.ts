import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { sortTasks } from "@/lib/derive";
import { TASK_FLAGS, TASK_SOURCES, type TaskFlag, type TaskSource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tasks?area=<id|all>&include=<open|all>
 * Default excludes done. Sort: red flag first, then sort_order, then created_at.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const area = url.searchParams.get("area") || "all";
    const include = url.searchParams.get("include") === "all" ? "all" : "open";
    const store = await getStore();
    const tasks = await store.listTasks({
      areaId: area,
      includeDone: include === "all",
    });
    return NextResponse.json(sortTasks(tasks));
  } catch (e) {
    console.error("[/api/tasks GET]", e);
    return apiError("tasks read failed", 500);
  }
}

/**
 * POST /api/tasks — create.
 * Body { area, title, note?, projectId?, flag?, dueDate?, source }.
 * Unknown/empty area defaults to 'inbox' (never force categorizing in the moment).
 */
export async function POST(req: NextRequest) {
  const caller = authenticate(req);
  if (!caller) return unauthorized();
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return apiError("title is required", 400);

    const store = await getStore();
    const areas = await store.listAreas();
    const requested = typeof body.area === "string" ? body.area.trim() : "";
    const areaId = areas.some((a) => a.id === requested) ? requested : "inbox";

    const flagRaw = typeof body.flag === "string" ? body.flag : "none";
    const flag: TaskFlag = (TASK_FLAGS as string[]).includes(flagRaw)
      ? (flagRaw as TaskFlag)
      : "none";

    const sourceRaw = typeof body.source === "string" ? body.source : "";
    const fallback: TaskSource = caller === "conrad" ? "conrad" : "phone";
    const source: TaskSource = (TASK_SOURCES as string[]).includes(sourceRaw)
      ? (sourceRaw as TaskSource)
      : fallback;

    const dueDate =
      typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)
        ? body.dueDate
        : null;

    const task = await store.createTask({
      areaId,
      title,
      note: typeof body.note === "string" ? body.note : "",
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      flag,
      dueDate,
      source,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    console.error("[/api/tasks POST]", e);
    return apiError("task create failed", 500);
  }
}
