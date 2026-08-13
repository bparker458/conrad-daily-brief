-- Conrad Command Dashboard — migration 002
--
-- Adds the durable homes the dashboard needs so that nothing on screen
-- is re-derived at render time or typed into code:
--
--   signals        what a source said wants attention, and what Brad
--                  decided about it (dismissed / converted into a task)
--   daily_numbers  the La-Z-Boy recap figures, one row per business day
--   source_health  what worked, what broke, when
--   task_events    the durable log the checkbox writes to
--
-- Plus two columns on tasks so every task can answer "where did this
-- come from" without a second lookup.
--
-- Safe to run more than once. Run it in the Supabase SQL editor after
-- schema.sql. Nothing in here drops or rewrites existing rows.

/* ── enums ───────────────────────────────────────────── */

do $$ begin
  create type signal_kind as enum ('mail','calendar','chat','numbers','note');
exception when duplicate_object then null; end $$;

do $$ begin
  create type signal_status as enum ('open','acknowledged','converted','dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_event_kind as enum
    ('created','done','reopened','delegated','pulled_back','noted',
     'planned','unplanned','flagged','converted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_event_actor as enum ('phone','conrad');
exception when duplicate_object then null; end $$;

-- 'signal' joins the existing task_source enum: tasks born from an email
-- or a meeting are neither phone capture nor voice capture.
do $$ begin
  alter type task_source add value if not exists 'signal';
exception when undefined_object then null; end $$;

/* ── signals ────────────────────────────────────────── */

create table if not exists signals (
  id                uuid primary key default gen_random_uuid(),
  kind              signal_kind   not null default 'note',
  source            text          not null,
  external_id       text          not null,
  area_id           text references areas(id),
  title             text          not null,
  detail            text          default '',
  person            text          default '',
  person_email      text          default '',
  url               text          default '',
  occurred_at       timestamptz   not null default now(),
  status            signal_status not null default 'open',
  converted_task_id uuid references tasks(id) on delete set null,
  created_at        timestamptz   default now()
);

-- One row per thing in the world. Re-running a sweep updates, never duplicates.
create unique index if not exists signals_source_external_idx
  on signals (source, external_id);
create index if not exists signals_status_occurred_idx
  on signals (status, occurred_at desc);

/* ── daily numbers ────────────────────────────────────── */

create table if not exists daily_numbers (
  id                    uuid primary key default gen_random_uuid(),
  business              text        not null default 'la-z-boy',
  results_through       date        not null,
  written               numeric     not null,
  to_goal_pct           numeric     not null,
  to_adjusted_goal_pct  numeric     not null,
  to_last_year_pct      numeric     not null,
  source                text        default '',
  recorded_at           timestamptz not null default now()
);

-- A corrected recap replaces the earlier one for that day rather than
-- stacking a second version of the truth.
create unique index if not exists daily_numbers_business_day_idx
  on daily_numbers (business, results_through);

/* ── source health ────────────────────────────────────── */

create table if not exists source_health (
  source        text primary key,
  last_ok_at    timestamptz,
  last_error_at timestamptz,
  last_error    text default '',
  detail        text default ''
);

/* ── task events ─────────────────────────────────────── */

create table if not exists task_events (
  id      uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind    task_event_kind  not null,
  actor   task_event_actor not null default 'phone',
  detail  text default '',
  at      timestamptz not null default now()
);

create index if not exists task_events_task_idx on task_events (task_id, at desc);
create index if not exists task_events_at_idx    on task_events (at desc);

/* ── task provenance ─────────────────────────────────── */

alter table tasks add column if not exists source_ref       text default '';
alter table tasks add column if not exists origin_signal_id uuid references signals(id) on delete set null;

create index if not exists tasks_due_status_idx on tasks (due_date, status);

/* ── access ─────────────────────────────────────────── */

-- Server-only via the service role, which bypasses RLS. Enable RLS and
-- add NO public policies so nothing is reachable with an anon key.
alter table signals       enable row level security;
alter table daily_numbers enable row level security;
alter table source_health enable row level security;
alter table task_events   enable row level security;
