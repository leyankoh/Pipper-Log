-- Run this in Supabase: Project > SQL Editor > New query

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security must be explicitly opened up, since it blocks
-- everything by default. This app has no login system, so every visitor
-- uses the same public "anon" key — these policies let that key read
-- and write freely. Fine for a small trusted group of neighbours;
-- anyone with your deployed URL's code could, in principle, write to
-- this table directly, same tradeoff as the original Claude artifact link.
alter table kv_store enable row level security;

create policy "Allow anon read" on kv_store
  for select using (true);

create policy "Allow anon write" on kv_store
  for insert with check (true);

create policy "Allow anon update" on kv_store
  for update using (true);
