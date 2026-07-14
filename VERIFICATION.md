# Verification Record

Build-time verification by the build agent (Fable 5), 2026-07-13, against the
production build (`next build` + `next start`) with the local dev store
behind the API. Every claim below was executed, not assumed. Items that can
only be proven on real infrastructure are listed honestly as deferred, with
the RUNBOOK step that covers them.

## Phase 1 — foundation + phone brief

Automated: `scripts/verify-phase1.sh` (17 checks) — ALL PASSED.

- [x] Check a task done, hard-reload: still done, off the active list.
      Proven harder than asked: task marked done, server process killed,
      server restarted — status `done`, absent from default list, present
      via `include=all`, area progress correct (spray-the-peaches test).
- [x] Add a task with `+`: POSTs and appears in the chosen area; unknown or
      empty area lands in Inbox.
- [x] Checking tasks moves area progress (0/5 → 1/5 observed via /api/areas)
      and "Done today" (client derives from the same rows).
- [x] Delegating sets `waiting` + `delegatedTo` (moves to "Waiting on
      others"); pull back returns it to `open`.
- [x] "I'm not sure" sets `unsure=true` and persists.
- [x] Passphrase gate blocks without the phrase (401; page shows gate);
      wrong passphrase 401; no auth on /api/tasks 401.
- [x] No Supabase key in the client bundle: `check-bundle.mjs` scans
      .next/static for secret names AND live env values — clean, and wired
      into the Netlify build command so a future leak fails the deploy.
- [x] Builds with zero errors/warnings; page serves gate (no cookie) and
      brief shell (cookie) correctly; manifest, sw.js, icons all 200.
- [~] iOS home-screen install + standalone open: all required pieces are in
      place and served (manifest `display: standalone`, apple-touch-icon,
      `apple-mobile-web-app-capable`, theme color, safe-area insets) but a
      real iPhone is required — RUNBOOK step 5, do it with Brad.
- [~] "Loads with no console errors" was verified as: production build
      compiles clean, all endpoints return well-formed JSON, HTML renders.
      Final browser-console pass happens on the live Netlify URL (RUNBOOK
      step 4 sanity check).

## Phase 2 — Conrad contract

Automated: `scripts/conrad-test.mjs` (11 checks) — ALL PASSED.

- [x] Task created via `Authorization: Bearer` appears in the shared list
      (same rows the phone face reads).
- [x] Task checked done by the phone face reads `done` to Conrad via
      `GET /api/tasks?include=all` (cross-face test executed both ways).
- [x] Requests without the secret → 401; wrong secret → 401.
- [x] Voice capture, inbox default, inbox sort (PATCH areaId), delegate,
      conradNote write-back, progress reads — all round-trip.

## Phase 3 — Google (read-only) + rollups

Automated: `scripts/google-parse-test.mjs` (7 checks) — ALL PASSED.

- [x] Progress rolls up task → project → area (seeded a project with 2
      linked tasks, 1 done: project 1/2 = 50%, area math consistent).
- [x] Failure honesty: with no credentials the endpoints return
      `not_configured` (sections stay off); with bad credentials against
      real Google they return `unavailable` — never stale or fake data.
      Both states exercised live.
- [x] Auth required on both Google endpoints (401 without).
- [x] Calendar/Gmail parsers verified against fixture payloads (timed,
      all-day, cancelled events; subject/from/snippet extraction).
- [~] "Today's events render from Google Calendar" with real data requires
      the OAuth credentials that only Marshall can create — RUNBOOK step 7,
      then re-open the app and eyeball the Today card.

## Security checks

- [x] RLS enabled with no public policies (schema.sql); server-only
      service-role access; API is the single door.
- [x] Secret-leak gate in the build pipeline (fails the Netlify deploy).
- [x] httpOnly, SameSite=Lax, Secure(prod) session cookie; HMAC-signed,
      constant-time compares for both cookie and bearer.
- [x] Bad bearer never falls through to cookie auth.
- [x] No analytics, no external logging of task titles.

## Deferred to live deploy (all covered in RUNBOOK.md)

Netlify build + site password behavior with `/api/*`, real iPhone install,
real Google render, `conrad:test` against the live URL.
