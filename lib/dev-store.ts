import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Store } from "./store";
import type {
  Area,
  CreateTaskInput,
  Project,
  Task,
  TaskPatch,
} from "./types";
import { SEED_AREAS, SEED_TASKS } from "./seed-data";

interface DevData {
  areas: Area[];
  projects: Project[];
  tasks: Task[];
}

const FILE = path.join(process.cwd(), ".dev-store.json");

/**
 * Local development stand-in for Supabase. File-backed so persistence
 * survives reloads and server restarts, which is exactly what the
 * Phase 1 checklist tests. Never used when SUPABASE_URL is configured.
 */
export class DevStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();

  /** Serialize all read-modify-write cycles to keep the file consistent. */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<DevData> {
    try {
      const raw = await fs.readFile(FILE, "utf8");
      return JSON.parse(raw) as DevData;
    } catch {
      const seeded: DevData = {
        areas: SEED_AREAS,
        projects: [],
        tasks: SEED_TASKS.map((t, i) => ({
          ...t,
          id: randomUUID(),
          createdAt: new Date(Date.now() + i).toISOString(),
        })),
      };
      await this.save(seeded);
      return seeded;
    }
  }

  private async save(data: DevData): Promise<void> {
    const tmp = `${FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, FILE);
  }

  listAreas(): Promise<Area[]> {
    return this.locked(async () => {
      const d = await this.load();
      return [...d.areas].sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }

  listProjects(): Promise<Project[]> {
    return this.locked(async () => {
      const d = await this.load();
      return [...d.projects].sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }

  listTasks(filter: { areaId?: string; includeDone: boolean }): Promise<Task[]> {
    return this.locked(async () => {
      const d = await this.load();
      return d.tasks.filter((t) => {
        if (filter.areaId && filter.areaId !== "all" && t.areaId !== filter.areaId) return false;
        if (!filter.includeDone && t.status === "done") return false;
        return true;
      });
    });
  }

  createTask(input: CreateTaskInput): Promise<Task> {
    return this.locked(async () => {
      const d = await this.load();
      const task: Task = {
        id: randomUUID(),
        areaId: input.areaId,
        projectId: input.projectId ?? null,
        title: input.title,
        note: input.note ?? "",
        status: "open",
        flag: input.flag ?? "none",
        delegatedTo: null,
        dueDate: input.dueDate ?? null,
        unsure: false,
        conradNote: "",
        source: input.source,
        createdAt: new Date().toISOString(),
        doneAt: null,
        sortOrder: 0,
      };
      d.tasks.push(task);
      await this.save(d);
      return task;
    });
  }

  updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    return this.locked(async () => {
      const d = await this.load();
      const idx = d.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      const prev = d.tasks[idx];
      const next: Task = {
        ...prev,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.flag !== undefined ? { flag: patch.flag } : {}),
        ...(patch.delegatedTo !== undefined ? { delegatedTo: patch.delegatedTo } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.unsure !== undefined ? { unsure: patch.unsure } : {}),
        ...(patch.conradNote !== undefined ? { conradNote: patch.conradNote } : {}),
        ...(patch.areaId !== undefined ? { areaId: patch.areaId } : {}),
        ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.doneAt !== undefined ? { doneAt: patch.doneAt } : {}),
      };
      d.tasks[idx] = next;
      await this.save(d);
      return next;
    });
  }

  async health(): Promise<boolean> {
    try {
      await this.load();
      return true;
    } catch {
      return false;
    }
  }
}
