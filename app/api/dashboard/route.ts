import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { areaProgress, projectProgress, sortTasks, weekBounds, withinWindow, ymdInTz, DEFAULT_WINDOW_DAYS } from "@/lib/derive";
import { calendarPanel, mailPanel } from "@/lib/sources";
import {
  panelOk,
  panelNotConfigured,
  panelUnavailable,
  type Panel,
} from "@/lib/panel";
import type {
  AreaProgress,
  DailyNumbers,
  ProjectProgress,
  Signal,
  SourceHealth,
  Task,
} from "@/lib/types";
import type { CalendarItem, MailItem } from "@/lib/source-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DashboardPayload {
  generatedAt: string;
  today: string;
  week: { start: string; end: string };
  tasks: Panel<Task>;
  areas: Panel<AreaProgress>;
  projects: ProjectProgress[];
  signals: Panel<Signal>;
  numbers: Panel<DailyNumbers> & { isCurrent: boolean };
  mail: Panel<MailItem>;
  calendar: Panel<CalendarItem>;
  sourceHealth: SourceHealth[];
}

/**
 * GET /api/dashboard — everything the dashboard shows, in one round trip,
 * every section carrying its own status.
 *
 * Each panel is fetched independently and a failure in one never blanks
 * another. The task store, the connectors and the numbers are separate
 * panels precisely so an Outlook outage cannot make Brad's task list look
 * empty, and a Supabase outage cannot look like "nothing to do today".
 *
 * Nothing in this route reads from a cache or a build-time constant. If
 * a pull fails, its panel comes back `unavailable` with the reason, and
 * the dashboard prints that reason on screen.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();

  const store = await getStore();
  const now = new Date();
  const today = ymdInTz(now);
  const week = weekBounds(now);

  const url = new URL(req.url);
  const windowParam = url.searchParams.get("window");
  const windowDays =
    windowParam === "all"
      ? 0
      : Number.isFinite(Number(windowParam)) && Number(windowParam) > 0
        ? Number(windowParam)
        : DEFAULT_WINDOW_DAYS;

  /* The task store: its own panel, so an outage is visible as an outage. */
  const tasksPromise = (async (): Promise<{
    tasks: Panel<Task>;
    areas: Panel<AreaProgress>;
    projects: ProjectProgress[];
  }> => {
    try {
      const [areas, projects, all] = await Promise.all([
        store.listAreas(),
        store.listProjects(),
        store.listTasks({ areaId: "all", includeDone: true }),
      ]);
      const visible = windowDays
        ? all.filter((t) => t.status === "done" || withinWindow(t, windowDays, now))
        : all;
      await store.recordSourceHealth("task-store", { ok: true, detail: `${all.length} rows` });
      return {
        tasks: panelOk("Task store", sortTasks(visible)),
        areas: panelOk("Task store", areaProgress(areas, all)),
        projects: projectProgress(projects, all),
      };
    } catch (e) {
      await store.recordSourceHealth("task-store", {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        tasks: panelUnavailable<Task>("Task store", e),
        areas: panelUnavailable<AreaProgress>("Task store", e),
        projects: [],
      };
    }
  })();

  const signalsPromise = (async (): Promise<Panel<Signal>> => {
    try {
      const signals = await store.listSignals({
        statuses: ["open", "acknowledged"],
        sinceDays: 30,
      });
      return panelOk("Signals", signals);
    } catch (e) {
      return panelUnavailable<Signal>("Signals", e);
    }
  })();

  const numbersPromise = (async (): Promise<Panel<DailyNumbers> & { isCurrent: boolean }> => {
    try {
      const row = await store.latestNumbers("la-z-boy");
      if (!row) {
        return {
          ...panelNotConfigured<DailyNumbers>(
            "Daily numbers",
            "No recap has been recorded yet"
          ),
          isCurrent: false,
        };
      }
      const panel = panelOk("Daily numbers", [row]);
      panel.asOf = row.recordedAt;
      const yesterday = ymdInTz(new Date(now.getTime() - 86400000));
      return { ...panel, isCurrent: row.resultsThrough >= yesterday };
    } catch (e) {
      return { ...panelUnavailable<DailyNumbers>("Daily numbers", e), isCurrent: false };
    }
  })();

  const [taskBits, signals, numbers, mail, calendar] = await Promise.all([
    tasksPromise,
    signalsPromise,
    numbersPromise,
    mailPanel(store),
    calendarPanel(store),
  ]);

  // Read health LAST, on purpose. The pulls above write their own results
  // into it, and reading in parallel would hand back a snapshot taken
  // before this request's failures were recorded.
  const sourceHealth: SourceHealth[] = await store.listSourceHealth().catch(() => []);

  const payload: DashboardPayload = {
    generatedAt: new Date().toISOString(),
    today,
    week,
    tasks: taskBits.tasks,
    areas: taskBits.areas,
    projects: taskBits.projects,
    signals,
    numbers,
    mail,
    calendar,
    sourceHealth,
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
