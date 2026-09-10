-- Conrad Daily Brief to Dashboard, migration 002
-- Run once in the Supabase SQL editor, after schema.sql and seed.sql.
-- Additive only. Nothing here touches areas, projects, or tasks.

-- Quick capture. Brad speaks, this row lands, Conrad drains it later.
-- Nothing on this path calls a model, which is what makes it instant.
create table if not exists captures (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  person      text,
  area_id     text references areas(id),
  status      text not null default 'pending',   -- pending | filed
  conrad_note text default '',                   -- where Conrad filed it
  created_at  timestamptz default now(),
  filed_at    timestamptz
);
create index if not exists captures_status_idx on captures (status, created_at desc);

-- The people tiles. "I'm about to talk to Chris, anything I should remember?"
create table if not exists people (
  id             text primary key,               -- 'gretchen'
  name           text not null,
  role           text default '',
  area_id        text references areas(id),
  remember       text default '',                -- the short walking-over brief
  open_with_them text default '',
  last_talked_at timestamptz,
  sort_order     int default 0
);

-- Rendered state documents. Markdown stays the source of truth in OneDrive;
-- Conrad PUTs the current body here so the dashboard can render it.
create table if not exists state_docs (
  slug       text primary key,                   -- 'garage'
  title      text not null,
  area_id    text references areas(id),
  body       text not null default '',           -- markdown
  updated_at timestamptz default now(),
  updated_by text default 'conrad'
);

-- The numbers strip. Conrad parses Jessica's recap and PUTs one row per day.
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

-- Same posture as the existing tables: RLS on, no public policies, all access
-- server-side through the service role. The bearer secret is the guard.
alter table captures      enable row level security;
alter table people        enable row level security;
alter table state_docs    enable row level security;
alter table daily_numbers enable row level security;
