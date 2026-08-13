"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardPayload } from "@/app/api/dashboard/route";
import type { Signal, Task } from "@/lib/types";
import type { MailItem } from "@/lib/source-types";
import { ago, datedLine, todayLabel } from "@/lib/client-format";
import { ymdInTz } from "@/lib/derive";
import TaskCard, {
  WaitingCard,
  HANDOFF_PEOPLE,
  type ClientTask,
} from "@/components/dashboard/TaskCard";
import {
  AreasPanel,
  CalendarPanel,
  MailPanel,
  NumbersStrip,
  PanelState,
  SectionHeader,
  StatusBar,
} from "@/components/dashboard/Panels";

/* ───────────────────────────────────────────────────────
   The dashboard.

   Rules it is built to keep, from Brad's Daily Dashboard Protocol:

   1. Every section pulls live when the page opens, and again when Brad
      comes back to it. Nothing here is generated once and frozen.
   2. A section that cannot load says so, by name, with the reason. There
      is no path that swaps in older data quietly — when the service
      worker serves an offline copy, the banner says it is an offline copy
      and how old it is.
   3. "Needs attention" is always a named thing: the sender, the subject,
      the meeting, the overdue item.
   4. Open items live in the task store. The checkbox writes through the
      API to that store and to the event log, so a tick is durable and
      Conrad stops resurfacing it.
   5. This Week leads, because that is what Brad needs first.
   ────────────────────────────────────────────────────── */

interface QueueItem {
  kind: "create" | "patch";
  url: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  tempId?: string;
}

const QUEUE_KEY = "cb-write-queue-v1";
const REFRESH_MS = 5 * 60 * 1000;

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
    /* storage full or blocked — the queue still lives in memory */
  }
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return ymdInTz(new Date(iso)) === ymdInTz();
}

function openComparator(a: ClientTask, b: ClientTask): number {
  const ra = a.flag === "red" ? 0 : a.flag === "amber" ? 1 : 2;
  const rb = b.flag === "red" ? 0 : b.flag === "amber" ? 1 : 2;
  if (ra !== rb) return ra - rb;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.createdAt.localeCompare(b.createdAt);
}

const NAV = [
  { id: "week", label: "This Week" },
  { id: "today", label: "Today" },
  { id: "numbers", label: "Numbers" },
  { id: "calendar", label: "Calendar" },
  { id: "mail", label: "Waiting on you" },
  { id: "worlds", label: "Worlds" },
  { id: "work", label: "Open work" },
  { id: "waiting", label: "Delegated" },
];

