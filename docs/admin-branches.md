# 지점 관리 탭 (`tab="branches"`)

`/apply` 드롭다운 + `/admin` 모든 지점 필터의 출처 데이터를 관리. CRUD + 정렬 + 활성 토글.

- 위치: [app/admin/page.tsx:1694-1823](../app/admin/page.tsx#L1694-L1823)
- API: [app/api/admin/branches/](../app/api/admin/branches/) (지점 CRUD)
- 공개 API: [app/api/branches/route.ts](../app/api/branches/route.ts) (활성 지점만 반환, /apply 폼이 사용)
- 마이그레이션: [supabase-migration-branches.sql](../supabase-migration-branches.sql)

---

## 1. 데이터 모델

```ts
interface Branch {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
}
```

테이블명: `branches`. 12개 초기값은 마이그레이션에서 시드 (사양서 §2 참고).

---

## 2. UI 구성

### 상단 카운트
`{활성 지점 수}개 활성` — `b.active` 만 카운트.

### 추가 입력 행
- 신규 지점명 input + `+ 지점 추가` 버튼
- Enter 키로도 추가
- 신규 추가 시 `active=true`, `sort_order = 마지막 + 1`

### 변경사항 저장 바
- `branchesDirty` 상태로 미저장 변경 감지
- `[취소]` — `localBranches` 를 서버 fetch 결과로 리셋
- `[변경사항 저장]` — `PATCH /api/admin/branches` 일괄 적용

### 테이블 컬럼
드래그 핸들 (`⋮⋮`) / 지점명(input) / 활성(toggle) / 상태(사용 카운트) / 삭제 버튼

---

## 3. 드래그 정렬

- `draggable` row, `handleDragStart/Over/Drop` 핸들러로 `sort_order` 재배치
- 드래그 중인 행은 `drag-ghost` (반투명), drop 타겟은 `drag-over` (상단 노란 라인)
- 정렬은 클라이언트에서 `localBranches` 만 갱신 — `[저장]` 눌러야 서버 반영
- 비활성 지점은 `opacity: 0.55` 로 흐리게 표시

---

## 4. 활성 토글

체크 해제 시:
- `/apply` 드롭다운에서 즉시 사라짐
- 대시보드 / 매트릭스 탭의 `activeBranchNames` 에서 제외
- 기존 지원자 데이터는 유지 — 사용 카운트는 그대로 노출됨

---

## 5. 사용 카운트 (상태 컬럼)

```
usageCount = data.filter(a =>
  a.branch === b.name ||
  a.branch1 === b.name ||
  a.branch2 === b.name ||
  a.confirmed_branch === b.name ||
  a.current_branch === b.name
).length
```

5개 컬럼 중 하나라도 매칭되면 카운트. **이름 변경 시 데이터 정합성 깨짐 가능** — 기존 `branch`/`branch1`/`branch2` 텍스트 컬럼은 안 따라옴. 운영 가이드 필요.

---

## 6. 삭제

`deleteBranch(id, name)` — 사용 카운트가 있어도 삭제 가능한지 라우트 코드 확인 필요. 안전상 사용 카운트 > 0 이면 비활성화만 권장.

---

## 7. 환경 / 의존성

- `/apply` 페이지: 시작 시 `/api/branches` 호출 → 활성 지점 드롭다운에 채움
- `/admin` 모든 매트릭스/필터: `activeBranchNames` 사용
- 사양서의 12지점 하드코딩(`recruitment_system_spec_v2.md` §2)은 **참고용**, 실제 운영은 이 테이블 기준

---

## 8. 한계 / 향후

- **이름 변경 시 기존 row의 `branch` 텍스트 컬럼이 동기화 안 됨** — 정합성 위험. 향후 외래키 도입 또는 일괄 UPDATE 트리거 검토.
- 드래그 정렬이 모바일에서 동작 안 함
- 권한 체크 없음 (관리자 페이지 자체 인증에 의존)
- 지점별 정원 / 슬롯 정원 관리 없음 — 현재 정원 2 하드코딩 ([admin-confirmed-slots.md](admin-confirmed-slots.md))
