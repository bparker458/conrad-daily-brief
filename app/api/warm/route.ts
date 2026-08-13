import { NextRequest, NextResponse } from "next/server";
import { authenticate, unauthorized } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { calendarPanel, mailPanel, probeAll } from "@/lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/warm — run every source pull ahead of Brad opening the app.
 *
 * Brad opens this first thing and will not wait on a cold start. A
 * scheduled task hits this on weekday mornings before he is up: it
 * refreshes tokens, pulls mail and calendar, writes the signals rows,
 * and records source health, so the first real open renders immediately
 * and any broken connector is already known and labelled.
 *
 * It reports exactly what happened. If Outlook is down at 5am, this
 * response says so and the morning dashboard says so too.
 */
export async function POST(req: NextRequest) {
  if (!authenticate(req)) return unauthorized();
  const store = await getStore();
  const started = Date.now();

  const probes = await probeAll(store);
  const [mail, calendar] = await Promise.all([mailPanel(store), calendarPanel(store)]);

  // Not connected is a setup fact, not a failure. Only a source that is
  // configured and did not answer counts as a problem worth waking up to.
  const problems = [mail, calendar]
    .filter((p) => p.status === "unavailable" || (p.status !== "not_configured" && p.error))
    .map((p) => `${p.source}: ${p.error || p.status}`);

  const notConnected = [mail, calendar]
    .filter((p) => p.status === "not_configured")
    .map((p) => p.source);

  return NextResponse.json({
    ok: problems.length === 0,
    ranForMs: Date.now() - started,
    probes,
    mail: { status: mail.status, count: mail.data.length, error: mail.error },
    calendar: { status: calendar.status, count: calendar.data.length, error: calendar.error },
    problems,
    notConnected,
  });
}

/** GET is allowed too, so a plain scheduled fetch can warm it. */
export async function GET(req: NextRequest) {
  return POST(req);
}