export default function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [localTasks, setLocalTasks] = useState<ClientTask[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [active, setActive] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showOlder, setShowOlder] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureArea, setCaptureArea] = useState("inbox");
  const [openAction, setOpenAction] = useState<{ id: string; kind: "handoff" | "note" } | null>(
    null
  );
  const [handoffPick, setHandoffPick] = useState(HANDOFF_PEOPLE[0]);
  const [handoffOther, setHandoffOther] = useState("");
  const [noteText, setNoteText] = useState("");
  const [thinkingIds, setThinkingIds] = useState<Record<string, boolean>>({});
  const [hiddenSteps, setHiddenSteps] = useState<Record<string, boolean>>({});
  const [busyMail, setBusyMail] = useState<Record<string, boolean>>({});

  const queueRef = useRef<QueueItem[]>([]);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1100);
  }, []);

  /* ── the one load ────────────────────────────────────── */

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error(`dashboard read failed (${res.status})`);
      // The service worker marks anything it served from its cache, so an
      // offline copy is labelled instead of passing as live.
      setFromCache(res.headers.get("x-from-cache") === "1");
      const data = (await res.json()) as DashboardPayload;
      setPayload(data);
      setLocalTasks(data.tasks.data as ClientTask[]);
      setLoadError("");
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? `${e.message}. Showing nothing rather than something stale.`
          : "Could not reach the dashboard."
      );
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    queueRef.current = loadQueue();
    setPending(queueRef.current.length);
    void load();
  }, [load]);

  /* Live means live: refresh when he comes back to it, and on a timer. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = setInterval(() => void load(true), REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [load]);

  /* ── write path: optimistic, confirmed, retried ────────────── */

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
          setLocalTasks((ts) =>
            (ts || []).map((t) => (t.id === item.tempId ? { ...real } : t))
          );
        }
        queueRef.current = queueRef.current.slice(1);
        saveQueue(queueRef.current);
        setPending(queueRef.current.length);
        flashSaved();
      }
      void load(true);
    } finally {
      flushing.current = false;
    }
  }, [flashSaved, load]);

  useEffect(() => {
    const t = setInterval(flushQueue, 12000);
    window.addEventListener("online", flushQueue);
    void flushQueue();
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
        setLocalTasks((ts) => (ts || []).map((t) => (t.id === id ? { ...updated } : t)));
        flashSaved();
      } catch {
        enqueue({ kind: "patch", url: `/api/tasks/${id}`, method: "PATCH", body });
      }
    },
    [enqueue, flashSaved]
  );

  /* ── task mutations ─────────────────────────────────── */

  const toggleDone = useCallback(
    (t: ClientTask) => {
      if (t._pending) return;
      const makingDone = t.status !== "done";
      setLocalTasks((ts) =>
        (ts || []).map((x) =>
          x.id === t.id
            ? {
                ...x,
                status: makingDone ? "done" : "open",
                doneAt: makingDone ? new Date().toISOString() : null,
                delegatedTo: makingDone ? x.delegatedTo : null,
              }
            : x
        )
      );
      void sendPatch(t.id, { status: makingDone ? "done" : "open" });
    },
    [sendPatch]
  );

  const askConrad = useCallback(
    async (t: ClientTask) => {
      if (t._pending || thinkingIds[t.id]) return;
      setLocalTasks((ts) => (ts || []).map((x) => (x.id === t.id ? { ...x, unsure: true } : x)));
      setThinkingIds((m) => ({ ...m, [t.id]: true }));
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
          setLocalTasks((ts) => (ts || []).map((x) => (x.id === t.id ? { ...real } : x)));
        }
        flashSaved();
      } catch {
        enqueue({
          kind: "patch",
          url: `/api/tasks/${t.id}`,
          method: "PATCH",
          body: { unsure: true },
        });
      } finally {
        setThinkingIds((m) => {
          const n = { ...m };
          delete n[t.id];
          return n;
        });
      }
    },
    [enqueue, flashSaved, thinkingIds]
  );

  const confirmHandoff = useCallback(
    (t: ClientTask) => {
      const name = handoffPick === "__other__" ? handoffOther.trim() : handoffPick;
      if (!name) return;
      setLocalTasks((ts) =>
        (ts || []).map((x) =>
          x.id === t.id ? { ...x, delegatedTo: name, status: "waiting" } : x
        )
      );
      setOpenAction(null);
      setHandoffOther("");
      void sendPatch(t.id, { delegatedTo: name });
    },
    [handoffOther, handoffPick, sendPatch]
  );

  const pullBack = useCallback(
    (t: ClientTask) => {
      setLocalTasks((ts) =>
        (ts || []).map((x) => (x.id === t.id ? { ...x, delegatedTo: null, status: "open" } : x))
      );
      void sendPatch(t.id, { status: "open", delegatedTo: null });
    },
    [sendPatch]
  );

  const confirmNote = useCallback(
    (t: ClientTask) => {
      const text = noteText.trim();
      if (!text) return;
      const newNote = t.note ? `${t.note}\n${datedLine(text)}` : datedLine(text);
      setLocalTasks((ts) => (ts || []).map((x) => (x.id === t.id ? { ...x, note: newNote } : x)));
      setNoteText("");
      setOpenAction(null);
      void sendPatch(t.id, { note: newNote });
    },
    [noteText, sendPatch]
  );

  const capture = useCallback(async () => {
    const title = captureText.trim();
    if (!title) return;
    const areaId = captureArea || "inbox";
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
      dueDate: null,
      unsure: false,
      conradNote: "",
      source: "phone",
      sourceRef: "Captured on the phone",
      originSignalId: null,
      createdAt: new Date().toISOString(),
      doneAt: null,
      sortOrder: 0,
      _pending: true,
    };
    setLocalTasks((ts) => [...(ts || []), temp]);
    setCaptureText("");
    setSheetOpen(false);
    const body = { area: areaId, title, source: "phone", sourceRef: "Captured on the phone" };
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
      setLocalTasks((ts) => (ts || []).map((t) => (t.id === tempId ? { ...real } : t)));
      flashSaved();
    } catch {
      enqueue({ kind: "create", url: "/api/tasks", method: "POST", body, tempId });
    }
  }, [captureArea, captureText, enqueue, flashSaved]);

  /* ── mail actions: convert to a task, or say it is not his ────── */

  const signalFor = useCallback(
    (m: MailItem): Signal | undefined =>
      (payload?.signals.data || []).find(
        (s) => s.source === m.source && s.externalId === m.id
      ),
    [payload]
  );

  /** Ensure a signal row exists so the decision has somewhere to live. */
  const ensureSignal = useCallback(
    async (m: MailItem): Promise<string | null> => {
      const existing = signalFor(m);
      if (existing) return existing.id;
      try {
        const res = await fetch("/api/signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "mail",
            source: m.source,
            externalId: m.id,
            title: m.subject,
            detail: m.snippet,
            person: m.from,
            personEmail: m.fromEmail,
            url: m.url,
            occurredAt: m.receivedAt,
          }),
        });
        if (!res.ok) return null;
        const s: Signal = await res.json();
        return s.id;
      } catch {
        return null;
      }
    },
    [signalFor]
  );

  const makeTaskFromMail = useCallback(
    async (m: MailItem) => {
      setBusyMail((b) => ({ ...b, [m.id]: true }));
      try {
        const signalId = await ensureSignal(m);
        if (!signalId) throw new Error("no signal");
        const res = await fetch(`/api/signals/${signalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            convertTo: { area: "inbox", title: m.subject, dueDate: payload?.today ?? null },
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        flashSaved();
        await load(true);
      } catch {
        setLoadError("Could not turn that email into a task. Nothing was changed.");
      } finally {
        setBusyMail((b) => {
          const n = { ...b };
          delete n[m.id];
          return n;
        });
      }
    },
    [ensureSignal, flashSaved, load, payload]
  );

  const dismissMail = useCallback(
    async (m: MailItem) => {
      setBusyMail((b) => ({ ...b, [m.id]: true }));
      try {
        const signalId = await ensureSignal(m);
        if (!signalId) throw new Error("no signal");
        const res = await fetch(`/api/signals/${signalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "dismissed" }),
        });
        if (!res.ok) throw new Error(String(res.status));
        flashSaved();
        await load(true);
      } catch {
        setLoadError("Could not dismiss that one. It is still on the list.");
      } finally {
        setBusyMail((b) => {
          const n = { ...b };
          delete n[m.id];
          return n;
        });
      }
    },
    [ensureSignal, flashSaved, load]
  );

  /* ── derived view state ──────────────────────────────── */

  const tasks = useMemo(() => localTasks || [], [localTasks]);
  const today = payload?.today ?? ymdInTz();
  const weekEnd = payload?.week.end ?? today;

  const areaMeta = useMemo(() => {
    const m = new Map<string, { name: string; endInMind: string }>();
    (payload?.areas.data || []).forEach((a) => m.set(a.id, { name: a.name, endInMind: a.endInMind }));
    return m;
  }, [payload]);

  const areaName = useCallback(
    (id: string | null) => (id && areaMeta.get(id)?.name) || "Inbox",
    [areaMeta]
  );

  const counts = useCallback(
    (areaId: string) => {
      const list = tasks.filter((t) => t.areaId === areaId);
      const done = list.filter((t) => t.status === "done").length;
      return {
        done,
        total: list.length,
        pct: list.length ? Math.round((done / list.length) * 100) : 0,
      };
    },
    [tasks]
  );

  const inView = useCallback(
    (t: ClientTask) => active === "all" || t.areaId === active,
    [active]
  );

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status === "open" && inView(t)).sort(openComparator),
    [tasks, inView]
  );

  const overdue = useMemo(
    () => openTasks.filter((t) => !!t.dueDate && t.dueDate < today),
    [openTasks, today]
  );
  const dueToday = useMemo(
    () => openTasks.filter((t) => t.dueDate === today),
    [openTasks, today]
  );
  const laterThisWeek = useMemo(
    () => openTasks.filter((t) => !!t.dueDate && t.dueDate > today && t.dueDate <= weekEnd),
    [openTasks, today, weekEnd]
  );
  const planned = useMemo(() => [...overdue, ...dueToday], [overdue, dueToday]);
  const plannedIds = useMemo(() => new Set(planned.map((t) => t.id)), [planned]);

  const restOfList = useMemo(
    () => openTasks.filter((t) => !plannedIds.has(t.id)),
    [openTasks, plannedIds]
  );
  const recentList = useMemo(
    () =>
      restOfList.filter(
        (t) =>
          t.flag !== "none" ||
          !!t.dueDate ||
          Date.now() - new Date(t.createdAt).getTime() < 14 * 86400000
      ),
    [restOfList]
  );
  const olderList = useMemo(
    () => restOfList.filter((t) => !recentList.includes(t)),
    [restOfList, recentList]
  );

  const waitingTasks = useMemo(
    () => tasks.filter((t) => t.status === "waiting" && inView(t)),
    [tasks, inView]
  );
  const doneToday = useMemo(
    () => tasks.filter((t) => t.status === "done" && isToday(t.doneAt) && inView(t)),
    [tasks, inView]
  );
  const flaggedUnscheduled = useMemo(
    () => openTasks.filter((t) => !t.dueDate && t.flag !== "none"),
    [openTasks]
  );

  const cardProps = (t: ClientTask) => ({
    task: t,
    areaName: areaName(t.areaId),
    today,
    thinking: !!thinkingIds[t.id],
    hiddenSteps: !!hiddenSteps[t.id],
    openAction,
    handoffPick,
    handoffOther,
    noteText,
    onToggleDone: toggleDone,
    onAskConrad: askConrad,
    onOpenAction: setOpenAction,
    onHandoffPick: setHandoffPick,
    onHandoffOther: setHandoffOther,
    onNoteText: setNoteText,
    onConfirmHandoff: confirmHandoff,
    onConfirmNote: confirmNote,
    onToggleSteps: (id: string) => setHiddenSteps((m) => ({ ...m, [id]: !m[id] })),
  });

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* ── render ──────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-dash px-4">
      {/* Header */}
      <div className="relative pb-1 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="text-[10.5px] font-bold tracking-[0.14em] text-navysoft">
          CONRAD &middot; CHIEF OF STAFF
        </div>
        <h1 className="mb-0 mt-0.5 font-serif text-[26px] font-bold leading-tight text-navy">
          Command Dashboard
        </h1>
        <div className="text-[13px] text-muted">{todayLabel()}</div>
        <div className="mt-0.5 text-[11.5px] text-muted">
          {refreshing ? (
            <span className="text-navysoft">Checking every source&hellip;</span>
          ) : payload ? (
            <>
              Live as of {ago(payload.generatedAt)}.{" "}
              <button onClick={() => void load()} className="text-navysoft underline">
                Check again
              </button>
            </>
          ) : (
            "Opening…"
          )}
        </div>
        <div
          className={`absolute right-0 top-[calc(env(safe-area-inset-top)+20px)] text-[11px] font-semibold text-grn transition-opacity duration-300 ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        >
          Saved &#10003;
        </div>
        {pending > 0 && !saved && (
          <div className="absolute right-0 top-[calc(env(safe-area-inset-top)+20px)] text-[11px] text-amber">
            {pending} change{pending === 1 ? "" : "s"} waiting to sync
          </div>
        )}
      </div>

      {/* Quick nav */}
      <div className="no-scrollbar sticky top-0 z-10 -mx-4 flex gap-1.5 overflow-x-auto bg-cream px-4 pb-2 pt-2">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => jump(n.id)}
            className="whitespace-nowrap rounded-full bg-chip px-[13px] py-[7px] text-[12.5px] text-navy"
          >
            {n.label}
          </button>
        ))}
      </div>

      {/* World filter */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-3 pt-1">
        <button
          onClick={() => {
            setActive("all");
            setShowDone(false);
          }}
          className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] ${
            active === "all" ? "bg-navy text-white" : "bg-chip text-navy"
          }`}
        >
          All worlds
        </button>
        {(payload?.areas.data || []).map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setActive(a.id);
              setShowDone(false);
            }}
            className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] ${
              active === a.id ? "bg-navy text-white" : "bg-chip text-navy"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      {!loaded && (
        <div className="py-8 text-sm italic text-muted">Pulling every source&hellip;</div>
      )}

      {loaded && loadError && (
        <div className="mb-2 rounded-[11px] border border-redflag/40 bg-[#fdf0ef] p-4 text-sm text-redflag">
          {loadError}{" "}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {payload && (
        <>
          <StatusBar
            fromCache={fromCache}
            generatedAt={payload.generatedAt}
            health={payload.sourceHealth}
            panels={[
              { label: "Task store", panel: payload.tasks },
              { label: "Mail", panel: payload.mail },
              { label: "Calendar", panel: payload.calendar },
              { label: "Daily numbers", panel: payload.numbers },
            ]}
          />

          {/* ── This Week leads ───────────────────────────── */}
          <SectionHeader
            id="week"
            title="This week"
            right={
              <span className="text-[11px] text-muted">
                {payload.week.start} to {payload.week.end}
              </span>
            }
          />
          <PanelState
            panel={payload.tasks}
            emptyText="No tasks recorded in the current window."
          />
          {payload.tasks.status !== "unavailable" && (
            <div className="mb-2 grid grid-cols-3 gap-2">
              {[
                { label: "Overdue", n: overdue.length, cls: overdue.length ? "text-redflag" : "text-muted" },
                { label: "Due today", n: dueToday.length, cls: "text-navy" },
                { label: "Later this week", n: laterThisWeek.length, cls: "text-navy" },
                { label: "Flagged, unscheduled", n: flaggedUnscheduled.length, cls: flaggedUnscheduled.length ? "text-amber" : "text-muted" },
                { label: "With someone else", n: waitingTasks.length, cls: "text-navy" },
                { label: "Done today", n: doneToday.length, cls: "text-grn" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-[11px] border border-line bg-paper px-2.5 py-2"
                >
                  <div className={`text-[20px] font-bold leading-none ${s.cls}`}>{s.n}</div>
                  <div className="mt-1 text-[10.5px] uppercase tracking-[0.04em] text-muted">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {overdue.length > 0 && (
            <>
              <SectionHeader id="overdue" title={`Overdue · ${overdue.length}`} />
              {overdue.map((t) => (
                <TaskCard key={t.id} {...cardProps(t)} />
              ))}
            </>
          )}

          {/* ── Today ──────────────────────────────────── */}
          <SectionHeader
            id="today"
            title="Today's plan"
            right={
              <span className="text-[11px] text-muted">{dueToday.length} picked</span>
            }
          />
          {dueToday.length === 0 ? (
            <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-[13px] italic text-muted">
              Nothing is stamped for today yet. Conrad picks the day in the morning sweep,
              or tap + to add something.
            </div>
          ) : (
            dueToday.map((t) => <TaskCard key={t.id} {...cardProps(t)} />)
          )}

          {/* ── Numbers ────────────────────────────────── */}
          <NumbersStrip panel={payload.numbers} isCurrent={payload.numbers.isCurrent} />

          {/* ── Calendar ───────────────────────────────── */}
          <CalendarPanel panel={payload.calendar} />

          {/* ── Mail ─────────────────────────────────── */}
          <MailPanel
            panel={payload.mail}
            onMakeTask={(m) => void makeTaskFromMail(m)}
            onDismiss={(m) => void dismissMail(m)}
            busyIds={busyMail}
          />

          {/* ── Worlds ─────────────────────────────────── */}
          <AreasPanel
            areas={payload.areas.data}
            counts={counts}
            onPick={(id) => setActive(active === id ? "all" : id)}
          />

          {active !== "all" && areaMeta.get(active)?.endInMind && (
            <div className="mt-2 rounded-[13px] bg-navy px-4 py-[15px] text-white">
              <div className="text-[17px] font-bold">{areaName(active)}</div>
              <div className="mt-0.5 text-[13px] italic text-[#cfdbe1]">
                {areaMeta.get(active)?.endInMind}
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-md bg-white/20">
                <div className="bar-fill" style={{ width: `${counts(active).pct}%` }} />
              </div>
              <div className="mt-2 text-xs text-[#cfdbe1]">
                {counts(active).done} of {counts(active).total} done &middot;{" "}
                {counts(active).pct}% toward the End in Mind
              </div>
            </div>
          )}

          {/* ── Open work ──────────────────────────────── */}
          <SectionHeader
            id="work"
            title={active === "all" ? "Open work" : `Open in ${areaName(active)}`}
            right={
              <span className="text-[11px] text-muted">
                last {payload.tasks.status === "ok" ? "30 days" : ""}
              </span>
            }
          />
          {recentList.length === 0 && olderList.length === 0 ? (
            <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-[13px] italic text-muted">
              Nothing open here. Tap + to capture something.
            </div>
          ) : (
            recentList.map((t) => <TaskCard key={t.id} {...cardProps(t)} />)
          )}

          {olderList.length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => setShowOlder(!showOlder)}
                className="mx-0.5 text-[12.5px] text-navysoft underline"
              >
                {showOlder ? "Hide" : `Show ${olderList.length} older`} open item
                {olderList.length === 1 ? "" : "s"}
              </button>
              {showOlder && (
                <div className="mt-2">
                  {olderList.map((t) => (
                    <TaskCard key={t.id} {...cardProps(t)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Delegated ──────────────────────────────── */}
          {waitingTasks.length > 0 && (
            <>
              <SectionHeader
                id="waiting"
                title={`With someone else · ${waitingTasks.length}`}
              />
              {waitingTasks.map((t) => (
                <WaitingCard
                  key={t.id}
                  task={t}
                  areaName={areaName(t.areaId)}
                  onPullBack={pullBack}
                />
              ))}
            </>
          )}

          {/* ── Done today ─────────────────────────────── */}
          <div className="mx-0.5 mt-4 flex items-center justify-between text-[12.5px] text-muted">
            <span>Done today: {doneToday.length}</span>
            {doneToday.length > 0 && (
              <button onClick={() => setShowDone(!showDone)} className="text-navysoft underline">
                {showDone ? "hide" : "show"}
              </button>
            )}
          </div>
          {showDone &&
            doneToday.map((t) => (
              <div
                key={t.id}
                className="mb-[9px] mt-2 flex items-start gap-3 rounded-[11px] border border-line bg-paper px-3.5 py-[13px] opacity-60"
              >
                <button
                  aria-label="Mark not done"
                  onClick={() => toggleDone(t)}
                  className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-grn bg-grn text-[15px] text-white"
                >
                  &#10003;
                </button>
                <div>
                  <div className="text-[15.5px] leading-[1.3] text-ink line-through">
                    {t.title}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.03em] text-muted">
                    {areaName(t.areaId)}
                  </div>
                </div>
              </div>
            ))}

          <footer className="mt-6 border-t border-line px-0.5 py-3.5 text-[11.5px] leading-relaxed text-muted">
            Every panel above was pulled live when this page opened, and anything that
            could not be pulled says so in its own words. Tap the circle to finish
            something, tap + to capture a thought. The same list Conrad reads and writes.
          </footer>
        </>
      )}

      {/* Capture */}
      <button
        aria-label="Capture a thought"
        onClick={() => {
          setSheetOpen(true);
          setCaptureArea(active === "all" ? "inbox" : active);
        }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+22px)] right-[22px] z-20 h-[60px] w-[60px] rounded-full bg-rust text-[34px] leading-none text-white shadow-[0_5px_16px_rgba(0,0,0,0.3)]"
      >
        +
      </button>

      <div
        onClick={() => setSheetOpen(false)}
        className={`fixed inset-0 z-[25] bg-[rgba(10,20,26,0.35)] transition-opacity duration-200 ${
          sheetOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-dash rounded-t-[22px] bg-white px-[18px] pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[18px] shadow-[0_-8px_26px_rgba(0,0,0,0.25)] transition-transform duration-300 ${
          sheetOpen ? "translate-y-0" : "translate-y-[115%]"
        }`}
      >
        <div className="mb-3 font-serif text-[19px] text-navy">Capture a thought</div>
        <input
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void capture()}
          placeholder="Say it or type it&hellip;"
          autoComplete="off"
          className="w-full rounded-[10px] border border-line bg-paper px-3.5 py-[13px] text-base text-ink outline-none focus:border-navysoft"
        />
        <div className="mb-1.5 mt-3 text-[11.5px] text-muted">Goes to</div>
        <select
          value={captureArea}
          onChange={(e) => setCaptureArea(e.target.value)}
          className="w-full rounded-[10px] border border-line bg-white px-3.5 py-3 text-[15px] text-ink"
        >
          {(payload?.areas.data || []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.id === "inbox" ? " (sort later)" : ""}
            </option>
          ))}
        </select>
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={() => setSheetOpen(false)}
            className="flex-1 rounded-[10px] border border-navy bg-white py-[13px] text-[15px] text-navy"
          >
            Cancel
          </button>
          <button
            onClick={() => void capture()}
            className="flex-1 rounded-[10px] border border-navy bg-navy py-[13px] text-[15px] text-white"
          >
            Add to list
          </button>
        </div>
        <div className="mt-3 text-xs leading-[1.45] text-muted">
          Lands on your list right away. Conrad files it into the right world later.
        </div>
      </div>
    </div>
  );
}
