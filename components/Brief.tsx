"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AreaProgress, Task } from "@/lib/types";

/* ────────────────────────────────────────────────────────────────────
   The phone face. Renders ONLY from the same task rows the checkboxes
   write to (Prime Directive). All reads and writes go through /api/*.
   Optimistic UI for feel; "Saved ✓" fires only on a confirmed server
   write; failed writes queue in localStorage and retry.
   ──────────────────────────────────────────────────────────────────── */

type ClientTask = Task & { _pending?: boolean };

interface QueueItem {
  kind: "create" | "patch";
  url: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  tempId?: string;
}

const QUEUE_KEY = "cb-write-queue-v1";
const HANDOFF_PEOPLE = ["Gretchen", "Jessica", "Ross", "Amber", "Chris"];

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
    /* storage full or blocked — queue still lives in memory */
  }
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function shortDate(): string {
  return new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Brief() {
  const [areas, setAreas] = useState<AreaProgress[]>([]);
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [active, setActive] = useState<string>("all"); // 'all' | areaId
  const [showDone, setShowDone] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureArea, setCaptureArea] = useState("inbox");
  const [openAction, setOpenAction] = useState<{ id: string; kind: "handoff" | "note" } | null>(null);
  const [handoffPick, setHandoffPick] = useState(HANDOFF_PEOPLE[0]);
  const [handoffOther, setHandoffOther] = useState("");
  const [noteText, setNoteText] = useState("");

  const queueRef = useRef<QueueItem[]>([]);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);

  const flashSaved = useCallback(() => {
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1100);
  }, []);

  /* ── data loading ─────────────────────────────────────────────── */

  const fetchAll = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    queueRef.current = loadQueue();
    setPending(queueRef.current.length);
    fetchAll()
      .then(() => setLoaded(true))
      .catch(() => {
        setLoaded(true);
        setLoadError("Couldn't reach the list. Showing nothing rather than something stale — pull to retry.");
      });
  }, [fetchAll]);

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
      // Queue drained — reconcile with server truth.
      fetchAll().catch(() => undefined);
    } finally {
      flushing.current = false;
    }
  }, [fetchAll, flashSaved]);

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

  /* ── mutations ────────────────────────────────────────────────── */

  function toggleDone(t: ClientTask) {
    if (t._pending) return;
    const makingDone = t.status !== "done";
    setTasks((ts) =>
      ts.map((x) =>
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
  }

  function markUnsure(t: ClientTask) {
    if (t._pending || t.unsure) return;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, unsure: true } : x)));
    void sendPatch(t.id, { unsure: true });
  }

  function confirmHandoff(t: ClientTask) {
    const name = handoffPick === "__other__" ? handoffOther.trim() : handoffPick;
    if (!name) return;
    setTasks((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, delegatedTo: name, status: "waiting" } : x))
    );
    setOpenAction(null);
    setHandoffOther("");
    void sendPatch(t.id, { delegatedTo: name });
  }

  function pullBack(t: ClientTask) {
    setTasks((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, delegatedTo: null, status: "open" } : x))
    );
    void sendPatch(t.id, { status: "open", delegatedTo: null });
  }

  function confirmNote(t: ClientTask) {
    const text = noteText.trim();
    if (!text) return;
    const dated = `[${shortDate()}] ${text}`;
    const newNote = t.note ? `${t.note}\n${dated}` : dated;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, note: newNote } : x)));
    setNoteText("");
    setOpenAction(null);
    void sendPatch(t.id, { note: newNote });
  }

  async function capture() {
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
      createdAt: new Date().toISOString(),
      doneAt: null,
      sortOrder: 0,
      _pending: true,
    };
    setTasks((ts) => [...ts, temp]);
    setCaptureText("");
    setSheetOpen(false);
    setActive(areaId);
    const body = { area: areaId, title, source: "phone" };
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
  }

  /* ── derived view state (all from the one task list) ──────────── */

  const areaMeta = useMemo(() => {
    const m = new Map<string, AreaProgress>();
    areas.forEach((a) => m.set(a.id, a));
    return m;
  }, [areas]);

  const counts = useCallback(
    (areaId: string) => {
      const list = tasks.filter((t) => t.areaId === areaId);
      const done = list.filter((t) => t.status === "done").length;
      return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
    },
    [tasks]
  );

  const inView = useCallback(
    (t: ClientTask) => active === "all" || t.areaId === active,
    [active]
  );

  const openTasks = useMemo(() => {
    const list = tasks.filter((t) => t.status === "open" && inView(t));
    return list.sort((a, b) => {
      const ra = a.flag === "red" ? 0 : 1;
      const rb = b.flag === "red" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [tasks, inView]);

  const waitingTasks = useMemo(
    () => tasks.filter((t) => t.status === "waiting" && inView(t)),
    [tasks, inView]
  );

  const doneToday = useMemo(
    () => tasks.filter((t) => t.status === "done" && isToday(t.doneAt) && inView(t)),
    [tasks, inView]
  );

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const areaName = (id: string | null) =>
    (id && areaMeta.get(id)?.name) || "Inbox";

  /* ── render ───────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-brief px-4">
      {/* Header */}
      <div className="relative pb-2 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="text-[10.5px] font-bold tracking-[0.14em] text-navysoft">
          CONRAD &middot; CHIEF OF STAFF
        </div>
        <h1 className="mb-0 mt-0.5 font-serif text-[26px] font-bold leading-tight text-navy">
          Daily Brief
        </h1>
        <div className="text-[13px] text-muted">{todayLabel}</div>
        <div
          className={`absolute right-0 top-[calc(env(safe-area-inset-top)+20px)] text-[11px] font-semibold text-grn transition-opacity duration-300 ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        >
          Saved &#10003;
        </div>
        {pending > 0 && !saved && (
          <div className="absolute right-0 top-[calc(env(safe-area-inset-top)+20px)] text-[11px] text-amber">
            syncing&hellip;
          </div>
        )}
      </div>

      {/* Area chips */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-3 pt-1.5">
        <button
          onClick={() => {
            setActive("all");
            setShowDone(false);
          }}
          className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] ${
            active === "all" ? "bg-navy text-white" : "bg-chip text-navy"
          }`}
        >
          All
        </button>
        {areas.map((a) => (
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

      {!loaded && <div className="py-8 text-sm italic text-muted">Opening your brief&hellip;</div>}
      {loaded && loadError && (
        <div className="rounded-[11px] border border-line bg-paper p-4 text-sm text-redflag">
          {loadError}{" "}
          <button className="underline" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      {loaded && !loadError && (
        <>
          {/* Progress */}
          {active === "all" ? (
            <div>
              <div className="mx-0.5 mb-2 mt-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-navysoft">
                Where each world stands
              </div>
              {areas
                .filter((a) => counts(a.id).total > 0)
                .map((a) => {
                  const c = counts(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => setActive(a.id)}
                      className="mb-2 block w-full rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-left"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-[14.5px] font-bold text-navy">{a.name}</span>
                        <span className="text-xs text-muted">
                          {c.done}/{c.total}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-md bg-chip">
                        <div className="bar-fill" style={{ width: `${c.pct}%` }} />
                      </div>
                    </button>
                  );
                })}
            </div>
          ) : (
            (() => {
              const meta = areaMeta.get(active);
              const c = counts(active);
              return (
                <div className="mb-3 rounded-[13px] bg-navy px-4 py-[15px] text-white">
                  <div className="text-[17px] font-bold">{meta?.name || active}</div>
                  {meta?.endInMind && (
                    <div className="mt-0.5 text-[13px] italic text-[#cfdbe1]">{meta.endInMind}</div>
                  )}
                  <div className="mt-2 h-2.5 overflow-hidden rounded-md bg-white/20">
                    <div className="bar-fill" style={{ width: `${c.pct}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-[#cfdbe1]">
                    {c.done} of {c.total} done &middot; {c.pct}% toward the End in Mind
                  </div>
                </div>
              );
            })()
          )}

          {/* Open tasks */}
          <div>
            {openTasks.length === 0 && (
              <div className="px-0.5 py-3 text-sm italic text-muted">
                Nothing open here. Tap + to capture something.
              </div>
            )}
            {openTasks.map((t) => {
              const red = t.flag === "red";
              return (
                <div
                  key={t.id}
                  className={`mb-[9px] rounded-[11px] border border-line bg-paper px-3.5 py-[13px] ${
                    red ? "border-l-4 border-l-redflag" : ""
                  } ${t._pending ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      aria-label="Mark done"
                      onClick={() => toggleDone(t)}
                      className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-navysoft bg-white text-[15px] text-white"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15.5px] font-semibold leading-[1.3] text-ink">
                        {t.title}
                      </div>
                      <div
                        className={`mt-1 text-[11px] uppercase tracking-[0.03em] ${
                          red ? "font-bold text-redflag" : "text-muted"
                        }`}
                      >
                        {areaName(t.areaId)}
                        {red && <> &middot; needs you now</>}
                        {t._pending && <span className="text-amber"> &middot; syncing</span>}
                      </div>

                      {t.unsure && (
                        <div className="mt-1.5 text-[12.5px] text-amber">
                          {t.conradNote ? (
                            <>Conrad: {t.conradNote}</>
                          ) : (
                            <>Flagged for Conrad.</>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {!t._pending && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          {!t.unsure && (
                            <button
                              onClick={() => markUnsure(t)}
                              className="text-[12.5px] text-navysoft underline"
                            >
                              I&apos;m not sure
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setOpenAction(
                                openAction?.id === t.id && openAction.kind === "handoff"
                                  ? null
                                  : { id: t.id, kind: "handoff" }
                              );
                              setHandoffPick(HANDOFF_PEOPLE[0]);
                              setHandoffOther("");
                            }}
                            className="text-[12.5px] text-navysoft underline"
                          >
                            Hand off
                          </button>
                          <button
                            onClick={() => {
                              setOpenAction(
                                openAction?.id === t.id && openAction.kind === "note"
                                  ? null
                                  : { id: t.id, kind: "note" }
                              );
                              setNoteText("");
                            }}
                            className="text-[12.5px] text-navysoft underline"
                          >
                            Note
                          </button>
                        </div>
                      )}

                      {/* Inline hand-off */}
                      {openAction?.id === t.id && openAction.kind === "handoff" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            value={handoffPick}
                            onChange={(e) => setHandoffPick(e.target.value)}
                            className="rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
                          >
                            {HANDOFF_PEOPLE.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                            <option value="__other__">Someone else&hellip;</option>
                          </select>
                          {handoffPick === "__other__" && (
                            <input
                              value={handoffOther}
                              onChange={(e) => setHandoffOther(e.target.value)}
                              placeholder="Name"
                              className="w-28 rounded-lg border border-line bg-white px-2 py-2 text-sm"
                            />
                          )}
                          <button
                            onClick={() => confirmHandoff(t)}
                            className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white"
                          >
                            Hand off
                          </button>
                        </div>
                      )}

                      {/* Inline note */}
                      {openAction?.id === t.id && openAction.kind === "note" && (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && confirmNote(t)}
                            placeholder="Add a note&hellip;"
                            className="flex-1 rounded-lg border border-line bg-white px-2 py-2 text-sm"
                          />
                          <button
                            onClick={() => confirmNote(t)}
                            className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white"
                          >
                            Save
                          </button>
                        </div>
                      )}

                      {t.note && (
                        <div className="mt-1.5 whitespace-pre-line text-[12px] leading-snug text-muted">
                          {t.note}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Waiting on others */}
          {waitingTasks.length > 0 && (
            <div className="mt-4">
              <div className="mx-0.5 mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-navysoft">
                Waiting on others
              </div>
              {waitingTasks.map((t) => (
                <div
                  key={t.id}
                  className="mb-[9px] rounded-[11px] border border-line bg-paper px-3.5 py-[13px]"
                >
                  <div className="text-[15px] font-semibold text-ink">{t.title}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.03em] text-muted">
                    {areaName(t.areaId)} &middot; with {t.delegatedTo || "someone"}
                  </div>
                  <div className="mt-2 flex gap-4">
                    <a
                      className="text-[12.5px] text-navysoft underline"
                      href={`mailto:?subject=${encodeURIComponent(
                        `Nudge: ${t.title}`
                      )}&body=${encodeURIComponent(
                        `Quick nudge on "${t.title}" — any update?\n\n(from Brad's Daily Brief)`
                      )}`}
                    >
                      Nudge {t.delegatedTo || ""}
                    </a>
                    <button
                      onClick={() => pullBack(t)}
                      className="text-[12.5px] text-navysoft underline"
                    >
                      Pull back to me
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Done today */}
          <div className="mx-0.5 mt-2.5 flex items-center justify-between text-[12.5px] text-muted">
            <span>Done today: {doneToday.length}</span>
            {doneToday.length > 0 && (
              <button
                onClick={() => setShowDone(!showDone)}
                className="text-navysoft underline"
              >
                {showDone ? "hide" : "show"}
              </button>
            )}
          </div>
          {showDone &&
            doneToday.map((t) => (
              <div
                key={t.id}
                className="mb-[9px] mt-2 flex items-start gap-3 rounded-[11px] border border-line bg-paper px-3.5 py-[13px] opacity-50"
              >
                <button
                  aria-label="Mark not done"
                  onClick={() => toggleDone(t)}
                  className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-grn bg-grn text-[15px] text-white"
                >
                  &#10003;
                </button>
                <div>
                  <div className="text-[15.5px] font-normal leading-[1.3] text-ink line-through">
                    {t.title}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.03em] text-muted">
                    {areaName(t.areaId)}
                  </div>
                </div>
              </div>
            ))}

          <footer className="mt-6 border-t border-line px-0.5 py-3.5 text-[11.5px] text-muted">
            Conrad holds all your worlds in one place. Tap the circle to finish
            something, tap + to capture a thought. Synced with Conrad.
          </footer>
        </>
      )}

      {/* Capture FAB */}
      <button
        aria-label="Capture a thought"
        onClick={() => {
          setSheetOpen(true);
          setCaptureArea("inbox");
        }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+22px)] right-[22px] z-20 h-[60px] w-[60px] rounded-full bg-rust text-[34px] leading-none text-white shadow-[0_5px_16px_rgba(0,0,0,0.3)]"
      >
        +
      </button>

      {/* Scrim + bottom sheet */}
      <div
        onClick={() => setSheetOpen(false)}
        className={`fixed inset-0 z-[25] bg-[rgba(10,20,26,0.35)] transition-opacity duration-200 ${
          sheetOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-brief rounded-t-[22px] bg-white px-[18px] pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[18px] shadow-[0_-8px_26px_rgba(0,0,0,0.25)] transition-transform duration-300 ${
          sheetOpen ? "translate-y-0" : "translate-y-[115%]"
        }`}
      >
        <div className="mb-3 font-serif text-[19px] text-navy">Capture a thought</div>
        <input
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && capture()}
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
          {areas.map((a) => (
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
            onClick={capture}
            className="flex-1 rounded-[10px] border border-navy bg-navy py-[13px] text-[15px] text-white"
          >
            Add to list
          </button>
        </div>
        <div className="mt-3 text-xs leading-[1.45] text-muted">
          Lands on your list right away. Conrad files it into the right area later.
        </div>
      </div>
    </div>
  );
}
