import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import {
  calendarSyncedAt,
  listCalendar,
  replaceCalendarWindow,
  NotConfiguredError,
} from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !ISO.test(v)) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * GET /api/calendar?from=<iso>&to=<iso>
 * Defaults: from = start of today (server UTC), to = from + 14 days.
 * Returns { events, syncedAt, staleMinutes }. staleMinutes is how old the
 * cache is; the dashboard warns above 90 so a dead sync is never mistaken
 * for a quiet day.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const from = isoOrNull(url.searchParams.get("from")) ?? dayStart.toISOString();
    const to =
      isoOrNull(url.searchParams.get("to")) ??
      new Date(new Date(from).getTime() + 14 * 86400000).toISOString();
    const [events, syncedAt] = await Promise.all([listCalendar(from, to), calendarSyncedAt()]);
    const staleMinutes = syncedAt
      ? Math.round((Date.now() - new Date(syncedAt).getTime()) / 60000)
      : null;
    return NextResponse.json({
      events: events.filter((e) => e.id !== "__sync_marker__"),
      syncedAt,
      staleMinutes,
    });
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/calendar GET]", e);
    return apiError(`calendar read failed: ${(e as Error).message}`, 500);
  }
}

/**
 * PUT /api/calendar — Conrad only (the calendar-sync scheduled task).
 * Body { windowStart, windowEnd, events: [{ id, subject, startAt, endAt, allDay,
 *        location?, organizer?, attendees?, webLink?, isCancelled? }] }
 * Replaces every cached event starting inside the window.
 */
export async function PUT(req: NextRequest) {
  const caller = authenticate(req);
  if (!caller) return unauthorized();
  if (caller !== "conrad") return apiError("calendar is written by Conrad only", 403);
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }
    const windowStart = isoOrNull(payload.windowStart);
    const windowEnd = isoOrNull(payload.windowEnd);
    if (!windowStart || !windowEnd) return apiError("windowStart and windowEnd are required ISO dates", 400);
    if (!Array.isArray(payload.events)) return apiError("events must be an array", 400);

    const events = [];
    for (const raw of payload.events as Record<string, unknown>[]) {
      const startAt = isoOrNull(raw.startAt);
      const endAt = isoOrNull(raw.endAt) ?? startAt;
      const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
      if (!startAt || !endAt || !subject) continue; // skip malformed rows, never fail the batch
      const id =
        typeof raw.id === "string" && raw.id.trim()
          ? raw.id.trim()
          : `${startAt}|${subject}`.slice(0, 200);
      events.push({
        id,
        subject,
        startAt,
        endAt,
        allDay: Boolean(raw.allDay),
        location: typeof raw.location === "string" ? raw.location : "",
        organizer: typeof raw.organizer === "string" ? raw.organizer : "",
        attendees: Array.isArray(raw.attendees)
          ? (raw.attendees as unknown[]).filter((a): a is string => typeof a === "string")
          : [],
        webLink: typeof raw.webLink === "string" ? raw.webLink : null,
        isCancelled: Boolean(raw.isCancelled),
        source: typeof raw.source === "string" ? raw.source : "outlook",
      });
    }
    const result = await replaceCalendarWindow({ windowStart, windowEnd, events });
    return NextResponse.json({ ok: true, skipped: (payload.events as unknown[]).length - events.length, ...result });
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/calendar PUT]", e);
    return apiError(`calendar write failed: ${(e as Error).message}`, 500);
  }
}
