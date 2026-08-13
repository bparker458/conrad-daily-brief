import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { sortTasks, weekBounds, ymdInTz } from "@/lib/derive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/week — the current Monday-to-Sunday window: what is due, what
 * is already carried over, and what is still unscheduled but flagged.
 *
 * This is the section that leads the dashboard, and the same numbers
 * Conrad narrates in the morning. One computation, both faces.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const store = await getStore();
    const now = new Date();
    const today = ymdInTz(now);
    const { start, end } = weekBounds(now);
    const all = await store.listTasks({ areaId: "all", includeDone: true });

    const open = all.filter((t) => t.status === "open");
    const dueThisWeek = open.filter((t) => t.dueDate && t.dueDate <= end);
    const overdue = dueThisWeek.filter((t) => t.dueDate! < today);
    const dueToday = dueThisWeek.filter((t) => t.dueDate === today);
    const later = dueThisWeek.filter((t) => t.dueDate! > today);
    const flaggedUnscheduled = open.filter((t) => !t.dueDate && t.flag !== "none");
    const doneThisWeek = all.filter(
      (t) => t.status === "done" && t.doneAt && t.doneAt.slice(0, 10) >= start
    );

    return NextResponse.json({
      today,
      week: { start, end },
      counts: {
        overdue: overdue.length,
        dueToday: dueToday.length,
        later: later.length,
        flaggedUnscheduled: flaggedUnscheduled.length,
        doneThisWeek: doneThisWeek.length,
        waiting: all.filter((t) => t.status === "waiting").length,
      },
      overdue: sortTasks(overdue),
      dueToday: sortTasks(dueToday),
      later: sortTasks(later),
      flaggedUnscheduled: sortTasks(flaggedUnscheduled),
    });
  } catch (e) {
    console.error("[/api/week]", e);
    return apiError("week read failed", 500);
  }
}
