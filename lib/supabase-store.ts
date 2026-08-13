import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "./store";
import type {
  Area,
  CreateNumbersInput,
  CreateSignalInput,
  CreateTaskInput,
  DailyNumbers,
  Project,
  Signal,
  SignalPatch,
  SignalStatus,
  SourceHealth,
  Task,
  TaskEvent,
  TaskEventKind,
  TaskPatch,
} from "./types";

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
  source_ref: string | null;
  origin_signal_id: string | null;
  created_at: string;
  done_at: string | null;
  sort_order: number | null;
}
interface SignalRow {
  id: string;
  kind: Signal["kind"];
  source: string;
  external_id: string;
  area_id: string | null;
  title: string;
  detail: string | null;
  person: string | null;
  person_email: string | null;
  url: string | null;
  occurred_at: string;
  status: SignalStatus;
  converted_task_id: string | null;
  created_at: string;
}
interface NumbersRow {
  id: string;
  business: string;
  results_through: string;
  written: number | string;
  to_goal_pct: number | string;
  to_adjusted_goal_pct: number | string;
  to_last_year_pct: number | string;
  source: string | null;
  recorded_at: string;
}
interface HealthRow {
  source: string;
  last_ok_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  detail: string | null;
}
interface EventRow {
  id: string;
  task_id: string;
  kind: TaskEventKind;
  actor: "phone" | "conrad";
  detail: string | null;
  at: string;
}

const num = (v: number | string | null): number =>
  typeof v === "number" ? v : Number(v ?? 0);

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
  sourceRef: r.source_ref ?? "",
  originSignalId: r.origin_signal_id ?? null,
  createdAt: r.created_at,
  doneAt: r.done_at,
  sortOrder: r.sort_order ?? 0,
});
const mapSignal = (r: SignalRow): Signal => ({
  id: r.id,
  kind: r.kind,
  source: r.source,
  externalId: r.external_id,
  areaId: r.area_id,
  title: r.title,
  detail: r.detail ?? "",
  person: r.person ?? "",
  personEmail: r.person_email ?? "",
  url: r.url ?? "",
  occurredAt: r.occurred_at,
  status: r.status,
  convertedTaskId: r.converted_task_id,
  createdAt: r.created_at,
});
const mapNumbers = (r: NumbersRow): DailyNumbers => ({
  id: r.id,
  business: r.business,
  resultsThrough: r.results_through,
  written: num(r.written),
  toGoalPct: num(r.to_goal_pct),
  toAdjustedGoalPct: num(r.to_adjusted_goal_pct),
  toLastYearPct: num(r.to_last_year_pct),
  source: r.source ?? "",
  recordedAt: r.recorded_at,
});
const mapHealth = (r: HealthRow): SourceHealth => ({
  source: r.source,
  lastOkAt: r.last_ok_at,
  lastErrorAt: r.last_error_at,
  lastError: r.last_error ?? "",
  detail: r.detail ?? "",
});
const mapEvent = (r: EventRow): TaskEvent => ({
  id: r.id,
  taskId: r.task_id,
  kind: r.kind,
  actor: r.actor,
  detail: r.detail ?? "",
  at: r.at,
});

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
  if (patch.sourceRef !== undefined) row.source_ref = patch.sourceRef;
  if (patch.doneAt !== undefined) row.done_at = patch.doneAt;
  return row;
}

/**
 * Server-only Supabase access using the service-role key.
 * This module must never be imported from client code — the bundle
 * check (scripts/check-bundle.mjs) enforces that at build time.
 */
export class SupabaseStore implements Store {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
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

  async listTasks(filter: {
    areaId?: string;
    includeDone: boolean;
  }): Promise<Task[]> {
    let q = this.client.from("tasks").select("*");
    if (filter.areaId && filter.areaId !== "all") q = q.eq("area_id", filter.areaId);
    if (!filter.includeDone) q = q.neq("status", "done");
    const { data, error } = await q;
    if (error) throw new Error(`tasks read failed: ${error.message}`);
    return (data as TaskRow[]).map(mapTask);
  }

  async getTask(id: string): Promise<Task | null> {
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`task read failed: ${error.message}`);
    return data ? mapTask(data as TaskRow) : null;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const { data, error } = await this.client
      .from("tasks")
      .insert({
        area_id: input.areaId,
        title: input.title,
        note: input.note ?? "",
        project_id: input.projectId ?? null,
        flag: input.flag ?? "none",
        due_date: input.dueDate ?? null,
        source: input.source,
        source_ref: input.sourceRef ?? "",
        origin_signal_id: input.originSignalId ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(`task create failed: ${error.message}`);
    return mapTask(data as TaskRow);
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    const row = patchToRow(patch);
    const { data, error } = await this.client
      .from("tasks")
      .update(row)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`task update failed: ${error.message}`);
    return data ? mapTask(data as TaskRow) : null;
  }

