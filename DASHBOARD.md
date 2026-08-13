# The dashboard: protocol, implementation, proof

Brad's Daily Dashboard Protocol is a list of rules with reasons behind
them, most of them earned the hard way. This file maps every rule to the
code that keeps it, so the next person to touch this repo can tell whether
a change breaks one.

---

## 1. Live, never a static export

**Rule:** the dashboard pulls fresh data every time it is opened. Rewriting
a file each morning with freshly hardcoded arrays is the same failure in a
different wrapper.

**Where it lives:** `components/Dashboard.tsx` fetches `/api/dashboard` on
mount, on `visibilitychange`, on window focus, on `online`, and every five
minutes. The header prints "Live as of …" with the real age of the payload
and a Check again button.

`app/api/dashboard/route.ts` is `dynamic = "force-dynamic"` and returns
`Cache-Control: no-store`. It calls the store and the connectors on every
request. There is no build-time constant anywhere in the render path, and
`lib/numbers.ts` — the file that used to hold the figures as source code —
is gone. Numbers now come from the `daily_numbers` table.

## 2. A section that cannot load says so

**Rule:** no silent skipping, and no try/catch that swaps in old data while
pretending it is current.

**Where it lives:** `lib/panel.ts` defines one shape for every section:

```
ok | empty | not_configured | unavailable | stale
```

Each panel carries `asOf`, `error`, and `source`. `panelOk` is the only
constructor that stamps `asOf` with the current time, and it is only ever
called with data that was just fetched. `mergePanels` combines Outlook and
Gmail without letting one failure hide behind the other: if one provider
works and the other does not, the panel returns the working data AND names
the broken one in `error`, which the UI renders as "Partly loaded".

`components/dashboard/Panels.tsx` has exactly one component, `PanelState`,
that decides what a non-ok panel renders. It has no branch that returns
nothing.

The service worker is the sneaky case, because it can serve a cached
response without the app knowing. `public/sw.js` re-wraps any cache
fallback with an `x-from-cache: 1` header; `Dashboard.tsx` reads it and
shows an "Offline copy" banner with the age. Connector endpoints
(`/api/mail`, `/api/calendar`, `/api/signals`, `/api/events`) are network
only in the worker — a stale connector read is worse than an honest
failure.

## 3. "Needs attention" is always a named thing

**Rule:** never a vague count.

