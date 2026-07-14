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
- **bcrypt over argon2.** bcryptjs is dependency-free and serverless-safe;
  fine for a passphrase behind two other gates.
- **Git author.** Commits are authored "Lenny (AuthenticUS build agent)
  <msnider@authenticus.us>" so history lands under Marshall's identity.
