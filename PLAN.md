# 코워크 연동 캘린더 — 개발 계획

작성일: 2026-11-01

## 1. 목표
Claude 코워크에서 대화로 짠 계획(일정)을 MCP로 업로드하면, 여러 대의 Windows PC 바탕화면 위젯과 아이폰 기본 캘린더에 자동으로 표시되는 개인용 캘린더.

## 2. 범위
- **Windows 설치형 앱**: 바탕화면 위젯 + 전체 창
- **Claude 코워크 연동**: 원격 MCP 서버(claude.ai 커스텀 커넥터)
- **아이폰**: ICS 구독으로 기본 캘린더 앱에서 보기 전용 (웹앱 없음)
- **사용자**: 본인 1명
- **표시 정보**: 날짜·시간 위주의 일정 (체크리스트/목표 구조 없음)

## 3. 구성도
```
[Claude 코워크] ──MCP──▶ [MCP 서버 (Cloudflare Workers)] ──▶ [Supabase DB]
                                                              ▲      │
                       [Windows 위젯 앱 (여러 PC)] ◀──실시간──┘      │
                                                                     ▼
                                     [ICS 구독 URL] ──▶ [아이폰 캘린더 + 위젯]
```

## 4. 기술 스택
| 구성 | 기술 |
|---|---|
| 데스크톱 앱 | Tauri 2 + React + TypeScript + FullCalendar |
| DB / 인증 / 실시간 | Supabase (무료 티어) |
| MCP 서버 + ICS 피드 | TypeScript MCP SDK + Cloudflare Workers (무료 티어) |
| 배포 / 업데이트 | GitHub Releases + Tauri Updater |

## 5. 데이터 모델
**events**
| 필드 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | 소유자 (RLS) |
| title | text | 제목 |
| start_at | timestamptz | 시작 |
| end_at | timestamptz | 종료 |
| all_day | boolean | 종일 여부 |
| memo | text | 메모 (선택) |
| color | text | 색상 (선택) |
| batch_id | uuid | 코워크가 한 번에 올린 묶음 (되돌리기용, 화면 비표시) |
| source | text | `cowork` / `manual` |
| created_at / updated_at | timestamptz | |

## 6. MCP 도구
| 도구 | 기능 |
|---|---|
| `add_events` | 일정 여러 개 일괄 등록 (batch_id 부여) |
| `list_events` | 기간별 조회 (겹침 확인용) |
| `update_event` | 일정 수정 |
| `delete_event` | 일정 1개 삭제 |
| `delete_batch` | 묶음 전체 삭제 |

## 7. Windows 앱
### 위젯 모드 (기본)
- 테두리 없는 반투명 창, 바탕화면 고정 (항상 맨 아래)
- 월간 달력 (일정 있는 날 점 표시) + 오늘/다가오는 일정 목록
- 위치·크기·투명도 조절, 위치 잠금 (PC별 저장)
- 작업표시줄 숨김, 트레이 아이콘으로 관리

### 전체 창 (위젯 더블클릭)
- 월/주/일 보기
- 일정 추가·수정·삭제, 드래그 이동

### 공통
- Supabase Realtime 실시간 동기화
- Windows 시작 시 자동 실행
- 일정 시작 전 Windows 알림
- 오프라인 캐시 (마지막 일정 표시)
- 자동 업데이트

## 8. 아이폰
- 앱 설정에서 "아이폰 구독 주소" 복사 → 아이폰 설정 > 캘린더 > 계정 > 구독 캘린더 추가
- 기본 캘린더 위젯·알림 사용
- 보기 전용, 반영 주기는 iOS가 결정 (수십 분 지연 가능)
- (확인 예정) 아이폰 Claude 앱에서 커스텀 커넥터로 일정 추가 가능 여부

## 9. 보안
- 앱: Supabase 이메일 로그인 (PC마다 1회)
- MCP 커넥터·ICS URL: 비밀 토큰 포함 URL, 앱 설정에서 재발급 가능
- DB: RLS로 본인 데이터만 접근

