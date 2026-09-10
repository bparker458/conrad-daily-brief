/**
 * Task status lifecycle (migration 003/004).
 *   candidate    AI-detected from email or a recording; not yet real until Brad confirms
 *   open         confirmed, on the list
 *   in_progress  started
 *   waiting      handed to someone; delegatedTo / waitingOn says who
 *   blocked      cannot move until something outside Brad happens
 *   someday      parked on purpose
 *   done         finished; doneAt + evidence stay forever
 *   cancelled    will not do; kept for the record
 */
export type TaskStatus =
  | "candidate"
  | "open"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "someday"
  | "done"
  | "cancelled";
export type TaskFlag = "none" | "amber" | "red";
/**
 * Where a task came from. Stored, never normalized away (the 08-12 audit found
 * every row said 'conrad' because the API collapsed unknown values).
 *   phone   the + button in the app        text   Brad's iMessage self-thread
 *   plaud   a Plaud recording              email  email-monitor candidate sweep
 *   conrad  Conrad in a working session    voice  dictation
 *   seed    original seed rows             manual anything typed by hand elsewhere
 */
export type TaskSource =
  | "phone"
  | "conrad"
  | "voice"
  | "seed"
  | "text"
  | "plaud"
  | "email"
  | "manual";

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
  createdAt: string;
  doneAt: string | null;
  sortOrder: number;
  /* migration 003 fields; null when the column is absent or empty */
  sourceAccount: string | null;
  sourceLink: string | null;
  waitingOn: string | null;
  confidence: "ai" | "user" | null;
  confirmedAt: string | null;
  startAfter: string | null;
  nextReviewAt: string | null;
  evidence: string;
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

/** Fields a client may create a task with. */
export interface CreateTaskInput {
  areaId: string;
  title: string;
  note?: string;
  projectId?: string | null;
  flag?: TaskFlag;
  dueDate?: string | null;
  source: TaskSource;
  status?: TaskStatus; // defaults to 'open'; email/plaud sweeps pass 'candidate'
  sourceAccount?: string | null;
  sourceLink?: string | null;
  waitingOn?: string | null;
  confidence?: "ai" | "user" | null;
  startAfter?: string | null;
  nextReviewAt?: string | null;
}

/** Fields a client may PATCH. Business logic (done_at, waiting, confirmed_at) lives in the API layer. */
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
  title?: string;
  doneAt?: string | null; // set by the API layer only, derived from status
  sourceAccount?: string | null;
  sourceLink?: string | null;
  waitingOn?: string | null;
  confidence?: "ai" | "user" | null;
  confirmedAt?: string | null; // set by the API layer when a candidate becomes open
  startAfter?: string | null;
  nextReviewAt?: string | null;
  evidence?: string;
}

export const TASK_STATUSES: TaskStatus[] = [
  "candidate",
  "open",
  "in_progress",
  "waiting",
  "blocked",
  "someday",
  "done",
  "cancelled",
];
/** Statuses that count as "still live" for the open list. */
export const LIVE_STATUSES: TaskStatus[] = ["open", "in_progress", "waiting", "blocked"];
/** Statuses that are finished one way or the other. */
export const CLOSED_STATUSES: TaskStatus[] = ["done", "cancelled"];
export const TASK_FLAGS: TaskFlag[] = ["none", "amber", "red"];
export const TASK_SOURCES: TaskSource[] = [
  "phone",
  "conrad",
  "voice",
  "seed",
  "text",
  "plaud",
  "email",
  "manual",
];
/** Sources that exist in the original enum; safe before migration 004 runs. */
export const LEGACY_SOURCES: TaskSource[] = ["phone", "conrad", "voice", "seed"];

/* ---------------------------------------------------------- calendar */

export interface CalendarEvent {
  id: string; // Outlook event id (or organizer-subject-start hash)
  subject: string;
  startAt: string; // ISO
  endAt: string; // ISO
  allDay: boolean;
  location: string;
  organizer: string;
  attendees: string[];
  webLink: string | null;
  isCancelled: boolean;
  source: string; // 'outlook'
  syncedAt: string;
}
