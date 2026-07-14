#!/usr/bin/env node
/**
 * Phase 3 parser verification — runs the pure Google parsers against
 * fixture payloads shaped like real API responses, so the data path is
 * tested even before Marshall supplies OAuth credentials.
 * (Live end-to-end check happens after RUNBOOK step 6; the API routes
 * return honest "unavailable" until then — verified separately.)
 */

// The parsers live in a TS module; mirror-test the same logic contract here
// by importing the compiled route behavior is overkill — instead this file
// is executed with tsx-free plain node against a transpiled copy generated
// at test time by esbuild-lite string extraction. Simpler: re-implement the
// EXPECTED OUTPUT and diff against the module compiled by Next at build.
// To keep zero extra dependencies, we spawn `npx tsc` once into a temp dir.

import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const tmp = mkdtempSync(path.join(tmpdir(), "cb-google-test-"));
execSync(
  `npx tsc lib/google.ts --outDir ${tmp} --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { stdio: "inherit" }
);
const { parseEvents, parseMessage, laDayRange } = await import(
  path.join(tmp, "google.js")
);

let fails = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fails++;
};

console.log("── Phase 3 Google parser verification (fixtures)");

// Calendar fixture: timed event, all-day event, cancelled event
const events = parseEvents({
  items: [
    {
      id: "e1",
      summary: "Refi call with the bank",
      location: "Zoom",
      start: { dateTime: "2026-07-13T09:00:00-07:00" },
      end: { dateTime: "2026-07-13T09:30:00-07:00" },
    },
    {
      id: "e2",
      summary: "County fair",
      start: { date: "2026-07-13" },
      end: { date: "2026-07-14" },
    },
    { id: "e3", summary: "Ghost", status: "cancelled", start: { dateTime: "2026-07-13T10:00:00-07:00" } },
  ],
});
check("timed event parsed with title/start/location", events[0].title === "Refi call with the bank" && events[0].allDay === false && events[0].location === "Zoom");
check("all-day event flagged allDay", events[1].allDay === true && events[1].start === "2026-07-13");
check("cancelled events dropped", events.length === 2);

// Gmail fixture
const msg = parseMessage({
  id: "m1",
  snippet: "Your escrow closing docs are ready for review…",
  payload: {
    headers: [
      { name: "Subject", value: "Escrow closing docs" },
      { name: "From", value: '"First American Title" <docs@firstam.com>' },
      { name: "Date", value: "Mon, 13 Jul 2026 08:12:00 -0700" },
    ],
  },
});
check("gmail subject/from parsed (display name only)", msg.subject === "Escrow closing docs" && msg.from === "First American Title");
check("gmail snippet carried through", msg.snippet.includes("escrow"));

const noSubject = parseMessage({ id: "m2", snippet: "", payload: { headers: [{ name: "From", value: "farm@lease.com" }] } });
check("missing subject handled honestly", noSubject.subject === "(no subject)");

// Day-range sanity: 24h window, valid ISO strings
const { timeMin, timeMax } = laDayRange(new Date("2026-07-13T20:00:00Z"));
const spanH = (new Date(timeMax) - new Date(timeMin)) / 36e5;
check(`laDayRange spans 24h (${spanH}h) and parses as dates`, spanH === 24 && !isNaN(new Date(timeMin).getTime()));

console.log("");
if (fails === 0) console.log("── GOOGLE PARSERS: ALL CHECKS PASSED");
else {
  console.log(`── GOOGLE PARSERS: ${fails} CHECK(S) FAILED`);
  process.exit(1);
}
