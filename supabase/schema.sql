-- Conrad Command Dashboard — base schema.
-- Run this once in the Supabase SQL editor, then seed.sql, then every
-- file in migrations/ in order.

create type task_status as enum ('open','done','waiting');
create type task_flag   as enum ('none','amber','red');
create type task_source as enum ('phone','conrad','voice','seed');

create table areas (
  id          text primary key,          -- e.g. 'dash-farms'
  name        text not null,             -- 'Dash Farms'
  end_in_mind text default '',           -- the vision
  sort_order  int  default 0
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  area_id     text references areas(id) on delete cascade,
  name        text not null,
  end_in_mind text default '',
  status      text default 'active',
  sort_order  int  default 0,
  created_at  timestamptz default now()
);

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  area_id      text references areas(id),
  project_id   uuid references projects(id) on delete set null,
  title        text not null,
  note         text default '',
  status       task_status default 'open',
  flag         task_flag   default 'none',
  delegated_to text,
  due_date     date,
  unsure       boolean default false,
  conrad_note  text default '',
  source       task_source default 'phone',
  created_at   timestamptz default now(),
  done_at      timestamptz,
  sort_order   int default 0
);

create index tasks_area_status_idx on tasks (area_id, status);

-- Access is server-only via the service role, which bypasses RLS.
-- Enable RLS and add NO public policies so nothing is reachable
-- with an anon key. The API passphrase/secret is the guard.
alter table areas    enable row level security;
alter table projects enable row level security;
alter table tasks    enable row level security;
