"use client";

import { useRef, useState } from "react";

/**
 * Quick capture — the single highest-value screen in the dashboard.
 *
 * Brad finishes a hallway conversation, opens this from the home screen, taps
 * the mic on the iOS keyboard, talks, taps Save, and walks away. The POST hits
 * a plain insert and returns in well under a second because nothing on this
 * path calls a model. Conrad files it later.
 *
 * The failure mode this replaces: opening Claude, waiting, clicking through to
 * Dispatch, waiting again, and giving up before the thought is recorded.
 */
export default function CapturePage() {
  const [body, setBody] = useState("");
  const [person, setPerson] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);

  async function save() {
    const text = body.trim();
    if (!text) return;
    setState("saving");
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, person: person.trim() || null }),
      });
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "save failed" }));
        setState("error");
        setMessage(err.error || "save failed");
        return;
      }
      setBody("");
      setPerson("");
      setState("saved");
      setMessage("Saved. Conrad will file it.");
      boxRef.current?.focus();
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setMessage("No connection. Nothing was saved, so say it again when you have signal.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-brief flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-[26px] font-bold text-navy">Capture</h1>
        <a href="/" className="text-sm text-navysoft underline">
          Dashboard
        </a>
      </header>

      <p className="text-sm text-muted">
        Tap the mic on the keyboard and talk. It lands now and gets filed later.
      </p>

      <textarea
        ref={boxRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        autoFocus
        placeholder="Had a great talk with Gretchen. She is focused on Medford. One of the chickens died."
        className="w-full rounded-xl border border-line p-4 text-lg leading-relaxed focus:border-navysoft focus:outline-none"
      />

      <input
        value={person}
        onChange={(e) => setPerson(e.target.value)}
        placeholder="Who was this about? (optional)"
        className="w-full rounded-xl border border-line p-3 text-base focus:border-navysoft focus:outline-none"
      />

      <button
        onClick={save}
        disabled={state === "saving" || !body.trim()}
        className="w-full rounded-xl bg-navy px-6 py-5 text-lg font-medium text-white disabled:opacity-40"
      >
        {state === "saving" ? "Saving..." : "Save"}
      </button>

      {state === "saved" && (
        <p className="text-center text-sm text-grn">{message}</p>
      )}
      {state === "error" && (
        <p className="text-center text-sm text-redflag">{message}</p>
      )}
    </main>
  );
}
