# 지원자 목록 탭 (`tab="applicants"`)

지원자 전체 검색·필터·인라인 편집의 핵심 화면.

- 위치: [app/admin/page.tsx:1090-1279](../app/admin/page.tsx#L1090-L1279)
- 상세 패널: [app/admin/page.tsx:1143-1277](../app/admin/page.tsx#L1143-L1277)
- 편집 PATCH API: [app/api/admin/applicants/[id]/route.ts](../app/api/admin/applicants/[id]/route.ts)
- 스크리닝 완료 트리거: [app/api/admin/screening/route.ts](../app/api/admin/screening/route.ts)

---

## 1. 필터 / 검색

| 컨트롤 | 옵션 |
|--|--|
| 지점 | `전체` + 활성 지점 |
| 상태 | `전체` + `서류심사` / `스크리닝 완료` / `확정` / `이탈` / `부적합` |
| 검색 | 이름 또는 전화번호 부분 일치 |

좌측 상단에 결과 건수(`{filtered.length}명`) 표시.

---

## 2. 테이블 컬럼

성함 / 연락처 / 지점 / 차량 / 면허 / 시작가능일 / 상태(배지) / 채널 / 지원일 / 액션

- **성함**: 클릭 시 문자 대화창 오픈(`openChat`) — [admin-contact.md](admin-contact.md) 참고. 행 클릭 영역과 분리(`stopPropagation`).
- **상태 배지**: `STATUS_COLORS` 매핑 (서류심사=회색 / 스크리닝 완료=주황 / 확정=초록 / 이탈=짙은회 / 부적합=빨강)
- **중복 태그**: `note === "중복지원"` 시 이름 옆 `중복` 칩
- **액션 버튼**:
  - `filter_pass === "Y" && status === "서류심사"` 일 때만 `1차 스크리닝 완료` 노출
  - 클릭 → `handleScreening(id)` → `POST /api/admin/screening`
    - 알림톡 ⑥ (가이드) 자동 발송 + status를 `스크리닝 완료`로 갱신
    - SOLAPI 템플릿 미발급/실패 시 SMS 폴백

---

## 3. 상세 패널 (행 클릭 시 토글)

같은 행을 다시 클릭하면 닫힘. 다른 행을 클릭하면 그 행으로 전환.

### 3.1 편집 가능 필드 (명시적 저장)

| 필드 | 타입 | 비고 |
|--|--|--|
| 진행 상태 | select | `ALL_STATUSES` 5개 |
| 확정 슬롯 | select | `평일오전`/`평일오후`/`주말오전`/`주말오후` 또는 `—`(null) |
| 확정 지점 | select | 모든 지점 또는 `—` |
| 현재 근무 지점 | select | 모든 지점 또는 `— (비근무)` |
| 시작일 | date | `start_date` |
| 이탈 사유 | text | **`status === "이탈"` 일 때만 노출** |

- `editDraft` 로컬 상태에 변경 누적, `변경됨` 칩 표시
- `[저장]` 클릭 → `PATCH /api/admin/applicants/[id]` 일괄 업데이트
- `[취소]`로 모든 변경 폐기
- 하단 X 버튼은 패널만 닫음 (변경 폐기 동작 유의 필요)

### 3.2 읽기 전용 필드 (detail-grid)

거주지 / 차종 / 희망지점(`branch1` + `branch2`) / 희망시간(`work_hours`) / 본인명의 / 필터(통과/탈락)

### 3.3 자유 텍스트 섹션

- 자기소개 (`introduction`)
- 경력 (`experience`) — 비어있으면 섹션 미노출

---

## 4. 자동 동작 (서버 측)

`PATCH /api/admin/applicants/[id]`에서 트리거:

- `status`가 `이탈`로 바뀌면: `current_branch=null` + `churned_at=now()` 자동 기록
- `status`가 `이탈` → 다른 값으로 복원되면: `churned_at=null` 등 처리는 라우트 코드 확인 필요
- (TODO) `status`가 `확정`/`대기`로 바뀔 때 알림톡 ③/④ 자동 발송 — **현재 미구현**, 수동 트리거

---

## 5. 실시간 갱신

[app/admin/page.tsx:826](../app/admin/page.tsx#L826)에서 `applicants` 테이블 변경을 Realtime으로 구독. 다른 매니저가 변경 시 즉시 반영. 동시 편집 충돌 시 마지막 저장자 승.

---

## 6. 향후 / 알려진 한계

- 페이지네이션 없음 — 전체 데이터를 클라이언트에 로드. 누적 5,000명 이상 시 검토 필요.
- 정렬 컨트롤 없음 (현재는 `created_at desc` 고정 추정).
- CSV 내보내기 없음.
- 이력 (status 변경 타임라인) 없음.
- `confirmed_slot`/`confirmed_branch` 변경 시 매트릭스 정원 검증 안 함 (수동 책임).