  async listSignals(filter: {
    statuses?: SignalStatus[];
    sinceDays?: number;
  }): Promise<Signal[]> {
    let q = this.client.from("signals").select("*");
    if (filter.statuses && filter.statuses.length > 0) {
      q = q.in("status", filter.statuses);
    }
    if (filter.sinceDays && filter.sinceDays > 0) {
      const since = new Date(Date.now() - filter.sinceDays * 86400000).toISOString();
      q = q.gte("occurred_at", since);
    }
    const { data, error } = await q.order("occurred_at", { ascending: false });
    if (error) throw new Error(`signals read failed: ${error.message}`);
    return (data as SignalRow[]).map(mapSignal);
  }

  async upsertSignal(input: CreateSignalInput): Promise<Signal> {
    // Only send fields we actually have. On insert the rest take their
    // defaults; on conflict the columns we omit are left alone, so a
    // later sweep with thinner metadata cannot erase what an earlier
    // richer one recorded.
    const row: Record<string, unknown> = {
      kind: input.kind,
      source: input.source,
      external_id: input.externalId,
      title: input.title,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    };
    if (input.areaId) row.area_id = input.areaId;
    if (input.detail) row.detail = input.detail;
    if (input.person) row.person = input.person;
    if (input.personEmail) row.person_email = input.personEmail;
    if (input.url) row.url = input.url;

    const { data, error } = await this.client
      .from("signals")
      .upsert(row, { onConflict: "source,external_id", ignoreDuplicates: false })
      .select("*")
      .single();
    if (error) throw new Error(`signal upsert failed: ${error.message}`);
    return mapSignal(data as SignalRow);
  }

  async updateSignal(id: string, patch: SignalPatch): Promise<Signal | null> {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.areaId !== undefined) row.area_id = patch.areaId;
    if (patch.convertedTaskId !== undefined) row.converted_task_id = patch.convertedTaskId;
    if (patch.detail !== undefined) row.detail = patch.detail;
    const { data, error } = await this.client
      .from("signals")
      .update(row)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`signal update failed: ${error.message}`);
    return data ? mapSignal(data as SignalRow) : null;
  }

  async getSignal(id: string): Promise<Signal | null> {
    const { data, error } = await this.client
      .from("signals")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`signal read failed: ${error.message}`);
    return data ? mapSignal(data as SignalRow) : null;
  }

  async latestNumbers(business: string): Promise<DailyNumbers | null> {
    const { data, error } = await this.client
      .from("daily_numbers")
      .select("*")
      .eq("business", business)
      .order("results_through", { ascending: false })
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`numbers read failed: ${error.message}`);
    return data ? mapNumbers(data as NumbersRow) : null;
  }

  async insertNumbers(input: CreateNumbersInput): Promise<DailyNumbers> {
    const { data, error } = await this.client
      .from("daily_numbers")
      .upsert(
        {
          business: input.business ?? "la-z-boy",
          results_through: input.resultsThrough,
          written: input.written,
          to_goal_pct: input.toGoalPct,
          to_adjusted_goal_pct: input.toAdjustedGoalPct,
          to_last_year_pct: input.toLastYearPct,
          source: input.source ?? "",
          recorded_at: new Date().toISOString(),
        },
        { onConflict: "business,results_through", ignoreDuplicates: false }
      )
      .select("*")
      .single();
    if (error) throw new Error(`numbers write failed: ${error.message}`);
    return mapNumbers(data as NumbersRow);
  }

  async listSourceHealth(): Promise<SourceHealth[]> {
    const { data, error } = await this.client.from("source_health").select("*");
    if (error) throw new Error(`source health read failed: ${error.message}`);
    return (data as HealthRow[]).map(mapHealth);
  }

  async recordSourceHealth(
    source: string,
    result: { ok: boolean; error?: string; detail?: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = { source, detail: result.detail ?? "" };
    if (result.ok) {
      row.last_ok_at = now;
      row.last_error = "";
      row.last_error_at = null;
    } else {
      row.last_error = result.error ?? "unknown error";
      row.last_error_at = now;
    }
    const { error } = await this.client
      .from("source_health")
      .upsert(row, { onConflict: "source" });
    if (error) console.error("[source_health]", error.message);
  }

  async appendEvent(
    taskId: string,
    kind: TaskEventKind,
    actor: "phone" | "conrad",
    detail = ""
  ): Promise<void> {
    const { error } = await this.client
      .from("task_events")
      .insert({ task_id: taskId, kind, actor, detail });
    // The log must never take the write down with it.
    if (error) console.error("[task_events]", error.message);
  }

  async listEvents(limit: number): Promise<TaskEvent[]> {
    const { data, error } = await this.client
      .from("task_events")
      .select("*")
      .order("at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`events read failed: ${error.message}`);
    return (data as EventRow[]).map(mapEvent);
  }

  async health(): Promise<boolean> {
    const { error } = await this.client.from("areas").select("id").limit(1);
    return !error;
  }
}
