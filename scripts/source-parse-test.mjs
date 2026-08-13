#!/usr/bin/env node
/**
 * Parser fixtures for the connectors — no network, no accounts needed.
 *
 *   node scripts/source-parse-test.mjs
 *
 * The parsers are the part most likely to quietly rot: a provider tweaks
 * a field name and the dashboard starts showing "(no subject)" forever
 * without anything failing loudly. These fixtures pin the shapes.
 *
 * The lib is TypeScript, so this compiles the two source modules into a
 * temp folder with the TypeScript already in devDependencies, then
 * imports the JavaScript. No new dependency, no build step in the app.
 */
import { execFileSync } from "child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { pathToFileURL } from "url";

const out = mkdtempSync(path.join(tmpdir(), "cb-parse-"));
let fails = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fails++;
};

try {
  execFileSync(
    "npx",
    [
      "tsc",
      "lib/graph.ts",
      "lib/google.ts",
      "--outDir",
      out,
      "--module",
      "es2022",
      "--target",
      "es2022",
      "--moduleResolution",
      "bundler",
      "--skipLibCheck",
    ],
    { stdio: "inherit" }
  );

  // tsc emits the extensionless specifiers it was given; Node's ESM
  // loader needs the .js. One rewrite beats adding a bundler.
  for (const f of readdirSync(out).filter((n) => n.endsWith(".js"))) {
    const p = path.join(out, f);
    writeFileSync(
      p,
      readFileSync(p, "utf8").replace(/from "(\.\/[^"]+?)"/g, (m, spec) =>
        spec.endsWith(".js") ? m : `from "${spec}.js"`
      )
    );
  }

  const graph = await import(pathToFileURL(path.join(out, "graph.js")).href);
  const google = await import(pathToFileURL(path.join(out, "google.js")).href);

  const now = Date.parse("2026-08-13T17:00:00Z");

  /* ── Outlook mail ───────────────────────────────────── */
  const msg = graph.parseGraphMessage(
    {
      id: "AAMk-1",
      subject: "Refi docs need your signature",
      bodyPreview: "  Lender needs   the signed page\n by Friday ",
      receivedDateTime: "2026-08-11T17:00:00Z",
      isRead: false,
      hasAttachments: true,
      webLink: "https://outlook.office.com/mail/id/AAMk-1",
      flag: { flagStatus: "flagged" },
      from: { emailAddress: { name: "Nick Stanley", address: "NStanley@Crownpoint.com" } },
    },
    now
  );
  check("outlook: subject and sender parsed", msg.subject.startsWith("Refi") && msg.from === "Nick Stanley");
  check("outlook: email lowercased for matching", msg.fromEmail === "nstanley@crownpoint.com");
  check("outlook: snippet whitespace collapsed", msg.snippet === "Lender needs the signed page by Friday");
  check("outlook: age computed in whole hours", msg.ageHours === 48);
  check("outlook: flagged wins the reason", msg.flagged === true && msg.reason === "flagged");
  check("outlook: attention rule keeps it", graph.needsAttention(msg) === true);

  const readMail = graph.parseGraphMessage(
    { id: "AAMk-2", subject: "FYI", isRead: true, receivedDateTime: "2026-08-13T16:00:00Z", from: { emailAddress: { address: "a@b.com" } } },
    now
  );
  check("outlook: already-read mail is not an open loop", graph.needsAttention(readMail) === false);

  const oldUnread = graph.parseGraphMessage(
    { id: "AAMk-3", subject: "Still waiting", isRead: false, receivedDateTime: "2026-08-10T17:00:00Z", from: { emailAddress: { address: "c@d.com" } } },
    now
  );
  check("outlook: unread over a day counts as waiting", graph.needsAttention(oldUnread) === true && oldUnread.reason === "waiting");

  /* ── Outlook calendar ────────────────────────────────── */
  const ev = graph.parseGraphEvent(
    {
      id: "EV-1",
      subject: "Store walk with Ross",
      start: { dateTime: "2026-08-13T18:00:00.0000000" },
      end: { dateTime: "2026-08-13T19:00:00.0000000" },
      location: { displayName: "Tualatin" },
      organizer: { emailAddress: { name: "Ross" } },
      attendees: [{}, {}],
      onlineMeeting: { joinUrl: "https://teams.microsoft.com/x" },
    },
    now
  );
  check("outlook cal: offset-less times get a zone", ev.start === "2026-08-13T18:00:00.0000000Z");
  check("outlook cal: prep flag on a real meeting inside the day", ev.needsPrep === true);
  check("outlook cal: join link kept", ev.joinUrl.includes("teams.microsoft.com"));

  const cancelledSafe = graph.parseGraphEvent({ id: "EV-2", subject: "", isAllDay: true, start: { dateTime: "2026-08-14T00:00:00" } }, now);
  check("outlook cal: untitled and all-day handled", cancelledSafe.title === "(untitled)" && cancelledSafe.allDay === true && cancelledSafe.needsPrep === false);

  /* ── Gmail ────────────────────────────────────────── */
  const gm = google.parseMessage(
    {
      id: "18f",
      snippet: "Escrow  closes   Thursday",
      labelIds: ["UNREAD", "STARRED", "INBOX"],
      internalDate: String(Date.parse("2026-08-13T14:00:00Z")),
      payload: {
        headers: [
          { name: "Subject", value: "Escrow update" },
          { name: "From", value: '"Dannielle Booth" <Dannielle.Booth@stewart.com>' },
        ],
      },
    },
    now
  );
  check("gmail: display name split from address", gm.from === "Dannielle Booth" && gm.fromEmail === "dannielle.booth@stewart.com");
  check("gmail: starred reads as flagged", gm.flagged === true && gm.reason === "flagged");
  check("gmail: deep link built from the id", gm.url.endsWith("/18f"));
  check("gmail: internalDate wins over header date", gm.receivedAt === "2026-08-13T14:00:00.000Z");

  const noHeaders = google.parseMessage({ id: "x", payload: { headers: [] } }, now);
  check("gmail: missing headers degrade to labels, not a crash", noHeaders.subject === "(no subject)");

  /* ── Google calendar ─────────────────────────────────── */
  const gcal = google.parseEvents(
    {
      items: [
        { id: "g1", status: "cancelled", summary: "Dropped" },
        {
          id: "g2",
          summary: "Blue Angels",
          start: { date: "2026-08-14" },
          end: { date: "2026-08-15" },
          htmlLink: "https://calendar.google.com/g2",
        },
        {
          id: "g3",
          summary: "Call with Marshall",
          start: { dateTime: "2026-08-13T18:30:00Z" },
          end: { dateTime: "2026-08-13T19:00:00Z" },
          attendees: [{}, {}],
          hangoutLink: "https://meet.google.com/x",
        },
      ],
    },
    now
  );
  check("google cal: cancelled events dropped", gcal.length === 2);
  check("google cal: all-day detected", gcal[0].allDay === true);
  check("google cal: prep flag on the timed meeting", gcal[1].needsPrep === true);
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log("");
if (fails === 0) {
  console.log("── SOURCE PARSERS: ALL CHECKS PASSED");
} else {
  console.log(`── SOURCE PARSERS: ${fails} CHECK(S) FAILED`);
  process.exit(1);
}
