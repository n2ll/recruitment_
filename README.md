# 옹고잉 구인 자동화

배송원 채용 전 과정(지원 → 탐색 → 스크리닝 → 온보딩 → 운영)을 한 곳에서 굴리는 Next.js 사내 시스템.

## 빠른 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

배포는 Vercel. 환경변수는 Vercel 프로젝트 설정에서 관리.

## 화면

| 경로 | 용도 |
|------|------|
| `/apply` | 지원자용 공개 폼 |
| `/admin` | 매니저용 관리 페이지 (10개 탭) |

### `/admin` 탭

| 탭 | 핵심 |
|---|---|
| 대시보드 | 오늘 채용 현황 한눈에 |
| 지원자 목록 | 검색·필터·상태 변경 메인 화면 |
| 희망 슬롯 | 어디 모집해야 하나 매트릭스 (1·2지망 합산) |
| 확정 슬롯 | 정원 충족도 매트릭스 |
| 추천 받기 | 후보 풀 점수 정렬 + 일괄 SMS |
| 배송원 컨택 | SMS 양방향 + AI 답변 초안 |
| 지점 관리 | 지점 추가/순서/활성 |
| **현장 매니저** | 만남장소·확정 알림에 쓸 매니저 정보 |
| **구인 에이전트** | 공고 단위 칸반 — AI가 단계별 자동 응대 |
| **플레이그라운드** | AI 응대 시뮬 (실발송 X) |
| **🥕 당근마켓구인** | source='danggeun' 후보 관리 + 매니저 직접 시작 멘트 (실발송) |
| **톤 가이드** | 퓨샷 예시 라이브러리 — AI 프롬프트와 매니저 참고용 양쪽 활용 |

## 구인 에이전트 4단계

후보 1명 = `job_candidates` 1행. 인입 SMS마다 현재 단계 모듈이 호출됨.

```
탐색 (exploration)
  └─ 공고/조건 질문에 답변. 지원의사 명확해지면 →
스크리닝 (screening)
  └─ 시스템: 안내 묶음(정산·프로모션·업무시간) 자동 발송
  └─ AI: 미확인 확인질문(시작일·자차·본인명의·공휴일) 묶어서 질의
  └─ 체크리스트 모두 충족하면 →
온보딩 (onboarding)
  └─ 시스템: 가이드(앱설치·교육·아이디·차량번호 회신 요청)
  └─ AI: 배민ID + 차량번호 수집 (둘 중 하나만 오면 다른 것 요청)
  └─ 둘 다 수신 시 시스템: 만남장소 안내 자동 발송
근무중 (active)
  └─ 자유 대화 응대
```

부수 단계: `paused`(매니저 인계), `abort`(부적합).

조건부 자동 처리:
- 공고 자차 불필요 → 자차 재확인 자동 통과
- 공고 슬롯 평일 전용 → 공휴일 업무 자동 통과

## 기술 스택

- Next.js 14 (App Router)
- Supabase (Postgres + Realtime)
- SOLAPI (알림톡 / SMS, 양방향)
- Claude API (Sonnet 4.6 — 단계별 도구 호출)
- Kakao Local API (주소 → 위경도)
- Slack Webhook (확정·예외 알림, 환경변수 ON 시)

## 디렉토리

```
app/
  admin/
    agent/            구인 에이전트 + 플레이그라운드
    site-managers/    현장 매니저 탭
    page.tsx          관리자 라우트 + 사이드바
  apply/              지원자 폼
  api/                서버 라우트 (admin/agent/messages 등)
lib/
  agent/
    stages/           단계별 AI 모듈 (exploration/screening/onboarding/active)
    router.ts         인입 → 단계 dispatch
    transitions.ts    단계 전이 + 자동 발송 (안내 묶음/가이드/만남장소/슬랙 등)
    examples.ts       프롬프트 톤 가이드 로더
    types.ts          코어 타입
    checklist.ts      체크리스트 헬퍼
  agent.ts            (legacy) draft generator — active 단계 위임
  claude.ts           Claude API 호출 래퍼
  supabase.ts         서비스/브라우저 클라이언트
  solapi.ts           알림톡 + SMS 래퍼
  slack.ts            웹훅 알림
  kakao-geocode.ts    주소 → 위경도
  scoring.ts          추천 점수 계산
docs/migrations/
  2026-05-prompt-examples.sql  prompt_examples 테이블 마이그레이션
```

## 환경변수

| 키 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트용 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버용 (RLS 우회) |
| `CLAUDE_API` | Anthropic API 키 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_FROM` | SMS / 알림톡 |
| `SOLAPI_TEMPLATE_*` | 카카오 알림톡 템플릿 ID (없으면 SMS 폴백) |
| `KAKAO_REST_API_KEY` | 주소 지오코딩 |
| `SLACK_WEBHOOK_URL` / `SLACK_NOTIFICATIONS_ENABLED=1` | 슬랙 알림 |
| `AGENT_MANAGER_NAME` | AI 자기소개 매니저 이름 (기본: 홍석범) |
| `NEXT_PUBLIC_KAKAO_CHANNEL_URL` | 지원 후 카카오 채널 추가 페이지 |

## 기능 설명

비전공자용 운영 가이드: [docs/기능설명서.md](docs/기능설명서.md)
