# RUNBOOK — Marshall's Steps to Go Live

Everything the code can't do without accounts, secrets, or a card. Work top
to bottom; each step says what you're doing, what to expect, and what can go
wrong. Nothing here requires reading code.

Have ready: the GitHub account, the Netlify account (Authenticus team), a
Supabase account, and Brad's chosen passphrase.

---

## 1. Supabase project (the database)

What this is: the one shared list lives in a hosted Postgres database.

1. supabase.com → New project. Name it `conrad-daily-brief`, region **US West
   (Oregon)**. Set a strong database password (Supabase keeps it; the app
   never uses it directly).
2. When the project finishes provisioning, open **SQL Editor** → New query.
   Paste the entire contents of `supabase/schema.sql` → Run. Expect
   "Success. No rows returned."
3. New query again. Paste `supabase/seed.sql` → Run. Expect a success notice
   (7 areas, 12 tasks inserted).
4. Project Settings → **API**. Copy two values:
   - `Project URL` → this becomes `SUPABASE_URL`
   - `service_role` key (under "Project API keys" — the SECRET one, not anon)
     → this becomes `SUPABASE_SERVICE_ROLE_KEY`

Failure modes: running seed before schema errors ("relation does not
exist") — run schema first. Running seed twice duplicates tasks — if that
happens, Table Editor → tasks → delete the duplicates.

The service_role key bypasses all row security. It only ever lives in
Netlify's environment settings (server side). Never put it anywhere else.

## 2. GitHub repo

1. Create a private repo (suggested: `LZB-Oregon/conrad-daily-brief`, same
   pattern as pat-norton).
2. From your terminal, in the project folder:

```
git remote add origin git@github.com:LZB-Oregon/conrad-daily-brief.git
git push -u origin main
```

What it does: uploads the three phase commits. Expect a summary ending in
`main -> main`.

## 3. Secrets

Run these in your terminal from the project folder (after `npm install`).

1. Brad's app passphrase — pick it with him, then:

```
npm run hash -- "the exact passphrase"
```

   It prints the value for `APP_PASSPHRASE_HASH` in two formats — the plain
   one is for Netlify's UI.

2. Two random secrets (run twice, keep the outputs separate):

```
openssl rand -hex 32
```

   First output → `SESSION_SECRET`. Second → `CONRAD_API_SECRET`.

3. Put `CONRAD_API_SECRET` in Brad's substrate credentials on the Mac Studio
   (Clients/LZB pattern) so Conrad can authenticate. It never goes in a
   browser or a chat.

## 4. Netlify site

1. Netlify → Add new site → **Import an existing project** → pick the GitHub
   repo. Build settings are read from `netlify.toml` automatically (build
   command `npm run build:netlify`, publish `.next`, Next.js plugin). Accept.
2. Before the first deploy finishes, go to Site configuration →
   **Environment variables** and add:

```
SUPABASE_URL                (from step 1)
SUPABASE_SERVICE_ROLE_KEY   (from step 1)
APP_PASSPHRASE_HASH         (from step 3 — paste the plain hash, no backslashes)
SESSION_SECRET              (from step 3)
CONRAD_API_SECRET           (from step 3)
NEXT_PUBLIC_APP_NAME        Daily Brief
```

3. Trigger a redeploy (Deploys → Trigger deploy). The build fails on purpose
   if any secret leaks into the browser bundle — that's the
   `check-bundle` gate doing its job. A normal build ends green.
4. **Site password:** Site configuration → Site protection → set a password.
   This is the outer gate; give it to Brad once, Safari remembers it.
   Note: if site protection also challenges API calls, Conrad needs the same
   Basic Auth header, or scope protection to exclude `/api/*` — check which
   options your Netlify plan shows and test `npm run conrad:test` against the
   live URL.
5. Optional: Domain management → give it a friendlier name like
   `brad-daily-brief.netlify.app`.

Sanity check: open the site URL in a browser. Expect the Netlify password
prompt, then the navy "Daily Brief" passphrase gate. Enter Brad's passphrase;
the seeded worlds should load. Check something done, hard-reload — it stays
done. That's the whole point proven live.

## 5. Brad's iPhone install (2 minutes, do it with him)

1. Open the site URL in **Safari** on his phone (not Chrome).
2. Enter the Netlify site password, then his passphrase.
3. Tap the Share button → **Add to Home Screen** → "Daily Brief" → Add.
4. Open it from the home-screen icon: full screen, no browser chrome.

He should tap a task done and watch the bar move. Show him the + button and
the dictation mic on the keyboard.

## 6. Conrad hookup (Phase 2 — when you wire Face B)

1. `CONRAD-INTEGRATION.md` is written to drop into Conrad's instructions;
   fill in the live site URL and point Conrad at the secret in his
   credentials file.
2. Smoke-test from your machine first:

```
BASE=https://<site>.netlify.app CONRAD_API_SECRET=<secret> npm run conrad:test
```

   Expect "CONRAD CONTRACT: ALL CHECKS PASSED". (This creates and completes a
   couple of test tasks named "Conrad … test" — they end up in Done, harmless,
   deletable in Supabase's Table Editor if you care.)

## 7. Google calendar + inbox (Phase 3, read-only, optional to enable)

What Brad gets: a "Today" card from his Google Calendar and a "From the
inbox" section showing mail from the last 2 days matching his money words
(closing, escrow, insurance, refi, title, tax, farm, lease). Until this step,
those sections simply don't appear — no nagging.

1. console.cloud.google.com → new project `conrad-daily-brief`.
2. APIs & Services → Library → enable **Google Calendar API** and
   **Gmail API**.
3. APIs & Services → OAuth consent screen → External → fill the two required
   fields → add Brad's Gmail address as a **test user**. (Testing mode is
   fine permanently for a single user; refresh tokens for test users expire
   after 7 days ONLY for "external unverified" apps requesting sensitive
   scopes — if the token dies weekly, the fix is publishing the app or using
   an internal Workspace account. Note it and see how it behaves.)
4. Credentials → Create credentials → OAuth client ID → **Desktop app**.
   Copy the client ID and client secret.
5. In the project folder:

```
node scripts/google-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
```

   Follow its three steps signed in as BRAD's Google account (read-only
   scopes). It prints `GOOGLE_REFRESH_TOKEN`.
6. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` to
   Netlify env vars → redeploy.
7. Open the app: today's events should render. If Google is down or the
   token dies, the sections say "unavailable" — they never show stale or
   fake data.

## 8. Passphrase or secret rotation (later, when needed)

New passphrase: `npm run hash`, update `APP_PASSPHRASE_HASH` in Netlify,
redeploy. New Conrad secret: `openssl rand -hex 32`, update Netlify AND
Brad's credentials file. Session cookies die on their own when
`SESSION_SECRET` changes.

## 9. Conrad's step-writer (the "I'm not sure" brain)

One env var turns it on. Without it the button still works — it flags the
task for Conrad and says so honestly. With it, Brad gets numbered next
steps on the card in a few seconds.

1. Get an Anthropic API key (console.anthropic.com → API Keys). Marshall's
   key is fine to start; swap in Brad's later — nothing else changes.
2. Netlify → Site configuration → Environment variables → add
   `ANTHROPIC_API_KEY`. Paste the key value directly into the Netlify form.
   Do NOT paste the key into chat, a text, or a shared doc.
3. Trigger a redeploy (Deploys → Trigger deploy → Deploy site).
4. Prove it on the phone: open a farm task ("Spray and prune the peach
   trees"), tap "I'm not sure" → "Conrad is thinking…" → numbered steps
   appear and SURVIVE a hard reload (they live in `conrad_note`, same rows
   as everything else).
5. Optional: `CONRAD_SUGGEST_MODEL` env var overrides the default model
   (`claude-sonnet-5`). Leave it unset unless you have a reason.

Cost note: single user, a few dozen taps a month — pennies. No usage cap
needed at this scale.
