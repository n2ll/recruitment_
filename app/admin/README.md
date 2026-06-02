# `app/admin/` — 관리자 대시보드 UI

매니저·운영팀이 사용하는 단일 페이지 앱. 인증은 별도 미들웨어 없음(내부 접근 가정).

## 진입점

`page.tsx` — 사이드바 탭 라우팅 + 지원자 목록 + 대시보드 + 매트릭스 + 지점 관리 모두 한 파일. ~3000줄. 하위 폼·뷰만 컴포넌트로 분리.

## 파일별 책임

| 파일 | 역할 |
|---|---|
| `page.tsx` | 메인 — 사이드바, 탭 라우팅, 대시보드/지원자 목록/매트릭스/지점 관리/배송원 컨택 |
| `ApplicantFormModal.tsx` | 지원자 추가/편집 모달 — 6섹션 폼, source/status 옵션 등 |
| `agent/DanggeunView.tsx` | 당근/배민/연습용 후보 관리 화면 (mode prop으로 재사용) |
| `agent/AgentJobsView.tsx` | (기타) 공고 단위 칸반 — 당근·배민 채널과 별개 흐름 |
| `agent/PlaygroundView.tsx` | (기타) 공고+가짜 지원자 시뮬레이션 |
| `agent/JobCreateModal.tsx` | (기타) 신규 공고 등록 모달 |
| `agent/types.ts` / `agent/sent-by-label.ts` | DanggeunView 공통 타입 + sent_by 라벨 매핑 |
| `inbox/PendingInboxView.tsx` | 미분류 인박스 — `classification='pending'` 메시지 매니저 직접 분류 |
| `prompts/PromptExamplesView.tsx` | 🧠 클로드 조련하기 — facts / system_message 관리 |
| `site-managers/SiteManagersView.tsx` | (기타) 현장 매니저 정보 |

## 사이드바 구조

```
AI 에이전트       → DanggeunView(mode=live|baemin|practice), PromptExamplesView
운영              → page.tsx 내부 탭들 + PendingInboxView
매트릭스           → page.tsx 내부 (확정 슬롯)
관리              → page.tsx 내부 (지점 관리)
기타 ▸            → AgentJobsView, hope-slots, recommend, SiteManagersView, PlaygroundView
🧪 당근마켓구인(연습용) → DanggeunView(mode=practice)
```

## Realtime 구독

`getBrowserClient()`로 받은 supabase client에서 `applicants` / `messages` / `job_candidates` 변경을 구독. 변경 시 UI 자동 갱신.

## 상태 6종

- 자동: `스크리닝 전` / `스크리닝 중` / `스크리닝 완료`
- 수동: `확정인력` / `대기자` / `부적합`

매니저가 한 번 수동 상태로 바꾸면 시스템이 절대 안 덮어씀. 자세한 건 [docs/기능설명서.md](../../docs/기능설명서.md) §3.

## 인라인 편집 (노션 스타일)

지원자 목록의 셀(지점·시작가능일·상태)을 클릭하면 즉시 드롭다운/날짜 선택기로 수정. 행 단위 클릭은 우측 상세 패널 열기.

## 전체 폭

`.content { max-width: 1800px }` — 1280px 이상에선 화면 가로를 거의 다 씀. 상세 패널이 sticky 우측 420px로 표시.
