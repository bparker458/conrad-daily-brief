-- Conrad Daily Brief, migration 003: full status model
-- Run in the Supabase SQL editor AFTER schema.sql and 002 (if applied).
-- Safe to re-run: everything is IF NOT EXISTS / ADD VALUE IF NOT EXISTS.
--
-- Why: the ledger becomes the single system of record. Tasks need a
-- candidate/confirmed split (AI-detected vs Brad-accepted), a real
-- lifecycle, waiting-on tracking, source links back to the originating
-- email/recording, review dates for the horizon cycles, and completion
-- evidence that never disappears.

-- 1. Lifecycle. Existing values: open, done, waiting.
alter type task_status add value if not exists 'candidate';   -- AI detected, not yet real
alter type task_status add value if not exists 'in_progress';
alter type task_status add value if not exists 'blocked';
alter type task_status add value if not exists 'someday';
alter type task_status add value if not exists 'cancelled';
-- 'open' = confirmed/planned. 'done' keeps completion date + evidence.

-- 2. New columns.
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

-- 3. Indexes for the cycles.
create index if not exists tasks_status_idx      on tasks (status);
create index if not exists tasks_waiting_idx     on tasks (waiting_on) where waiting_on is not null;
create index if not exists tasks_next_review_idx on tasks (next_review_at);
create index if not exists tasks_parent_idx      on tasks (parent_task_id);
