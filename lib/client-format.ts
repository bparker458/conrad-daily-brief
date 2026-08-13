/**
 * Formatting the dashboard reads out loud. Client-safe: no server imports.
 * Every one of these exists so a panel can say something specific instead
 * of something vague. "3 hours ago" beats a raw timestamp; "waiting 2 days"
 * beats a silent row.
 */

export function timeOfDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function shortDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** "just now", "12 min ago", "3 hours ago", "2 days ago". */
export function ago(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "waiting 2 days" for mail that has been sitting. */
export function waitingFor(hours: number): string {
  if (hours < 1) return "just arrived";
  if (hours < 24) return `waiting ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `waiting ${days} day${days === 1 ? "" : "s"}`;
}

export function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** Color band for a "% to goal" number: at target green, close amber, soft red. */
export function numBand(pct: number): string {
  if (pct >= 100) return "text-grn";
  if (pct >= 85) return "text-amber";
  return "text-redflag";
}

/** A dated line for note appends: "[Aug 13] ..." */
export function datedLine(text: string): string {
  const stamp = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `[${stamp}] ${text}`;
}

/** Build a mailto that is already written, so the button does real work. */
export function mailtoLink(opts: {
  to?: string;
  subject: string;
  body: string;
}): string {
  const to = opts.to || "";
  return `mailto:${to}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(
    opts.body
  )}`;
}

/** Longhand date for the header. */
export function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
