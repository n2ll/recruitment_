# AGENTS.md — 리포지터리 맵

> "1,000페이지의 설명서가 아닌 맵을 제공" — OpenAI Harness Engineering
> 작성 2026-06-17 (ongManagement 레퍼런스 관행 적용)

배송원 채용 전 과정(지원 → 스크리닝 → 온보딩 → 확정)을 AI가 자동 응대하고 매니저가 모니터링하는 Next.js 사내 시스템.

## 필독 파일

- `.cursor/rules/00-karpathy-guidelines.mdc` → 최우선 행동 룰 (충돌 시 1순위)
- `.cursor/rules/30-domain-workflow.mdc` → 채용 도메인 불변식 (수동 상태 비덮어쓰기, 확정 뉘앙스 금지, kill switch)
- `.cursor/rules/40-design-system.mdc` → 디자인 시스템 가드 (Huddle 토큰은 천장이 아닌 하한선 — 진화는 토큰 정식 수정으로)
- `README.md` → 전체 흐름·상태·채널 요약
- `docs/기능설명서.md` → 가장 포괄적인 가이드 (UI·데이터 흐름·매니저 일과)

## 기술 스택

- **Frontend/Server**: Next.js 14 App Router (route handlers + server components), 스타일은 인라인 `style={{}}` (Tailwind/CSS 파일 없음)
- **Backend**: Supabase (Postgres + Realtime + Database Webhooks), `project_ref=lrktxyfzxwwpjffzltnq`
- **AI**: Claude Sonnet 4.6 (응대) + Haiku 4.5 (배민 triage)
- **외부 연동**: SOLAPI (SMS/알림톡) · Kakao Local API (지오코딩) · Slack Webhook (매니저 인계)
- **배포**: Vercel (`vercel.json` cron 등록)

## 아키텍처 레이어

```
Types(lib/agent/types.ts) → lib/* 어댑터·헬퍼 → app/api route handlers → app/admin UI
```

## 단계 흐름 (내부)

```
exploration → screening(7항목) → onboarding(배민 ID) → active
                  │                      │
                  └── paused(자동/수동) ←─ 매니저 [▶ 재개]
                      abort (자격 미달 → status='부적합')
```

UI 표시는 2단계로 단순화. `applicants.status` 6종: 자동 3종(스크리닝 전/중/완료) + 매니저 수동 3종(확정인력/대기자/부적합). **매니저 수동값은 시스템이 안 덮어씀.**

## 주요 문서 / 코드 맵

| 경로 | 설명 |
|---|---|
| `docs/기능설명서.md` | 시스템 전체 가이드 (가장 포괄적) |
| `docs/migrations/` | DB 스키마 변경 SQL (적용 순서·멱등 여부) |
| `lib/agent/README.md` | AI 응대 엔진 구조 |
| `lib/agent/stages/README.md` | 단계 모듈 (screening/onboarding/active) |
| `lib/README.md` | 공통 유틸 (supabase/claude/solapi/slack/kakao) |
| `app/api/README.md` | REST API 라우트 전체 매핑 |
| `app/api/webhooks/README.md` | Supabase Database Webhook 진입점 (인입 SMS) |
| `app/admin/README.md` | 어드민 대시보드 UI 구조 |

## 핵심 진입점

| 시나리오 | 시작점 |
|---|---|
| 인입 SMS 처리 | `app/api/webhooks/supabase-new-message` → `lib/agent/router.ts` `runAgentForCandidate` |
| 단계 전이 부수효과 (자동 발송·Slack) | `lib/agent/transitions.ts` `applyTransition` |
| 미매칭 SMS 분류 | `lib/agent/baemin-triage.ts` `triageInbound` / `isHardSpam` |
| 지원 폼 제출 | `app/api/apply` (POST) |
| 온보딩 리마인더 cron | `app/api/admin/cron/onboarding-reminder` (`0 * * * *`) |
| 전역 AI 중단 | `lib/agent/kill-switch.ts` `isAgentDisabled` |

## 위험도 높은 영역

| 영역 | 이유 |
|---|---|
| `lib/agent/router.ts` / `transitions.ts` | 단계 전이·자동 발송·실 SMS 발송. 중복 발송/오발송 위험 |
| `applicants.status` 변경 코드 | 매니저 수동 상태를 덮어쓰면 운영 사고 |
| SMS/Claude 발송 경로 | 비용 적재(`ai_usage_daily`/`messages`) 누락 시 비용 추적 불가 |
| `app/admin/page.tsx` (~3,900줄) | 거대 파일 — 신규 작업 시 분리 계획 필요 (`.cursor/rules/10-anti-slop-code.mdc`) |

## 비용 추적 불변식

- AI 호출 → `ai_usage_daily` 테이블 + `messages` 토큰 컬럼
- SMS 발송비 → `messages.sms_type` / `sms_cost_krw` (DB 트리거가 자동 분류)
- 통합 view: `SELECT * FROM usage_daily_cost ORDER BY day DESC`

## 거대 파일 명단 (라인 추가 시 분리 계획 필수)

`app/admin/page.tsx`(~3,900) · `app/admin/agent/DanggeunView.tsx`(~1,540) · `app/admin/agent/AgentJobsView.tsx`(~1,040). 상세는 `.cursor/rules/10-anti-slop-code.mdc`.

## 작업 규칙 (브랜치)

- 개별 기능 브랜치에서 작업한다. **`main` 푸시는 명시적 지시 없이는 금지.**
