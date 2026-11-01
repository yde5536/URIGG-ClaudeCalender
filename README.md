# URIGG-ClaudeCalender

Claude 코워크와 대화하며 짠 계획을 그대로 올리면, Windows 바탕화면 위젯과 아이폰 캘린더에 표시되는 개인용 캘린더.

```
[Claude 코워크] ──MCP──▶ [Cloudflare Worker] ──▶ [Supabase DB]
                                                    ▲      │
                     [Windows 위젯 앱 (여러 PC)] ◀──실시간──┘      ▼
                                          [ICS 구독] ──▶ [아이폰 캘린더]
```

## 구성

| 폴더 | 내용 |
|---|---|
| `app/` | Windows 데스크톱 앱 (Tauri 2 + React). 바탕화면에 박히는 위젯과 월/주/일 전체 창 |
| `server/` | Cloudflare Worker. 코워크용 MCP 엔드포인트(`/mcp/<token>`)와 아이폰 구독용 ICS(`/ics/<token>.ics`) |
| `supabase/` | DB 스키마와 변경 SQL (순서대로 실행) |
| `PLAN.md` | 개발 계획과 단계별 진행 상황 |

## 기능

- 코워크가 일정을 한 번에 올리고(이모지 자동 지정), 조회·수정·삭제·묶음 되돌리기
- 위젯: 바탕화면의 일부로 동작 (다른 창 아래, Win+D에도 표시), 날짜 아래 이모지, 불투명도 조절
- 전체 창: 월/주/일 보기, 일정 추가·수정·삭제, 드래그 이동
- 모든 PC와 아이폰에 실시간/주기적으로 동기화

## 개발

```powershell
# 데스크톱 앱
cd app
npm.cmd install
npm.cmd run tauri dev

# 서버
cd server
npm.cmd install
npx.cmd wrangler deploy
npx.cmd wrangler secret put SUPABASE_SECRET_KEY
```

비밀 값(Supabase secret key, MCP/ICS 토큰)은 저장소에 없습니다. 토큰은 SHA-256 해시만 DB에 저장되며, 원문은 로컬의 `secrets.local.txt`(git 제외)에만 있습니다.
앱에 들어 있는 Supabase publishable 키는 공개용이며, 데이터는 행 단위 보안(RLS)으로 본인 계정만 접근할 수 있습니다.
