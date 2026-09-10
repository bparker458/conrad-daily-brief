-- Conrad Dashboard OS, migration 004 (2026-09-07)
-- ONE file to run, once, in the Supabase SQL editor. It folds in 002 and 003
-- and adds the calendar cache and the new task sources. Every statement is
-- idempotent, so re-running it is harmless.
--
-- After it runs, GET /api/health returns schema.ready = true.

-- 1. task status lifecycle (from 003)
alter type task_status add value if not exists 'candidate';
alter type task_status add value if not exists 'in_progress';
alter type task_status add value if not exists 'blocked';
alter type task_status add value if not exists 'someday';
alter type task_status add value if not exists 'cancelled';

-- 2. task provenance: real sources instead of 'conrad' for everything
alter type task_source add value if not exists 'text';    -- Brad's iMessage self-thread
alter type task_source add value if not exists 'plaud';   -- Plaud recording
alter type task_source add value if not exists 'email';   -- email-monitor candidate sweep
alter type task_source add value if not exists 'manual';

-- 3. task columns (from 003)
alter table tasks
  add column if not exists source_account   text,
  add column if not exists source_link      text,
  add column if not exists waiting_on       text,
  add column if not exists confidence       text default 'user',
  add column if not exists confirmed_at     timestamptz,
  add column if not exists start_after      date,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists next_review_at   date,
  add column if not exists recurrence       text,
  add column if not exists parent_task_id   uuid references tasks(id) on delete set null,
  add column if not exists evidence         text default '';

create index if not exists tasks_status_idx      on tasks (status);
create index if not exists tasks_due_idx         on tasks (due_date) where due_date is not null;
create index if not exists tasks_done_at_idx     on tasks (done_at) where done_at is not null;
create index if not exists tasks_waiting_idx     on tasks (waiting_on) where waiting_on is not null;
create index if not exists tasks_next_review_idx on tasks (next_review_at);
create index if not exists tasks_parent_idx      on tasks (parent_task_id);

-- 4. dashboard entities (from 002)
create table if not exists captures (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  person      text,
  area_id     text references areas(id),
  status      text not null default 'pending',
  conrad_note text default '',
  created_at  timestamptz default now(),
  filed_at    timestamptz
);
create index if not exists captures_status_idx on captures (status, created_at desc);

create table if not exists people (
  id             text primary key,
  name           text not null,
  role           text default '',
  area_id        text references areas(id),
  remember       text default '',
  open_with_them text default '',
  last_talked_at timestamptz,
  sort_order     int default 0
);

create table if not exists state_docs (
  slug       text primary key,
  title      text not null,
  area_id    text references areas(id),
  body       text not null default '',
  updated_at timestamptz default now(),
  updated_by text default 'conrad'
);

create table if not exists daily_numbers (
  for_date      date primary key,
  written       numeric,
  pct_goal      numeric,
  pct_adj_goal  numeric,
  pct_last_year numeric,
  trakwell      jsonb,
  recap_link    text,
  updated_at    timestamptz default now()
);

-- 5. Outlook calendar cache (new)
create table if not exists calendar_events (
  id           text primary key,
  subject      text not null,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  all_day      boolean default false,
  location     text default '',
  organizer    text default '',
  attendees    jsonb default '[]'::jsonb,
  web_link     text,
  is_cancelled boolean default false,
  source       text default 'outlook',
  synced_at    timestamptz default now()
);
create index if not exists calendar_events_start_idx on calendar_events (start_at);

-- 6. same security posture as the original tables
alter table captures        enable row level security;
alter table people          enable row level security;
alter table state_docs      enable row level security;
alter table daily_numbers   enable row level security;
alter table calendar_events enable row level security;

-- 7. areas: the 14 substrate Areas + inbox + Conrad Rollout
insert into areas (id, name, end_in_mind, sort_order) values
 ('inbox',                  'Inbox',                  'Unsorted, Conrad files these', 0),
 ('la-z-boy',               'La-Z-Boy',               '', 1),
 ('trakwell',               'Trakwell',               '', 2),
 ('dash-farms',             'Dash Farms',             '', 3),
 ('paid-in-full-oregon',    'Paid In Full Oregon',    '', 4),
 ('finance',                'Finance',                '', 5),
 ('estate-planning',        'Estate Planning',        '', 6),
 ('real-estate-investment', 'Real Estate Investment', '', 7),
 ('properties',             'Properties',             '', 8),
 ('gs-flp',                 'G&S FLP',                '', 9),
 ('ffc',                    'FFC',                    '', 10),
 ('garage',                 'Garage',                 '', 11),
 ('health',                 'Health',                 '', 12),
 ('personal-life',          'Personal Life',          '', 13),
 ('conrad-rollout',         'Conrad Rollout',         '', 14)
on conflict (id) do nothing;
