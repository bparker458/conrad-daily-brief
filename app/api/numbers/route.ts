import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { latestNumbers, putNumbers, NotConfiguredError } from "@/lib/dashboard-store";
import { LZB_DAILY_NUMBERS } from "@/lib/numbers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/numbers — La-Z-Boy daily numbers for the dashboard.
 * Reads the newest daily_numbers row (Conrad PUTs one each morning from
 * Jessica's recap). Falls back to the last hardcoded constant ONLY when the
 * table is empty or missing, and says so with `live: false` so a stale card
 * can never pass as current.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const row = await latestNumbers();
    if (row) {
      const forDate = new Date(`${row.forDate}T12:00:00Z`);
      const ageDays = Math.floor((Date.now() - forDate.getTime()) / 86400000);
      return NextResponse.json({
        live: true,
        forDate: row.forDate,
        written: row.written ?? 0,
        toGoalPct: row.pctGoal ?? 0,
        toAdjustedGoalPct: row.pctAdjGoal ?? 0,
        toLastYearPct: row.pctLastYear ?? 0,
        resultsThrough: forDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
        latestRecapLanded: ageDays <= 1,
        ageDays,
        recapLink: row.recapLink,
        trakwell: row.trakwell,
        source: "Jessica's Daily Numbers Recap (Outlook), posted by Conrad",
        updatedAt: row.updatedAt,
      });
    }
  } catch (e) {
    if (!(e instanceof NotConfiguredError)) console.error("[/api/numbers GET]", e);
  }
  return NextResponse.json({
    live: false,
    forDate: LZB_DAILY_NUMBERS.updatedAt,
    ...LZB_DAILY_NUMBERS,
    latestRecapLanded: false,
    ageDays: null,
    recapLink: null,
    trakwell: null,
    source: `${LZB_DAILY_NUMBERS.source} (fallback constant, not live)`,
  });
}

/**
 * PUT /api/numbers — Conrad only.
 * Body { forDate: 'YYYY-MM-DD', written, pctGoal, pctAdjGoal, pctLastYear, recapLink?, trakwell? }
 */
export async function PUT(req: NextRequest) {
  const caller = authenticate(req);
  if (!caller) return unauthorized();
  if (caller !== "conrad") return apiError("numbers are written by Conrad only", 403);
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }
    const forDate = typeof payload.forDate === "string" ? payload.forDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return apiError("forDate must be YYYY-MM-DD", 400);
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
    const row = await putNumbers({
      forDate,
      written: num(payload.written),
      pctGoal: num(payload.pctGoal),
      pctAdjGoal: num(payload.pctAdjGoal),
      pctLastYear: num(payload.pctLastYear),
      recapLink: typeof payload.recapLink === "string" ? payload.recapLink : null,
      trakwell:
        payload.trakwell && typeof payload.trakwell === "object"
          ? (payload.trakwell as Record<string, unknown>)
          : null,
    });
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof NotConfiguredError) return apiError("store not configured", 503);
    console.error("[/api/numbers PUT]", e);
    return apiError(`numbers write failed: ${(e as Error).message}`, 500);
  }
}
