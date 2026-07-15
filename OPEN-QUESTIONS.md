# Open Questions and Judgment Calls

Per Section 0 of the handoff: where a decision wasn't specified, the
simplest choice that upholds the Prime Directive was made and logged here.
Open questions are for Marshall; none block deploy.

## Open questions (for Marshall)

1. **Nudge emails have no addresses.** The handoff specifies a one-tap
   "Nudge <name>" mailto for delegated tasks, but no email addresses for
   Gretchen / Jessica / Ross / Amber / Chris were provided. The button
   currently opens a pre-filled compose (subject + body) with the To field
   empty, so Brad picks the person from his contacts in one tap. If you want
   the addresses baked in, supply them and it's a five-line change.
2. **No project-creation endpoint.** Section 6 defines no POST /api/projects,
   and Section 13 forbids adding features, so projects are created directly
   in Supabase (Table Editor or SQL) for now. Conrad can already FILE tasks
   into projects via PATCH. If Conrad should also create projects, that's a
   contract addition for you to approve.
3. **Netlify site password vs the API.** Depending on plan settings, Netlify
   site protection may also challenge `/api/*` with Basic Auth. Conrad's
   calls then need that header too (noted in CONRAD-INTEGRATION.md and
   RUNBOOK step 4). Decide at deploy time; test with `npm run conrad:test`
   against the live URL.
4. **Google OAuth token longevity.** With an External consent screen in
   Testing mode, Google may expire refresh tokens for sensitive scopes after
   7 days. RUNBOOK step 7 flags it; if the token dies weekly, the fix is
   publishing the consent screen. Watch it after enabling Phase 3.
5. **Phase 4 not built** (explicitly optional): activity log, web-push
   nudges, in-app End-in-Mind editing, richer offline queueing.

## Judgment calls made (logged, not blocking)

- **Local dev store.** With no Supabase project yet (Marshall step), a
  file-backed store (`.dev-store.json`) runs behind the same API in local
  dev only. Production always has SUPABASE_URL, so it can never become a
  second source of truth. This is what let every checklist item be verified
  before the database exists.
- **"Unavailable" vs "not configured" (Phase 3).** Until Google credentials
  exist, the Today/Inbox sections stay hidden entirely; "unavailable" is
  reserved for real failures of a configured integration. Honest both ways,
  and Brad never stares at a permanent error for a feature that isn't on yet.
- **Done today.** The count and faded list show tasks completed today (Brad's
  timezone); older completions still count toward every progress bar. The
  handoff says "Done today: N" — this reads it literally.
- **Session length 180 days.** Single user, plus Netlify password as outer
  gate; Brad shouldn't retype a passphrase weekly on his own phone.
- **Unsure suggestions.** Phase 1 sets the flag and shows "Flagged for
  Conrad." If Conrad later writes `conradNote`, the phone shows that text
  inline on the card — the "suggestion endpoint" is simply Conrad answering
  through the shared store.
- **Offline queue scope.** Failed writes queue in localStorage and retry
  (12s interval + on reconnect); "Saved ✓" only fires on confirmed server
  writes. Actions on a not-yet-synced capture are disabled until it syncs —
  simplest safe behavior; richer queueing is Phase 4.
- **Today's Plan (added 7/13 post-launch, Marshall's call).** Open tasks with
  `due_date` on or before today pin to a cross-world "Today's Plan" section at
  the top of the All view; earlier-dated unfinished items read "carried over."
  Composition is Conrad's job via PATCH `dueDate` (contract section 6) or
  Supabase's table editor until he's wired. Deliberately NO date picker in the
  capture sheet: capture stays frictionless, scheduling stays with Conrad.
- **bcrypt over argon2.** bcryptjs is dependency-free and serverless-safe;
  fine for a passphrase behind two other gates.
- **Git author.** Commits are authored "Lenny (AuthenticUS build agent)
  <msnider@authenticus.us>" so history lands under Marshall's identity.

## Step-writer judgment calls (2026-07-15, "I'm not sure" upgrade)

- **Default model `claude-sonnet-5`**, overridable via `CONRAD_SUGGEST_MODEL`.
  Chosen for step quality on farm/property/finance tasks; single-user cost
  is negligible either way.
- **8-second generation timeout.** Netlify route handlers get ~10s; the
  flag write happens BEFORE the model call, so a timeout degrades to
  exactly the old behavior ("Flagged for Conrad" + an "Ask Conrad again"
  link). Nothing is lost, nothing blocks.
- **Steps live in `conrad_note`** — the field Conrad (Face B) already owns
  via PATCH. Conrad can overwrite the generated steps with better ones;
  the phone renders whichever text is current. One field, one truth.
- **No regenerate-on-every-tap.** "I'm not sure" appears once per task;
  "Ask Conrad again" appears only when no steps arrived. Brad never sits
  watching a spinner for steps he already has.
- **"Add these steps as tasks" deliberately deferred** — candidate fast
  follow once Brad has reacted to the inline version.
