import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
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
import { SEED_AREAS, SEED_TASKS } from "./seed-data";

interface DevData {
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  signals: Signal[];
  numbers: DailyNumbers[];
  sourceHealth: SourceHealth[];
  events: TaskEvent[];
}

const FILE = path.join(process.cwd(), ".dev-store.json");

/**
 * Local development stand-in for Supabase. File-backed so persistence
 * survives reloads and server restarts, which is exactly what the
 * acceptance checklist tests. Never used when SUPABASE_URL is configured.
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
      const parsed = JSON.parse(raw) as Partial<DevData>;
      // Tolerate stores written before the dashboard tables existed.
      return {
        areas: parsed.areas ?? SEED_AREAS,
        projects: parsed.projects ?? [],
        tasks: (parsed.tasks ?? []).map((t) => ({
          ...t,
          sourceRef: t.sourceRef ?? "",
          originSignalId: t.originSignalId ?? null,
        })) as Task[],
        signals: parsed.signals ?? [],
        numbers: parsed.numbers ?? [],
        sourceHealth: parsed.sourceHealth ?? [],
        events: parsed.events ?? [],
      };
    } catch {
      const seeded: DevData = {
        areas: SEED_AREAS,
        projects: [],
        tasks: SEED_TASKS.map((t, i) => ({
          ...t,
          id: randomUUID(),
          createdAt: new Date(Date.now() + i).toISOString(),
        })),
        signals: [],
        numbers: [],
        sourceHealth: [],
        events: [],
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

  getTask(id: string): Promise<Task | null> {
    return this.locked(async () => {
      const d = await this.load();
      return d.tasks.find((t) => t.id === id) ?? null;
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
        sourceRef: input.sourceRef ?? "",
        originSignalId: input.originSignalId ?? null,
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
        ...(patch.sourceRef !== undefined ? { sourceRef: patch.sourceRef } : {}),
        ...(patch.doneAt !== undefined ? { doneAt: patch.doneAt } : {}),
      };
      d.tasks[idx] = next;
      await this.save(d);
      return next;
    });
  }

  listSignals(filter: { statuses?: SignalStatus[]; sinceDays?: number }): Promise<Signal[]> {
    return this.locked(async () => {
      const d = await this.load();
      const cutoff = filter.sinceDays
        ? Date.now() - filter.sinceDays * 86400000
        : null;
      return d.signals
        .filter((s) => {
          if (filter.statuses && filter.statuses.length > 0 && !filter.statuses.includes(s.status))
            return false;
          if (cutoff !== null && new Date(s.occurredAt).getTime() < cutoff) return false;
          return true;
        })
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    });
  }

  upsertSignal(input: CreateSignalInput): Promise<Signal> {
    return this.locked(async () => {
      const d = await this.load();
      const idx = d.signals.findIndex(
        (s) => s.source === input.source && s.externalId === input.externalId
      );
      if (idx !== -1) {
        // A thinner later pull must not erase richer earlier metadata.
        const prev = d.signals[idx];
        const merged: Signal = {
          ...prev,
          title: input.title || prev.title,
          detail: input.detail || prev.detail,
          person: input.person || prev.person,
          personEmail: input.personEmail || prev.personEmail,
          url: input.url || prev.url,
          occurredAt: input.occurredAt || prev.occurredAt,
        };
        d.signals[idx] = merged;
        await this.save(d);
        return merged;
      }
      const signal: Signal = {
        id: randomUUID(),
        kind: input.kind,
        source: input.source,
        externalId: input.externalId,
        areaId: input.areaId ?? null,
        title: input.title,
        detail: input.detail ?? "",
        person: input.person ?? "",
        personEmail: input.personEmail ?? "",
        url: input.url ?? "",
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        status: "open",
        convertedTaskId: null,
        createdAt: new Date().toISOString(),
      };
      d.signals.push(signal);
      await this.save(d);
      return signal;
    });
  }

  updateSignal(id: string, patch: SignalPatch): Promise<Signal | null> {
    return this.locked(async () => {
      const d = await this.load();
      const idx = d.signals.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      const next: Signal = {
        ...d.signals[idx],
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.areaId !== undefined ? { areaId: patch.areaId } : {}),
        ...(patch.convertedTaskId !== undefined
          ? { convertedTaskId: patch.convertedTaskId }
          : {}),
        ...(patch.detail !== undefined ? { detail: patch.detail } : {}),
      };
      d.signals[idx] = next;
      await this.save(d);
      return next;
    });
  }

  getSignal(id: string): Promise<Signal | null> {
    return this.locked(async () => {
      const d = await this.load();
      return d.signals.find((s) => s.id === id) ?? null;
    });
  }

  latestNumbers(business: string): Promise<DailyNumbers | null> {
    return this.locked(async () => {
      const d = await this.load();
      const rows = d.numbers
        .filter((n) => n.business === business)
        .sort((a, b) => b.resultsThrough.localeCompare(a.resultsThrough));
      return rows[0] ?? null;
    });
  }

  insertNumbers(input: CreateNumbersInput): Promise<DailyNumbers> {
    return this.locked(async () => {
      const d = await this.load();
      const business = input.business ?? "la-z-boy";
      const row: DailyNumbers = {
        id: randomUUID(),
        business,
        resultsThrough: input.resultsThrough,
        written: input.written,
        toGoalPct: input.toGoalPct,
        toAdjustedGoalPct: input.toAdjustedGoalPct,
        toLastYearPct: input.toLastYearPct,
        source: input.source ?? "",
        recordedAt: new Date().toISOString(),
      };
      const idx = d.numbers.findIndex(
        (n) => n.business === business && n.resultsThrough === input.resultsThrough
      );
      if (idx !== -1) d.numbers[idx] = { ...row, id: d.numbers[idx].id };
      else d.numbers.push(row);
      await this.save(d);
      return idx !== -1 ? d.numbers[idx] : row;
    });
  }

  listSourceHealth(): Promise<SourceHealth[]> {
    return this.locked(async () => {
      const d = await this.load();
      return d.sourceHealth;
    });
  }

  recordSourceHealth(
    source: string,
    result: { ok: boolean; error?: string; detail?: string }
  ): Promise<void> {
    return this.locked(async () => {
      const d = await this.load();
      const now = new Date().toISOString();
      const idx = d.sourceHealth.findIndex((h) => h.source === source);
      const prev: SourceHealth =
        idx !== -1
          ? d.sourceHealth[idx]
          : { source, lastOkAt: null, lastErrorAt: null, lastError: "", detail: "" };
      const next: SourceHealth = result.ok
        ? { ...prev, lastOkAt: now, lastError: "", lastErrorAt: null, detail: result.detail ?? "" }
        : {
            ...prev,
            lastError: result.error ?? "unknown error",
            lastErrorAt: now,
            detail: result.detail ?? prev.detail,
          };
      if (idx !== -1) d.sourceHealth[idx] = next;
      else d.sourceHealth.push(next);
      await this.save(d);
    });
  }

  appendEvent(
    taskId: string,
    kind: TaskEventKind,
    actor: "phone" | "conrad",
    detail = ""
  ): Promise<void> {
    return this.locked(async () => {
      const d = await this.load();
      d.events.push({
        id: randomUUID(),
        taskId,
        kind,
        actor,
        detail,
        at: new Date().toISOString(),
      });
      // Keep the dev file from growing without bound.
      if (d.events.length > 2000) d.events = d.events.slice(-2000);
      await this.save(d);
    });
  }

  listEvents(limit: number): Promise<TaskEvent[]> {
    return this.locked(async () => {
      const d = await this.load();
      return [...d.events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
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
