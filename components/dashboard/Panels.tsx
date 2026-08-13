"use client";

import type { Panel } from "@/lib/panel";
import type { AreaProgress, DailyNumbers, SourceHealth } from "@/lib/types";
import type { CalendarItem, MailItem } from "@/lib/source-types";
import {
  ago,
  mailtoLink,
  money,
  numBand,
  shortDay,
  timeOfDay,
  waitingFor,
} from "@/lib/client-format";

/* ── Section furniture ───────────────────────────────────── */

export function SectionHeader({
  id,
  title,
  right,
}: {
  id: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div id={id} className="anchor mx-0.5 mb-2 mt-4 flex items-baseline justify-between">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-navysoft">
        {title}
      </span>
      {right}
    </div>
  );
}

/**
 * The one component that decides what a panel is allowed to say when it
 * does not have live data. There is no branch here that renders nothing:
 * a broken source is always visible, always named, and always carries the
 * reason. Returning null happens only when the panel genuinely has data.
 */
export function PanelState<T>({ panel, emptyText }: { panel: Panel<T>; emptyText: string }) {
  if (panel.status === "ok") return null;

  if (panel.status === "empty") {
    return (
      <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-[13px] italic text-muted">
        {emptyText}
      </div>
    );
  }

  if (panel.status === "not_configured") {
    return (
      <div className="rounded-[11px] border border-dashed border-line bg-paper px-[13px] py-[11px] text-[12.5px] text-muted">
        <span className="font-semibold text-ink">
          {panel.error || `${panel.source} is not connected.`}
        </span>{" "}
        This section is empty because nothing is being pulled into it, not because
        there is nothing happening.
      </div>
    );
  }

  if (panel.status === "stale") {
    return (
      <div className="rounded-[11px] border border-amber/40 bg-[#fdf7e8] px-[13px] py-[11px] text-[12.5px] text-amber">
        <span className="font-semibold">Showing an older copy</span> from {ago(panel.asOf)}.
        The live pull did not go through{panel.error ? `: ${panel.error}` : "."}
      </div>
    );
  }

  return (
    <div className="rounded-[11px] border border-redflag/40 bg-[#fdf0ef] px-[13px] py-[11px] text-[12.5px] text-redflag">
      <span className="font-semibold">{panel.source} did not answer.</span>{" "}
      {panel.error || "No reason given."} Nothing older is being shown in its place.
    </div>
  );
}

/** A partial failure inside an otherwise working panel still gets said. */
export function PartialNote<T>({ panel }: { panel: Panel<T> }) {
  if (panel.status !== "ok" && panel.status !== "empty") return null;
  if (!panel.error) return null;
  return (
    <div className="mt-1.5 rounded-[9px] border border-amber/40 bg-[#fdf7e8] px-3 py-2 text-[11.5px] text-amber">
      Partly loaded. {panel.error}
    </div>
  );
}

/* ── Connector status strip ──────────────────────────────── */

