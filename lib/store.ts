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

/**
 * The single door to the data (Section 3 of the handoff).
 * Both faces (phone + Conrad) reach the store only through the API layer,
 * and the API layer reaches the data only through this interface.
 *
 * Everything the dashboard shows that is not a live connector pull comes
 * from here: tasks, signals, numbers, source health, and the event log.
 * Nothing is typed into a component and nothing is baked into a build.
 */
export interface Store {
  listAreas(): Promise<Area[]>;
  listProjects(): Promise<Project[]>;
  listTasks(filter: { areaId?: string; includeDone: boolean }): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  /** Returns the updated task, or null if no task has that id. */
  updateTask(id: string, patch: TaskPatch): Promise<Task | null>;
  getTask(id: string): Promise<Task | null>;

  /* Signals — the durable record of what wants attention. */
  listSignals(filter: { statuses?: SignalStatus[]; sinceDays?: number }): Promise<Signal[]>;
  /** Upsert on (source, externalId) so repeated pulls never duplicate. */
  upsertSignal(input: CreateSignalInput): Promise<Signal>;
  updateSignal(id: string, patch: SignalPatch): Promise<Signal | null>;
  getSignal(id: string): Promise<Signal | null>;

  /* Daily numbers — stored rows, newest wins. */
  latestNumbers(business: string): Promise<DailyNumbers | null>;
  insertNumbers(input: CreateNumbersInput): Promise<DailyNumbers>;

  /* Source health — what worked, what broke, when. */
  listSourceHealth(): Promise<SourceHealth[]>;
  recordSourceHealth(
    source: string,
    result: { ok: boolean; error?: string; detail?: string }
  ): Promise<void>;

  /* Event log — the checkbox writes here so Conrad stops resurfacing things. */
  appendEvent(
    taskId: string,
    kind: TaskEventKind,
    actor: "phone" | "conrad",
    detail?: string
  ): Promise<void>;
  listEvents(limit: number): Promise<TaskEvent[]>;

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
 * file-backed dev store so the whole app can be built and tested without
 * touching production. Same interface, same API layer, same logic — the
 * dev store is never a second source of truth in production because
 * production always has SUPABASE_URL set.
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
