"use client";

import { useMemo, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import { useLedger, type ClientTask, type Loaded } from "./useLedger";
import TaskCard, { areaNameOf } from "./TaskCard";
import {
  addDays,
  dayLabel,
  daysBetween,
  fromYmd,
  isSameLocalDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  timeLabel,
  ymd,
  ymdToday,
} from "@/lib/dates";

/* ────────────────────────────────────────────────────────────────────
   The home screen of Brad's life. Opened many times a day, and it is the
   same page every time. It answers four questions in order:
     1. What is on me right now
     2. What is coming
     3. What did I get done
     4. Where does each world stand
   Every section is a database read or a cached connector. Nothing on the
   read path calls a model. When a section cannot load it says so; it never
   shows a blank and it never shows something stale as if it were current.
   ──────────────────────────────────────────────────────────────────── */

const LIVE = new Set(["open", "in_progress", "waiting", "blocked"]);

function numBand(pct: number): string {
  if (pct >= 100) return "text-grn";
  if (pct >= 85) return "text-amber";
  return "text-redflag";
}

function H2({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mx-0.5 mb-2 mt-5 flex items-baseline justify-between">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-navysoft">{children}</div>
      {right && <div className="text-[11.5px] text-muted">{right}</div>}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="mx-0.5 mb-1.5 mt-3 text-[12px] font-semibold text-muted">{children}</div>;
}

function Note({ tone = "muted", children }: { tone?: "muted" | "amber" | "red"; children: React.ReactNode }) {
  const cls = tone === "red" ? "text-redflag" : tone === "amber" ? "text-amber" : "italic text-muted";
  return (
    <div className={`rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-[12.5px] ${cls}`}>
      {children}
    </div>
  );
}

function EventRow({ e }: { e: CalendarEvent }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line py-[7px] last:border-b-0">
      <span className="w-[64px] flex-none text-[12px] font-semibold text-navysoft">
        {e.allDay ? "All day" : timeLabel(e.startAt)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[14px] font-semibold text-ink ${e.isCancelled ? "line-through" : ""}`}>
          {e.webLink ? (
            <a href={e.webLink} target="_blank" rel="noopener noreferrer">{e.subject}</a>
          ) : (
            e.subject
          )}
        </span>
        {(e.location || e.organizer) && (
          <span className="block truncate text-[11.5px] text-muted">
            {e.location}
            {e.location && e.organizer && " · "}
            {e.organizer}
          </span>
        )}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const ledger = useLedger();
  const { areas, tasks, loaded, loadError, saved, pending, numbers, calendar, docs, schema, lastRefresh } = ledger;

  const [view, setView] = useState<string>("home"); // 'home' | areaId
  const [showAllOpen, setShowAllOpen] = useState(false);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [showDoneToday, setShowDoneToday] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureArea, setCaptureArea] = useState("inbox");
  const [captureDue, setCaptureDue] = useState<string>("");

  const now = new Date();
  const today = ymdToday();
  const tomorrow = ymd(addDays(now, 1));
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  /* ── derived from the one task list ────────────────────────────── */

  const live = useMemo(() => tasks.filter((t) => LIVE.has(t.status)), [tasks]);
  const candidates = useMemo(() => tasks.filter((t) => t.status === "candidate"), [tasks]);
  const parked = useMemo(() => tasks.filter((t) => t.status === "someday"), [tasks]);
  const doneAll = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const sortLive = (a: ClientTask, b: ClientTask) => {
    const ra = a.flag === "red" ? 0 : 1;
    const rb = b.flag === "red" ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const da = a.dueDate ?? "9999";
    const db = b.dueDate ?? "9999";
    if (da !== db) return da.localeCompare(db);
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  };

  /* 1. On me now: unsure without an answer, red, overdue, due today. One list. */
  const onMeNow = useMemo(() => {
    const pick = live.filter(
      (t) =>
        t.status !== "waiting" &&
        ((t.unsure && !t.conradNote) || t.flag === "red" || (!!t.dueDate && t.dueDate <= today))
    );
    return pick.sort((a, b) => {
      const ua = a.unsure && !a.conradNote ? 0 : 1;
      const ub = b.unsure && !b.conradNote ? 0 : 1;
      if (ua !== ub) return ua - ub;
      return sortLive(a, b);
    });
  }, [live, today]);

  const blocked = useMemo(() => live.filter((t) => t.status === "blocked"), [live]);
  const dueTomorrow = useMemo(() => live.filter((t) => t.dueDate === tomorrow && t.status !== "waiting"), [live, tomorrow]);

  /* 2. Coming: next 14 days, tasks by due date + calendar, grouped by day. */
  const horizon = useMemo(() => {
    const days: { date: Date; key: string; events: CalendarEvent[]; tasks: ClientTask[] }[] = [];
    const evs = calendar && calendar.ok ? calendar.data.events.filter((e) => !e.isCancelled) : [];
    for (let i = 1; i <= 14; i++) {
      const d = addDays(startOfDay(now), i);
      const key = ymd(d);
      days.push({
        date: d,
        key,
        events: evs.filter((e) => isSameLocalDay(e.startAt, d) || (e.allDay && e.startAt.slice(0, 10) === key)),
        tasks: live.filter((t) => t.dueDate === key).sort(sortLive),
      });
    }
    return days.filter((d) => d.events.length || d.tasks.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar, live, today]);

  const waiting = useMemo(
    () =>
      live
        .filter((t) => t.status === "waiting")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [live]
  );

  const laterDue = useMemo(
    () => live.filter((t) => t.dueDate && t.dueDate > ymd(addDays(now, 14)) && t.status !== "waiting").sort(sortLive),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, today]
  );

  /* 3. Done: today, this week, this month. */
  const doneToday = useMemo(() => doneAll.filter((t) => isSameLocalDay(t.doneAt, now)), [doneAll, now]);
  const doneWeek = useMemo(
    () => doneAll.filter((t) => t.doneAt && new Date(t.doneAt) >= weekStart),
    [doneAll, weekStart]
  );
  const doneMonth = useMemo(
    () => doneAll.filter((t) => t.doneAt && new Date(t.doneAt) >= monthStart),
    [doneAll, monthStart]
  );
  const doneWeekByArea = useMemo(() => {
    const m = new Map<string, number>();
    doneWeek.forEach((t) => m.set(t.areaId ?? "inbox", (m.get(t.areaId ?? "inbox") ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [doneWeek]);

  /* 4. Worlds */
  const docFor = (areaId: string) => (docs && docs.ok ? docs.data.find((d) => d.slug === areaId || d.areaId === areaId) : undefined);

  const todayEvents: Loaded<CalendarEvent[]> = useMemo(() => {
    if (!calendar) return null;
    if (!calendar.ok) return calendar;
    return {
      ok: true,
      data: calendar.data.events.filter(
        (e) => !e.isCancelled && (isSameLocalDay(e.startAt, now) || (e.allDay && e.startAt.slice(0, 10) === today))
      ),
    };
  }, [calendar, now, today]);

  const calendarStale = calendar && calendar.ok && (calendar.data.staleMinutes === null || calendar.data.staleMinutes > 90);

  const todayLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const schemaReady = !schema || schema.ready !== false;

  async function doCapture() {
    const title = captureText.trim();
    if (!title) return;
    const areaId = captureArea || "inbox";
    setCaptureText("");
    setCaptureDue("");
    setSheetOpen(false);
    await ledger.capture(title, areaId, captureDue || null);
  }

  /* ── render ───────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-brief px-4">
      {/* Header */}
      <div className="relative pb-2 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="text-[10.5px] font-bold tracking-[0.14em] text-navysoft">CONRAD &middot; CHIEF OF STAFF</div>
        <h1 className="mb-0 mt-0.5 font-serif text-[26px] font-bold leading-tight text-navy">
          {view === "home" ? "Dashboard" : areaNameOf(areas, view)}
        </h1>
        <div className="text-[13px] text-muted">
          {todayLabel}
          {lastRefresh && (
            <span className="text-[11px]"> &middot; refreshed {lastRefresh.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
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
            syncing&hellip;
          </div>
        )}
      </div>

      {/* Nav chips: Home, Done, then each Area */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-3 pt-1.5">
        <button
          onClick={() => setView("home")}
          className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] ${view === "home" ? "bg-navy text-white" : "bg-chip text-navy"}`}
        >
          Home
        </button>
        <a href="/done" className="whitespace-nowrap rounded-full bg-chip px-[13px] py-[7px] text-[13px] text-navy">
          Done
        </a>
        {areas
          .filter((a) => a.id !== "inbox" || live.some((t) => t.areaId === "inbox"))
          .map((a) => (
            <button
              key={a.id}
              onClick={() => setView(a.id)}
              className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] ${view === a.id ? "bg-navy text-white" : "bg-chip text-navy"}`}
            >
              {a.name}
            </button>
          ))}
      </div>

      {!schemaReady && (
        <div className="mb-3 rounded-[11px] border border-amber bg-paper px-[13px] py-[11px] text-[12.5px] text-amber">
          Database migration 004 has not been run. Calendar, numbers, state docs and the new task
          statuses are unavailable until it is. Run <code>supabase/004-dashboard-os.sql</code> once in the Supabase SQL editor.
        </div>
      )}

      {!loaded && <div className="py-8 text-sm italic text-muted">Opening your dashboard&hellip;</div>}
      {loaded && loadError && (
        <div className="rounded-[11px] border border-line bg-paper p-4 text-sm text-redflag">
          {loadError}{" "}
          <button className="underline" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {loaded && !loadError && view === "home" && (
        <>
          {/* ══════════════ 1. WHAT IS ON ME RIGHT NOW ══════════════ */}
          <H2 right={onMeNow.length ? `${onMeNow.length} item${onMeNow.length === 1 ? "" : "s"}` : undefined}>
            On me right now
          </H2>

          {/* Numbers strip */}
          {numbers === null && <Note>Loading numbers&hellip;</Note>}
          {numbers && !numbers.ok && <Note tone="red">Numbers unavailable. {numbers.reason}</Note>}
          {numbers && numbers.ok && (
            <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[10px]">
              <div className="flex items-baseline justify-between text-[11.5px] text-muted">
                <span>
                  La-Z-Boy wrote, {numbers.data.resultsThrough}
                  {!numbers.data.latestRecapLanded && <span className="text-amber"> &middot; newest recap not in yet</span>}
                </span>
                {numbers.data.recapLink && (
                  <a href={numbers.data.recapLink} target="_blank" rel="noopener noreferrer" className="text-navysoft underline">
                    recap
                  </a>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {[
                  { label: "Written", value: `$${Math.round(numbers.data.written).toLocaleString()}`, cls: "text-navy" },
                  { label: "To goal", value: `${numbers.data.toGoalPct.toFixed(1)}%`, cls: numBand(numbers.data.toGoalPct) },
                  { label: "Adj. goal", value: `${numbers.data.toAdjustedGoalPct.toFixed(1)}%`, cls: numBand(numbers.data.toAdjustedGoalPct) },
                  { label: "Last year", value: `${numbers.data.toLastYearPct.toFixed(1)}%`, cls: numBand(numbers.data.toLastYearPct) },
                ].map((n) => (
                  <div key={n.label} className="min-w-[68px] flex-1 rounded-[9px] border border-line bg-white px-2 py-1.5">
                    <div className="text-[9.5px] uppercase tracking-[0.05em] text-muted">{n.label}</div>
                    <div className={`text-[16px] font-bold ${n.cls}`}>{n.value}</div>
                  </div>
                ))}
              </div>
              {!numbers.data.live && (
                <div className="mt-1.5 text-[11px] text-redflag">
                  Not live: this is the last hardcoded figure. Conrad has not posted a daily_numbers row yet.
                </div>
              )}
            </div>
          )}

          {/* Today's calendar (Outlook cache) */}
          <Sub>Today on the calendar</Sub>
          {todayEvents === null && <Note>Loading calendar&hellip;</Note>}
          {todayEvents && !todayEvents.ok && <Note tone="red">Calendar unavailable. {todayEvents.reason}</Note>}
          {todayEvents && todayEvents.ok && (
            <>
              {calendar && calendar.ok && calendar.data.syncedAt === null && (
                <Note tone="amber">Calendar cache is empty. The calendar-sync task has not written anything yet, so this is not a quiet day, it is a missing feed.</Note>
              )}
              {calendar && calendar.ok && calendar.data.syncedAt !== null && calendarStale && (
                <div className="mb-1.5 text-[11.5px] text-amber">
                  Calendar cache is {calendar.data.staleMinutes} minutes old. The sync may have stopped.
                </div>
              )}
              {calendar && calendar.ok && calendar.data.syncedAt !== null && (
                todayEvents.data.length === 0 ? (
                  <Note>Nothing on the calendar today.</Note>
                ) : (
                  <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[5px]">
                    {todayEvents.data.map((e) => <EventRow key={e.id} e={e} />)}
                  </div>
                )
              )}
            </>
          )}

          {/* Needs you */}
          <Sub>Needs you</Sub>
          {onMeNow.length === 0 ? (
            <Note>Nothing is red, overdue, due today or waiting on an answer from you. Clear runway.</Note>
          ) : (
            onMeNow.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} />)
          )}

          {blocked.length > 0 && (
            <>
              <Sub>Blocked ({blocked.length})</Sub>
              {blocked.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} compact />)}
            </>
          )}

          {/* Candidates */}
          {candidates.length > 0 && (
            <>
              <Sub>
                <button onClick={() => setShowCandidates(!showCandidates)} className="underline">
                  {candidates.length} candidate{candidates.length === 1 ? "" : "s"} from email and recordings
                </button>
                <span className="font-normal"> &middot; keep or dismiss</span>
              </Sub>
              {showCandidates && candidates.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} />)}
            </>
          )}

          {/* Tomorrow's shape */}
          <Sub>
            <button onClick={() => setShowTomorrow(!showTomorrow)} className="underline">
              Tomorrow&apos;s shape
            </button>
            <span className="font-normal">
              {" "}&middot; {horizon.find((d) => d.key === tomorrow)?.events.length ?? 0} meeting
              {(horizon.find((d) => d.key === tomorrow)?.events.length ?? 0) === 1 ? "" : "s"}, {dueTomorrow.length} due
            </span>
          </Sub>
          {showTomorrow && (
            <>
              {(horizon.find((d) => d.key === tomorrow)?.events.length ?? 0) > 0 && (
                <div className="mb-2 rounded-[11px] border border-line bg-paper px-[13px] py-[5px]">
                  {horizon.find((d) => d.key === tomorrow)!.events.map((e) => <EventRow key={e.id} e={e} />)}
                </div>
              )}
              {dueTomorrow.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} compact />)}
              {(horizon.find((d) => d.key === tomorrow)?.events.length ?? 0) === 0 && dueTomorrow.length === 0 && (
                <Note>Nothing scheduled or due tomorrow.</Note>
              )}
            </>
          )}

          {/* ══════════════ 2. WHAT IS COMING ══════════════ */}
          <H2 right="next 14 days">What is coming</H2>
          {horizon.length === 0 && <Note>No meetings or due dates in the next two weeks.</Note>}
          {horizon.map((d) => (
            <div key={d.key} className="mb-2">
              <div className="mx-0.5 mb-1 text-[12px] font-semibold text-navy">
                {dayLabel(d.date)}
                <span className="font-normal text-muted"> &middot; {d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </div>
              {d.events.length > 0 && (
                <div className="mb-1.5 rounded-[11px] border border-line bg-paper px-[13px] py-[5px]">
                  {d.events.map((e) => <EventRow key={e.id} e={e} />)}
                </div>
              )}
              {d.tasks.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} compact />)}
            </div>
          ))}

          {waiting.length > 0 && (
            <>
              <Sub>Waiting on other people ({waiting.length})</Sub>
              {waiting.map((t) => (
                <div key={t.id} className="mb-[7px] flex items-baseline justify-between rounded-[11px] border border-line bg-paper px-[13px] py-[9px]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{t.title}</div>
                    <div className="text-[11px] uppercase tracking-[0.03em] text-muted">
                      {areaNameOf(areas, t.areaId)} &middot; with {t.delegatedTo || t.waitingOn || "someone"}
                    </div>
                  </div>
                  <div className={`ml-3 flex-none text-[13px] font-bold ${daysBetween(t.createdAt) > 14 ? "text-redflag" : daysBetween(t.createdAt) > 7 ? "text-amber" : "text-muted"}`}>
                    {daysBetween(t.createdAt)}d
                  </div>
                </div>
              ))}
            </>
          )}

          {laterDue.length > 0 && (
            <>
              <Sub>Further out ({laterDue.length})</Sub>
              {laterDue.slice(0, 8).map((t) => (
                <div key={t.id} className="mb-[7px] flex items-baseline justify-between rounded-[11px] border border-line bg-paper px-[13px] py-[9px]">
                  <div className="min-w-0 flex-1 truncate text-[14px] text-ink">{t.title}</div>
                  <div className="ml-3 flex-none text-[12px] text-muted">
                    {fromYmd(t.dueDate!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ══════════════ 3. WHAT DID I GET DONE ══════════════ */}
          <H2 right={<a href="/done" className="text-navysoft underline">full history</a>}>What I got done</H2>
          <div className="flex gap-2">
            {[
              { label: "Today", n: doneToday.length },
              { label: "This week", n: doneWeek.length },
              { label: "This month", n: doneMonth.length },
            ].map((s) => (
              <div key={s.label} className="flex-1 rounded-[11px] border border-line bg-paper px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.05em] text-muted">{s.label}</div>
                <div className="text-[22px] font-bold text-grn">{s.n}</div>
              </div>
            ))}
          </div>
          {doneWeekByArea.length > 0 && (
            <div className="mt-2 rounded-[11px] border border-line bg-paper px-[13px] py-[8px]">
              {doneWeekByArea.map(([areaId, n]) => (
                <div key={areaId} className="flex items-center gap-2 py-[3px]">
                  <span className="w-[130px] flex-none truncate text-[12px] text-ink">{areaNameOf(areas, areaId)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-md bg-chip">
                    <div className="bar-fill" style={{ width: `${Math.min(100, (n / Math.max(1, doneWeekByArea[0][1])) * 100)}%` }} />
                  </div>
                  <span className="w-6 flex-none text-right text-[12px] text-muted">{n}</span>
                </div>
              ))}
            </div>
          )}
          {doneToday.length > 0 && (
            <>
              <Sub>
                <button onClick={() => setShowDoneToday(!showDoneToday)} className="underline">
                  {showDoneToday ? "Hide" : "Show"} today&apos;s {doneToday.length}
                </button>
              </Sub>
              {showDoneToday && doneToday.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} compact />)}
            </>
          )}

          {/* ══════════════ 4. WHERE EACH WORLD STANDS ══════════════ */}
          <H2 right={`${live.length} open across ${areas.filter((a) => live.some((t) => t.areaId === a.id)).length} areas`}>
            Where each world stands
          </H2>
          {docs && !docs.ok && <div className="mb-2 text-[11.5px] text-redflag">State docs unavailable. {docs.reason}</div>}
          <div className="grid grid-cols-2 gap-2">
            {areas
              .filter((a) => live.some((t) => t.areaId === a.id) || docFor(a.id))
              .map((a) => {
                const open = live.filter((t) => t.areaId === a.id);
                const reds = open.filter((t) => t.flag === "red" || (t.dueDate && t.dueDate < today)).length;
                const wk = doneWeek.filter((t) => t.areaId === a.id).length;
                const doc = docFor(a.id);
                const docAge = doc ? daysBetween(doc.updatedAt) : null;
                return (
                  <button
                    key={a.id}
                    onClick={() => { setView(a.id); window.scrollTo({ top: 0 }); }}
                    className="rounded-[11px] border border-line bg-paper px-3 py-2.5 text-left"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="truncate text-[14px] font-bold text-navy">{a.name}</span>
                      {reds > 0 && <span className="ml-1 flex-none text-[11px] font-bold text-redflag">{reds} red</span>}
                    </div>
                    <div className="mt-1 text-[11.5px] text-muted">
                      {open.length} open &middot; {wk} done this week
                    </div>
                    <div className={`mt-0.5 text-[11px] ${docAge === null ? "text-muted" : docAge > 30 ? "text-amber" : "text-muted"}`}>
                      {doc ? `state ${docAge === 0 ? "today" : `${docAge}d ago`}` : "no state doc"}
                    </div>
                  </button>
                );
              })}
          </div>

          {parked.length > 0 && (
            <div className="mt-3 text-[12px] text-muted">{parked.length} parked for someday. Open an area to see them.</div>
          )}

          {/* Everything open, collapsed */}
          <div className="mx-0.5 mt-5 text-[12.5px] text-muted">
            <button onClick={() => setShowAllOpen(!showAllOpen)} className="text-navysoft underline">
              {showAllOpen ? "Hide" : "Show"} everything open ({live.filter((t) => t.status !== "waiting").length})
            </button>
          </div>
          {showAllOpen &&
            live
              .filter((t) => t.status !== "waiting")
              .sort(sortLive)
              .map((t) => <TaskCard key={t.id} t={t} ledger={ledger} />)}

          <footer className="mt-6 border-t border-line px-0.5 py-3.5 text-[11.5px] text-muted">
            One list, one truth. Tap the circle to finish something, + to capture. Text yourself and Conrad files it.
          </footer>
        </>
      )}

      {/* ══════════════ AREA VIEW ══════════════ */}
      {loaded && !loadError && view !== "home" && (() => {
        const meta = areas.find((a) => a.id === view);
        const open = live.filter((t) => t.areaId === view && t.status !== "waiting").sort(sortLive);
        const areaWaiting = live.filter((t) => t.areaId === view && t.status === "waiting");
        const areaCandidates = candidates.filter((t) => t.areaId === view);
        const areaParked = parked.filter((t) => t.areaId === view);
        const areaDoneWeek = doneWeek.filter((t) => t.areaId === view);
        const doc = docFor(view);
        return (
          <>
            <div className="mb-3 rounded-[13px] bg-navy px-4 py-[15px] text-white">
              <div className="text-[17px] font-bold">{meta?.name || view}</div>
              {meta?.endInMind && <div className="mt-0.5 text-[13px] italic text-[#cfdbe1]">{meta.endInMind}</div>}
              <div className="mt-2 text-xs text-[#cfdbe1]">
                {open.length} open &middot; {areaWaiting.length} waiting &middot; {areaDoneWeek.length} done this week
              </div>
              {doc ? (
                <a href={`/areas/${doc.slug}`} className="mt-2 inline-block rounded-md bg-white/15 px-2.5 py-1 text-[12px] text-white underline">
                  Where this stands (updated {daysBetween(doc.updatedAt) === 0 ? "today" : `${daysBetween(doc.updatedAt)}d ago`})
                </a>
              ) : (
                <div className="mt-2 text-[11.5px] text-[#cfdbe1]">No state document posted for this area yet.</div>
              )}
            </div>

            {areaCandidates.length > 0 && (
              <>
                <Sub>Candidates ({areaCandidates.length})</Sub>
                {areaCandidates.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} showArea={false} />)}
              </>
            )}

            <Sub>Open ({open.length})</Sub>
            {open.length === 0 && <Note>Nothing open here. Tap + to capture something.</Note>}
            {open.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} showArea={false} />)}

            {areaWaiting.length > 0 && (
              <>
                <Sub>Waiting on others ({areaWaiting.length})</Sub>
                {areaWaiting.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} showArea={false} />)}
              </>
            )}

            {areaParked.length > 0 && (
              <>
                <Sub>Parked ({areaParked.length})</Sub>
                {areaParked.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} showArea={false} />)}
              </>
            )}

            {areaDoneWeek.length > 0 && (
              <>
                <Sub>Done this week ({areaDoneWeek.length})</Sub>
                {areaDoneWeek.map((t) => <TaskCard key={t.id} t={t} ledger={ledger} showArea={false} compact />)}
              </>
            )}
          </>
        );
      })()}

      {/* Capture FAB */}
      <button
        aria-label="Capture a thought"
        onClick={() => {
          setSheetOpen(true);
          setCaptureArea(view !== "home" ? view : "inbox");
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
          onKeyDown={(e) => e.key === "Enter" && doCapture()}
          placeholder="Say it or type it&hellip;"
          autoComplete="off"
          className="w-full rounded-[10px] border border-line bg-paper px-3.5 py-[13px] text-base text-ink outline-none focus:border-navysoft"
        />
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <div className="mb-1.5 text-[11.5px] text-muted">Goes to</div>
            <select
              value={captureArea}
              onChange={(e) => setCaptureArea(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-white px-3 py-3 text-[15px] text-ink"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.id === "inbox" ? " (sort later)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[44%]">
            <div className="mb-1.5 text-[11.5px] text-muted">When (optional)</div>
            <select
              value={captureDue}
              onChange={(e) => setCaptureDue(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-white px-3 py-3 text-[15px] text-ink"
            >
              <option value="">No date</option>
              <option value={today}>Today</option>
              <option value={tomorrow}>Tomorrow</option>
              <option value={ymd(addDays(now, 7))}>Next week</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2.5">
          <button onClick={() => setSheetOpen(false)} className="flex-1 rounded-[10px] border border-navy bg-white py-[13px] text-[15px] text-navy">
            Cancel
          </button>
          <button onClick={doCapture} className="flex-1 rounded-[10px] border border-navy bg-navy py-[13px] text-[15px] text-white">
            Add to list
          </button>
        </div>
        <div className="mt-3 text-xs leading-[1.45] text-muted">
          Lands on your list right away. Or text yourself and Conrad files it within two hours.
        </div>
      </div>
    </div>
  );
}