## 10. 개발 단계
| 단계 | 내용 | 완료 기준 | 상태 |
|---|---|---|---|
| 0 | 개발 환경 준비 (Node.js, Rust, VS C++ Build Tools, Git), 계정 생성 | 빌드 도구 설치 완료 | ✅ |
| 1 | Supabase 스키마 + MCP 서버 배포 + 커넥터 연결 | 코워크 대화 → DB 저장 | ✅ |
| 2 | ICS 구독 URL | 아이폰 캘린더에 일정 표시 | ✅ |
| 3 | 위젯 MVP (달력 + 오늘 일정, 로그인, 실시간) | 바탕화면 위젯 즉시 반영 | ✅ (이모지 표시, Win+D 대응 포함) |
| 4 | 전체 창 (보기 전환, 편집) | 앱에서 일정 관리 | ✅ (taste-skill 디자인 적용) |
| 5 | 트레이, 자동 실행, 알림, 오프라인 캐시, 자동 업데이트, 설치 파일 | 새 PC 설치 → 로그인 → 바로 사용 | ✅ (알림은 제외) |

## 11. 사용자 직접 작업 (Claude가 안내)
1. Supabase 가입
2. Cloudflare 가입
3. GitHub 가입
4. claude.ai 커스텀 커넥터 등록
5. 아이폰 캘린더 구독 추가

## 12. 운영 정보
- Supabase 프로젝트: `https://dfvcgacadkaglgtooxdy.supabase.co` (서울 리전)
- Cloudflare Worker: `https://cowork-calendar.cowork-calendar-server.workers.dev`
  - 배포: `cd server` → `npx.cmd wrangler deploy`
  - 비밀 값: `SUPABASE_SECRET_KEY` (wrangler secret)
- MCP/ICS 전체 주소(토큰 포함): `secrets.local.txt` (git 제외)
- claude.ai 커스텀 커넥터 이름: 클로드캘린더 (인증: 로그인 없음, 토큰은 URL에 포함)

## 13. 개발 실행 방법
- 개발 모드 실행: `cd app` → `npm.cmd run tauri dev` (VS Code 터미널에서 `npx`/`npm` 대신 `.cmd` 사용 — PowerShell 실행 정책)
- 서버 재배포: `cd server` → `npx.cmd wrangler deploy`
- DB 변경 SQL은 `supabase/` 폴더에 순서대로 (`schema.sql` → `seed-tokens.sql` → `002_emoji.sql`)

## 14. 배포 (5단계)
- 설치 파일: NSIS (`CoworkCalendar_<버전>_x64-setup.exe`), 사용자 단위 설치(관리자 권한 불필요)
- 자동 업데이트: 앱이 시작 15초 뒤, 이후 6시간마다 `releases/latest/download/latest.json` 확인 → 새 버전이면 설치 후 재시작
- 업데이트 서명 키: `%USERPROFILE%\.tauri\coworkcal.key` (비밀번호 없음). **잃어버리면 기존 설치본은 더 이상 업데이트 불가 — 백업 필수**
- 새 버전 내는 법:
  1. `app/src-tauri/tauri.conf.json`의 `version` 올리기
  2. 서명 빌드: `$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $env:USERPROFILE\.tauri\coworkcal.key -Raw; $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""; cd app; npm.cmd run tauri build`
  3. 커밋·푸시 후 저장소 루트에서 `node scripts/release.mjs "바뀐 점"`
- 항상 최신 설치 파일 주소 (웹사이트 다운로드 버튼용): https://github.com/yde5536/URIGG-ClaudeCalender/releases/latest/download/CoworkCalendar-setup.exe
- 트레이: 전체 창 열기 / 위젯 위치 초기화 / Windows 시작 시 실행 / 종료
- 탐색기가 재시작돼 위젯이 사라지면 바탕화면이 다시 생길 때 자동으로 다시 띄움
- 오프라인: 위젯이 마지막으로 받은 일정을 PC에 저장해 두고 연결이 끊기면 그것을 표시
- 알림 기능은 사용자 요청으로 제외
- 릴리스: https://github.com/yde5536/URIGG-ClaudeCalender/releases (최신 v0.1.3, 2026-11-01)
- 아이콘을 바꾸면 빌드 캐시 때문에 exe에 반영되지 않을 수 있음 → `cargo clean --release -p app` 후 빌드
- 탐색기가 재시작되면 위젯은 widget-2, widget-3 … 새 이름으로 다시 만들어짐 (Tauri가 사라진 창을 감지하지 못하므로)
