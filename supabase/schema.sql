-- 코워크 연동 캘린더 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run

-- ── 일정 ──────────────────────────────────────────────
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean not null default false,
  memo        text,
  color       text,
  batch_id    uuid,
  source      text not null default 'manual' check (source in ('cowork', 'manual')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_at >= start_at)
);

create index events_user_start_idx on public.events (user_id, start_at);
create index events_batch_idx on public.events (batch_id) where batch_id is not null;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;

create policy "events: owner only" on public.events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;

-- 데스크톱 앱 실시간 동기화
alter publication supabase_realtime add table public.events;

-- ── MCP / ICS 접근 토큰 (원문 대신 SHA-256 해시만 저장) ──
create table public.access_tokens (
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('mcp', 'ics')),
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.access_tokens enable row level security;

create policy "access_tokens: owner only" on public.access_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.access_tokens to authenticated;
grant all on public.access_tokens to service_role;
