import type {
  Area,
  CreateTaskInput,
  Project,
  Task,
  TaskPatch,
} from "./types";

/**
 * The single door to the data (Section 3 of the handoff).
 * Both faces (phone + Conrad) reach the store only through the API layer,
 * and the API layer reaches the data only through this interface.
 */
export interface Store {
  listAreas(): Promise<Area[]>;
  listProjects(): Promise<Project[]>;
  listTasks(filter: { areaId?: string; includeDone: boolean }): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  /** Returns the updated task, or null if no task has that id. */
  updateTask(id: string, patch: TaskPatch): Promise<Task | null>;
  health(): Promise<boolean>;
}

function supabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const placeholder = (v: string) =>
    v === "" || v.startsWith("YOUR") || v.startsWith("your") || v.includes("placeholder");
  return !placeholder(url) && !placeholder(key);
}

let cached: Store | null = null;
let warned = false;

/**
 * Selects the real Supabase store when configured, otherwise a local
 * file-backed dev store so the whole app can be built and tested before
 * Marshall creates the Supabase project (Section 12). Same interface,
 * same API layer, same logic — the dev store is never a second source
 * of truth in production because production always has SUPABASE_URL set.
 */
export async function getStore(): Promise<Store> {
  if (cached) return cached;
  if (supabaseConfigured()) {
    const { SupabaseStore } = await import("./supabase-store");
    cached = new SupabaseStore();
  } else {
    if (!warned) {
      console.warn(
        "[store] SUPABASE_URL not configured — using local dev store (.dev-store.json). Fine for development, not for production."
      );
      warned = true;
    }
    const { DevStore } = await import("./dev-store");
    cached = new DevStore();
  }
  return cached;
}
