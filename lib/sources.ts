/**
 * Source orchestration: turn live connector pulls into honest panels,
 * record what worked and what broke, and give every surfaced item a
 * durable home in the signals table.
 *
 * The order matters and is deliberate:
 *   1. Pull live. If it fails, the panel says unavailable and names the
 *      failure. Nothing silently substitutes older data.
 *   2. Write what came back into `signals`, keyed on (source, externalId),
 *      so an item Brad dismissed yesterday stays dismissed today and an
 *      item he converted into a task keeps the link back to its origin.
 *   3. Annotate the live items with that stored status and drop the ones
 *      he has already handled.
 *
 * Persisting is best effort: a failed signal write is logged and never
 * takes the panel down with it, because a read outage and a write outage
 * are different problems and Brad should see the mail either way.
 */

import type { Store } from "./store";
import type { CalendarItem, MailItem } from "./source-types";
import type { Signal, SignalKind } from "./types";
import {
  mergePanels,
  panelNotConfigured,
  panelOk,
  panelUnavailable,
  type Panel,
} from "./panel";
import {
  fetchOutlookAttentionMail,
  fetchOutlookEvents,
  graphConfigured,
  probeGraph,
} from "./graph";
import {
  fetchGmailAttentionMail,
  fetchGoogleEvents,
  googleConfigured,
  probeGoogle,
} from "./google";

export const SOURCE_LABELS: Record<string, string> = {
  outlook: "Outlook",
  gmail: "Gmail",
  google: "Google Calendar",
  supabase: "Task store",
};

/** Persist what a pull returned, then hide anything already handled. */
async function persistAndFilter<T extends { id: string }>(
  store: Store,
  kind: SignalKind,
  sourceName: string,
  items: T[],
  toSignal: (item: T) => {
    title: string;
    detail: string;
    person: string;
    personEmail: string;
    url: string;
    occurredAt: string;
  }
): Promise<T[]> {
  let known: Signal[] = [];
  try {
    known = await store.listSignals({ sinceDays: 30 });
  } catch (e) {
    console.error("[sources] could not read signals", e);
  }
  const handled = new Set(
    known
      .filter(
        (s) =>
          s.source === sourceName &&
          (s.status === "dismissed" || s.status === "converted")
      )
      .map((s) => s.externalId)
  );

  await Promise.all(
    items.map(async (item) => {
      const s = toSignal(item);
      try {
        await store.upsertSignal({
          kind,
          source: sourceName,
          externalId: item.id,
          title: s.title,
          detail: s.detail,
          person: s.person,
          personEmail: s.personEmail,
          url: s.url,
          occurredAt: s.occurredAt,
        });
      } catch (e) {
        console.error("[sources] signal write failed", e);
      }
    })
  );

  return items.filter((i) => !handled.has(i.id));
}

/* ── Mail ───────────────────────────────────────────── */

