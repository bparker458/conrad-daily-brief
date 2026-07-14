# Conrad Daily Brief

One personal command surface for Brad Parker, across two faces that share one
list. Face A is the phone Daily Brief in this repo — a PWA Brad installs to
his iPhone home screen. Face B is Conrad, his substrate AI, which connects
through the same API (see `CONRAD-INTEGRATION.md`).

**Prime directive:** one shared list is the single source of truth. Every
surface reads from and writes to it, and the brief is always rendered from
the same rows the checkbox writes to. That is the rule that kills the
reappearing-task bug.

```
Phone Daily Brief ─┐
                   ├─►  /api/*  ──►  Supabase (tasks, areas, projects)
Conrad (Dispatch) ─┘
```

## Stack

Next.js 14 (App Router) + TypeScript, Tailwind, Supabase (Postgres, server-only
via service role), PWA (manifest + service worker), Netlify with
`@netlify/plugin-nextjs`. Auth: bcrypt passphrase gate → httpOnly signed
session cookie for the phone; `Authorization: Bearer CONRAD_API_SECRET` for
Conrad. No Supabase key ever ships to the browser (enforced at build time by
`scripts/check-bundle.mjs`).

## Layout

```
app/api/…            the single door to the store (session, areas, tasks,
                     tasks/[id], progress, health, google/today, google/inbox)
components/          Brief (the phone face), Gate (passphrase)
lib/                 store selector, Supabase store, local dev store, auth,
                     derive (progress + sort), google (Phase 3, read-only)
supabase/            schema.sql + seed.sql (run once in the SQL editor)
scripts/             verify-phase1.sh, conrad-test.mjs, google-parse-test.mjs,
                     check-bundle.mjs, hash-passphrase.mjs,
                     google-refresh-token.mjs
public/              manifest, service worker, icons
```

## Running locally

```
npm install
npm run dev        # or: npm run build && npm start
```

With no `SUPABASE_URL` configured the app uses a file-backed local dev store
(`.dev-store.json`, gitignored) seeded with the Section 10 data — same API,
same logic, so everything is testable before the Supabase project exists.
Production always has `SUPABASE_URL` set, so the dev store never runs there
(it would not persist on serverless anyway). The committed `.env.example`
lists every variable; local dev needs `APP_PASSPHRASE_HASH` (see
`npm run hash`), `SESSION_SECRET`, and `CONRAD_API_SECRET`.

Note on `.env.local`: bcrypt hashes contain `$` characters and Next's env
loader expands them. `npm run hash` prints the correctly escaped line.

## Verification

```
bash scripts/verify-phase1.sh     # Phase 1 acceptance (17 checks) against a running server
npm run conrad:test               # Phase 2 Conrad contract (11 checks)
node scripts/google-parse-test.mjs# Phase 3 parser fixtures
npm run check:bundle              # secret-leak gate (also runs in the Netlify build)
```

`VERIFICATION.md` records the results of the build-time runs, including the
persistence-across-restart test (task checked done, server killed and
restarted, task still done).

## Deploying

Everything requiring an account or secret is a human step, walked through in
`RUNBOOK.md`: Supabase project + schema/seed, GitHub repo, Netlify site +
env vars + site password, passphrase hash, `CONRAD_API_SECRET`, and (Phase 3)
the Google OAuth app.

## Decisions made where the handoff left room

Logged with reasoning in `OPEN-QUESTIONS.md`. The notable ones: local
file-backed dev store behind the same API for pre-Supabase development;
Google sections stay hidden until configured ("unavailable" is reserved for
real failures); nudge emails open a pre-filled compose with no address on
file yet; session cookie lives 180 days (single user, two outer gates).

## Guardrails honored

Single user. No Microsoft/Outlook anywhere. No features beyond the handoff.
Progress is derived, never stored. End-in-Mind text is seed placeholder —
Marshall's vision sessions replace it. Conrad itself is not built here; the
store and contract are.