export function StatusBar({
  panels,
  health,
  generatedAt,
  fromCache,
}: {
  panels: { label: string; panel: Panel<unknown> }[];
  health: SourceHealth[];
  generatedAt: string | null;
  fromCache: boolean;
}) {
  const broken = panels.filter((p) => p.panel.status === "unavailable");
  const partial = panels.filter(
    (p) => (p.panel.status === "ok" || p.panel.status === "empty") && p.panel.error
  );
  const missing = panels.filter((p) => p.panel.status === "not_configured");

  if (fromCache) {
    return (
      <div className="mb-2 rounded-[11px] border border-amber/50 bg-[#fdf7e8] px-[13px] py-[10px] text-[12.5px] text-amber">
        <span className="font-semibold">Offline copy.</span> This is what was on the phone
        as of {ago(generatedAt)}. Nothing here was checked just now.
      </div>
    );
  }

  if (broken.length === 0 && partial.length === 0 && missing.length === 0) return null;

  return (
    <div className="mb-2 rounded-[11px] border border-line bg-paper px-[13px] py-[10px]">
      {broken.map((b) => (
        <div key={b.label} className="text-[12.5px] text-redflag">
          <span className="font-semibold">{b.label} is down.</span> {b.panel.error}
        </div>
      ))}
      {partial.map((b) => (
        <div key={b.label} className="text-[12.5px] text-amber">
          <span className="font-semibold">{b.label} partly loaded.</span> {b.panel.error}
        </div>
      ))}
      {missing.length > 0 && (
        <div className="text-[12px] text-muted">
          Not connected: {missing.map((m) => m.panel.source).join(", ")}.
        </div>
      )}
      {health.length > 0 && (
        <div className="mt-1 text-[11px] text-muted">
          {health
            .filter((h) => h.lastOkAt)
            .map((h) => `${h.source} ok ${ago(h.lastOkAt)}`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

/* ── La-Z-Boy daily numbers ──────────────────────────────── */

export function NumbersStrip({
  panel,
  isCurrent,
}: {
  panel: Panel<DailyNumbers>;
  isCurrent: boolean;
}) {
  const n = panel.data[0];
  return (
    <>
      <SectionHeader id="numbers" title="La-Z-Boy numbers" />
      <PanelState panel={panel} emptyText="No recap recorded yet." />
      {n && (
        <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[12px]">
          <div className="text-[12.5px] leading-[1.5] text-ink">
            {isCurrent ? (
              <>Results through {shortDay(`${n.resultsThrough}T12:00:00`)}.</>
            ) : (
              <>
                <span className="font-semibold text-amber">
                  The newest recap has not landed.
                </span>{" "}
                These are the latest on file, results through{" "}
                {shortDay(`${n.resultsThrough}T12:00:00`)}.
              </>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[
              { label: "Written", value: money(n.written), cls: "text-navy" },
              { label: "To goal", value: `${n.toGoalPct.toFixed(1)}%`, cls: numBand(n.toGoalPct) },
              {
                label: "To adj. goal",
                value: `${n.toAdjustedGoalPct.toFixed(1)}%`,
                cls: numBand(n.toAdjustedGoalPct),
              },
              {
                label: "To last year",
                value: `${n.toLastYearPct.toFixed(1)}%`,
                cls: numBand(n.toLastYearPct),
              },
            ].map((m) => (
              <div
                key={m.label}
                className="min-w-[72px] flex-1 rounded-[9px] border border-line bg-white px-2.5 py-2"
              >
                <div className="text-[10px] uppercase tracking-[0.05em] text-muted">
                  {m.label}
                </div>
                <div className={`mt-0.5 text-[17px] font-bold ${m.cls}`}>{m.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-muted">
            {n.source || "source not recorded"} · recorded {ago(n.recordedAt)}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Calendar ───────────────────────────────────────── */

export function CalendarPanel({ panel }: { panel: Panel<CalendarItem> }) {
  const now = Date.now();
  const upcoming = panel.data.filter((e) => !e.end || new Date(e.end).getTime() >= now);
  const next = upcoming.find((e) => !e.allDay);

  return (
    <>
      <SectionHeader
        id="calendar"
        title="On the calendar"
        right={
          next ? (
            <span className="text-[11px] text-muted">next at {timeOfDay(next.start)}</span>
          ) : undefined
        }
      />
      <PanelState panel={panel} emptyText="Nothing on the calendar in the next day." />
      {upcoming.length > 0 && (
        <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[5px]">
          {upcoming.map((e) => (
            <div
              key={`${e.source}-${e.id}`}
              className="flex items-baseline gap-3 border-b border-line py-[8px] last:border-b-0"
            >
              <span className="w-[64px] flex-none text-[12px] font-semibold text-navysoft">
                {e.allDay ? "All day" : timeOfDay(e.start)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">
                  {e.title}
                </span>
                <span className="block truncate text-[11.5px] text-muted">
                  {[
                    e.location,
                    e.attendeeCount > 1 ? `${e.attendeeCount} people` : "",
                    e.organizer,
                    e.source === "outlook" ? "Outlook" : "Google",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {e.needsPrep && (
                  <span className="mt-0.5 inline-block text-[11px] font-semibold text-amber">
                    Needs prep before this one
                  </span>
                )}
              </span>
              {e.joinUrl && (
                <a
                  href={e.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-none text-[12px] font-semibold text-navysoft underline"
                >
                  Join
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <PartialNote panel={panel} />
    </>
  );
}

/* ── Mail that is waiting on Brad ─────────────────────────── */

export function MailPanel({
  panel,
  onMakeTask,
  onDismiss,
  busyIds,
}: {
  panel: Panel<MailItem>;
  onMakeTask: (m: MailItem) => void;
  onDismiss: (m: MailItem) => void;
  busyIds: Record<string, boolean>;
}) {
  const reasonLabel: Record<MailItem["reason"], string> = {
    flagged: "you flagged it",
    priority: "priority sender",
    waiting: "sitting unanswered",
    keyword: "matches a watch word",
  };

  return (
    <>
      <SectionHeader
        id="mail"
        title="Waiting on you"
        right={
          panel.data.length > 0 ? (
            <span className="text-[11px] text-muted">{panel.data.length} items</span>
          ) : undefined
        }
      />
      <PanelState panel={panel} emptyText="Nothing in the inbox is waiting on you." />
      {panel.data.map((m) => (
        <div
          key={`${m.source}-${m.id}`}
          className={`mb-[9px] rounded-[11px] border border-line bg-paper px-3.5 py-[12px] ${
            busyIds[m.id] ? "opacity-60" : ""
          }`}
        >
          <div className="text-[14.5px] font-semibold leading-snug text-ink">{m.subject}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {m.from} · {m.source === "outlook" ? "Outlook" : "Gmail"} ·{" "}
            {waitingFor(m.ageHours)} · {reasonLabel[m.reason]}
          </div>
          {m.snippet && (
            <div className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted">
              {m.snippet}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {m.url && (
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="text-[12.5px] text-navysoft underline"
              >
                Open
              </a>
            )}
            <a
              href={mailtoLink({
                to: m.fromEmail,
                subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
                body: `${m.from ? `${m.from.split(" ")[0]},` : ""}\n\n\n\n— Brad`,
              })}
              className="text-[12.5px] text-navysoft underline"
            >
              Reply
            </a>
            <button
              onClick={() => onMakeTask(m)}
              className="text-[12.5px] text-navysoft underline"
            >
              Make a task
            </button>
            <button
              onClick={() => onDismiss(m)}
              className="text-[12.5px] text-muted underline"
            >
              Not mine
            </button>
          </div>
        </div>
      ))}
      <PartialNote panel={panel} />
    </>
  );
}

/* ── Areas ─────────────────────────────────────────── */

export function AreasPanel({
  areas,
  counts,
  onPick,
}: {
  areas: AreaProgress[];
  counts: (id: string) => { done: number; total: number; pct: number };
  onPick: (id: string) => void;
}) {
  const live = areas.filter((a) => counts(a.id).total > 0);
  return (
    <>
      <SectionHeader id="worlds" title="Where each world stands" />
      {live.length === 0 ? (
        <div className="rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-[13px] italic text-muted">
          No open work recorded in any world.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {live.map((a) => {
            const c = counts(a.id);
            return (
              <button
                key={a.id}
                onClick={() => onPick(a.id)}
                className="rounded-[11px] border border-line bg-paper px-[13px] py-[11px] text-left"
              >
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-[13.5px] font-bold text-navy">{a.name}</span>
                  <span className="flex-none pl-2 text-[11px] text-muted">
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
      )}
    </>
  );
}
