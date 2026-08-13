# Conrad Integration Contract (Face B)

Conrad is Brad's substrate AI, running in his Cowork session, driven from
the phone via Dispatch. Conrad reads and writes **the same list** Brad's
phone uses, through the same API. A task Brad speaks to Conrad appears on
his phone; a task he taps done on his phone reads as done to Conrad. Both
go through one door, so the two faces can never disagree.

This document is written so it can be dropped into Conrad's instructions
almost verbatim.

Everything in the original contract still works exactly as written. The
dashboard rebuild **added** endpoints; it changed no existing behaviour.

---

## Base URL and auth

```
BASE = https://<the-netlify-site>.netlify.app
```

Every request carries the bearer secret (from Brad's substrate credentials,
held server-side — never in a browser):

```
Authorization: Bearer <CONRAD_API_SECRET>
Content-Type: application/json
```

A request without the secret (or with a wrong one) gets `401 {"error":"unauthorized"}`.
Errors always look like `{"error":"<what happened>"}` with a real HTTP status.
Never treat a non-2xx as success.

## Area ids

`inbox`, `dash-farms`, `la-z-boy`, `trakwell`, `estate`, `properties`, `personal`

When guessing an area from a voice capture, guess conservatively; anything
uncertain goes to `inbox` — sorting later is cheap, mis-filing is not.

---

## 1. Add a task from a voice brain-dump

`POST /api/tasks`

```json
{
  "area": "dash-farms",
  "title": "Rent the brush machine",
  "source": "voice",
  "sourceRef": "Voice note on the drive, Aug 13"
}
```

Optional fields: `note`, `projectId`, `flag` (`none|amber|red`), `dueDate`
(`YYYY-MM-DD`), `sourceRef`, `originSignalId`. Unknown or empty `area`
lands in `inbox` automatically.

**`sourceRef` is new and worth using every time.** It is plain English
provenance, and the dashboard prints it on the card as "From: …". A task
Brad cannot place is a task he will not do. "Email from Nick Stanley, Aug
13", "Said on the Tuesday manager call", "Voice note on the drive" — all
good. It costs one field and it is the difference between a list and a
record.

Response `201` — the full task, now including `sourceRef` and
`originSignalId`.

## 2. List what's open (by area)

```
GET /api/tasks?area=dash-farms          open + waiting (done excluded)
GET /api/tasks?area=all                 everything open across all worlds
GET /api/tasks?area=dash-farms&include=all   includes done
GET /api/tasks?area=all&window=all      no 30-day window (use this for sweeps)
```

**The window is new.** By default the list returns roughly the last 30 days
of activity, because that is what the daily view shows. Red and amber
flags, anything with a due date, and anything delegated are never windowed
out. **For a full sweep, pass `window=all`** — otherwise Conrad will not
see quiet old items.

Response `200` — array of task objects, sorted red-flag first, then sort
order, then creation time.

## 3. Mark done / waiting / delegate / add note

`PATCH /api/tasks/:id` — send only the fields being changed.

```json
{ "status": "done" }                          // server stamps doneAt
{ "status": "open" }                          // server clears doneAt
{ "delegatedTo": "Gretchen" }                 // server sets status waiting
{ "status": "open", "delegatedTo": null }     // pull back
{ "note": "[Aug 13] Tyler says flooring guy comes Thursday" }
{ "conradNote": "1. …\n2. …", "unsure": false }
{ "sourceRef": "Email from Jessica, Aug 12" }
```

Every PATCH now also writes a row to the event log (see §9). Nothing about
the request changes; the log is automatic.

Response `200` — the full updated task. `404` if the id doesn't exist.

## 4. Read progress for a morning brief

`GET /api/areas` and `GET /api/progress` are unchanged.

`GET /api/week` is new and is the one to narrate from:

```json
{
  "today": "2026-08-13",
  "week": { "start": "2026-08-10", "end": "2026-08-16" },
  "counts": { "overdue": 2, "dueToday": 6, "later": 3,
              "flaggedUnscheduled": 1, "doneThisWeek": 9, "waiting": 4 },
  "overdue": [ … ], "dueToday": [ … ], "later": [ … ],
  "flaggedUnscheduled": [ … ]
}
```

Monday-start bounds, computed in Brad's time zone, not the server's. The
dashboard renders from this same computation, so Conrad and the screen can
never disagree about what "this week" means.

## 5. Sort the Inbox

`PATCH /api/tasks/:id` with `{ "areaId": "properties" }`, optionally with
`projectId`. Unchanged.

## 6. Compose Today's Plan (the morning sweep)

Stamp due dates: `PATCH /api/tasks/:id` with `{ "dueDate": "2026-08-14" }`,
or `null` to remove. Unchanged.

Rules of composition: pick a human-sized day (5 to 8 items) across worlds,
weighted by End in Mind priorities, red flags, and the calendar. Unfinished
picks carry over automatically the next day and the dashboard labels them
"carried over from <date>", so re-stamp or clear them deliberately rather
than letting the pile grow. Never stamp `waiting` or `done` tasks.

## 7. Health

`GET /api/health` → `{ "status": "ok", "db": "ok" }`. If this fails, say so
plainly and stop; do not report stale task state as current.

`GET /api/health?deep=1` (with the bearer) also probes every connector and
returns `probes` and `sourceHealth`. Use it when Brad asks why something is
missing from the dashboard.

