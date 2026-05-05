# 희망 슬롯 탭 (`tab="hope-slots"`)

지원자가 **희망한** 시간대·지점 풀 분포를 매트릭스로 시각화. 모집 우선순위(어느 슬롯이 마른지) 판단용.

- 위치: [app/admin/page.tsx:1279-1394](../app/admin/page.tsx#L1279-L1394)
- 데이터 소스: 클라이언트 메모리 `applicants` (별도 API 없음)

---

## 1. 매트릭스 셀 산식

행 = 활성 지점, 열 = 4슬롯(`평일오전`/`평일오후`/`주말오전`/`주말오후`).

```
cell(branch, slot) = data.filter(a =>
  a.filter_pass === "Y" &&
  ["서류심사","스크리닝 완료","확정"].includes(a.status) &&  // ACTIVE_STATUSES
  (a.branch1 === branch || a.branch2 === branch) &&
  matchesSlot(a.work_hours, slot)
).length
```

- `matchesSlot()`: `work_hours` 콤마 join 텍스트에서 `평일`/`주말` × `오전`/`오후` 토큰 일치 여부 검사 ([app/admin/page.tsx:116-125](../app/admin/page.tsx#L116-L125))
- **활성 상태**만 카운트 (이탈/부적합 제외)
- 1지망 OR 2지망 매칭 — 같은 지원자가 여러 셀에 카운트될 수 있음(중복 집계 의도)

---

## 2. 색상 (강도)

| 인원 | 클래스 | 색상 |
|--|--|--|
| 0명 | `cell-zero` | 회색 |
| 1~2명 | `cell-some` | 연 노랑 |
| 3명+ | `cell-hot` | 진한 노랑 |

---

## 3. 합계 행/열

- 우측 `지점 합계`: 해당 지점 1지망/2지망 전체 활성 풀 (슬롯 무관, 중복 제거 X)
- 하단 `슬롯 합계`: 해당 슬롯 전체 풀 (지점 무관)
- 우하단: 활성 풀 전체 인원

---

## 4. 셀 클릭 → drill-down

- `slotCell={branch, slot}` 상태로 하단에 매칭 인원 테이블 표시
- 컬럼: 성함 / 연락처 / 희망지점(1·2) / 상태 / 시작가능일 / 희망시간
- **이름(행) 클릭** → `setTab("applicants") + setSelectedId(a.id)` — 지원자 목록 탭으로 점프 + 상세 패널 자동 오픈
- 같은 셀 재클릭 또는 우상단 X 클릭으로 닫힘

---

## 5. 활용

- "어느 지점·슬롯에 풀이 부족한가?" → 광고 타겟 우선순위
- "이 지점 평일오전이 1명뿐" → 추가 모집 트리거
- 확정 매트릭스([admin-confirmed-slots.md](admin-confirmed-slots.md))와 비교 → 실제 채용 가능성 추정

---

## 6. 한계

- 1·2지망 가중치 동일 — 1지망 우선 표시는 안 됨
- `work_hours` 텍스트 매칭이라 사양서 수정 시 단어 변경(예 "오전"→"AM")만으로 깨짐
- 같은 인원이 여러 셀/지점에 카운트되어 합계가 풀 인원보다 클 수 있음 (의도된 동작)
