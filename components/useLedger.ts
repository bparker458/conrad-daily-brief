"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AreaProgress, CalendarEvent, Task, TaskStatus } from "@/lib/types";
import { addDays, startOfDay } from "@/lib/dates";

/* Response shapes defined locally so no server module is ever imported into
   the client bundle (scripts/check-bundle.mjs enforces this). */

export interface NumbersView {
  live: boolean;
  forDate: string;
  written: number;
  toGoalPct: number;
  toAdjustedGoalPct: number;
  toLastYearPct: number;
  resultsThrough: string;
  latestRecapLanded: boolean;
  ageDays: number | null;
  recapLink: string | null;
  source: string;
  updatedAt: string;
}

export interface CalendarView {
  events: CalendarEvent[];
  syncedAt: string | null;
  staleMinutes: number | null;
}

export interface DocMeta {
  slug: string;
  title: string;
  areaId: string | null;
  updatedAt: string;
}

export interface SchemaHealth {
  dashboardTables?: boolean;
  statusModel?: boolean;
  calendar?: boolean;
  ready?: boolean;
  probe?: string;
}

/** A section either loaded, or failed with a reason we show. Never silent. */
export type Loaded<T> = { ok: true; data: T } | { ok: false; reason: string } | null;

export type ClientTask = Task & { _pending?: boolean };

interface QueueItem {
  kind: "create" | "patch";
  url: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  tempId?: string;
}

const QUEUE_KEY = "cb-write-queue-v1";

function loadQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage full or blocked; the queue still lives in memory */
  }
}

async function loadSection<T>(url: string, label: string): Promise<Loaded<T>> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.status === 401) {
      window.location.reload();
      return null;
    }
    if (!r.ok) {
      let reason = `${label} returned HTTP ${r.status}`;
      try {
        const j = await r.json();
        if (j && typeof j.error === "string") reason = `${label}: ${j.error}`;
      } catch {
        /* keep the status text */
      }
      return { ok: false, reason };
    }
    return { ok: true, data: (await r.json()) as T };
  } catch {
    return { ok: false, reason: `${label}: no connection` };
  }
}

/**
 * The one client-side door to the ledger. Every view (home, area, done)
 * reads the same task rows and writes through the same optimistic queue,
 * so a checkbox tapped anywhere is the same write everywhere.
 */
