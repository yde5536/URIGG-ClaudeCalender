-- 접근 토큰 등록 (해시만 저장됨). Authentication 에서 사용자 1명을 만든 뒤 실행
insert into public.access_tokens (user_id, kind, token_hash)
select u.id, v.kind, v.token_hash
from (select id from auth.users order by created_at limit 1) u,
     (values ('mcp', '54eb1a2fb81715e37a5b8864480ded50b32f12aea373bb5397e876e48cf73e48'), ('ics', '40e45d297eccfb6f725346cf3e539b96ddd567be4300a6919fd1615f7cb2e449')) as v(kind, token_hash)
on conflict (user_id, kind) do update set token_hash = excluded.token_hash, created_at = now();
