import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Store, TaskFilter } from "./store";
import type {
  Area,
  CreateTaskInput,
  Project,
  Task,
  TaskPatch,
} from "./types";
import { CLOSED_STATUSES, LEGACY_SOURCES } from "./types";

/**
 * Every Supabase read must hit the database. Next 14 patches fetch() and can
 * serve a cached copy of an identical GET, which froze /api/state-docs at the
 * 5:40am list on 2026-09-11 while the rows underneath kept changing. no-store
 * on the client's own fetch closes that for every query at once.
 */
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/* Row shapes as they exist in Postgres (snake_case). */
interface AreaRow {
  id: string;
  name: string;
  end_in_mind: string | null;
  sort_order: number | null;
}
interface ProjectRow {
  id: string;
  area_id: string | null;
  name: string;
  end_in_mind: string | null;
  status: string | null;
  sort_order: number | null;
  created_at: string;
}
interface TaskRow {
  id: string;
  area_id: string | null;
  project_id: string | null;
  title: string;
  note: string | null;
  status: Task["status"];
  flag: Task["flag"];
  delegated_to: string | null;
  due_date: string | null;
  unsure: boolean | null;
  conrad_note: string | null;
  source: Task["source"];
  created_at: string;
  done_at: string | null;
  sort_order: number | null;
  /* migration 003 columns, absent until it runs */
  source_account?: string | null;
  source_link?: string | null;
  waiting_on?: string | null;
  confidence?: string | null;
  confirmed_at?: string | null;
  start_after?: string | null;
  next_review_at?: string | null;
  evidence?: string | null;
}

const mapArea = (r: AreaRow): Area => ({
  id: r.id,
  name: r.name,
  endInMind: r.end_in_mind ?? "",
  sortOrder: r.sort_order ?? 0,
});
const mapProject = (r: ProjectRow): Project => ({
  id: r.id,
  areaId: r.area_id,
  name: r.name,
  endInMind: r.end_in_mind ?? "",
  status: r.status ?? "active",
  sortOrder: r.sort_order ?? 0,
  createdAt: r.created_at,
});
const mapTask = (r: TaskRow): Task => ({
  id: r.id,
  areaId: r.area_id,
  projectId: r.project_id,
  title: r.title,
  note: r.note ?? "",
  status: r.status,
  flag: r.flag,
  delegatedTo: r.delegated_to,
  dueDate: r.due_date,
  unsure: r.unsure ?? false,
  conradNote: r.conrad_note ?? "",
  source: r.source,
  createdAt: r.created_at,
  doneAt: r.done_at,
  sortOrder: r.sort_order ?? 0,
  sourceAccount: r.source_account ?? null,
  sourceLink: r.source_link ?? null,
  waitingOn: r.waiting_on ?? null,
  confidence: r.confidence === "ai" || r.confidence === "user" ? r.confidence : null,
  confirmedAt: r.confirmed_at ?? null,
  startAfter: r.start_after ?? null,
  nextReviewAt: r.next_review_at ?? null,
  evidence: r.evidence ?? "",
});

/** Columns that only exist after migration 003/004. */
const EXTENDED_COLUMNS = [
  "source_account",
  "source_link",
  "waiting_on",
  "confidence",
  "confirmed_at",
  "start_after",
  "next_review_at",
  "evidence",
];

function patchToRow(patch: TaskPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.flag !== undefined) row.flag = patch.flag;
  if (patch.delegatedTo !== undefined) row.delegated_to = patch.delegatedTo;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.unsure !== undefined) row.unsure = patch.unsure;
  if (patch.conradNote !== undefined) row.conrad_note = patch.conradNote;
  if (patch.areaId !== undefined) row.area_id = patch.areaId;
  if (patch.projectId !== undefined) row.project_id = patch.projectId;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.doneAt !== undefined) row.done_at = patch.doneAt;
  if (patch.sourceAccount !== undefined) row.source_account = patch.sourceAccount;
  if (patch.sourceLink !== undefined) row.source_link = patch.sourceLink;
  if (patch.waitingOn !== undefined) row.waiting_on = patch.waitingOn;
  if (patch.confidence !== undefined) row.confidence = patch.confidence;
  if (patch.confirmedAt !== undefined) row.confirmed_at = patch.confirmedAt;
  if (patch.startAfter !== undefined) row.start_after = patch.startAfter;
  if (patch.nextReviewAt !== undefined) row.next_review_at = patch.nextReviewAt;
  if (patch.evidence !== undefined) row.evidence = patch.evidence;
  return row;
}

/**
 * True when the error means the schema is behind the code: a column from
 * migration 003/004 is missing or an enum value has not been added yet.
 * The store then retries with a legacy-shaped row so a write never fails
 * just because Brad has not run the SQL yet. /api/health reports the gap.
 */