**Where it lives:** the mail panel prints the sender, the subject, how long
it has been sitting, and why it surfaced ("you flagged it", "priority
sender", "sitting unanswered"). The week strip's counts are all clickable
context around lists of actual named items, not a bare number. Calendar
rows name the organizer, the attendee count and the location, and flag the
ones that need prep.

## 4. Open items have a durable home, and the checkbox round-trips

**Rule:** an item needs a record with its area, where it came from, when it
was created and its status. Ticking it must flip that record and log the
resolution, or the checkbox must not exist.

**Where it lives:** two tables in `supabase/migrations/002_dashboard.sql`.

`signals` is the durable record of what a source said: kind, source,
external id, person, url, when it happened, and Brad's decision about it
(`open`, `acknowledged`, `converted`, `dismissed`). It is unique on
`(source, external_id)`, so re-running a sweep updates rather than
duplicates, and a dismissed item stays dismissed across every future pull
(`lib/sources.ts`, `persistAndFilter`).

`task_events` is the log. Every PATCH in `app/api/tasks/[id]/route.ts`
writes the events it earned: done, reopened, delegated, pulled_back, noted,
planned, unplanned, flagged, converted. `GET /api/events` is what Conrad
reads to know something was resolved so it stops resurfacing.

Tasks gained `source_ref` (plain English provenance, shown on the card as
"From: Email from Nick Stanley, Aug 13") and `origin_signal_id` (the link
home). Converting a signal into a task sets both, in one call:
`PATCH /api/signals/:id` with `convertTo`.

## 5. 30 days by default, and This Week leads

**Rule:** the daily view defaults to about the last 30 days. This Week sits
above the grouped list.

**Where it lives:** `withinWindow` in `lib/derive.ts`, applied by
`/api/tasks` and `/api/dashboard`. Age is a decluttering rule, not a way to
lose work: anything flagged red or amber, anything with a due date, and
anything delegated is never windowed out. Older open items appear behind
one "Show N older" tap rather than disappearing.

This Week is the first section after the status strip, computed from
Monday-start bounds in Brad's own time zone (`weekBounds`, `ymdInTz`) — not
the server's UTC day, which is how a 6am brief ends up showing yesterday.

## 6. Keep it warm

**Rule:** a scheduled task runs on weekday mornings before Brad's start
time so the dashboard opens with current data.

**Where it lives:** `POST /api/warm` (GET also works, so a plain scheduled
fetch is enough). It probes every connector, pulls mail and calendar,
writes the signal rows and the source health, and returns exactly what
happened, including which sources are merely not connected versus actually
broken.

Set it up as a scheduled task hitting:

```
POST https://<site>.netlify.app/api/warm
Authorization: Bearer <CONRAD_API_SECRET>
```

on weekdays around 5:15am Pacific, before Jessica's recap lands and before
Brad is up.

---

## Setting up Outlook (the one new human step)

Everything else is already in `RUNBOOK.md`. Microsoft Graph is new.

1. **Azure portal → App registrations → New registration.**
   Name it "Conrad Dashboard". Supported account types: accounts in this
   organizational directory.
2. **Authentication → Add a platform → Mobile and desktop applications.**
   Redirect URI: `http://localhost:5599/callback`. This is only used once,
   to mint the refresh token from a laptop.
3. **Certificates & secrets → New client secret.** Copy the *value*
   immediately; it is only shown once.
4. **API permissions → Microsoft Graph → Delegated permissions.** Add
   `offline_access`, `Mail.Read`, `Calendars.Read`, `User.Read`. These are
   read-only by design: there is no send or accept scope, so the app
   cannot act in Brad's name even if someone later asks it to.
5. **Mint the token** on any machine with this repo:

   ```
   MS_CLIENT_ID=… MS_CLIENT_SECRET=… MS_TENANT_ID=… npm run ms:token
   ```

   Sign in as Brad, approve, and it prints `MS_REFRESH_TOKEN=…`.
6. **Netlify → Site settings → Environment variables.** Add `MS_CLIENT_ID`,
   `MS_CLIENT_SECRET`, `MS_TENANT_ID`, `MS_REFRESH_TOKEN`, and
   `PRIORITY_SENDERS` (comma separated, lowercase — the people whose unread
   mail should surface immediately instead of waiting out the 24 hour rule).
7. **Run the migration.** Supabase SQL editor →
   `supabase/migrations/002_dashboard.sql`. It is safe to run more than
   once and it drops nothing.

Until step 6 is done the dashboard runs fine and the mail and calendar
panels say "not connected" in plain words. That is the intended behaviour,
not a bug.

---

## Verification run

Run against the local dev store, production build, on the day of the
rebuild.

```
npm run typecheck        no errors
npm run build            compiled, 20 routes
npm run check:bundle     clean — no server secrets in the client bundle
npm run parse:test       20/20 parser fixtures pass
npm run dashboard:test   31/31 dashboard contract checks pass
npm run conrad:test      12/12 Conrad contract checks pass (unchanged)
```

The failure path was exercised deliberately, with connector credentials
present but unreachable:

```
tasks     status=ok            n=14
mail      status=unavailable   Outlook: Could not reach Microsoft sign-in …
                               · Gmail: Could not reach Google sign-in …
calendar  status=unavailable   Outlook calendar: … · Google Calendar: …
numbers   status=ok            n=1

source_health
  outlook           lastOk=null  lastError=Could not reach Microsoft sign-in
  gmail             lastOk=null  lastError=Could not reach Google sign-in
  outlook-calendar  lastOk=null  lastError=Could not reach Microsoft sign-in
  google-calendar   lastOk=null  lastError=Could not reach Google sign-in
  task-store        lastOk=<now>
```

Two connectors down, the task list still correct, nothing stale
substituted, every failure named on screen. That is the whole point.
