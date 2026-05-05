# 배송원 추천 탭 (`tab="recommend"`)

공고 텍스트를 입력하면 Claude가 상차지 주소를 추출하고, 후보 풀에서 점수 상위 후보를 추천. 선택한 후보들에게 공고를 SMS로 일괄 발송.

- 위치: [app/admin/page.tsx:1487-1694](../app/admin/page.tsx#L1487-L1694)
- 추천 API: [app/api/admin/recommend/route.ts](../app/api/admin/recommend/route.ts)
- 공고 자동 생성 API: [app/api/admin/recommend/generate/](../app/api/admin/recommend/generate/)
- 일괄 발송 API: [app/api/admin/messages/bulk-send/](../app/api/admin/messages/bulk-send/)
- 점수 로직: [lib/scoring.ts](../lib/scoring.ts)
- Claude 호출: [lib/claude.ts](../lib/claude.ts)

---

## 1. 사용 흐름

1. (선택) **공고 자동 생성** — 대충 입력한 메모를 Claude가 정형 공고로 다듬음
2. 공고 텍스트 입력 + **차량 필요 여부** 라디오 선택
3. (선택) 상차지 주소 직접 입력 — Claude 자동 추출 건너뛰기
4. `[추천 받기]` → 점수 상위 10명 표시
5. 체크박스로 발송 대상 선택 (`전체 선택`/`전체 해제`)
6. (선택) `10명 더 받기` — 최대 50명까지 페이지네이션
7. 발송 미리보기 확인 → `[N명에게 발송]` SMS 일괄 송출

---

## 2. 공고 자동 생성 (✨)

`<details>` 패널 안에 위치. 추천 결과가 비어 있으면 자동으로 펼쳐짐(`open={!recPosting}`).

- 입력 예시: `강북미아 토일 장보기 자차, 시급 1.5~2만, 픽업 도봉로 34`
- API가 빠진 항목을 `[?]` 로 표시 → UI에서 chip으로 안내(`recGenMissing`)
- 사용자가 직접 채워서 본 textarea로 전달

---

## 3. 후보 점수 계산 ([lib/scoring.ts](../lib/scoring.ts))

만점 100점:

| 항목 | 점수 |
|--|--|
| **거리** (haversine, 픽업↔거주지) | ≤3km: 70 / ≤7km: 50 / ≤15km: 30 / ≤25km: 15 / 그 외: 0 |
| **차량** | 차량 필요 + 보유: 20 / 차량 필요 + 미보유: 0 / 차량 불필요: 12 (전원 동일) |
| **최신성** (지원일 경과) | ≤30일: 10 / ≤90일: 8 / ≤180일: 5 / 그 외: 0 |

`rankCandidates()` 가 점수 내림차순 정렬 후 `topN=10` 슬라이스.

---

## 4. 후보 풀 (source 2종)

| source | 출처 | 용도 |
|--|--|--|
| `applicant` (신규) | `applicants` 테이블 | 진행 중/이탈 포함 (라우트가 어떤 status를 풀에 포함하는지는 라우트 코드 확인 필요) |
| `legacy` | `legacy_applicants` 류 (이력 마이그레이션) | 과거 옹고잉 응시자 — `import_legacy.py`로 가져온 데이터 |

UI 배지로 `신규` / `레거시` 구분 (`src-active` / `src-legacy`).

---

## 5. 결과 테이블 컬럼

순위 / 이름·전화 / 나이(`birth_date`로부터 계산) / 출처 / 거리(km) / 차량(`own_vehicle`) / 시군구 / 점수 총점 / 세부(`거리·차량·최신성`)

체크박스로 선택, 선택 카운트(`{selected}/{total}명 선택됨`) 표시.

---

## 6. 일괄 발송

- `recPosting` 텍스트 그대로 SMS 전송 (알림톡 전환 미적용 — 마케팅성 메시지)
- `messages` 테이블에 `direction='outbound'`, `message_type='sms'`, `sent_by` 매니저 ID/세션 식별자 기록
- 한 번 발송된 메시지는 회수 불가 (UI에 경고)
- **마케팅 수신 동의** 미동의자 자동 제외 여부는 `bulk-send` 라우트 코드 확인 필요 — 동의 컬럼(`marketing_consent`)이 적재돼 있으므로 응당 필터링되어야 함

---

## 7. 환경변수

| 변수 | 용도 |
|--|--|
| `ANTHROPIC_API_KEY` | Claude (주소 추출/공고 생성) |
| `KAKAO_REST_API_KEY` | 픽업 주소 지오코딩 |
| `SOLAPI_*` | 일괄 SMS 발송 |

---

## 8. 한계 / 향후

- **점수 가중치 하드코딩** — 운영 데이터로 가중치 튜닝 시 코드 수정 필요
- **희망 시간대(work_hours)** 와 공고 시간대 매칭 안 함 — 거리/차량/최신성만 점수에 반영
- 발송 후 응답률 추적 대시보드 없음
- 광고성/정보성 분리 미적용 (현재는 정보성으로 간주)
- 친구톡 발송 (카카오 채널 친구) 분기 미구현 (`kakao_channel_friend` 컬럼은 있음)
- `이탈` 상태 후보 자동 제외 여부는 `recommend/route.ts` 검수 필요
