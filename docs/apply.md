# 지원 폼 (`/apply`)

배송원 지원 접수 폼. 메타 광고 / 알바몬 / 카카오 오픈채팅 / 직접 유입 등 모든 채널이 이 폼으로 수렴한다.

- 페이지: [app/apply/page.tsx](../app/apply/page.tsx) (841줄, `"use client"` Suspense 래핑)
- API: [app/api/apply/route.ts](../app/api/apply/route.ts)
- 지점 목록 API: [app/api/branches/route.ts](../app/api/branches/route.ts) — `active=true` 지점만 반환

---

## 1. URL 파라미터

| 파라미터 | 용도 | 예시 |
|--|--|--|
| `source` | 유입 채널 추적 | `meta` / `kakao` / `albamon` / `direct` (기본) |
| `branch` | 지점 사전 선택 (1지망 자동 채움) | `광진자양` |

예: `https://recruitment-sooty.vercel.app/apply?source=meta&branch=강북미아`

---

## 2. 폼 필드

| 필드 | 타입 | 필수 | 비고 |
|--|--|--|--|
| 성함 | text | ✅ | |
| 생년월일 6자리 | text(숫자) | ✅ | YYMMDD, 50~99→19xx / 00~49→20xx 자동 변환 |
| 휴대폰 번호 | text(숫자) | ✅ | `010-XXXX-XXXX` 자동 포매팅 |
| 거주지 (동단위) | text | ✅ | **다음 우편번호 API** 연동 (`postcode.v2.js` 동적 로딩) |
| 자기명의 차량 여부 | 버튼 (있음/없음) | ✅ | 필터 기준 |
| 운전면허 종류 | 드롭다운 | ✅ | `1종 보통` / `2종 보통` / `1종 대형` / `없음` |
| 차종 | text | ✅ | |
| 희망지점 1지망 | 드롭다운 | ✅ | `/api/branches`에서 동적 로드 |
| 희망지점 2지망 | 드롭다운 | 선택 | 1지망과 다른 지점만 |
| 희망 근무 시간대 | 체크박스 (4슬롯 복수) | ✅ | `평일오전`/`평일오후`/`주말오전`/`주말오후` (콤마 join 저장) |
| 자기소개 및 지원동기 | textarea | ✅ | |
| 배달 업무 관련 경력 | textarea | 선택 | |
| 업무 시작 가능일 | date picker | ✅ | |
| 본인 명의 업무/정산 가능 여부 | 버튼 | ✅ | `문제 없음` 만 통과 |
| 마케팅 정보 수신 동의 | 체크박스 | 선택 | 기본 `true`, `marketing_consent_at` 함께 기록 |

---

## 3. 자동 필터 (filter_pass)

`POST /api/apply` 진입 시 3조건 AND로 자동 판정.

```ts
filterPass =
  ownVehicle === "있음" &&
  ["1종 보통","2종 보통","1종 대형"].includes(licenseType) &&
  selfOwnership === "문제 없음";

autoStatus = filterPass ? "서류심사" : "부적합";
```

- 통과 시: `status='서류심사'`, `filter_pass='Y'` → 시트2(스크리닝 관리) 추가 전송
- 탈락 시: `status='부적합'`, `filter_pass='N'`

---

## 4. 중복 지원 처리

- 키: `phone` 일치
- 중복이어도 **저장은 진행**. `note='중복지원'` 만 기록 → 지원자 목록에서 `중복` 태그 노출
- 응답 JSON에 `{ duplicate: true }` 포함

---

## 5. 저장 후 자동 처리

`route.ts`가 직렬로 처리 (각 단계 실패해도 다음 단계 계속):

1. **주소 지오코딩** ([lib/kakao-geocode.ts](../lib/kakao-geocode.ts)) — `lat/lng/sido/sigungu/bname/road_address` 보강. 실패 시 null 저장.
2. **Supabase `applicants` insert** — 상기 모든 컬럼 + `branch=branch1`(현재 지점) + `marketing_consent`/`marketing_consent_at`.
3. **구글 시트 동기화** — [lib/google-sheets.ts](../lib/google-sheets.ts) `appendToSheet()`.
4. **시트2 동기화** (필터 통과자만) — `appendToScreeningSheet({ name, phone, branch, available_date, status })`.
5. **슬랙 알림** — **현재 off** (코드 주석 처리). 복구는 [app/api/apply/route.ts:148-160](../app/api/apply/route.ts#L148-L160) 주석 해제.
6. **알림톡 ① 자동 발송** — 템플릿 키 `APPLY_RECEIVED`, 변수 `#{이름}`/`#{지점}`/`#{접수일시}`. 환경변수 `SOLAPI_TEMPLATE_APPLY_RECEIVED`가 없거나 발송 실패 시 SMS 폴백 ([lib/solapi.ts](../lib/solapi.ts)). `messages` 테이블에 `outbound` 기록(`message_type` = `alimtalk` 또는 `sms`).

---

## 6. 완료 페이지 (step="done")

- "지원이 완료되었습니다" 메시지
- **카카오톡 채널 추가 CTA** — `NEXT_PUBLIC_KAKAO_CHANNEL_URL` (현재 `https://pf.kakao.com/_xnxaxaib` — 내이루리_배송&스케쥴)
- 중복 지원이면 안내 문구 분기

---

## 7. 환경변수

| 변수 | 용도 |
|--|--|
| `NEXT_PUBLIC_KAKAO_CHANNEL_URL` | 완료 페이지 채널 추가 버튼 |
| `KAKAO_REST_API_KEY` | 지오코딩 (lib/kakao-geocode.ts) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | DB 저장 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_FROM` | 발신 |
| `SOLAPI_PFID` | 알림톡 발신프로필 (`KA01PF260418064924102qnJOZkePrns`) |
| `SOLAPI_TEMPLATE_APPLY_RECEIVED` | 알림톡 ① 템플릿 ID (없으면 SMS 폴백) |
| `GOOGLE_SHEETS_*` | 시트1/시트2 동기화 |

---

## 8. 알려진 한계 / 향후

- 시트 동기화 실패 시 재시도 없음 (콘솔만 로그) — 실제 운영 손실은 미미하나 모니터링 필요.
- 슬랙 알림 off 상태 — 신규 지원 즉시 인지 채널이 없음. 대시보드 폴링/Realtime 의존.
- 지오코딩 실패율 측정 안 됨.
- 마케팅 수신 미동의 시 광고성 일괄 발송에서 자동 제외하는 로직은 [admin-recommend.md](admin-recommend.md) 참고.
