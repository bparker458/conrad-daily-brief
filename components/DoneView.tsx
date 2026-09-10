"use client";

import { useMemo, useState } from "react";
import { useLedger, type ClientTask } from "./useLedger";
import TaskCard, { areaNameOf } from "./TaskCard";
import { addDays, dayLabel, startOfDay, startOfMonth, startOfWeek } from "@/lib/dates";

/**
 * What did I get done. Today, this week, this month, grouped by day and then
 * by Area. It reads done_at, which has always been recorded and never shown
 * past "today"; this is the view that fixes the end-of-day feeling that
 * nothing happened.
 */
type Range = "today" | "week" | "month" | "all";

export default function DoneView() {
  const ledger = useLedger();
  const { areas, tasks, loaded, loadError } = ledger;
  const [range, setRange] = useState<Range>("week");
  const [areaFilter, setAreaFilter] = useState<string>("all");

  const now = new Date();
  const from = useMemo(() => {
    if (range === "today") return startOfDay(now);
    if (range === "week") return startOfWeek(now);
    if (range === "month") return startOfMonth(now);
    return new Date(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const done = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "done" && t.doneAt && new Date(t.doneAt) >= from)
        .filter((t) => areaFilter === "all" || t.areaId === areaFilter)
        .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")),
    [tasks, from, areaFilter]
  );

  const cancelled = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === "cancelled" && (areaFilter === "all" || t.areaId === areaFilter)
      ),
    [tasks, areaFilter]
  );

  const byDay = useMemo(() => {
    const m = new Map<string, ClientTask[]>();
    for (const t of done) {
      const d = startOfDay(new Date(t.doneAt!));
      const key = d.toISOString();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [done]);

  const byArea = useMemo(() => {
    const m = new Map<string, number>();
    done.forEach((t) => m.set(t.areaId ?? "inbox", (m.get(t.areaId ?? "inbox") ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [done]);

  /* A simple streak: consecutive days back from today with at least one done. */
  const streak = useMemo(() => {
    const days = new Set(
      tasks.filter((t) => t.status === "done" && t.doneAt).map((t) => startOfDay(new Date(t.doneAt!)).getTime())
    );
    let n = 0;
    let d = startOfDay(now);
    if (!days.has(d.getTime())) d = addDays(d, -1); // today may still be in progress
    while (days.has(d.getTime())) {
      n++;
      d = addDays(d, -1);
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const rangeLabel = { today: "today", week: "this week", month: "this month", all: "all time" }[range];

  return (
    <div className="mx-auto max-w-brief px-4">
      <div className="pb-2 pt-[calc(env(safe-area-inset-top)+18px)]">
        <div className="text-[10.5px] font-bold tracking-[0.14em] text-navysoft">CONRAD &middot; CHIEF OF STAFF</div>
        <h1 className="mb-0 mt-0.5 font-serif text-[26px] font-bold leading-tight text-navy">Done</h1>
        <div className="text-[13px] text-muted">
          <a href="/" className="text-navysoft underline">Dashboard</a>
          {streak > 0 && <> &middot; {streak}-day streak</>}
        </div>
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-2 pt-1.5">
        {(["today", "week", "month", "all"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] ${range === r ? "bg-navy text-white" : "bg-chip text-navy"}`}
          >
            {r === "today" ? "Today" : r === "week" ? "This week" : r === "month" ? "This month" : "All"}
          </button>
        ))}
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-3">
        <button
          onClick={() => setAreaFilter("all")}
          className={`whitespace-nowrap rounded-full px-[11px] py-[5px] text-[12px] ${areaFilter === "all" ? "bg-navysoft text-white" : "bg-white text-navy"}`}
        >
          All areas
        </button>
        {areas
          .filter((a) => tasks.some((t) => t.status === "done" && t.areaId === a.id))
          .map((a) => (
            <button
              key={a.id}
              onClick={() => setAreaFilter(a.id)}
              className={`whitespace-nowrap rounded-full px-[11px] py-[5px] text-[12px] ${areaFilter === a.id ? "bg-navysoft text-white" : "bg-white text-navy"}`}
            >
              {a.name}
            </button>
          ))}
      </div>

      {!loaded && <div className="py-8 text-sm italic text-muted">Loading&hellip;</div>}
      {loaded && loadError && <div className="rounded-[11px] border border-line bg-paper p-4 text-sm text-redflag">{loadError}</div>}

      {loaded && !loadError && (
        <>
          <div className="rounded-[13px] bg-navy px-4 py-[15px] text-white">
            <div className="text-[30px] font-bold leading-none">{done.length}</div>
            <div className="mt-1 text-[13px] text-[#cfdbe1]">finished {rangeLabel}</div>
            {byArea.length > 0 && (
              <div className="mt-3 space-y-1">
                {byArea.map(([areaId, n]) => (
                  <div key={areaId} className="flex items-center gap-2">
                    <span className="w-[130px] flex-none truncate text-[12px]">{areaNameOf(areas, areaId)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-md bg-white/20">
                      <div className="bar-fill" style={{ width: `${(n / byArea[0][1]) * 100}%` }} />
                    </div>
                    <span className="w-6 flex-none text-right text-[12px]">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {byDay.length === 0 && (
            <div className="mt-4 rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-[12.5px] italic text-muted">
              Nothing marked done {rangeLabel}. Tapping the circle on the dashboard is what records it.
            </div>
          )}

          {byDay.map(([key, list]) => {
            const d = new Date(key);
            return (
              <div key={key} className="mt-4">
                <div className="mx-0.5 mb-1.5 flex items-baseline justify-between">
                  <span className="text-[13px] font-bold text-navy">{dayLabel(d)}</span>
                  <span className="text-[11.5px] text-muted">
                    {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} &middot; {list.length}
                  </span>
                </div>
                {list.map((t: ClientTask) => <TaskCard key={t.id} t={t} ledger={ledger} compact />)}
              </div>
            );
          })}

          {cancelled.length > 0 && range === "all" && (
            <div className="mt-6">
              <div className="mx-0.5 mb-1.5 text-[12px] font-semibold text-muted">Decided not to do ({cancelled.length})</div>
              {cancelled.map((t) => (
                <div key={t.id} className="mb-[7px] rounded-[11px] border border-line bg-paper px-[13px] py-[9px] text-[13px] text-muted line-through">
                  {t.title.replace(/^CANDIDATE:\s*/i, "")}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
