# 옹고잉 구인 자동화

배송원 채용 전 과정(지원 → 스크리닝 → 온보딩 → 확정)을 AI가 자동 응대하고 매니저가 모니터링하는 Next.js 사내 시스템.

## 빠른 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

배포는 Vercel. 환경변수는 Vercel 프로젝트 설정에서 관리.

## 화면

| 경로 | 용도 |
|---|---|
| `/apply` | 지원자용 공개 폼 (당근·배민 채널) |
| `/admin` | 매니저용 관리 대시보드 (사이드바 멀티 탭) |

## 핵심 채널 — 당근 / 배민

| 채널 | 흐름 |
|---|---|
| 🥕 **당근** | apply 폼 작성 → AI 자동 응대 시작 |
| 📱 **배민** | 지원자 SMS → Haiku triage → apply 폼 안내 SMS → 폼 작성 → AI 자동 응대 시작 |

지원자 답장이 들어오면 Supabase Database Webhook이 우리 서버를 호출 → 현재 단계 모듈(Claude Sonnet 4.6) → 답장 발송 → 단계 전이 처리.

## 단계 흐름 (내부)

```
exploration → screening (7항목) → onboarding (배민 ID) → active
                  │                       │
                  └── paused (자동/수동) ←─ 매니저 [▶ 재개]
                      abort  (자격 미달 → status='부적합')
```

UI 표시는 2단계로 단순화(`screening`="스크리닝 중", `onboarding`/`active`="스크리닝 완료").

지원자 상태(`applicants.status`)는 6종:
- **자동**: 스크리닝 전 / 스크리닝 중 / 스크리닝 완료
- **매니저 수동**: 확정인력 / 대기자 / 부적합

매니저가 수동 상태로 바꾸면 시스템이 절대 안 덮어씀.

## 비용 추적

모든 Claude 호출과 SOLAPI 발송은 자동으로 비용 적재됨:
- AI 토큰 → `ai_usage_daily` 테이블 + `messages` 토큰 컬럼
- SMS 발송비 → `messages.sms_type` / `sms_cost_krw` (DB 트리거가 자동 분류)
- 통합 view: `SELECT * FROM usage_daily_cost ORDER BY day DESC`

## 기술 스택

- **Next.js 14** App Router (route handlers + server components)
- **Supabase** Postgres + Realtime + Database Webhooks
- **SOLAPI** SMS / 카카오 알림톡 (양방향)
- **Claude API** Sonnet 4.6 (응대) + Haiku 4.5 (분류)
- **Kakao Local API** 주소 → 위경도
- **Slack Webhook** 매니저 인계 알림

## 디렉토리 (각 폴더에 README 있음)

```
app/
  admin/        관리자 대시보드 UI            → app/admin/README.md
  apply/        지원자 폼
  api/          REST API + webhook 진입점     → app/api/README.md
    webhooks/   Supabase Database Webhook    → app/api/webhooks/README.md
lib/            공통 유틸리티                 → lib/README.md
  agent/        AI 응대 엔진                  → lib/agent/README.md
    stages/     단계 모듈                     → lib/agent/stages/README.md
docs/           문서                          → docs/README.md
  migrations/   DB 마이그레이션 SQL           → docs/migrations/README.md
```

## SMS Gateway (별도 저장소)

법인폰의 SMS 송수신을 담당하는 안드로이드 Kotlin 앱. 위치: `C:\sms-gateway`. 이 앱이 Supabase REST API에 직접 INSERT하면 Database Webhook이 우리 서버로 트리거.

## 문서

- **운영자·매니저용 가이드**: [docs/기능설명서.md](docs/기능설명서.md) — 가장 먼저 보기
- **환경변수·DB 마이그레이션**: 기능설명서 §9 또는 [docs/migrations/README.md](docs/migrations/README.md)
