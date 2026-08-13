/**
 * Google Calendar + Gmail, READ ONLY, server side only.
 *
 * Plain REST with a refresh-token grant — no googleapis dependency.
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
 * (RUNBOOK.md; scripts/google-refresh-token.mjs helps).
 *
 * Emits the same MailItem / CalendarItem shapes the Outlook module does,
 * so the dashboard merges the two accounts without caring which is which
 * beyond the `source` label it shows on screen.
 */

import type { CalendarItem, MailItem } from "./source-types";
import { needsAttention, prioritySenders } from "./graph";

const TZ = "America/Los_Angeles"; // Brad's day, not the server's

/** Words that make a message worth surfacing even when it is read. */
const KEYWORDS = ["closing", "escrow", "insurance", "refi", "title", "tax", "farm", "lease"];

function placeholder(v: string): boolean {
  return v === "" || v.startsWith("YOUR") || v.startsWith("your") || v.includes("placeholder");
}

export function googleConfigured(): boolean {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REFRESH_TOKEN,
  ].every((v) => typeof v === "string" && v.length > 8 && !placeholder(v));
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

/* ── access token (cached until near expiry) ──────────────────── */

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await reachable(
    () =>
      fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
          grant_type: "refresh_token",
        }),
      }),
    "Google sign-in"
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google sign-in failed (${res.status}). ${detail.slice(0, 160)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

/* ── time helpers ─────────────────────────────────────── */

/** UTC instants for the start and end of "today" in Brad's time zone. */
export function laDayRange(now = new Date()): { timeMin: string; timeMax: string } {
  const laNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMs = now.getTime() - laNow.getTime();
  const laMidnight = new Date(laNow);
  laMidnight.setHours(0, 0, 0, 0);
  const start = new Date(laMidnight.getTime() + offsetMs);
  const end = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/* ── parsers (pure — unit-tested by scripts/source-parse-test.mjs) ── */

interface RawEvent {
  id?: string;
  summary?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  organizer?: { displayName?: string; email?: string };
  attendees?: unknown[];
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export function parseEvents(payload: { items?: RawEvent[] }, now = Date.now()): CalendarItem[] {
  return (payload.items || [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const start = e.start?.dateTime || e.start?.date || "";
      const allDay = Boolean(e.start?.date && !e.start?.dateTime);
      const attendeeCount = Array.isArray(e.attendees) ? e.attendees.length : 0;
      const startMs = start ? new Date(start).getTime() : 0;
      const withinDay = startMs > 0 && startMs - now < 24 * 3600000 && startMs >= now - 3600000;
      return {
        id: e.id || "",
        source: "google" as const,
        title: e.summary || "(untitled)",
        start,
        end: e.end?.dateTime || e.end?.date || "",
        allDay,
        location: e.location || "",
        organizer: e.organizer?.displayName || e.organizer?.email || "",
        attendeeCount,
        needsPrep: withinDay && attendeeCount > 1 && !allDay,
        url: e.htmlLink || "",
        joinUrl: e.hangoutLink || "",
      };
    });
}

interface RawHeader {
  name?: string;
  value?: string;
}

export function parseMessage(
  payload: {
    id?: string;
    snippet?: string;
    labelIds?: string[];
    internalDate?: string;
    payload?: { headers?: RawHeader[] };
  },
  now = Date.now()
): MailItem {
  const headers = payload.payload?.headers || [];
  const h = (name: string) =>
    headers.find((x) => (x.name || "").toLowerCase() === name.toLowerCase())?.value || "";
  const rawFrom = h("From");
  const emailMatch = rawFrom.match(/<([^>]+)>/);
  const fromEmail = (emailMatch ? emailMatch[1] : rawFrom).toLowerCase().trim();
  const from = rawFrom.replace(/<[^>]*>/g, "").replace(/"/g, "").trim() || fromEmail;
  const labels = payload.labelIds || [];
  const receivedAt = payload.internalDate
    ? new Date(Number(payload.internalDate)).toISOString()
    : h("Date")
      ? new Date(h("Date")).toISOString()
      : new Date().toISOString();
  const ageHours = Math.max(0, Math.floor((now - new Date(receivedAt).getTime()) / 3600000));
  const flagged = labels.includes("STARRED") || labels.includes("IMPORTANT");
  const unread = labels.includes("UNREAD");
  const reason: MailItem["reason"] = flagged
    ? "flagged"
    : unread && prioritySenders().includes(fromEmail)
      ? "priority"
      : unread && ageHours >= 24
        ? "waiting"
        : "keyword";
  return {
    id: payload.id || "",
    source: "gmail",
    subject: h("Subject") || "(no subject)",
    from,
    fromEmail,
    receivedAt,
    snippet: (payload.snippet || "").replace(/\s+/g, " ").trim().slice(0, 180),
    url: payload.id ? `https://mail.google.com/mail/u/0/#inbox/${payload.id}` : "",
    unread,
    flagged,
    hasAttachments: false,
    reason,
    ageHours,
  };
}

/* ── live fetchers ─────────────────────────────────────── */

export async function fetchGoogleEvents(): Promise<CalendarItem[]> {
  const token = await accessToken();
  const { timeMin, timeMax } = laDayRange();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "25");
  const res = await reachable(
    () => fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
    "Google Calendar"
  );
  if (!res.ok) throw new Error(`Google Calendar read failed (${res.status}).`);
  return parseEvents(await res.json());
}

export async function fetchGmailAttentionMail(): Promise<MailItem[]> {
  const token = await accessToken();
  // Starred, important, unread from the last week, or the standing keywords.
  const q = `newer_than:7d (is:starred OR is:important OR is:unread OR {${KEYWORDS.join(" ")}})`;
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", q);
  listUrl.searchParams.set("maxResults", "25");
  const listRes = await reachable(
    () => fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } }),
    "Gmail"
  );
  if (!listRes.ok) throw new Error(`Gmail list failed (${listRes.status}).`);
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (list.messages || []).map((m) => m.id);

  const now = Date.now();
  const items = await Promise.all(
    ids.map(async (id) => {
      const msgUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
      msgUrl.searchParams.set("format", "metadata");
      for (const hName of ["Subject", "From", "Date"]) {
        msgUrl.searchParams.append("metadataHeaders", hName);
      }
      const res = await fetch(msgUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Gmail message read failed (${res.status}).`);
      return parseMessage(await res.json(), now);
    })
  );
  return items.filter(needsAttention).slice(0, 15);
}

/** Cheap reachability probe used by /api/health and the warm run. */
export async function probeGoogle(): Promise<void> {
  await accessToken();
}
