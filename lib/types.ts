export type TaskStatus = "open" | "done" | "waiting";
export type TaskFlag = "none" | "amber" | "red";
export type TaskSource = "phone" | "conrad" | "voice" | "seed";

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
  doneAt?: string | null; // set by the API layer only, derived from status
}

export const TASK_STATUSES: TaskStatus[] = ["open", "done", "waiting"];
export const TASK_FLAGS: TaskFlag[] = ["none", "amber", "red"];
export const TASK_SOURCES: TaskSource[] = ["phone", "conrad", "voice", "seed"];
