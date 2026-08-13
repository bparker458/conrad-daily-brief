"use client";

import type { Task } from "@/lib/types";
import { mailtoLink } from "@/lib/client-format";

export type ClientTask = Task & { _pending?: boolean };

export const HANDOFF_PEOPLE = ["Gretchen", "Jessica", "Ross", "Amber", "Chris"];

/**
 * One card renderer for every list on the dashboard: This Week, Today's
 * Plan, and the per-world lists all render the same row, backed by the
 * same task record, writing through the same API. There is deliberately
 * no second way to draw a task — that is how the two faces stay honest
 * with each other.
 */
export default function TaskCard({
  task,
  areaName,
  today,
  thinking,
  hiddenSteps,
  openAction,
  handoffPick,
  handoffOther,
  noteText,
  onToggleDone,
  onAskConrad,
  onOpenAction,
  onHandoffPick,
  onHandoffOther,
  onNoteText,
  onConfirmHandoff,
  onConfirmNote,
  onToggleSteps,
}: {
  task: ClientTask;
  areaName: string;
  today: string;
  thinking: boolean;
  hiddenSteps: boolean;
  openAction: { id: string; kind: "handoff" | "note" } | null;
  handoffPick: string;
  handoffOther: string;
  noteText: string;
  onToggleDone: (t: ClientTask) => void;
  onAskConrad: (t: ClientTask) => void;
  onOpenAction: (v: { id: string; kind: "handoff" | "note" } | null) => void;
  onHandoffPick: (v: string) => void;
  onHandoffOther: (v: string) => void;
  onNoteText: (v: string) => void;
  onConfirmHandoff: (t: ClientTask) => void;
  onConfirmNote: (t: ClientTask) => void;
  onToggleSteps: (id: string) => void;
}) {
  const t = task;
  const red = t.flag === "red";
  const amber = t.flag === "amber";
  const planned = !!t.dueDate && t.dueDate <= today;
  const carried = !!t.dueDate && t.dueDate < today;

  return (
    <div
      className={`mb-[9px] rounded-[11px] border border-line bg-paper px-3.5 py-[13px] ${
        red ? "border-l-4 border-l-redflag" : amber ? "border-l-4 border-l-amber" : ""
      } ${t._pending ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label="Mark done"
          onClick={() => onToggleDone(t)}
          className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-navysoft bg-white text-[15px] text-white"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-semibold leading-[1.3] text-ink">{t.title}</div>
          <div
            className={`mt-1 text-[11px] uppercase tracking-[0.03em] ${
              red ? "font-bold text-redflag" : "text-muted"
            }`}
          >
            {areaName}
            {red && <> &middot; needs you now</>}
            {!red && planned && (carried ? (
              <span className="text-amber"> &middot; carried over from {t.dueDate}</span>
            ) : (
              <> &middot; today</>
            ))}
            {!planned && t.dueDate && <> &middot; due {t.dueDate}</>}
            {t._pending && <span className="text-amber"> &middot; syncing</span>}
          </div>

          {t.sourceRef && (
            <div className="mt-1 text-[11.5px] italic text-muted">From: {t.sourceRef}</div>
          )}

          {t.unsure && (
            <div className="mt-1.5">
              {thinking ? (
                <div className="animate-pulse text-[12.5px] italic text-navysoft">
                  Conrad is thinking&hellip;
                </div>
              ) : t.conradNote ? (
                <div className="mt-1 rounded-[9px] border border-line border-l-[3px] border-l-navysoft bg-white px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-navysoft">
                      Conrad suggests
                    </span>
                    <button
                      onClick={() => onToggleSteps(t.id)}
                      className="text-[11px] text-muted underline"
                    >
                      {hiddenSteps ? "show" : "hide"}
                    </button>
                  </div>
                  {!hiddenSteps && (
                    <div className="mt-1 whitespace-pre-line text-[13px] leading-[1.45] text-ink">
                      {t.conradNote}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[12.5px] text-amber">
                  Flagged for Conrad.{" "}
                  <button onClick={() => onAskConrad(t)} className="underline">
                    Ask Conrad again
                  </button>
                </div>
              )}
            </div>
          )}

          {!t._pending && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {!t.unsure && (
                <button
                  onClick={() => onAskConrad(t)}
                  className="text-[12.5px] text-navysoft underline"
                >
                  I&apos;m not sure
                </button>
              )}
              <button
                onClick={() => {
                  onOpenAction(
                    openAction?.id === t.id && openAction.kind === "handoff"
                      ? null
                      : { id: t.id, kind: "handoff" }
                  );
                  onHandoffPick(HANDOFF_PEOPLE[0]);
                  onHandoffOther("");
                }}
                className="text-[12.5px] text-navysoft underline"
              >
                Hand off
              </button>
              <button
                onClick={() => {
                  onOpenAction(
                    openAction?.id === t.id && openAction.kind === "note"
                      ? null
                      : { id: t.id, kind: "note" }
                  );
                  onNoteText("");
                }}
                className="text-[12.5px] text-navysoft underline"
              >
                Note
              </button>
            </div>
          )}

          {openAction?.id === t.id && openAction.kind === "handoff" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={handoffPick}
                onChange={(e) => onHandoffPick(e.target.value)}
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
                  onChange={(e) => onHandoffOther(e.target.value)}
                  placeholder="Name"
                  className="w-28 rounded-lg border border-line bg-white px-2 py-2 text-sm"
                />
              )}
              <button
                onClick={() => onConfirmHandoff(t)}
                className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white"
              >
                Hand off
              </button>
            </div>
          )}

          {openAction?.id === t.id && openAction.kind === "note" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={noteText}
                onChange={(e) => onNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onConfirmNote(t)}
                placeholder="Add a note&hellip;"
                className="flex-1 rounded-lg border border-line bg-white px-2 py-2 text-sm"
              />
              <button
                onClick={() => onConfirmNote(t)}
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
}

/** Waiting-on-others row, with a nudge that is already written. */
export function WaitingCard({
  task,
  areaName,
  onPullBack,
}: {
  task: ClientTask;
  areaName: string;
  onPullBack: (t: ClientTask) => void;
}) {
  const who = task.delegatedTo || "someone";
  return (
    <div className="mb-[9px] rounded-[11px] border border-line bg-paper px-3.5 py-[13px]">
      <div className="text-[15px] font-semibold text-ink">{task.title}</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.03em] text-muted">
        {areaName} &middot; with {who}
      </div>
      <div className="mt-2 flex gap-4">
        <a
          className="text-[12.5px] text-navysoft underline"
          href={mailtoLink({
            subject: `Nudge: ${task.title}`,
            body: `${who},\n\nQuick nudge on "${task.title}". Where does this stand?\n\n— Brad`,
          })}
        >
          Nudge {who}
        </a>
        <button
          onClick={() => onPullBack(task)}
          className="text-[12.5px] text-navysoft underline"
        >
          Pull back to me
        </button>
      </div>
    </div>
  );
}