export function useLedger() {
  const [areas, setAreas] = useState<AreaProgress[]>([]);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(0);
  const [numbers, setNumbers] = useState<Loaded<NumbersView>>(null);
  const [calendar, setCalendar] = useState<Loaded<CalendarView>>(null);
  const [docs, setDocs] = useState<Loaded<DocMeta[]>>(null);
  const [schema, setSchema] = useState<SchemaHealth | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const queueRef = useRef<QueueItem[]>([]);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1100);
  }, []);

  /* ── data loading ─────────────────────────────────────────────── */

  const fetchCore = useCallback(async () => {
    const [aRes, tRes] = await Promise.all([
      fetch("/api/areas", { cache: "no-store" }),
      fetch("/api/tasks?area=all&include=all", { cache: "no-store" }),
    ]);
    if (aRes.status === 401 || tRes.status === 401) {
      window.location.reload();
      return;
    }
    if (!aRes.ok || !tRes.ok) throw new Error("load failed");
    setAreas(await aRes.json());
    setTasks(await tRes.json());
    setLastRefresh(new Date());
  }, []);

  const fetchExtras = useCallback(async () => {
    const from = startOfDay(new Date());
    const to = addDays(from, 15);
    const [n, c, d, h] = await Promise.all([
      loadSection<NumbersView>("/api/numbers", "Numbers"),
      loadSection<CalendarView>(
        `/api/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(
          to.toISOString()
        )}`,
        "Calendar"
      ),
      loadSection<DocMeta[]>("/api/state-docs", "State docs"),
      loadSection<{ schema?: SchemaHealth }>("/api/health", "Health"),
    ]);
    setNumbers(n);
    setCalendar(c);
    setDocs(d);
    setSchema(h && h.ok ? h.data.schema ?? null : null);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchCore().catch(() => undefined), fetchExtras()]);
  }, [fetchCore, fetchExtras]);

  useEffect(() => {
    queueRef.current = loadQueue();
    setPending(queueRef.current.length);
    fetchCore()
      .then(() => setLoaded(true))
      .catch(() => {
        setLoaded(true);
        setLoadError("Could not reach the list. Showing nothing rather than something stale.");
      });
    fetchExtras();
  }, [fetchCore, fetchExtras]);

  /* Re-pull when the app comes back to the foreground; the phone sits in a
     pocket for hours and must not show a 7am view at 3pm. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [refresh]);

  /* ── write path: optimistic + confirmed-save + retry queue ────── */

  const enqueue = useCallback((item: QueueItem) => {
    queueRef.current = [...queueRef.current, item];
    saveQueue(queueRef.current);
    setPending(queueRef.current.length);
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushing.current || queueRef.current.length === 0) return;
    flushing.current = true;
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current[0];
        let res: Response;
        try {
          res = await fetch(item.url, {
            method: item.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.body),
          });
        } catch {
          return; // still offline; try again later
        }
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok && res.status !== 404) return; // server trouble; retry later
        if (res.ok && item.kind === "create" && item.tempId) {
          const real: Task = await res.json();
          setTasks((ts) => ts.map((t) => (t.id === item.tempId ? { ...real } : t)));
        }
        queueRef.current = queueRef.current.slice(1);
        saveQueue(queueRef.current);
        setPending(queueRef.current.length);
        flashSaved();
      }
      fetchCore().catch(() => undefined);
    } finally {
      flushing.current = false;
    }
  }, [fetchCore, flashSaved]);

  useEffect(() => {
    const t = setInterval(flushQueue, 12000);
    window.addEventListener("online", flushQueue);
    flushQueue();
    return () => {
      clearInterval(t);
      window.removeEventListener("online", flushQueue);
    };
  }, [flushQueue]);

  const sendPatch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const updated: Task = await res.json();
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...updated } : t)));
        flashSaved();
      } catch {
        enqueue({ kind: "patch", url: `/api/tasks/${id}`, method: "PATCH", body });
      }
    },
    [enqueue, flashSaved]
  );

  /* ── mutations (optimistic, then confirmed) ───────────────────── */

  const setStatus = useCallback(
    (t: ClientTask, status: TaskStatus, extra: Record<string, unknown> = {}) => {
      if (t._pending) return;
      setTasks((ts) =>
        ts.map((x) =>
          x.id === t.id
            ? {
                ...x,
                status,
                doneAt: status === "done" ? new Date().toISOString() : null,
                delegatedTo: status === "waiting" ? x.delegatedTo : status === "done" ? x.delegatedTo : null,
                confirmedAt:
                  x.status === "candidate" && status !== "candidate"
                    ? new Date().toISOString()
                    : x.confirmedAt,
              }
            : x
        )
      );
      void sendPatch(t.id, { status, ...extra });
    },
    [sendPatch]
  );

  const toggleDone = useCallback(
    (t: ClientTask) => setStatus(t, t.status === "done" ? "open" : "done"),
    [setStatus]
  );

  const handoff = useCallback(
    (t: ClientTask, name: string) => {
      setTasks((ts) =>
        ts.map((x) => (x.id === t.id ? { ...x, delegatedTo: name, waitingOn: name, status: "waiting" } : x))
      );
      void sendPatch(t.id, { delegatedTo: name });
    },
    [sendPatch]
  );

  const pullBack = useCallback(
    (t: ClientTask) => {
      setTasks((ts) =>
        ts.map((x) => (x.id === t.id ? { ...x, delegatedTo: null, waitingOn: null, status: "open" } : x))
      );
      void sendPatch(t.id, { status: "open", delegatedTo: null, waitingOn: null });
    },
    [sendPatch]
  );

  const addNote = useCallback(
    (t: ClientTask, text: string) => {
      const stamp = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const dated = `[${stamp}] ${text}`;
      const newNote = t.note ? `${t.note}\n${dated}` : dated;
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, note: newNote } : x)));
      void sendPatch(t.id, { note: newNote });
    },
    [sendPatch]
  );

  const setDue = useCallback(
    (t: ClientTask, dueDate: string | null) => {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, dueDate } : x)));
      void sendPatch(t.id, { dueDate });
    },
    [sendPatch]
  );

  const moveArea = useCallback(
    (t: ClientTask, areaId: string) => {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, areaId } : x)));
      void sendPatch(t.id, { areaId });
    },
    [sendPatch]
  );

  /** "I'm not sure": flag it and ask Conrad for steps in one tap. */
  const askConrad = useCallback(
    async (t: ClientTask, onThinking: (v: boolean) => void) => {
      if (t._pending) return;
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, unsure: true } : x)));
      onThinking(true);
      try {
        const res = await fetch(`/api/tasks/${t.id}/suggest`, { method: "POST" });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const d: { task?: Task } = await res.json();
        if (d.task) {
          const real = d.task;
          setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...real } : x)));
        }
        flashSaved();
      } catch {
        enqueue({ kind: "patch", url: `/api/tasks/${t.id}`, method: "PATCH", body: { unsure: true } });
      } finally {
        onThinking(false);
      }
    },
    [enqueue, flashSaved]
  );

  const capture = useCallback(
    async (title: string, areaId: string, dueDate: string | null) => {
      const tempId = `temp-${Date.now()}`;
      const temp: ClientTask = {
        id: tempId,
        areaId,
        projectId: null,
        title,
        note: "",
        status: "open",
        flag: "none",
        delegatedTo: null,
        dueDate,
        unsure: false,
        conradNote: "",
        source: "phone",
        createdAt: new Date().toISOString(),
        doneAt: null,
        sortOrder: 0,
        sourceAccount: null,
        sourceLink: null,
        waitingOn: null,
        confidence: "user",
        confirmedAt: null,
        startAfter: null,
        nextReviewAt: null,
        evidence: "",
        _pending: true,
      };
      setTasks((ts) => [...ts, temp]);
      const body: Record<string, unknown> = { area: areaId, title, source: "phone" };
      if (dueDate) body.dueDate = dueDate;
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const real: Task = await res.json();
        setTasks((ts) => ts.map((t) => (t.id === tempId ? { ...real } : t)));
        flashSaved();
      } catch {
        enqueue({ kind: "create", url: "/api/tasks", method: "POST", body, tempId });
      }
    },
    [enqueue, flashSaved]
  );

  return {
    areas,
    tasks,
    loaded,
    loadError,
    saved,
    pending,
    numbers,
    calendar,
    docs,
    schema,
    lastRefresh,
    refresh,
    setStatus,
    toggleDone,
    handoff,
    pullBack,
    addNote,
    setDue,
    moveArea,
    askConrad,
    capture,
  };
}

export type Ledger = ReturnType<typeof useLedger>;
