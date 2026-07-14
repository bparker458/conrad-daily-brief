import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "./store";
import type {
  Area,
  CreateTaskInput,
  Project,
  Task,
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
  created_at: string;
  done_at: string | null;
  sort_order: number | null;
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

  async health(): Promise<boolean> {
    const { error } = await this.client.from("areas").select("id").limit(1);
    return !error;
  }
}
