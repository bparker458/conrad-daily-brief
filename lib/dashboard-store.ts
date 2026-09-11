import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "./types";

/**
 * Every Supabase read must hit the database. Next 14 patches fetch() and can
 * serve a cached copy of an identical GET, which froze /api/state-docs at the
 * 5:40am list on 2026-09-11 while the rows underneath kept changing. no-store
 * on the client's own fetch closes that for every query at once.
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * Dashboard entities (captures, people, state docs, daily numbers).
 *
 * Deliberately separate from lib/store.ts: that interface is the single door
 * to the TASK list and its "one shared list" guarantee, and it is implemented
 * by both the Supabase store and the local dev store. Widening it would mean
 * touching both implementations. These are new, additive entities, so they get
 * their own narrow door and leave the task path untouched.
 *
 * Server-only. Never import from client code - scripts/check-bundle.mjs
 * enforces that at build time.
 */

export class NotConfiguredError extends Error {
  constructor() {
    super("supabase not configured");
    this.name = "NotConfiguredError";
  }
}

function configured(): boolean {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const placeholder = (v: string) =>
    v === "" || v.startsWith("YOUR") || v.startsWith("your") || v.includes("placeholder");
  return !placeholder(url) && !placeholder(key);
}

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  if (!configured()) throw new NotConfiguredError();
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } }
    );
  }
  return client;
}

/* ---------------------------------------------------------------- types */

export interface Capture {
  id: string;
  body: string;
  person: string | null;
  areaId: string | null;
  status: "pending" | "filed";
  conradNote: string;
  createdAt: string;
  filedAt: string | null;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  areaId: string | null;
  remember: string;
  openWithThem: string;
  lastTalkedAt: string | null;
  sortOrder: number;
}

