import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized, apiError } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { ymdInTz } from "@/lib/derive";
import { panelNotConfigured, panelOk, panelUnavailable } from "@/lib/panel";
import type { DailyNumbers } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/numbers?business=la-z-boy
 *
 * Returns the newest stored figures as a panel, with `resultsThrough`
 * so the dashboard can say out loud whether these are today's numbers
 * or the last set on file. There is no hardcoded fallback anywhere in
 * this route: if nothing has been written, the panel says so.
 *
 * POST /api/numbers — Conrad writes the recap when it lands.
 * Body: { resultsThrough, written, toGoalPct, toAdjustedGoalPct,
 *         toLastYearPct, source?, business? }
 * Upserts on (business, resultsThrough) so a corrected recap replaces
 * the earlier one instead of stacking a second version of the truth.
 */
export async function GET(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    const url = new URL(req.url);
    const business = url.searchParams.get("business") || "la-z-boy";
    const store = await getStore();
    const row = await store.latestNumbers(business);
    if (!row) {
      return NextResponse.json(
        panelNotConfigured<DailyNumbers>(
          "Daily numbers",
          "No recap has been recorded yet"
        )
      );
    }
    const panel = panelOk("Daily numbers", [row]);
    // The figures are as-of their business day, not as-of this request.
    panel.asOf = row.recordedAt;
    return NextResponse.json({
      ...panel,
      today: ymdInTz(),
      isCurrent: row.resultsThrough >= previousBusinessDay(),
    });
  } catch (e) {
    console.error("[/api/numbers GET]", e);
    return NextResponse.json(panelUnavailable<DailyNumbers>("Daily numbers", e), {
      status: 200,
    });
  }
}

export async function POST(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return apiError("bad request body", 400);
    }

    const resultsThrough = typeof body.resultsThrough === "string" ? body.resultsThrough : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(resultsThrough)) {
      return apiError("resultsThrough must be YYYY-MM-DD", 400);
    }

    const nums = ["written", "toGoalPct", "toAdjustedGoalPct", "toLastYearPct"] as const;
    for (const k of nums) {
      if (typeof body[k] !== "number" || !Number.isFinite(body[k] as number)) {
        return apiError(`${k} must be a number`, 400);
      }
    }

    const store = await getStore();
    const row = await store.insertNumbers({
      business: typeof body.business === "string" ? body.business : "la-z-boy",
      resultsThrough,
      written: body.written as number,
      toGoalPct: body.toGoalPct as number,
      toAdjustedGoalPct: body.toAdjustedGoalPct as number,
      toLastYearPct: body.toLastYearPct as number,
      source: typeof body.source === "string" ? body.source : "",
    });
    await store.recordSourceHealth("daily-numbers", {
      ok: true,
      detail: `recap through ${resultsThrough}`,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("[/api/numbers POST]", e);
    return apiError("numbers write failed", 500);
  }
}

/** Yesterday in Brad's zone — the freshest a morning recap can honestly be. */
function previousBusinessDay(): string {
  const d = new Date(Date.now() - 86400000);
  return ymdInTz(d);
}
