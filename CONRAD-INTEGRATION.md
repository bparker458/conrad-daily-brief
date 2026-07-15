# Conrad Integration Contract (Face B)

Conrad is Brad's substrate AI, running in his Cowork session on the Mac Studio,
driven from the phone via Dispatch. Conrad reads and writes **the same list**
Brad's phone uses, through the same API. A task Brad speaks to Conrad appears
on his phone; a task he taps done on his phone reads as done to Conrad. Both
go through one door, so the two faces can never disagree.

This document is written so it can be dropped into Conrad's instructions
almost verbatim.

---

## Base URL and auth

```
BASE = https://<the-netlify-site>.netlify.app
```

Every request carries the bearer secret (from Brad's substrate credentials,
held server-side on the Mac Studio — never in a browser):

```
Authorization: Bearer <CONRAD_API_SECRET>
Content-Type: application/json
```

A request without the secret (or with a wrong one) gets `401 {"error":"unauthorized"}`.
Errors always look like `{"error":"<what happened>"}` with a real HTTP status.
Never treat a non-2xx as success.

Note for local testing: the Netlify **site password** (Basic Auth) protects the
HTML pages for humans. API calls from Conrad go to the same host; if site-wide
protection is set to cover everything, include the Basic Auth header as well,
or have Marshall scope protection to page routes. This is a deploy-time detail,
listed in RUNBOOK.md.

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
  "source": "voice"
}
```

Optional fields: `note`, `projectId`, `flag` (`none|amber|red`), `dueDate` (`YYYY-MM-DD`).
Unknown or empty `area` lands in `inbox` automatically.

Response `201`:

```json
{
  "id": "3f6a1c2e-9d41-4b7a-a1b2-6c9e2f8d4a10",
  "areaId": "dash-farms",
  "projectId": null,
  "title": "Rent the brush machine",
  "note": "",
  "status": "open",
  "flag": "none",
  "delegatedTo": null,
  "dueDate": null,
  "unsure": false,
  "conradNote": "",
  "source": "voice",
  "createdAt": "2026-07-13T17:40:00.000Z",
  "doneAt": null,
  "sortOrder": 0
}
```

It is on Brad's phone the next time the brief loads. Nothing else to do.

## 2. List what's open (by area)

`GET /api/tasks?area=dash-farms` — open + waiting tasks (done excluded by default)
`GET /api/tasks?area=all` — everything open across all worlds
`GET /api/tasks?area=dash-farms&include=all` — includes done tasks too

Response `200` — array of task objects (same shape as above), sorted
red-flag first, then sort order, then creation time.

To read what Brad finished today: `include=all` and filter `status == "done"`
with `doneAt` on today's date.

## 3. Mark done / waiting / delegate / add note

`PATCH /api/tasks/:id` — send only the fields being changed.

Mark done (the server stamps `doneAt`; it will never reappear):

```json
{ "status": "done" }
```

Reopen (server clears `doneAt`):

```json
{ "status": "open" }
```

Delegate (server also sets `status` to `waiting` automatically):

```json
{ "delegatedTo": "Gretchen" }
```

Pull back from waiting:

```json
{ "status": "open", "delegatedTo": null }
```

Append a note (read the task first, append a dated line, write the whole note):

```json
{ "note": "[Jul 13] Tyler says flooring guy comes Thursday" }
```

Answer an "I'm not sure" flag (Brad tapped the button; `unsure` is true).
Write the suggested next step where the phone will show it inline:

```json
{ "conradNote": "Start with the county assessor's office — ask for the parcel status letter.", "unsure": false }
```

Response `200` — the full updated task. `404` if the id doesn't exist.

## 4. Read progress for a morning brief

`GET /api/areas`

```json
[
  { "id": "dash-farms", "name": "Dash Farms",
    "endInMind": "A profitable farm that runs without me",
    "sortOrder": 1, "done": 2, "total": 5, "pct": 40 }
]
```

`GET /api/progress` — the same per-area rollup plus per-project:

```json
{
  "areas":    [ { "id": "dash-farms", "name": "Dash Farms", "done": 2, "total": 5, "pct": 40 } ],
  "projects": [ { "id": "…", "name": "Orchard revival", "areaId": "dash-farms", "done": 1, "total": 4, "pct": 25 } ]
}
```

Narrate progress from these numbers; never recount from a cached list.

## 5. Sort the Inbox

Captured thoughts default to `inbox`. To file one into its world (and
optionally a project):

`PATCH /api/tasks/:id`

```json
{ "areaId": "properties" }
```

```json
{ "areaId": "dash-farms", "projectId": "9a1a4d3c-…" }
```

## 6. Compose Today's Plan (the morning sweep)

The phone pins a "Today's Plan" section to the top of Brad's All view: every
OPEN task whose `dueDate` is today or earlier, across all worlds. Conrad
composes the day by stamping due dates during the morning sweep:

`PATCH /api/tasks/:id`

```json
{ "dueDate": "2026-07-14" }
```

Remove something from the plan:

```json
{ "dueDate": null }
```

Rules of composition: pick a human-sized day (5 to 8 items) across worlds,
weighted by End in Mind priorities, red flags, and the calendar. Unfinished
picks carry over automatically the next day (the phone marks them
"carried over"), so re-stamp or clear them deliberately rather than letting
the pile grow. Never stamp `waiting` or `done` tasks.

## 7. Health

`GET /api/health` → `{ "status": "ok", "db": "ok" }`. If this fails, say so
plainly and stop; do not report stale task state as current.

## 8. Suggested next steps (`conrad_note` is a shared field)

When Brad taps "I'm not sure" on the phone, the server writes
`unsure=true` and (when `ANTHROPIC_API_KEY` is configured) generates
numbered next steps into `conrad_note` via `POST /api/tasks/:id/suggest`.
The phone renders whatever is in `conrad_note` under "Conrad suggests".

What this means for Conrad (Face B):

- **Sweep the flags.** `GET /api/tasks?area=all` → items with
  `unsure: true` and an empty `conradNote` are Brad saying "I don't know
  what to do here" — priority conversation material for the morning brief.
- **Write better steps any time.** `PATCH /api/tasks/:id` with
  `{ "conradNote": "1. …\n2. …" }` replaces the generated steps with
  Conrad's own (Conrad knows more context than the one-shot generator).
  The phone shows the new text on next load. Same field, either author —
  there is never a second copy of the suggestion.
- **Or trigger generation.** `POST /api/tasks/:id/suggest` with the bearer
  secret works for Conrad too. Response:
  `{ task, suggested: true }` or `{ task, suggested: false, reason }` —
  `suggested: false` still means the unsure flag is set.
- **Clearing.** When Brad and Conrad resolve an item, PATCH
  `{ "unsure": false, "conradNote": "" }` so the card returns to normal.

---

## Rules that keep the two faces honest

1. This API is the only way Conrad touches the list. No local copies, no
   shadow lists, no direct database access.
2. Read before narrate: pull fresh state before telling Brad where things
   stand.
3. Never invent task state. A failed write is reported as a failed write.
4. The secret stays in substrate credentials on the Mac Studio. It never
   appears in chat, in files Brad shares, or in a browser.

## Smoke test

`scripts/conrad-test.mjs` in this repo acts as Conrad end to end (create by
voice → appears in list → mark done → verify → reject without secret):

```
BASE=https://<site>.netlify.app CONRAD_API_SECRET=<secret> npm run conrad:test
```
