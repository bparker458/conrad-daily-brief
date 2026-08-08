/**
 * La-Z-Boy Daily Numbers — the single source the brief reads.
 *
 * This mirrors the "Daily Numbers" block in Conrad's morning artifact:
 * what the company wrote against goal, adjusted goal, and last year, from
 * Jessica's recap (APEX + Trakwell). It is the ONE place these values live
 * for the phone brief — the brief only reads them through /api/numbers, the
 * same one-door rule the task list follows. No number is ever typed into the
 * component.
 *
 * Refreshing it (Conrad, each morning when Jessica's recap lands): edit the
 * fields below and commit — Netlify redeploys. Set latestRecapLanded to false
 * when the newest recap has not arrived yet and these are the last on file.
 */
export interface DailyNumbers {
  written: number; // dollars written, whole number
  toGoalPct: number; // % of goal
  toAdjustedGoalPct: number; // % of adjusted goal
  toLastYearPct: number; // % of last year
  resultsThrough: string; // human label, e.g. "Monday, Aug 3"
  latestRecapLanded: boolean; // false when the newest recap hasn't arrived yet
  source: string; // where the numbers came from
  updatedAt: string; // ISO date this row was last refreshed
}

export const LZB_DAILY_NUMBERS: DailyNumbers = {
  written: 69285,
  toGoalPct: 92.0,
  toAdjustedGoalPct: 77.5,
  toLastYearPct: 93.8,
  resultsThrough: "Monday, Aug 3",
  latestRecapLanded: false,
  source: "Jessica's recap (APEX + Trakwell)",
  updatedAt: "2026-08-04",
};

