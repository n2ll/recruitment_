# 기능별 문서 인덱스

`/apply` 폼 + `/admin` 8개 탭의 기능 명세. 코드 기반 실측 — 사양서([../recruitment_system_spec_v2.md](../recruitment_system_spec_v2.md))와 차이가 있는 부분은 각 문서 하단에 명시.

---

## 지원 폼

- [apply.md](apply.md) — 폼 필드, URL 파라미터, 자동 필터, 중복 처리, 저장 후 자동 처리 (지오코딩 → Supabase → 시트 → 알림톡 ①)

## /admin 탭 (좌측 사이드바 순서)

| 탭 | 문서 | 핵심 |
|--|--|--|
| 대시보드 | [admin-dashboard.md](admin-dashboard.md) | 통계 카드 6개 + 지점별 통과율 |
| 지원자 목록 | [admin-applicants.md](admin-applicants.md) | 필터·검색 + 인라인 편집 + 1차 스크리닝 트리거 |
| 희망 슬롯 | [admin-hope-slots.md](admin-hope-slots.md) | 지점×슬롯 풀 분포 매트릭스 (모집 우선순위) |
| 확정 슬롯 | [admin-confirmed-slots.md](admin-confirmed-slots.md) | 정원(2/슬롯) 충족 매트릭스 |
| 배송원 추천 | [admin-recommend.md](admin-recommend.md) | 공고 → Claude 주소 추출 → 점수 상위 N명 → 일괄 SMS |
| 배송원 컨택 | [admin-contact.md](admin-contact.md) | 양방향 SMS + AI 답변 초안 (그대로/수정/무시/need_info) |
| 지점 관리 | [admin-branches.md](admin-branches.md) | CRUD + 드래그 정렬 + 활성 토글 |
| 구인 에이전트 | [admin-agent.md](admin-agent.md) | 공고 기반 응대 시뮬레이션 (실 발송 X) |

---

## 사양서와의 주요 차이

각 문서에 상세 명시. 요약:

1. **status 종류**: 사양서 8개(`연락대기`/`온보딩`/`현장투입`/`대기` 포함) vs 코드 5개(`서류심사`/`스크리닝 완료`/`확정`/`이탈`/`부적합`)
2. **확정 슬롯 매트릭스**: 사양서 "확정 2 + 대기 1" vs 코드 "확정 2만"
3. **알림톡 ③/④** (확정/대기 공지) 자동 발송 미구현 — 수동 발송
4. **슬랙 알림** off (지원 접수 알림 일시 비활성화)
5. **지점 데이터**: 사양서는 12지점 하드코딩 안내, 실제는 [`branches`](admin-branches.md) 테이블이 출처

---

## 관련 코드 위치

| 영역 | 파일 |
|--|--|
| 지원 폼 UI | [app/apply/page.tsx](../app/apply/page.tsx) |
| 지원 폼 API | [app/api/apply/route.ts](../app/api/apply/route.ts) |
| 관리자 (모든 탭) | [app/admin/page.tsx](../app/admin/page.tsx) — 단일 파일 2,796줄 |
| 공개 API | [app/api/branches/route.ts](../app/api/branches/route.ts) |
| 어드민 API | [app/api/admin/](../app/api/admin/) |
| Claude / 에이전트 | [lib/agent.ts](../lib/agent.ts), [lib/claude.ts](../lib/claude.ts) |
| 발신(알림톡/SMS) | [lib/solapi.ts](../lib/solapi.ts) |
| 점수 로직 | [lib/scoring.ts](../lib/scoring.ts) |
| 지오코딩 | [lib/kakao-geocode.ts](../lib/kakao-geocode.ts) |
| 시트 동기화 | [lib/google-sheets.ts](../lib/google-sheets.ts) |
| 슬랙 | [lib/slack.ts](../lib/slack.ts) |
| Supabase 클라이언트 | [lib/supabase.ts](../lib/supabase.ts) |
| DB 마이그레이션 | `../supabase-migration-*.sql` (9개 누적) |
| 크론 (24h 리마인더) | [app/api/admin/cron/reminder/](../app/api/admin/cron/), [vercel.json](../vercel.json) |
