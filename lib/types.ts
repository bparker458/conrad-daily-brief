export type TaskStatus = "open" | "done" | "waiting";
export type TaskFlag = "none" | "amber" | "red";
export type TaskSource = "phone" | "conrad" | "voice" | "seed" | "signal";

export interface Area {
  id: string;
  name: string;
  endInMind: string;
  sortOrder: number;
}

export interface Project {
  id: string;
  areaId: string | null;
  name: string;
  endInMind: string;
  status: string;
  sortOrder: number;
  createdAt: string;
}

export interface Task {
  id: string;
  areaId: string | null;
  projectId: string | null;
  title: string;
  note: string;
  status: TaskStatus;
  flag: TaskFlag;
  delegatedTo: string | null;
  dueDate: string | null;
  unsure: boolean;
  conradNote: string;
  source: TaskSource;
  /** Where this came from in the world: an email, a meeting, a call, a note. */
  sourceRef: string;
  /** The signal row that produced this task, when it came from one. */
  originSignalId: string | null;
  createdAt: string;
  doneAt: string | null;
  sortOrder: number;
}

export interface AreaProgress {
  id: string;
  name: string;
  endInMind: string;
  sortOrder: number;
  done: number;
  total: number;
  pct: number;
}

export interface ProjectProgress {
  id: string;
  name: string;
  areaId: string | null;
  done: number;
  total: number;
  pct: number;
}

/* ── Signals: the durable record of things that want Brad's attention ──
   A signal is what a source said (an email arrived, a meeting needs prep,
   a number came in soft). It is written when Conrad or a live pull first
   notices it, not re-derived at render time. Converting a signal makes a
   task and links the two, so the dashboard can always answer "where did
   this come from". */

export type SignalKind = "mail" | "calendar" | "chat" | "numbers" | "note";
export type SignalStatus = "open" | "acknowledged" | "converted" | "dismissed";

export interface Signal {
  id: string;
  kind: SignalKind;
  /** Which connector produced it: 'outlook', 'gmail', 'google-calendar', 'conrad'. */
  source: string;
  /** Stable id from the source system, used to dedupe repeat pulls. */
  externalId: string;
  areaId: string | null;
  title: string;
  detail: string;
  person: string;
  personEmail: string;
  /** Deep link back to the message, event or thread. */
  url: string;
  /** When the thing happened in the world, not when we noticed it. */
  occurredAt: string;
  status: SignalStatus;
  convertedTaskId: string | null;
  createdAt: string;
}

export interface CreateSignalInput {
  kind: SignalKind;
  source: string;
  externalId: string;
  title: string;
  detail?: string;
  person?: string;
  personEmail?: string;
  url?: string;
  occurredAt?: string;
  areaId?: string | null;
}

export interface SignalPatch {
  status?: SignalStatus;
  areaId?: string | null;
  convertedTaskId?: string | null;
  detail?: string;
}

/* ── Daily numbers: stored rows, never a hardcoded constant ─────────── */

export interface DailyNumbers {
  id: string;
  business: string;
  /** The business day the figures describe. */
  resultsThrough: string;
  written: number;
  toGoalPct: number;
  toAdjustedGoalPct: number;
  toLastYearPct: number;
  source: string;
  recordedAt: string;
}

export interface CreateNumbersInput {
  business?: string;
  resultsThrough: string;
  written: number;
  toGoalPct: number;
  toAdjustedGoalPct: number;
  toLastYearPct: number;
  source?: string;
}

/* ── Source health: what worked, what broke, when ─────────────────── */

export interface SourceHealth {
  source: string;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string;
  detail: string;
}

/* ── Task events: the durable log the checkbox writes to ──────────── */

export type TaskEventKind =
  | "created"
  | "done"
  | "reopened"
  | "delegated"
  | "pulled_back"
  | "noted"
  | "planned"
  | "unplanned"
  | "flagged"
  | "converted";

export interface TaskEvent {
  id: string;
  taskId: string;
  kind: TaskEventKind;
  actor: "phone" | "conrad";
  detail: string;
  at: string;
}

/** Fields a client may create a task with. */
export interface CreateTaskInput {
  areaId: string;
  title: string;
  note?: string;
  projectId?: string | null;
  flag?: TaskFlag;
  dueDate?: string | null;
  source: TaskSource;
  sourceRef?: string;
  originSignalId?: string | null;
}

/** Fields a client may PATCH. Business logic (done_at, waiting) lives in the API layer. */
export interface TaskPatch {
  status?: TaskStatus;
  flag?: TaskFlag;
  delegatedTo?: string | null;
  note?: string;
  unsure?: boolean;
  conradNote?: string;
  areaId?: string;
  projectId?: string | null;
  dueDate?: string | null;
  sourceRef?: string;
  doneAt?: string | null; // set by the API layer only, derived from status
}

export const TASK_STATUSES: TaskStatus[] = ["open", "done", "waiting"];
export const TASK_FLAGS: TaskFlag[] = ["none", "amber", "red"];
export const TASK_SOURCES: TaskSource[] = ["phone", "conrad", "voice", "seed", "signal"];
export const SIGNAL_KINDS: SignalKind[] = ["mail", "calendar", "chat", "numbers", "note"];
export const SIGNAL_STATUSES: SignalStatus[] = [
  "open",
  "acknowledged",
  "converted",
  "dismissed",
];
