/**
 * The honesty contract every dashboard panel obeys.
 *
 * There is exactly one shape for "here is a section of the dashboard",
 * and it always carries how the data was obtained. A panel can be:
 *
 *   ok             — a live pull succeeded just now
 *   empty          — a live pull succeeded and there is genuinely nothing
 *   not_configured — the connector was never set up; say so, do not pretend
 *   unavailable    — the connector is set up and the pull FAILED
 *   stale          — we are showing an older stored copy ON PURPOSE, with its age
 *
 * The rule from Brad's protocol: a failed live pull is never quietly
 * replaced with older data. If a fallback happens it must come back as
 * `stale` with `asOf` set, so the dashboard can label it on screen.
 * There is no code path in this app that returns `ok` for data it did
 * not just fetch.
 *
 * This module is imported by both server routes and client components,
 * so it must stay free of any server-only dependency.
 */

export type PanelStatus =
  | "ok"
  | "empty"
  | "not_configured"
  | "unavailable"
  | "stale";

export interface Panel<T> {
  status: PanelStatus;
  data: T[];
  /** ISO time the data in `data` was actually true. */
  asOf: string | null;
  /** Present for `unavailable`: what broke, in words Brad can act on. */
  error: string;
  /** Human label for the source, e.g. "Outlook", "Gmail". */
  source: string;
}

export function panelOk<T>(source: string, data: T[]): Panel<T> {
  return {
    status: data.length === 0 ? "empty" : "ok",
    data,
    asOf: new Date().toISOString(),
    error: "",
    source,
  };
}

export function panelNotConfigured<T>(source: string, note = ""): Panel<T> {
  return { status: "not_configured", data: [], asOf: null, error: note, source };
}

export function panelUnavailable<T>(source: string, error: unknown): Panel<T> {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
  return { status: "unavailable", data: [], asOf: null, error: message, source };
}

export function panelStale<T>(source: string, data: T[], asOf: string, error: unknown): Panel<T> {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return { status: "stale", data, asOf, error: message, source };
}

/** Merge sibling panels (Outlook + Gmail) into one, keeping every failure visible. */
export function mergePanels<T>(label: string, panels: Panel<T>[]): Panel<T> {
  const live = panels.filter((p) => p.status === "ok" || p.status === "empty");
  const broken = panels.filter((p) => p.status === "unavailable");
  const data = live.flatMap((p) => p.data);

  if (live.length === 0) {
    if (broken.length > 0) {
      return {
        status: "unavailable",
        data: [],
        asOf: null,
        error: broken.map((p) => `${p.source}: ${p.error}`).join(" · "),
        source: label,
      };
    }
    const names = panels.map((p) => p.source).join(" and ");
    return panelNotConfigured<T>(
      label,
      names ? `Neither ${names} is connected yet.` : "Nothing is connected yet."
    );
  }

  // Some worked, some did not. Show what we have AND name what is missing.
  return {
    status: data.length === 0 ? "empty" : "ok",
    data,
    asOf: new Date().toISOString(),
    error: broken.map((p) => `${p.source}: ${p.error}`).join(" · "),
    source: live.map((p) => p.source).join(" + ") || label,
  };
}

export function panelIsUsable<T>(p: Panel<T> | null | undefined): p is Panel<T> {
  return !!p && (p.status === "ok" || p.status === "empty" || p.status === "stale");
}
