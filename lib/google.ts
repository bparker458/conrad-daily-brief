/**
 * Phase 3 — Google Calendar + Gmail, READ-ONLY, server-side only.
 * Google only, never Microsoft/Outlook (Section 4/13 of the handoff).
 *
 * Uses plain REST with a refresh-token grant — no googleapis dependency.
 * Marshall supplies GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET /
 * GOOGLE_REFRESH_TOKEN (RUNBOOK.md; scripts/google-refresh-token.mjs helps).
 */

export interface GcalEvent {
  id: string;
  title: string;
  start: string; // ISO dateTime, or YYYY-MM-DD for all-day
  end: string;
  allDay: boolean;
  location: string;
}

export interface GmailItem {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

const TZ = "America/Los_Angeles"; // Brad's day, not the server's

// Section 11 Phase 3: closing, escrow, insurance, refi, title, tax, farm, lease
const KEYWORDS = ["closing", "escrow", "insurance", "refi", "title", "tax", "farm", "lease"];

export function googleConfigured(): boolean {
  const vals = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REFRESH_TOKEN,
  ];
  return vals.every((v) => typeof v === "string" && v.length > 8 && !v.startsWith("YOUR"));
}

/* ── access token (cached until near expiry) ─────────────────────── */

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

/* ── time helpers ────────────────────────────────────────────────── */

/** UTC instants for the start and end of "today" in Brad's time zone. */
export function laDayRange(now = new Date()): { timeMin: string; timeMax: string } {
  // Approximate the zone offset by re-reading "now" in LA; accurate to the
  // minute, which is plenty for day boundaries.
  const laNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const offsetMs = now.getTime() - laNow.getTime();
  const laMidnight = new Date(laNow);
  laMidnight.setHours(0, 0, 0, 0);
  const start = new Date(laMidnight.getTime() + offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/* ── parsers (pure — unit-tested by scripts/google-parse-test.mjs) ── */

interface RawEvent {
  id?: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export function parseEvents(payload: { items?: RawEvent[] }): GcalEvent[] {
  return (payload.items || [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id || "",
      title: e.summary || "(untitled)",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      allDay: Boolean(e.start?.date && !e.start?.dateTime),
      location: e.location || "",
    }));
}

interface RawHeader {
  name?: string;
  value?: string;
}

export function parseMessage(payload: {
  id?: string;
  snippet?: string;
  payload?: { headers?: RawHeader[] };
}): GmailItem {
  const headers = payload.payload?.headers || [];
  const h = (name: string) =>
    headers.find((x) => (x.name || "").toLowerCase() === name.toLowerCase())?.value || "";
  const rawFrom = h("From");
  // "Name <email>" → Name
  const from = rawFrom.replace(/<[^>]*>/g, "").replace(/"/g, "").trim() || rawFrom;
  return {
    id: payload.id || "",
    subject: h("Subject") || "(no subject)",
    from,
    date: h("Date"),
    snippet: payload.snippet || "",
  };
}

/* ── live fetchers ───────────────────────────────────────────────── */

export async function fetchTodayEvents(): Promise<GcalEvent[]> {
  const token = await accessToken();
  const { timeMin, timeMax } = laDayRange();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "20");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`calendar read failed: ${res.status}`);
  return parseEvents(await res.json());
}

export async function fetchFlaggedInbox(): Promise<GmailItem[]> {
  const token = await accessToken();
  const q = `newer_than:2d {${KEYWORDS.join(" ")}}`;
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", q);
  listUrl.searchParams.set("maxResults", "12");
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!listRes.ok) throw new Error(`gmail list failed: ${listRes.status}`);
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (list.messages || []).map((m) => m.id);

  const items = await Promise.all(
    ids.map(async (id) => {
      const msgUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`
      );
      msgUrl.searchParams.set("format", "metadata");
      for (const hName of ["Subject", "From", "Date"]) {
        msgUrl.searchParams.append("metadataHeaders", hName);
      }
      const res = await fetch(msgUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`gmail message read failed: ${res.status}`);
      return parseMessage(await res.json());
    })
  );
  return items;
}
