-- 일정별 이모지 (코워크가 자동으로 골라 넣음)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run
alter table public.events
  add column emoji text check (char_length(emoji) <= 16);