## 8. Suggested next steps (`conrad_note` is a shared field)

Unchanged. `POST /api/tasks/:id/suggest` flags the task first and then
writes numbered steps into `conrad_note`; Conrad may also PATCH that field
directly with better context. Same field, either author, never a second
copy of the suggestion.

---

## 9. NEW — Signals: what the world said, and what Brad decided

A signal is a thing a source surfaced: an email that wants an answer, a
meeting that needs prep, something said on a call. It is not yet a task.
Signals are how the dashboard remembers that Brad already dealt with
something, so the same email does not reappear every morning forever.

```
GET  /api/signals?status=open&days=30     what is still unhandled
GET  /api/signals?status=all
POST /api/signals                          record one
PATCH /api/signals/:id                     decide about one
```

Create:

```json
{
  "kind": "mail",
  "source": "outlook",
  "externalId": "AAMkAD…",
  "title": "Refi docs need your signature",
  "detail": "Lender needs the signed page by Friday",
  "person": "Nick Stanley",
  "personEmail": "nstanley@crownpointpartners.com",
  "url": "https://outlook.office.com/mail/id/AAMkAD…",
  "occurredAt": "2026-08-13T14:02:00.000Z"
}
```

`kind` is `mail | calendar | chat | numbers | note`. Unique on
`(source, externalId)`, so **re-running a sweep updates rather than
duplicates** — always send the real provider id when there is one, and a
stable string of your own when there is not. A later pull with thinner
metadata will not erase richer earlier metadata.

Decide:

```json
{ "status": "dismissed" }        // gone for good, never resurfaced
{ "status": "acknowledged" }     // seen, still open
{ "areaId": "properties" }       // file it without converting
```

Convert it into a real task, in one call:

```json
{ "convertTo": { "area": "properties", "dueDate": "2026-08-14", "flag": "amber" } }
```

Response: `{ signal, task }`. The task gets `originSignalId` pointing home
and a `sourceRef` written in plain English. The signal is marked
`converted` so it can never double-list.

## 10. NEW — Daily numbers

The La-Z-Boy figures live in the database, one row per business day. They
are no longer a constant in the source code, which means Conrad can post
them the moment Jessica's recap lands instead of waiting on a deploy.

```
GET  /api/numbers?business=la-z-boy
POST /api/numbers
```

Post:

```json
{
  "resultsThrough": "2026-08-12",
  "written": 73005,
  "toGoalPct": 153.8,
  "toAdjustedGoalPct": 88.3,
  "toLastYearPct": 112.4,
  "source": "Jessica's recap (APEX + Trakwell)"
}
```

Upserts on `(business, resultsThrough)`, so a corrected recap replaces the
earlier one rather than stacking a second version of the truth.
`resultsThrough` must be `YYYY-MM-DD` — the day the figures describe, not
the day they were sent.

GET returns a panel: `{ status, data: [row], asOf, isCurrent }`.
`isCurrent` is false when the newest recap has not landed yet, and the
dashboard says so out loud rather than passing old figures off as today's.

## 11. NEW — The event log

```
GET /api/events?limit=100
```

Every task change, in order: `created`, `done`, `reopened`, `delegated`,
`pulled_back`, `noted`, `planned`, `unplanned`, `flagged`, `converted`,
each with `actor` (`phone` or `conrad`) and a timestamp.

**This is what Conrad reads to stop resurfacing things.** If a task shows a
`done` event, it was finished, and by whom. It is also the honest answer to
"what did I actually get done this week".

## 12. NEW — The whole dashboard in one call

```
GET /api/dashboard
```

Returns every panel with its own status, exactly as the phone sees it:
`tasks`, `areas`, `projects`, `signals`, `numbers`, `mail`, `calendar`,
`sourceHealth`, plus `today` and `week`. Each panel is
`{ status, data, asOf, error, source }` where status is one of
`ok | empty | not_configured | unavailable | stale`.

Use this when Brad asks "what does my dashboard say right now" — it is the
same payload, so Conrad's answer and his screen cannot drift.

## 13. NEW — Warming it up

```
POST /api/warm
```

Probes every connector, pulls mail and calendar, writes signals and source
health. Run it on weekday mornings before Brad is up. It reports
`problems` (configured but broken) separately from `notConnected` (never
set up), because those need different responses from you.

---

## Rules that keep the two faces honest

1. This API is the only way Conrad touches the list. No local copies, no
   shadow lists, no direct database access.
2. Read before narrate: pull fresh state before telling Brad where things
   stand.
3. Never invent task state. A failed write is reported as a failed write.
4. Never present a panel's data without its status. If `/api/dashboard`
   says `mail.status = "unavailable"`, tell Brad his mail did not load —
   do not summarize an empty list as "nothing needs you".
5. Use `window=all` for sweeps; the default 30-day window is a display
   rule, not the whole list.
6. Set `sourceRef` on everything you create.
7. The secret stays in substrate credentials. It never appears in chat, in
   files Brad shares, or in a browser.

## Smoke tests

```
BASE=https://<site>.netlify.app CONRAD_API_SECRET=<secret> npm run conrad:test
BASE=https://<site>.netlify.app CONRAD_API_SECRET=<secret> npm run dashboard:test
```

The first proves the original contract still holds end to end. The second
proves the dashboard contract: every panel carries a status, the checkbox
round-trips into the event log, numbers come from stored rows, signals
convert with provenance, and a dismissal stays dismissed.