function schemaBehind(message: string): boolean {
  return (
    /column .* does not exist/i.test(message) ||
    /invalid input value for enum/i.test(message) ||
    /could not find the .* column/i.test(message)
  );
}

/** Strip a row down to what the original schema.sql can accept. */
function legacyRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (EXTENDED_COLUMNS.includes(k)) continue;
    out[k] = v;
  }
  if (typeof out.source === "string" && !(LEGACY_SOURCES as string[]).includes(out.source)) {
    // Keep provenance visible even on the old enum.
    out.note = `[source:${out.source}] ${String(out.note ?? "")}`.trim();
    out.source = "conrad";
  }
  if (out.status === "candidate") {
    out.title = `CANDIDATE: ${String(out.title ?? "")}`;
    out.status = "open";
  } else if (out.status === "in_progress" || out.status === "blocked" || out.status === "someday") {
    out.status = "open";
  } else if (out.status === "cancelled") {
    out.status = "done";
  }
  return out;
}

/**
 * Server-only Supabase access using the service-role key.
 * This module must never be imported from client code; the bundle
 * check (scripts/check-bundle.mjs) enforces that at build time.
 */
export class SupabaseStore implements Store {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: noStoreFetch },
    });
  }

  async listAreas(): Promise<Area[]> {
    const { data, error } = await this.client
      .from("areas")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`areas read failed: ${error.message}`);
    return (data as AreaRow[]).map(mapArea);
  }

  async listProjects(): Promise<Project[]> {
    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`projects read failed: ${error.message}`);
    return (data as ProjectRow[]).map(mapProject);
  }

  async listTasks(filter: TaskFilter): Promise<Task[]> {
    let q = this.client.from("tasks").select("*");
    if (filter.areaId && filter.areaId !== "all") q = q.eq("area_id", filter.areaId);
    if (filter.statuses && filter.statuses.length) {
      q = q.in("status", filter.statuses);
    } else if (!filter.includeDone) {
      q = q.not("status", "in", `(${CLOSED_STATUSES.join(",")})`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`tasks read failed: ${error.message}`);
    return (data as TaskRow[]).map(mapTask);
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const row: Record<string, unknown> = {
      area_id: input.areaId,
      title: input.title,
      note: input.note ?? "",
      project_id: input.projectId ?? null,
      flag: input.flag ?? "none",
      due_date: input.dueDate ?? null,
      source: input.source,
      status: input.status ?? "open",
    };
    if (input.sourceAccount !== undefined) row.source_account = input.sourceAccount;
    if (input.sourceLink !== undefined) row.source_link = input.sourceLink;
    if (input.waitingOn !== undefined) row.waiting_on = input.waitingOn;
    if (input.confidence !== undefined) row.confidence = input.confidence;
    if (input.startAfter !== undefined) row.start_after = input.startAfter;
    if (input.nextReviewAt !== undefined) row.next_review_at = input.nextReviewAt;

    let { data, error } = await this.client.from("tasks").insert(row).select("*").single();
    if (error && schemaBehind(error.message)) {
      console.warn("[store] schema behind code on insert, retrying legacy shape:", error.message);
      ({ data, error } = await this.client
        .from("tasks")
        .insert(legacyRow(row))
        .select("*")
        .single());
    }
    if (error) throw new Error(`task create failed: ${error.message}`);
    return mapTask(data as TaskRow);
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    const row = patchToRow(patch);
    let { data, error } = await this.client
      .from("tasks")
      .update(row)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error && schemaBehind(error.message)) {
      console.warn("[store] schema behind code on update, retrying legacy shape:", error.message);
      const legacy = legacyRow(row);
      delete legacy.title; // never rewrite a title on a patch fallback
      if (Object.keys(legacy).length === 0) {
        throw new Error(`task update needs migration 004: ${error.message}`);
      }
      ({ data, error } = await this.client
        .from("tasks")
        .update(legacy)
        .eq("id", id)
        .select("*")
        .maybeSingle());
    }
    if (error) throw new Error(`task update failed: ${error.message}`);
    return data ? mapTask(data as TaskRow) : null;
  }

  async health(): Promise<boolean> {
    const { error } = await this.client.from("areas").select("id").limit(1);
    return !error;
  }

  /**
   * Which migrations have actually been applied. Probed, not assumed, so the
   * dashboard can say "run 004" instead of failing quietly.
   */
  async schemaStatus(): Promise<{
    dashboardTables: boolean;
    statusModel: boolean;
    calendar: boolean;
  }> {
    const probe = async (table: string, column: string) => {
      const { error } = await this.client.from(table).select(column).limit(1);
      return !error;
    };
    const [dashboardTables, statusModel, calendar] = await Promise.all([
      probe("state_docs", "slug"),
      probe("tasks", "waiting_on"),
      probe("calendar_events", "id"),
    ]);
    return { dashboardTables, statusModel, calendar };
  }
}
