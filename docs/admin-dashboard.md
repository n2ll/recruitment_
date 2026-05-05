# 대시보드 탭 (`tab="dashboard"`)

`/admin` 진입 시 기본 탭. 전체 현황 + 지점별 통계를 한눈에.

- 위치: [app/admin/page.tsx:1058-1090](../app/admin/page.tsx#L1058-L1090)
- 데이터 소스: 클라이언트가 로드한 `applicants` 전체 배열 (별도 API 없음, 메모리 집계)

---

## 1. 상단 통계 카드 (6개)

| 카드 | 산식 |
|--|--|
| 전체 지원자 | `data.length` |
| 오늘 지원 (accent) | `created_at`이 오늘(KST)인 지원자 수 |
| 필터 통과 | `filter_pass === "Y"` |
| 스크리닝 대기 (warn) | `status === "서류심사" && filter_pass === "Y"` |
| 스크리닝 완료 | `status === "스크리닝 완료"` |
| 확정 (success) | `status === "확정"` |

> ⚠️ `recruitment_system_spec_v2.md`의 8개 status(`연락대기`/`온보딩`/`현장투입`/`대기` 등)와 코드의 5개 status(`서류심사`/`스크리닝 완료`/`확정`/`이탈`/`부적합`)가 다르다. **현재 운영은 코드 기준 5개 status**. 사양서 갱신 필요.

---

## 2. 지점별 현황 테이블

`activeBranchNames`(=활성 지점)별로 다음 컬럼 집계:

| 컬럼 | 산식 |
|--|--|
| 전체 | `branch === b.name` 인 지원자 수 |
| 필터 통과 | + `filter_pass === "Y"` |
| 스크리닝 대기 | + `status === "서류심사"` (1+면 노란 강조) |
| 통과율 | `필터통과 / 전체 * 100` (0이면 `-`) |

---

## 3. 실시간 갱신

[app/admin/page.tsx:826](../app/admin/page.tsx#L826) Supabase Realtime 채널이 `applicants` 테이블 모든 이벤트를 구독 → 통계가 자동 반영. 별도 폴링 없음.

---

## 4. 향후 확장 아이디어

- 채널별(`source`) 유입 비율
- 24h/7d 추이 차트
- 슬롯별 충족률 요약 (현재는 [admin-confirmed-slots.md](admin-confirmed-slots.md)에서 별도 확인)
- 이탈률 / 평균 근무 일수
