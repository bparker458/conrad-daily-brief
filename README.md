# Conrad Command Dashboard

One personal command surface for Brad Parker, across two faces that share
one list. Face A is the dashboard in this repo — a PWA Brad installs to his
iPhone home screen. Face B is Conrad, his substrate AI, which connects
through the same API (see `CONRAD-INTEGRATION.md`).

**Prime directive:** one shared list is the single source of truth. Every
surface reads from and writes to it, and the dashboard is always rendered
from the same rows the checkbox writes to. That is the rule that kills the
reappearing-task bug.

**Second directive, and the reason this is a dashboard and not a brief:**
nothing on screen is generated once and frozen. Every panel pulls when the
page opens, and any panel that cannot pull says so, by name, with the
reason. There is no code path in this app that quietly shows older data.

```
Phone dashboard ─┐                    ┌─► Supabase (tasks, signals,
                 ├─►  /api/*  ────────┤    numbers, health, events)
Conrad (Dispatch)┘                    └─► Outlook + Google, read only
```

## Stack

Next.js 14 (App Router) + TypeScript, Tailwind, Supabase (Postgres,
server-only via service role), PWA (manifest + service worker), Netlify with
`@netlify/plugin-nextjs`. Auth: bcrypt passphrase gate → httpOnly signed
session cookie for the phone; `Authorization: Bearer CONRAD_API_SECRET` for
Conrad. No Supabase key, and no connector secret, ever ships to the browser
(enforced at build time by `scripts/check-bundle.mjs`).

## Layout

```
app/api/…            the single door to the store and the sources:
                     dashboard, tasks, tasks/[id], tasks/[id]/suggest,
                     signals, signals/[id], numbers, mail, calendar,
                     week, events, warm, areas, progress, health, session
components/          Dashboard (the phone face), Gate (passphrase),
                     dashboard/ (TaskCard, Panels)
lib/                 store selector, Supabase store, local dev store, auth,
                     derive (progress, week and day maths), panel (the
                     honesty contract every section obeys), sources
                     (orchestration + source health), graph (Outlook),
                     google (Gmail + Google Calendar), suggest
supabase/            schema.sql, seed.sql, migrations/002_dashboard.sql
scripts/             dashboard-test, conrad-test, source-parse-test,
                     check-bundle, hash-passphrase, ms-refresh-token,
                     google-refresh-token, verify-phase1.sh
public/              manifest, service worker, icons
```

## What the dashboard shows, top to bottom

1. **Connector status** — anything down, partly loaded, or not connected,
   named, before Brad reads a single number.
2. **This week** — the counts that decide the day: overdue, due today,
   later this week, flagged but unscheduled, with someone else, done today.
3. **Overdue**, then **Today's plan** — the composed day, carried-over
   items labelled with the date they were originally stamped for.
4. **La-Z-Boy numbers** — from stored rows, stamped with the business day
   they describe and whether the newest recap has landed yet.
5. **On the calendar** — Outlook and Google merged and de-duped, with a
   prep flag on real meetings inside the next day and working join links.
6. **Waiting on you** — mail that is actually an open loop: flagged, unread
   from a priority sender, or unread more than a day. Each one names the
   sender, the age, and why it is there, with Open, Reply, Make a task and
   Not mine.
7. **Worlds** — every area with its progress bar, tapping filters the view.
8. **Open work** — the last 30 days by default, with older work one tap
   away. Flags, due dates and delegated items are never windowed out.
9. **With someone else**, then **Done today**.

## Running locally

```
npm install
npm run dev        # or: npm run build && npm start
```

With no `SUPABASE_URL` configured the app uses a file-backed local dev store
(`.dev-store.json`, gitignored) seeded with the same starter data — same
API, same logic, so everything is testable before touching production.
Production always has `SUPABASE_URL` set, so the dev store never runs there.
The committed `.env.example` lists every variable; local dev needs
`APP_PASSPHRASE_HASH` (see `npm run hash`), `SESSION_SECRET`, and
`CONRAD_API_SECRET`. Connectors are optional locally: with none configured
every source panel honestly reads "not connected".

Note on `.env.local`: bcrypt hashes contain `$` characters and Next's env
loader expands them. `npm run hash` prints the correctly escaped line.

## Verification

```
npm run typecheck                 # strict TS, no errors
npm run build                     # production build
npm run check:bundle              # secret-leak gate (also in the Netlify build)
npm run parse:test                # connector parser fixtures, no network needed
npm run dashboard:test            # dashboard contract, against a running server
npm run conrad:test               # Conrad contract, against a running server
bash scripts/verify-phase1.sh     # original Phase 1 acceptance checks
```

`DASHBOARD.md` records what each rule in Brad's Daily Dashboard Protocol
maps to in code, and the results of the last full run.

## Deploying

Everything requiring an account or secret is a human step, walked through in
`RUNBOOK.md` (Supabase, GitHub, Netlify, passphrase, `CONRAD_API_SECRET`,
Google OAuth) and `DASHBOARD.md` (the Azure app registration for Outlook,
the migration, and the morning warm task).

## Guardrails honored

Single user. Read-only on every connector: there is no send, accept, or
delete path anywhere in `lib/graph.ts` or `lib/google.ts`. Progress is
derived, never stored. No number is ever typed into a component or baked
into a build.
