import type { Area, AreaProgress, Project, ProjectProgress, Task } from "./types";

/**
 * Progress is derived, never stored.
 * done / total over an area's or project's tasks.
 */
export function areaProgress(areas: Area[], tasks: Task[]): AreaProgress[] {
  return areas
    .map((a) => {
      const list = tasks.filter((t) => t.areaId === a.id);
      const done = list.filter((t) => t.status === "done").length;
      const total = list.length;
      return {
        id: a.id,
        name: a.name,
        endInMind: a.endInMind,
        sortOrder: a.sortOrder,
        done,
        total,
        pct: total ? Math.round((done / total) * 100) : 0,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function projectProgress(projects: Project[], tasks: Task[]): ProjectProgress[] {
  return projects
    .filter((p) => p.status !== "archived")
    .map((p) => {
      const list = tasks.filter((t) => t.projectId === p.id);
      const done = list.filter((t) => t.status === "done").length;
      const total = list.length;
      return {
        id: p.id,
        name: p.name,
        areaId: p.areaId,
        done,
        total,
        pct: total ? Math.round((done / total) * 100) : 0,
      };
    });
}

/** Sort: red flag first, then sort_order, then created_at. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const redA = a.flag === "red" && a.status !== "done" ? 0 : 1;
    const redB = b.flag === "red" && b.status !== "done" ? 0 : 1;
    if (redA !== redB) return redA - redB;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/* ── Day and week arithmetic, in Brad's time zone ─────────────────────
   Everything the dashboard calls "today" or "this week" is Brad's local
   day in Oregon, not the server's UTC day. Getting this wrong is how a
   6am brief ends up showing yesterday. */

export const BRAD_TZ = "America/Los_Angeles";

/** YYYY-MM-DD for a given instant, in Brad's zone. */
export function ymdInTz(d: Date = new Date(), tz: string = BRAD_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Monday-start week containing `d`, as YYYY-MM-DD bounds inclusive. */
export function weekBounds(d: Date = new Date(), tz: string = BRAD_TZ): {
  start: string;
  end: string;
} {
  const today = ymdInTz(d, tz);
  const [y, m, day] = today.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, day, 12));
  const dow = noonUtc.getUTCDay(); // 0 Sun … 6 Sat
  const backToMonday = (dow + 6) % 7;
  const monday = new Date(noonUtc.getTime() - backToMonday * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

/** Add days to a YYYY-MM-DD string without tripping over time zones. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12) + days * 86400000);
  return t.toISOString().slice(0, 10);
}

/**
 * Today's Plan membership: open, and due today or earlier. Items due
 * earlier carry over so an unfinished pick never silently disappears.
 */
export function isPlanned(t: Task, today: string = ymdInTz()): boolean {
  return t.status === "open" && !!t.dueDate && t.dueDate <= today;
}

/** This Week: open work due inside the current Monday-to-Sunday window. */
export function isThisWeek(t: Task, now: Date = new Date()): boolean {
  if (t.status !== "open" || !t.dueDate) return false;
  const { end } = weekBounds(now);
  return t.dueDate <= end;
}

/**
 * The daily view's default scope: roughly the last 30 days of activity.
 * Older open work still exists in the substrate, it just does not clutter
 * a view meant to keep Brad on what is live right now.
 */
export const DEFAULT_WINDOW_DAYS = 30;

export function withinWindow(t: Task, days = DEFAULT_WINDOW_DAYS, now: Date = new Date()): boolean {
  // Anything flagged, planned, or delegated stays regardless of age —
  // age is a decluttering rule, not a way to lose a red flag.
  if (t.flag === "red" || t.flag === "amber") return true;
  if (t.dueDate) return true;
  if (t.status === "waiting") return true;
  const created = new Date(t.createdAt).getTime();
  return created >= now.getTime() - days * 86400000;
}
