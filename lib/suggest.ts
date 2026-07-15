import type { Area, Task } from "./types";

/**
 * Conrad's step-writer (server only).
 *
 * When Brad taps "I'm not sure" on a task, this asks Claude for the next
 * concrete steps and the API layer stores them in conrad_note — the SAME
 * field Conrad (Face B) writes through PATCH. One field, two suggestion
 * paths, no second copy of the truth (Prime Directive).
 *
 * The key lives in ANTHROPIC_API_KEY on the server only. It is never sent
 * to the browser; scripts/check-bundle.mjs fails the build if it leaks.
 * Marshall's key today, Brad's key later — swap the Netlify env var,
 * nothing else changes.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
// Netlify route handlers get ~10s; leave room to store and respond even
// when the model runs long. On timeout the task stays honestly flagged.
const TIMEOUT_MS = 8000;
const MAX_NOTE_CHARS = 1400;

function placeholder(v: string): boolean {
  return (
    v === "" || v.startsWith("YOUR") || v.startsWith("your") || v.includes("placeholder")
  );
}

export function suggestConfigured(): boolean {
  return !placeholder(process.env.ANTHROPIC_API_KEY || "");
}

/**
 * Who Conrad is and how he answers. Brad is a verbal processor who lives
 * on his phone; steps must be glanceable, startable, and seasonal where
 * the work is seasonal (the farm). No essays. No hedging. No preamble.
 */
const SYSTEM = [
  "You are Conrad, Brad Parker's AI Chief of Staff.",
  "Brad runs several worlds at once: La-Z-Boy of Oregon (furniture retail),",
  "Trakwell (his software company), Dash Farms (his 137-acre Oregon farm),",
  "an estate he is restoring, multiple rental properties, and his personal life.",
  "He reads these steps on his phone, often standing in a field or a store.",
  "When he says \"I'm not sure\" about a task, give him the next concrete steps.",
  "",
  "Rules:",
  "- 3 to 6 steps, numbered \"1.\" style, one line each, imperative voice.",
  "- Step 1 must be startable today with a phone call, a quick search, or a short errand.",
  "- Be specific to the task and the season; today's date is provided.",
  "  For farm work include timing and weather windows, and what to buy or rent.",
  "- If a step truly needs a licensed pro or a specialist, name the kind of pro to call.",
  "- If the right move depends on something unknown, make step 1 the check that resolves it.",
  "- Plain words. No preamble, no closing line, no headers, no bold.",
  "- Keep the whole list under 110 words.",
].join("\n");

function userPrompt(task: Task, area: Area | null): string {
  const lines = [
    `Task: ${task.title}`,
    `World: ${area ? area.name : "Inbox (not yet sorted)"}`,
  ];
  if (area?.endInMind) lines.push(`End in mind for this world: ${area.endInMind}`);
  if (task.note) lines.push(`Brad's notes on it so far:\n${task.note}`);
  lines.push(`Today's date: ${new Date().toISOString().slice(0, 10)}`);
  return lines.join("\n");
}

/**
 * Returns the numbered steps as plain text, or throws. Callers treat any
 * throw as "suggestion unavailable" — the unsure flag has already been
 * written by then, so nothing is lost.
 */
export async function generateSteps(task: Task, area: Area | null): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY || "";
  const model = process.env.CONRAD_SUGGEST_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        temperature: 0.3,
        system: SYSTEM,
        messages: [{ role: "user", content: userPrompt(task, area) }],
      }),
    });

    if (!res.ok) {
      // Never surface provider error bodies to the phone; log server-side.
      const detail = await res.text().catch(() => "");
      throw new Error(`anthropic ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content || [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();

    if (!text) throw new Error("anthropic returned no text");
    return text.length > MAX_NOTE_CHARS ? `${text.slice(0, MAX_NOTE_CHARS)}…` : text;
  } finally {
    clearTimeout(timer);
  }
}
