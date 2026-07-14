"use client";

import { useState } from "react";

/**
 * Single-user passphrase gate. Posts to /api/session; on match the server
 * sets an httpOnly cookie and the page reloads into the Brief.
 */
export default function Gate() {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phrase.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: phrase }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      if (res.status === 401) setError("That's not it. Try again.");
      else setError("The app isn't set up yet. Tell Marshall.");
    } catch {
      setError("No connection. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[85vh] max-w-brief flex-col justify-center px-6">
      <div className="text-[10.5px] font-bold tracking-[0.14em] text-navysoft">
        CONRAD &middot; CHIEF OF STAFF
      </div>
      <h1 className="mb-1 mt-0.5 font-serif text-[26px] font-bold text-navy">
        Daily Brief
      </h1>
      <p className="mb-6 text-sm text-muted">
        Private. Enter the passphrase to open your brief.
      </p>
      <form onSubmit={submit}>
        <input
          type="password"
          inputMode="text"
          autoComplete="current-password"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="Passphrase"
          className="w-full rounded-[10px] border border-line bg-paper px-4 py-3.5 text-base text-ink outline-none focus:border-navysoft"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-3 w-full rounded-[10px] border border-navy bg-navy py-3.5 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Checking…" : "Open my brief"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-redflag">{error}</p>}
    </main>
  );
}
