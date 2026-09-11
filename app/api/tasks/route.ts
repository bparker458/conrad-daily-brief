import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { sortTasks } from "@/lib/derive";
import { findDuplicate, stripCandidatePrefix } from "@/lib/dedupe";
import {
  TASK_FLAGS,
  TASK_SOURCES,
  TASK_STATUSES,
  type TaskFlag,
  type TaskSource,
  type TaskStatus,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/tasks?area=<id|all>&include=<open|all>&status=<a,b,c>
 *   include=open (default)  live tasks: open, in_progress, waiting, blocked, candidate, someday
 *   include=all             everything, including done and cancelled
 *   status=done,cancelled   explicit list, wins over include
 * Sort: red flag first, then sort_order, then created_at.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const area = url.searchParams.get("area") || "all";
    const include = url.searchParams.get("include") === "all" ? "all" : "open";
    const statusParam = url.searchParams.get("status");
    const statuses = statusParam
      ? (statusParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => (TASK_STATUSES as string[]).includes(s)) as TaskStatus[])
      : undefined;
    const store = await getStore();
    const tasks = await store.listTasks({
      areaId: area,
      includeDone: include === "all",
      statuses: statuses && statuses.length ? statuses : undefined,
    });
    return NextResponse.json(sortTasks(tasks));
  } catch (e) {
    console.error("[/api/tasks GET]", e);
    return apiError("tasks read failed", 500);
  }
}

/**
 * POST /api/tasks — create.
 * Body { area, title, note?, projectId?, flag?, dueDate?, source, status?,
 *        sourceAccount?, sourceLink?, waitingOn?, confidence?, startAfter?, nextReviewAt? }
 * Unknown/empty area defaults to 'inbox' (never force categorizing in the moment).
 * Source is stored as sent when it is a known value; it is never collapsed to
 * 'conrad' just because the caller is Conrad.
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

    const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
    // Old sweep habit: "CANDIDATE: ..." in the title with status open. The
    // marker becomes the status and never reaches the card.
    const { title, hadPrefix } = stripCandidatePrefix(rawTitle);
    if (!title) return apiError("title is required", 400);

    const store = await getStore();
    const areas = await store.listAreas();
    const requested = typeof body.area === "string" ? body.area.trim() : "";
    const areaId = areas.some((a) => a.id === requested) ? requested : "inbox";

    const flagRaw = typeof body.flag === "string" ? body.flag : "none";
    const flag: TaskFlag = (TASK_FLAGS as string[]).includes(flagRaw)
      ? (flagRaw as TaskFlag)
      : "none";

    const sourceRaw = typeof body.source === "string" ? body.source.trim() : "";
    const fallback: TaskSource = caller === "conrad" ? "conrad" : "phone";
    const source: TaskSource = (TASK_SOURCES as string[]).includes(sourceRaw)
      ? (sourceRaw as TaskSource)
      : fallback;

    const statusRaw = typeof body.status === "string" ? body.status.trim() : "";
    let status: TaskStatus = "open";
    if (statusRaw) {
      if (!(TASK_STATUSES as string[]).includes(statusRaw)) return apiError("invalid status", 400);
      if (statusRaw === "done" || statusRaw === "cancelled") {
        return apiError("create a task as open first, then PATCH it done", 400);
      }
      status = statusRaw as TaskStatus;
    }
    if (hadPrefix && caller === "conrad" && (!statusRaw || statusRaw === "open")) status = "candidate";
    // Only Conrad may seed candidates; the phone always creates real tasks.
    if (status === "candidate" && caller !== "conrad") status = "open";

    const ymd = (v: unknown) => (typeof v === "string" && YMD.test(v) ? v : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

    // Conrad's writes are deduped here, at the door, not just in the prompt.
    // A duplicate returns the existing row with deduped:true and status 200,
    // so a sweep's "created" count stays honest. allowDuplicate:true skips it.
    if (caller === "conrad" && body.allowDuplicate !== true) {
      const existing = await store.listTasks({ areaId: "all", includeDone: true });
      const dup = findDuplicate(existing, title, str(body.sourceLink));
      if (dup) {
        return NextResponse.json({ ...dup, deduped: true, duplicateOf: dup.id }, { status: 200 });
      }
    }

    const confidence =
      body.confidence === "ai" || body.confidence === "user"
        ? body.confidence
        : status === "candidate"
        ? "ai"
        : "user";

    const task = await store.createTask({
      areaId,
      title,
      note: typeof body.note === "string" ? body.note : "",
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      flag,
      dueDate: ymd(body.dueDate),
      source,
      status,
      sourceAccount: str(body.sourceAccount),
      sourceLink: str(body.sourceLink),
      waitingOn: str(body.waitingOn),
      confidence,
      startAfter: ymd(body.startAfter),
      nextReviewAt: ymd(body.nextReviewAt),
    });
    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    console.error("[/api/tasks POST]", e);
    return apiError("task create failed", 500);
  }
}