async function outlookMailPanel(store: Store): Promise<Panel<MailItem>> {
  if (!graphConfigured()) {
    return panelNotConfigured<MailItem>("Outlook", "Outlook is not connected yet");
  }
  try {
    const raw = await fetchOutlookAttentionMail();
    const items = await persistAndFilter(store, "mail", "outlook", raw, (m) => ({
      title: m.subject,
      detail: m.snippet,
      person: m.from,
      personEmail: m.fromEmail,
      url: m.url,
      occurredAt: m.receivedAt,
    }));
    await store.recordSourceHealth("outlook", { ok: true, detail: `${items.length} items` });
    return panelOk("Outlook", items);
  } catch (e) {
    await store.recordSourceHealth("outlook", {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return panelUnavailable<MailItem>("Outlook", e);
  }
}

async function gmailPanel(store: Store): Promise<Panel<MailItem>> {
  if (!googleConfigured()) {
    return panelNotConfigured<MailItem>("Gmail", "Gmail is not connected yet");
  }
  try {
    const raw = await fetchGmailAttentionMail();
    const items = await persistAndFilter(store, "mail", "gmail", raw, (m) => ({
      title: m.subject,
      detail: m.snippet,
      person: m.from,
      personEmail: m.fromEmail,
      url: m.url,
      occurredAt: m.receivedAt,
    }));
    await store.recordSourceHealth("gmail", { ok: true, detail: `${items.length} items` });
    return panelOk("Gmail", items);
  } catch (e) {
    await store.recordSourceHealth("gmail", {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return panelUnavailable<MailItem>("Gmail", e);
  }
}

export async function mailPanel(store: Store): Promise<Panel<MailItem>> {
  const [outlook, gmail] = await Promise.all([outlookMailPanel(store), gmailPanel(store)]);
  const merged = mergePanels("Mail", [outlook, gmail]);
  merged.data.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  merged.data = merged.data.slice(0, 20);
  return merged;
}

/* ── Calendar ──────────────────────────────────────── */

async function outlookCalendarPanel(store: Store): Promise<Panel<CalendarItem>> {
  if (!graphConfigured()) {
    return panelNotConfigured<CalendarItem>("Outlook calendar", "Outlook is not connected yet");
  }
  try {
    const raw = await fetchOutlookEvents();
    const items = await persistAndFilter(store, "calendar", "outlook-calendar", raw, (e) => ({
      title: e.title,
      detail: e.location,
      person: e.organizer,
      personEmail: "",
      url: e.url,
      occurredAt: e.start || new Date().toISOString(),
    }));
    await store.recordSourceHealth("outlook-calendar", {
      ok: true,
      detail: `${items.length} events`,
    });
    return panelOk("Outlook calendar", items);
  } catch (e) {
    await store.recordSourceHealth("outlook-calendar", {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return panelUnavailable<CalendarItem>("Outlook calendar", e);
  }
}

async function googleCalendarPanel(store: Store): Promise<Panel<CalendarItem>> {
  if (!googleConfigured()) {
    return panelNotConfigured<CalendarItem>("Google Calendar", "Google is not connected yet");
  }
  try {
    const raw = await fetchGoogleEvents();
    const items = await persistAndFilter(store, "calendar", "google-calendar", raw, (e) => ({
      title: e.title,
      detail: e.location,
      person: e.organizer,
      personEmail: "",
      url: e.url,
      occurredAt: e.start || new Date().toISOString(),
    }));
    await store.recordSourceHealth("google-calendar", {
      ok: true,
      detail: `${items.length} events`,
    });
    return panelOk("Google Calendar", items);
  } catch (e) {
    await store.recordSourceHealth("google-calendar", {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    return panelUnavailable<CalendarItem>("Google Calendar", e);
  }
}

/** De-dupe the same meeting invited to both accounts: same title, same start. */
function dedupeEvents(items: CalendarItem[]): CalendarItem[] {
  const seen = new Set<string>();
  const out: CalendarItem[] = [];
  for (const e of items) {
    const key = `${e.title.trim().toLowerCase()}|${e.start.slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export async function calendarPanel(store: Store): Promise<Panel<CalendarItem>> {
  const [outlook, google] = await Promise.all([
    outlookCalendarPanel(store),
    googleCalendarPanel(store),
  ]);
  const merged = mergePanels("Calendar", [outlook, google]);
  merged.data = dedupeEvents(merged.data).sort((a, b) => a.start.localeCompare(b.start));
  return merged;
}

/* ── Probes for /api/health and the warm run ──────────────────── */

export interface ProbeResult {
  source: string;
  configured: boolean;
  ok: boolean;
  error: string;
}

export async function probeAll(store: Store): Promise<ProbeResult[]> {
  const checks: { source: string; configured: boolean; run: () => Promise<void> }[] = [
    { source: "outlook", configured: graphConfigured(), run: probeGraph },
    { source: "google", configured: googleConfigured(), run: probeGoogle },
  ];
  const results: ProbeResult[] = [];
  for (const c of checks) {
    if (!c.configured) {
      results.push({ source: c.source, configured: false, ok: false, error: "not configured" });
      continue;
    }
    try {
      await c.run();
      await store.recordSourceHealth(c.source, { ok: true, detail: "probe" });
      results.push({ source: c.source, configured: true, ok: true, error: "" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await store.recordSourceHealth(c.source, { ok: false, error });
      results.push({ source: c.source, configured: true, ok: false, error });
    }
  }
  return results;
}