export interface StateDoc {
  slug: string;
  title: string;
  areaId: string | null;
  body: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DailyNumbers {
  forDate: string;
  written: number | null;
  pctGoal: number | null;
  pctAdjGoal: number | null;
  pctLastYear: number | null;
  trakwell: Record<string, unknown> | null;
  recapLink: string | null;
  updatedAt: string;
}

/* ------------------------------------------------------------- captures */

export async function createCapture(input: {
  body: string;
  person?: string | null;
  areaId?: string | null;
}): Promise<Capture> {
  const { data, error } = await db()
    .from("captures")
    .insert({
      body: input.body,
      person: input.person ?? null,
      area_id: input.areaId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`capture create failed: ${error.message}`);
  return mapCapture(data);
}

export async function listCaptures(status?: "pending" | "filed"): Promise<Capture[]> {
  let q = db().from("captures").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(`captures read failed: ${error.message}`);
  return (data as Record<string, unknown>[]).map(mapCapture);
}

export async function fileCapture(
  id: string,
  conradNote: string
): Promise<Capture | null> {
  const { data, error } = await db()
    .from("captures")
    .update({ status: "filed", conrad_note: conradNote, filed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`capture update failed: ${error.message}`);
  return data ? mapCapture(data) : null;
}

/* --------------------------------------------------------------- people */

export async function listPeople(): Promise<Person[]> {
  const { data, error } = await db()
    .from("people")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`people read failed: ${error.message}`);
  return (data as Record<string, unknown>[]).map(mapPerson);
}

export async function upsertPerson(p: Partial<Person> & { id: string; name: string }) {
  const { data, error } = await db()
    .from("people")
    .upsert({
      id: p.id,
      name: p.name,
      role: p.role ?? "",
      area_id: p.areaId ?? null,
      remember: p.remember ?? "",
      open_with_them: p.openWithThem ?? "",
      last_talked_at: p.lastTalkedAt ?? null,
      sort_order: p.sortOrder ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(`person write failed: ${error.message}`);
  return mapPerson(data);
}

/* ----------------------------------------------------------- state docs */

export async function listStateDocs(): Promise<Omit<StateDoc, "body">[]> {
  const { data, error } = await db()
    .from("state_docs")
    .select("slug,title,area_id,updated_at,updated_by")
    .order("title", { ascending: true });
  if (error) throw new Error(`state docs read failed: ${error.message}`);
  return (data as Record<string, unknown>[]).map((r) => ({
    slug: String(r.slug),
    title: String(r.title),
    areaId: (r.area_id as string) ?? null,
    updatedAt: String(r.updated_at),
    updatedBy: String(r.updated_by ?? "conrad"),
  }));
}

export async function getStateDoc(slug: string): Promise<StateDoc | null> {
  const { data, error } = await db()
    .from("state_docs")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`state doc read failed: ${error.message}`);
  return data ? mapStateDoc(data) : null;
}

export async function putStateDoc(doc: {
  slug: string;
  title: string;
  areaId?: string | null;
  body: string;
}): Promise<StateDoc> {
  const { data, error } = await db()
    .from("state_docs")
    .upsert({
      slug: doc.slug,
      title: doc.title,
      area_id: doc.areaId ?? null,
      body: doc.body,
      updated_at: new Date().toISOString(),
      updated_by: "conrad",
    })
    .select("*")
    .single();
  if (error) throw new Error(`state doc write failed: ${error.message}`);
  return mapStateDoc(data);
}

/* -------------------------------------------------------------- numbers */

export async function latestNumbers(): Promise<DailyNumbers | null> {
  const { data, error } = await db()
    .from("daily_numbers")
    .select("*")
    .order("for_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`numbers read failed: ${error.message}`);
  return data ? mapNumbers(data) : null;
}

export async function putNumbers(n: {
  forDate: string;
  written?: number | null;
  pctGoal?: number | null;
  pctAdjGoal?: number | null;
  pctLastYear?: number | null;
  trakwell?: Record<string, unknown> | null;
  recapLink?: string | null;
}): Promise<DailyNumbers> {
  const { data, error } = await db()
    .from("daily_numbers")
    .upsert({
      for_date: n.forDate,
      written: n.written ?? null,
      pct_goal: n.pctGoal ?? null,
      pct_adj_goal: n.pctAdjGoal ?? null,
      pct_last_year: n.pctLastYear ?? null,
      trakwell: n.trakwell ?? null,
      recap_link: n.recapLink ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(`numbers write failed: ${error.message}`);
  return mapNumbers(data);
}

/* --------------------------------------------------------------- mapper */

function mapCapture(r: Record<string, unknown>): Capture {
  return {
    id: String(r.id),
    body: String(r.body ?? ""),
    person: (r.person as string) ?? null,
    areaId: (r.area_id as string) ?? null,
    status: (r.status as Capture["status"]) ?? "pending",
    conradNote: String(r.conrad_note ?? ""),
    createdAt: String(r.created_at),
    filedAt: (r.filed_at as string) ?? null,
  };
}

function mapPerson(r: Record<string, unknown>): Person {
  return {
    id: String(r.id),
    name: String(r.name),
    role: String(r.role ?? ""),
    areaId: (r.area_id as string) ?? null,
    remember: String(r.remember ?? ""),
    openWithThem: String(r.open_with_them ?? ""),
    lastTalkedAt: (r.last_talked_at as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapStateDoc(r: Record<string, unknown>): StateDoc {
  return {
    slug: String(r.slug),
    title: String(r.title),
    areaId: (r.area_id as string) ?? null,
    body: String(r.body ?? ""),
    updatedAt: String(r.updated_at),
    updatedBy: String(r.updated_by ?? "conrad"),
  };
}

function mapNumbers(r: Record<string, unknown>): DailyNumbers {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    forDate: String(r.for_date),
    written: num(r.written),
    pctGoal: num(r.pct_goal),
    pctAdjGoal: num(r.pct_adj_goal),
    pctLastYear: num(r.pct_last_year),
    trakwell: (r.trakwell as Record<string, unknown>) ?? null,
    recapLink: (r.recap_link as string) ?? null,
    updatedAt: String(r.updated_at),
  };
}

/* ------------------------------------------------------------- calendar */


/**
 * Outlook calendar cache. Brad's real calendar is Outlook (Microsoft 365).
 * A scheduled Conrad task reads it every 30 minutes (read only) and PUTs the
 * window here; the dashboard renders from this table so the read path never
 * waits on Graph and never needs a Microsoft token in the app.
 */
export async function listCalendar(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
  const { data, error } = await db()
    .from("calendar_events")
    .select("*")
    .gte("end_at", fromIso)
    .lte("start_at", toIso)
    .order("start_at", { ascending: true });
  if (error) throw new Error(`calendar read failed: ${error.message}`);
  return (data as Record<string, unknown>[]).map(mapEvent);
}

/** When the cache was last written, or null if never. */
export async function calendarSyncedAt(): Promise<string | null> {
  const { data, error } = await db()
    .from("calendar_events")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`calendar read failed: ${error.message}`);
  return data ? String((data as Record<string, unknown>).synced_at) : null;
}

/**
 * Replace every event whose start falls inside [windowStart, windowEnd] with
 * the supplied set. Delete-then-insert inside the window means cancelled or
 * moved meetings disappear instead of lingering as ghosts.
 */
export async function replaceCalendarWindow(input: {
  windowStart: string;
  windowEnd: string;
  events: Array<Omit<CalendarEvent, "syncedAt" | "source"> & { source?: string }>;
}): Promise<{ deleted: number; inserted: number; syncedAt: string }> {
  const syncedAt = new Date().toISOString();
  const del = await db()
    .from("calendar_events")
    .delete({ count: "exact" })
    .gte("start_at", input.windowStart)
    .lte("start_at", input.windowEnd);
  if (del.error) throw new Error(`calendar clear failed: ${del.error.message}`);

  if (input.events.length === 0) {
    // Still record that a sync happened, via a zero-length sentinel row that
    // sits outside any real window (year 1970) and only carries synced_at.
    const { error } = await db().from("calendar_events").upsert({
      id: "__sync_marker__",
      subject: "sync marker",
      start_at: "1970-01-01T00:00:00Z",
      end_at: "1970-01-01T00:00:00Z",
      all_day: false,
      location: "",
      organizer: "",
      attendees: [],
      web_link: null,
      is_cancelled: true,
      source: "outlook",
      synced_at: syncedAt,
    });
    if (error) throw new Error(`calendar marker failed: ${error.message}`);
    return { deleted: del.count ?? 0, inserted: 0, syncedAt };
  }

  const rows = input.events.map((e) => ({
    id: e.id,
    subject: e.subject,
    start_at: e.startAt,
    end_at: e.endAt,
    all_day: e.allDay,
    location: e.location ?? "",
    organizer: e.organizer ?? "",
    attendees: e.attendees ?? [],
    web_link: e.webLink ?? null,
    is_cancelled: e.isCancelled ?? false,
    source: e.source ?? "outlook",
    synced_at: syncedAt,
  }));
  const ins = await db().from("calendar_events").upsert(rows, { onConflict: "id" });
  if (ins.error) throw new Error(`calendar write failed: ${ins.error.message}`);
  return { deleted: del.count ?? 0, inserted: rows.length, syncedAt };
}

function mapEvent(r: Record<string, unknown>): CalendarEvent {
  return {
    id: String(r.id),
    subject: String(r.subject ?? ""),
    startAt: String(r.start_at),
    endAt: String(r.end_at),
    allDay: Boolean(r.all_day),
    location: String(r.location ?? ""),
    organizer: String(r.organizer ?? ""),
    attendees: Array.isArray(r.attendees) ? (r.attendees as string[]) : [],
    webLink: (r.web_link as string) ?? null,
    isCancelled: Boolean(r.is_cancelled),
    source: String(r.source ?? "outlook"),
    syncedAt: String(r.synced_at),
  };
}
