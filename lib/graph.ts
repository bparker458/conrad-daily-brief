/**
 * Microsoft Graph — Outlook mail and calendar, READ ONLY, server side only.
 *
 * Delegated access with a refresh token, the same pattern the Google
 * module uses, so nothing here needs tenant-wide application permissions.
 * Brad consents once for his own mailbox; the refresh token lives in a
 * Netlify env var and never reaches the browser.
 *
 * Scopes needed at consent time:
 *   offline_access Mail.Read Calendars.Read User.Read
 *
 * This module NEVER writes. There is no send, accept, or delete path
 * in here on purpose: the dashboard reads Brad's world, it does not act
 * in his name without him.
 */

import type { CalendarItem, MailItem } from "./source-types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TZ_HEADER = 'outlook.timezone="Pacific Standard Time"';

function placeholder(v: string): boolean {
  return v === "" || v.startsWith("YOUR") || v.startsWith("your") || v.includes("placeholder");
}

export function graphConfigured(): boolean {
  return [
    process.env.MS_CLIENT_ID,
    process.env.MS_CLIENT_SECRET,
    process.env.MS_REFRESH_TOKEN,
  ].every((v) => typeof v === "string" && v.length > 8 && !placeholder(v));
}

/** Senders whose unread mail counts as needing attention, from env. */
export function prioritySenders(): string[] {
  return (process.env.PRIORITY_SENDERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/* ── access token (cached until near expiry) ──────────────────── */

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const tenant = process.env.MS_TENANT_ID || "common";
  const res = await reachable(
    () =>
      fetch(
        `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.MS_CLIENT_ID!,
            client_secret: process.env.MS_CLIENT_SECRET!,
            refresh_token: process.env.MS_REFRESH_TOKEN!,
            grant_type: "refresh_token",
            scope: "offline_access Mail.Read Calendars.Read User.Read",
          }),
        }
      ),
    "Microsoft sign-in"
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Outlook sign-in failed (${res.status}). ${shortReason(detail)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

/**
 * A raw `fetch failed` tells Brad nothing. Wrap network-level failures so
 * the panel can name what could not be reached instead of shrugging.
 */
async function reachable(run: () => Promise<Response>, what: string): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not reach ${what} (${detail}).`);
  }
}

/** Turn a provider error blob into one line Brad can act on. */
function shortReason(body: string): string {
  try {
    const j = JSON.parse(body) as {
      error?: string | { message?: string };
      error_description?: string;
    };
    if (typeof j.error === "object" && j.error?.message) return j.error.message.slice(0, 160);
    if (j.error_description) return j.error_description.split("\n")[0].slice(0, 160);
    if (typeof j.error === "string") return j.error.slice(0, 160);
  } catch {
    /* not JSON */
  }
  return body.slice(0, 160);
}

async function graphGet<T>(path: string, search: Record<string, string>): Promise<T> {
  const token = await accessToken();
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(search)) url.searchParams.set(k, v);
  const res = await reachable(
    () => fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: TZ_HEADER } }),
    "Microsoft Graph"
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Outlook read failed (${res.status}). ${shortReason(detail)}`);
  }
  return (await res.json()) as T;
}

/* ── parsers (pure, unit-tested by scripts/source-parse-test.mjs) ─── */

interface RawMessage {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  webLink?: string;
  flag?: { flagStatus?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
}

export function parseGraphMessage(m: RawMessage, now = Date.now()): MailItem {
  const received = m.receivedDateTime || new Date().toISOString();
  const ageHours = Math.max(0, Math.floor((now - new Date(received).getTime()) / 3600000));
  const email = (m.from?.emailAddress?.address || "").toLowerCase();
  const flagged = m.flag?.flagStatus === "flagged";
  const priority = prioritySenders().includes(email);
  const unread = m.isRead === false;
  const reason: MailItem["reason"] = flagged
    ? "flagged"
    : unread && priority
      ? "priority"
      : ageHours >= 24 && unread
        ? "waiting"
        : "keyword";
  return {
    id: m.id || "",
    source: "outlook",
    subject: m.subject || "(no subject)",
    from: m.from?.emailAddress?.name || email || "(unknown)",
    fromEmail: email,
    receivedAt: received,
    snippet: (m.bodyPreview || "").replace(/\s+/g, " ").trim().slice(0, 180),
    url: m.webLink || "",
    unread,
    flagged,
    hasAttachments: Boolean(m.hasAttachments),
    reason,
    ageHours,
  };
}

/**
 * The attention rule, in one place so both providers agree:
 * flagged, OR unread from a priority sender, OR unread and sitting
 * more than 24 hours. Everything else is just mail, and mail Brad has
 * already read is not an open loop.
 */
export function needsAttention(m: MailItem): boolean {
  if (m.flagged) return true;
  if (!m.unread) return false;
  if (prioritySenders().includes(m.fromEmail)) return true;
  return m.ageHours >= 24;
}

interface RawEvent {
  id?: string;
  subject?: string;
  webLink?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string } };
  attendees?: unknown[];
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
}

export function parseGraphEvent(e: RawEvent, now = Date.now()): CalendarItem {
  const start = e.start?.dateTime ? ensureZ(e.start.dateTime) : "";
  const attendeeCount = Array.isArray(e.attendees) ? e.attendees.length : 0;
  const startMs = start ? new Date(start).getTime() : 0;
  const withinDay = startMs > 0 && startMs - now < 24 * 3600000 && startMs >= now - 3600000;
  return {
    id: e.id || "",
    source: "outlook",
    title: e.subject || "(untitled)",
    start,
    end: e.end?.dateTime ? ensureZ(e.end.dateTime) : "",
    allDay: Boolean(e.isAllDay),
    location: e.location?.displayName || "",
    organizer: e.organizer?.emailAddress?.name || "",
    attendeeCount,
    needsPrep: withinDay && attendeeCount > 1 && !e.isAllDay,
    url: e.webLink || "",
    joinUrl: e.onlineMeeting?.joinUrl || "",
  };
}

/** Graph returns local-to-the-Prefer-header times without an offset. */
function ensureZ(dt: string): string {
  return /[zZ]|[+-]\d{2}:\d{2}$/.test(dt) ? dt : `${dt}Z`;
}

/* ── live fetchers ─────────────────────────────────────── */

export async function fetchOutlookAttentionMail(): Promise<MailItem[]> {
  const data = await graphGet<{ value?: RawMessage[] }>(
    "/me/mailFolders/Inbox/messages",
    {
      $top: "50",
      $orderby: "receivedDateTime desc",
      $select:
        "id,subject,bodyPreview,receivedDateTime,isRead,hasAttachments,webLink,flag,from",
    }
  );
  const now = Date.now();
  return (data.value || [])
    .map((m) => parseGraphMessage(m, now))
    .filter(needsAttention)
    .slice(0, 15);
}

export async function fetchOutlookEvents(hoursAhead = 36): Promise<CalendarItem[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 3600000);
  const end = new Date(now.getTime() + hoursAhead * 3600000);
  const data = await graphGet<{ value?: RawEvent[] }>("/me/calendarView", {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: "start/dateTime",
    $top: "30",
    $select:
      "id,subject,webLink,isAllDay,isCancelled,onlineMeeting,location,organizer,attendees,start,end",
  });
  const t = Date.now();
  return (data.value || [])
    .filter((e) => !e.isCancelled)
    .map((e) => parseGraphEvent(e, t));
}

/** Cheap reachability probe used by /api/health and the warm run. */
export async function probeGraph(): Promise<void> {
  await graphGet<{ id?: string }>("/me", { $select: "id" });
}
