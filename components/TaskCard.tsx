"use client";

import { useState } from "react";
import type { AreaProgress } from "@/lib/types";
import type { ClientTask, Ledger } from "./useLedger";
import { daysBetween, fromYmd, ymdToday, addDays, ymd } from "@/lib/dates";

const HANDOFF_PEOPLE = ["Gretchen", "Jessica", "Ross", "Amber", "Chris", "Jerel", "Marshall"];

const SOURCE_LABEL: Record<string, string> = {
  phone: "phone",
  text: "your text",
  plaud: "recording",
  email: "email",
  conrad: "Conrad",
  voice: "voice",
  seed: "seed",
  manual: "manual",
};

export function areaNameOf(areas: AreaProgress[], id: string | null): string {
  return (id && areas.find((a) => a.id === id)?.name) || "Inbox";
}

/**
 * One card renderer for every live task, everywhere. Same rows, same
 * actions, one truth. Candidates get a Keep / Not real pair instead of the
 * done circle, because a candidate is a suggestion, not a commitment.
 */
export default function TaskCard({
  t,
  ledger,
  showArea = true,
  compact = false,
}: {
  t: ClientTask;
  ledger: Ledger;
  showArea?: boolean;
  compact?: boolean;
}) {
  const { areas, toggleDone, setStatus, handoff, pullBack, addNote, setDue, moveArea, askConrad } = ledger;
  const [action, setAction] = useState<null | "handoff" | "note" | "due" | "move" | "more">(null);
  const [handoffPick, setHandoffPick] = useState(HANDOFF_PEOPLE[0]);
  const [handoffOther, setHandoffOther] = useState("");
  const [noteText, setNoteText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [hideSteps, setHideSteps] = useState(false);

  const red = t.flag === "red";
  const today = ymdToday();
  const overdue = !!t.dueDate && t.dueDate < today && t.status !== "done";
  const dueToday = t.dueDate === today;
  const isCandidate = t.status === "candidate";
  const isWaiting = t.status === "waiting";
  const isDone = t.status === "done";
  const age = daysBetween(t.createdAt);

  const dueLabel = t.dueDate
    ? overdue
      ? `${daysBetween(fromYmd(t.dueDate).toISOString())}d overdue`
      : dueToday
      ? "due today"
      : `due ${fromYmd(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : null;

  const confirmHandoff = () => {
    const name = handoffPick === "__other__" ? handoffOther.trim() : handoffPick;
    if (!name) return;
    handoff(t, name);
    setAction(null);
    setHandoffOther("");
  };

  const confirmNote = () => {
    const text = noteText.trim();
    if (!text) return;
    addNote(t, text);
    setNoteText("");
    setAction(null);
  };

  const link = "text-[12.5px] text-navysoft underline";

  return (
    <div
      className={`mb-[9px] rounded-[11px] border border-line bg-paper px-3.5 py-[13px] ${
        red ? "border-l-4 border-l-redflag" : isCandidate ? "border-dashed" : ""
      } ${t._pending ? "opacity-70" : ""} ${isDone ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        {isCandidate ? (
          <span className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 border-dashed border-amber text-[13px] font-bold text-amber">
            ?
          </span>
        ) : (
          <button
            aria-label={isDone ? "Mark not done" : "Mark done"}
            onClick={() => toggleDone(t)}
            className={`mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border-2 text-[15px] text-white ${
              isDone ? "border-grn bg-grn" : "border-navysoft bg-white"
            }`}
          >
            {isDone ? "✓" : ""}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div
            className={`text-[15.5px] font-semibold leading-[1.3] text-ink ${isDone ? "line-through font-normal" : ""}`}
          >
            {t.title.replace(/^CANDIDATE:\s*/i, "")}
          </div>
          <div
            className={`mt-1 text-[11px] uppercase tracking-[0.03em] ${
              red ? "font-bold text-redflag" : "text-muted"
            }`}
          >
            {showArea && <>{areaNameOf(areas, t.areaId)}</>}
            {red && <> &middot; needs you now</>}
            {isCandidate && <span className="text-amber"> &middot; from {SOURCE_LABEL[t.source] ?? t.source}, confirm?</span>}
            {t.status === "in_progress" && <> &middot; started</>}
            {t.status === "blocked" && <span className="text-amber"> &middot; blocked</span>}
            {t.status === "someday" && <> &middot; parked</>}
            {isWaiting && <> &middot; with {t.delegatedTo || t.waitingOn || "someone"} &middot; {age}d</>}
            {dueLabel && !isDone && (
              <span className={overdue ? " text-redflag" : dueToday ? " text-navysoft" : ""}> &middot; {dueLabel}</span>
            )}
            {t._pending && <span className="text-amber"> &middot; syncing</span>}
          </div>

          {t.unsure && !isDone && (
            <div className="mt-1.5">
              {thinking ? (
                <div className="animate-pulse text-[12.5px] italic text-navysoft">Conrad is thinking&hellip;</div>
              ) : t.conradNote ? (
                <div className="mt-1 rounded-[9px] border border-line border-l-[3px] border-l-navysoft bg-white px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-navysoft">Conrad suggests</span>
                    <button onClick={() => setHideSteps(!hideSteps)} className="text-[11px] text-muted underline">
                      {hideSteps ? "show" : "hide"}
                    </button>
                  </div>
                  {!hideSteps && (
                    <div className="mt-1 whitespace-pre-line text-[13px] leading-[1.45] text-ink">{t.conradNote}</div>
                  )}
                </div>
              ) : (
                <div className="text-[12.5px] text-amber">
                  Flagged for Conrad.{" "}
                  <button onClick={() => void askConrad(t, setThinking)} className="underline">
                    Ask Conrad again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {!t._pending && !isDone && !compact && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {isCandidate ? (
                <>
                  <button onClick={() => setStatus(t, "open")} className="rounded-md bg-navy px-2.5 py-1 text-[12.5px] font-semibold text-white">
                    Keep
                  </button>
                  <button onClick={() => setStatus(t, "cancelled")} className={link}>
                    Not real
                  </button>
                </>
              ) : isWaiting ? (
                <>
                  <a
                    className={link}
                    href={`mailto:?subject=${encodeURIComponent(`Nudge: ${t.title}`)}&body=${encodeURIComponent(
                      `Quick nudge on "${t.title}". Any update?\n\nBrad`
                    )}`}
                  >
                    Nudge {t.delegatedTo || ""}
                  </a>
                  <button onClick={() => pullBack(t)} className={link}>
                    Pull back to me
                  </button>
                </>
              ) : (
                <>
                  {!t.unsure && (
                    <button onClick={() => void askConrad(t, setThinking)} className={link}>
                      I&apos;m not sure
                    </button>
                  )}
                  <button onClick={() => setAction(action === "handoff" ? null : "handoff")} className={link}>
                    Hand off
                  </button>
                  <button onClick={() => setAction(action === "due" ? null : "due")} className={link}>
                    When
                  </button>
                  <button onClick={() => setAction(action === "note" ? null : "note")} className={link}>
                    Note
                  </button>
                  <button onClick={() => setAction(action === "more" ? null : "more")} className={link}>
                    More
                  </button>
                </>
              )}
            </div>
          )}

          {action === "more" && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {t.status !== "in_progress" && (
                <button onClick={() => { setStatus(t, "in_progress"); setAction(null); }} className={link}>
                  Started it
                </button>
              )}
              {t.status !== "blocked" && (
                <button onClick={() => { setStatus(t, "blocked"); setAction(null); }} className={link}>
                  Blocked
                </button>
              )}
              {t.status !== "someday" && (
                <button onClick={() => { setStatus(t, "someday"); setAction(null); }} className={link}>
                  Park it
                </button>
              )}
              {(t.status === "blocked" || t.status === "someday" || t.status === "in_progress") && (
                <button onClick={() => { setStatus(t, "open"); setAction(null); }} className={link}>
                  Back to open
                </button>
              )}
              <button onClick={() => setAction("move")} className={link}>
                Move to area
              </button>
              <button onClick={() => { setStatus(t, "cancelled"); setAction(null); }} className="text-[12.5px] text-redflag underline">
                Will not do
              </button>
            </div>
          )}

          {action === "move" && (
            <div className="mt-2 flex items-center gap-2">
              <select
                defaultValue={t.areaId ?? "inbox"}
                onChange={(e) => { moveArea(t, e.target.value); setAction(null); }}
                className="rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {action === "due" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => { setDue(t, today); setAction(null); }} className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">Today</button>
              <button onClick={() => { setDue(t, ymd(addDays(new Date(), 1))); setAction(null); }} className="rounded-lg border border-navy bg-white px-3 py-2 text-sm text-navy">Tomorrow</button>
              <button onClick={() => { setDue(t, ymd(addDays(new Date(), 7))); setAction(null); }} className="rounded-lg border border-navy bg-white px-3 py-2 text-sm text-navy">Next week</button>
              <input
                type="date"
                defaultValue={t.dueDate ?? ""}
                onChange={(e) => { if (e.target.value) { setDue(t, e.target.value); setAction(null); } }}
                className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
              />
              {t.dueDate && (
                <button onClick={() => { setDue(t, null); setAction(null); }} className={link}>Clear</button>
              )}
            </div>
          )}

          {action === "handoff" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={handoffPick}
                onChange={(e) => setHandoffPick(e.target.value)}
                className="rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink"
              >
                {HANDOFF_PEOPLE.map((p) => (
                  <option key={p} value={p}>{p}</option>
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
              <button onClick={confirmHandoff} className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">
                Hand off
              </button>
            </div>
          )}

          {action === "note" && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmNote()}
                placeholder="Add a note&hellip;"
                className="flex-1 rounded-lg border border-line bg-white px-2 py-2 text-sm"
              />
              <button onClick={confirmNote} className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          )}

          {t.note && !compact && (
            <div className="mt-1.5 whitespace-pre-line text-[12px] leading-snug text-muted">{t.note}</div>
          )}
          {t.sourceLink && !compact && (
            <a href={t.sourceLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11.5px] text-navysoft underline">
              Open the source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
