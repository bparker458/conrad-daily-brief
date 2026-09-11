import type { Task } from "./types";

/**
 * Server-side duplicate guard for Conrad's writes.
 *
 * The sweeps are told to dedupe before they POST, and they still produced
 * the same card twice when two runs worded one email differently. The list
 * is only trustworthy if the door itself refuses the second copy, so Conrad
 * creates go through this check. Phone captures never do: when Brad types a
 * task twice, he meant it.
 *
 * Tuned against the live ledger on 2026-09-10: it caught all four real
 * duplicates (two wordings of the Drata vote, the Amber feedback, the PGE
 * bill, the Sandra tax decision) and flagged zero false pairs across 116
 * live tasks.
 */

const CANDIDATE_PREFIX = /^\s*candidate\s*:\s*/i;
const STOP = new Set(
  "a an the to for of on in and or with your you is be at by from it this that".split(" ")
);

/** Legacy candidate marker in the title. The status carries that now. */
export function stripCandidatePrefix(title: string): { title: string; hadPrefix: boolean } {
  const hadPrefix = CANDIDATE_PREFIX.test(title);
  return { title: title.replace(CANDIDATE_PREFIX, "").trim(), hadPrefix };
}

function words(title: string): string[] {
  return stripCandidatePrefix(title)
    .title.toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function sameTask(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return false;
  if (wa.join(" ") === wb.join(" ")) return true;
  // Same opening seven words: two wordings of one ask.
  if (wa.length >= 7 && wb.length >= 7 && wa.slice(0, 7).join(" ") === wb.slice(0, 7).join(" ")) {
    return true;
  }
  const sa = new Set(wa.filter((w) => !STOP.has(w)));
  const sb = new Set(wb.filter((w) => !STOP.has(w)));
  if (Math.min(sa.size, sb.size) < 4) return false;
  let inter = 0;
  sa.forEach((w) => {
    if (sb.has(w)) inter++;
  });
  return inter / (sa.size + sb.size - inter) >= 0.75;
}

const RECENT_DAYS = 45;

/**
 * The existing task a new Conrad write duplicates, or null.
 * Live tasks always count. Done and cancelled ones count for 45 days, so a
 * sweep re-reading an old thread cannot resurrect something Brad finished.
 */
export function findDuplicate(
  existing: Task[],
  title: string,
  sourceLink: string | null
): Task | null {
  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  for (const t of existing) {
    const closed = t.status === "done" || t.status === "cancelled";
    if (closed) {
      const when = new Date(t.doneAt ?? t.createdAt).getTime();
      if (!(when >= cutoff)) continue;
    }
    if (sourceLink && t.sourceLink && t.sourceLink === sourceLink) return t;
    if (sameTask(t.title, title)) return t;
  }
  return null;
}
