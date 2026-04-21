# 구인 자동화 시스템 — 전체 설계 문서 v6

> 최종 정리일: 2026.04.19
> v6 변경사항: 슬롯 매트릭스 뷰(희망/확정) 구축, 지원자 인라인 편집, 슬랙 알림 off, Vercel Hobby 호환 cron 스케줄

---

## 1. 시스템 개요

배달/운송 기사 채용 전 과정을 자동화하는 시스템.
모집 → 서류심사 → 전화스크리닝 → 확정/대기 → 온보딩 → 현장투입 → 이탈/재활용까지의 파이프라인을 구축한다.

### 핵심 원칙
- **셀레니움 사용 절대 금지** (외부 플랫폼 자동화 X)
- **Supabase가 메인 DB**, 구글 시트는 담당자용 대시보드
- **외부 노코드 도구(Make 등) 미사용** — Next.js API route에서 직접 처리
- 발신 메시징은 **SOLAPI 알림톡(우선) + SMS 폴백** — 템플릿 ID 환경변수 있으면 알림톡, 없으면 SMS로 자동 전환
- 수신은 **전용 폰 SMS Gateway** (카카오 채널 1:1 답장은 API 미제공으로 SMS 양방향 유지)
- 광고는 **메타 광고** (준비 완료)
- **Vercel Hobby 플랜 유지** (cron 하루 1회 제한 내에서 운영)

### AS-IS vs TO-BE

| 단계 | 현재 (수동/SMS) | 자동화 후 |
|------|------------|-----------|
| 지원서 확인 | 시트 12개 따로 확인 | 관리자 대시보드 하나 |
| 지원 직후 안내 | 없음 | 알림톡 자동 발송 (템플릿 ①) |
| 무응답 리마인드 | 수동 재발송 | 24h 무응답 시 매일 1회 자동 (템플릿 ②) |
| 서류심사 | 수동 확인 | 대시보드 필터 |
| 전화 스크리닝 | 유지 | 유지 |
| 확정/대기 처리 | 복붙 SMS + 시트 수동 업데이트 | 대시보드 드롭다운 → Supabase 즉시 반영 + 알림톡 (템플릿 ③/④) |
| 가이드 공유 | 매니저가 하나씩 | 스크리닝 완료 시 자동 (템플릿 ⑥) |
| 출근 전날 확인 | 전화 한 통씩 | 버튼 알림톡 자동 (템플릿 ⑤, 향후) |
| 희망 슬롯 풀 파악 | 수동 카운트 | 희망 슬롯 매트릭스 뷰 (지점 × 슬롯) |
| 확정 인원 파악 | 시트 따로 관리 | 확정 슬롯 매트릭스 뷰 (정원 대비 결원 시각화) |
| 대기자 재활용 | 시트 조건 수동 필터 | 매트릭스 drill-down + 인라인 편집 |
| 이탈 관리 | 기록 없음 | 상태 '이탈' 선택 시 `churned_at` + `current_branch=null` 자동 |
| 지원자 문자 확인 | 전용 폰 직접 확인 | 대시보드 대화 화면 |
| 문자 답장 | 전용 폰 직접 타이핑 | 대시보드에서 SOLAPI 발송 |
| 중복 지원 탐지 | 육안 | 전화번호 기준 자동 감지 |

---

## 2. 지점 목록 (12개)

| branch 파라미터 | 지점명 | 주소 |
|----------------|--------|------|
| `은평` | 은평 | 서울 은평구 녹번동 155-20 |
| `마포상암` | 마포상암 | 서울 마포구 상암동 1647 |
| `서대문신촌` | 서대문신촌 | 서울 서대문구 신촌로 73 |
| `용산한남` | 용산한남 | 서울 용산구 이태원동 183-1 |
| `도봉쌍문` | 도봉쌍문 | 서울 도봉구 덕릉로63가길 60 |
| `중구명동` | 중구명동 | 서울 종로구 종로12길 15 |
| `성동옥수` | 성동옥수 | 서울 성동구 고산자로6길 40 |
| `동대문제기` | 동대문제기 | 서울 동대문구 용두동 788 |
| `강북미아` | 강북미아 | 서울 강북구 미아동 35-4 |
| `노원중계` | 노원중계 | 서울 노원구 하계동 256-14 |
| `중랑면목` | 중랑면목 | 서울 중랑구 겸재로 240 |
| `광진자양` | 광진자양 | 서울 성동구 아차산로17길 49 |

---

## 3. 슬롯 구조

지점별 근무 슬롯 = **평일/주말 × 오전/오후 = 4개**. 각 슬롯당 **확정 2명 + 대기 1명** 편성.

| 슬롯 키 | 시간대 | 확정 정원 | 대기 정원 |
|--|--|--|--|
| `평일오전` | 월~금 08:00 ~ 13:00 | 2 | 1 |
| `평일오후` | 월~금 11:00 ~ 16:00 | 2 | 1 |
| `주말오전` | 토~일 08:00 ~ 13:00 | 2 | 1 |
| `주말오후` | 토~일 11:00 ~ 16:00 | 2 | 1 |

**지점당 정원**: 확정 8 + 대기 4 = **12명**. 12개 지점 총 정원 144명.

### 진행 상태 (status)

| 상태 | 색상 | 의미 |
|--|--|--|
| 서류심사 | 회색 | 제출 직후, 아직 필터 미통과 또는 검토 대기 |
| 연락대기 | 파랑 | 필터 통과, 전화 스크리닝 대기 |
| 부적합 | 빨강 | 필터 탈락 |
| 확정 | 하늘 | 슬롯 배치 확정 |
| 대기 | 보라 | 특정 슬롯 대기자 (정원 대기) |
| 온보딩 | 주황 | 가이드 발송 완료, 근무 시작 전 |
| 현장투입 | 초록 | 실제 근무 중 (`current_branch` 입력됨) |
| 이탈 | 다크그레이 | 근무 종료 (`churned_at` 기록) |

---

## 4. 모집 채널

### 채널 A — 메타 광고 (핵심 유입)
- URL: `https://recruitment-sooty.vercel.app/apply?source=meta&branch=광진자양`
- 상태: 광고 계정 준비 완료
- 주의: "특별 광고 카테고리(고용)" 설정 필요

### 채널 B — 카카오 오픈채팅 홍보봇 (보조)
- URL: `?source=kakao&branch=지점명`
- 상태: 코드 미작성

### 채널 C — 알바몬 / 알바천국 (수동)
- URL: `?source=albamon&branch=지점명`

### 채널 D — 외부 플랫폼 수동 입력 (향후)
- 50+/당근 등 외부 유입 지원자를 매니저가 `/admin/manual-entry` 폼으로 입력
- 전제: "모든 채널 → Supabase" 운영 규칙 합의

---

## 5. 지원 폼

### 기술 스택
- Next.js 14 (App Router) / Supabase / Vercel

### 폼 필드

| 필드명 | 타입 | 필수 |
|--------|------|------|
| 성함 | text | O |
| 생년월일 6자리 | text (숫자) | O |
| 휴대폰 번호 | text (숫자) | O |
| 거주지 (동단위) | text | O |
| 자기명의 차량 여부 | 버튼 (있음/없음) | O |
| 운전면허 종류 | 드롭다운 | O |
| 차종 | text | O |
| 희망지점 1지망 | 드롭다운 | O |
| 희망지점 2지망 | 드롭다운 | 선택 |
| 희망 근무 시간대 | 체크박스 (4슬롯 복수) | O |
| 자기소개 및 지원동기 | textarea | O |
| 배달 업무 관련 경력 | textarea | 선택 |
| 업무 시작 가능일 | date picker | O |
| 본인 명의 업무/정산 가능 여부 | 버튼 | O |
| **마케팅 정보 수신 동의** | **체크박스** | **선택** |

### 제출 완료 페이지
- 카카오톡 채널 추가 CTA (`NEXT_PUBLIC_KAKAO_CHANNEL_URL` 환경변수, 현재 `https://pf.kakao.com/_xnxaxaib` — 내이루리_배송&스케쥴)
- 지원 직후 알림톡 ① 자동 발송 (SMS 폴백)

---

## 6. 데이터 저장

### Supabase 테이블 (applicants)

`supabase-schema.sql` + `supabase-migration-messages.sql` + `supabase-migration-alimtalk.sql` 누적 스키마

| 그룹 | 컬럼 | 타입 | 비고 |
|--|--|--|--|
| 기본 | id / created_at / name / birth_date / phone / location | - | 지원 시 입력 |
| 차량 | own_vehicle / license_type / vehicle_type | - | 지원 시 입력 |
| 희망 | branch1 / branch2 / work_hours | - | 희망 지점 + 4슬롯 콤마 join |
| 기타 입력 | introduction / experience / available_date / self_ownership | - | 지원 시 입력 |
| 분류 | status / branch / source / filter_pass / screening / note | - | 시스템/매니저 관리 |
| 대화 | last_message_at / unread_count | - | 메시지 트리거 자동 갱신 |
| 리마인더 | **reminder_sent_at** | TIMESTAMPTZ | 중복 발송 방지 |
| 마케팅 | **marketing_consent / marketing_consent_at** | BOOLEAN / TIMESTAMPTZ | 수신 동의 |
| 채널 | **kakao_channel_friend** | BOOLEAN | 친구톡 대상 판단 |
| 확정 | **start_date** | DATE | 확정된 시작일 |
| 확정 | **confirmed_slot** | TEXT | `평일오전`/`평일오후`/`주말오전`/`주말오후` |
| 확정 | **confirmed_branch** | TEXT | 실제 배치 지점 |
| 근무 | **current_branch** | TEXT | 현재 근무 지점 (null=비근무) |
| 이탈 | **churned_at / churn_reason** | TIMESTAMPTZ / TEXT | 이탈 추적 |
| 출근 | **attendance_response / attendance_response_at** | TEXT / TIMESTAMPTZ | 출근확인 응답 (향후) |

### Supabase 테이블 (messages)

| 컬럼 | 용도 |
|--|--|
| id / applicant_id / applicant_phone | 식별 |
| direction | inbound / outbound |
| body / status / sent_by / solapi_msg_id / device_id | 본문 + 메타 |
| **message_type** | `sms` / `alimtalk` / `friendtalk` |
| **template_id** | 알림톡 템플릿 ID |
| created_at | 시각 |

---

## 7. 관리자 대시보드

### 탭 구성 (6개)

| 탭 | 목적 |
|--|--|
| 대시보드 | 전체 지표 + 지점별 현황 |
| 지원자 목록 | 필터/검색, 상세 패널 + **인라인 편집** |
| 스크리닝 | 연락대기 → 온보딩 이행 (알림톡 ⑥ 자동 발송) |
| **희망 슬롯** | 지점×슬롯 매트릭스 (work_hours 희망 분포) |
| **확정 슬롯** | 지점×슬롯 매트릭스 (confirmed_slot + confirmed_branch 기반 정원 시각화) |
| 배송원 컨택 | 미읽음 우선 정렬 + 대화 화면 |

### 인라인 편집 가능 필드

지원자 상세 패널에서 드롭다운/날짜/텍스트 변경 시 **즉시 PATCH → Supabase 반영** (낙관적 업데이트):
- `status` (진행 상태, 8종)
- `confirmed_slot` (4슬롯 중 택1)
- `confirmed_branch` (12지점 중 택1)
- `current_branch` (근무 중 지점)
- `start_date` (확정 시작일)
- `churn_reason` (status=이탈일 때만 노출)

상태를 `이탈`로 변경하면 `current_branch=null` + `churned_at=now()` 자동 기록.

### 희망 슬롯 매트릭스 (뷰)
- 셀값 = `filter_pass='Y' AND status ∈ 활성상태 AND (branch1 또는 branch2 = 지점) AND work_hours에 슬롯 포함`
- 색상: 0명=회색, 1~2명=노랑, 3+명=진한 노랑
- 셀 클릭 → drill-down 목록 (지원자 이름 클릭 시 상세로 이동)

### 확정 슬롯 매트릭스 (뷰)
- 셀값 = `확정 X/2 · 대기 Y/1`
  - 확정: `status ∈ {확정, 온보딩, 현장투입} AND confirmed_slot + confirmed_branch 매칭`
  - 대기: `status = '대기' AND confirmed_slot + confirmed_branch 매칭`
- 색상: 정원충족(초록) / 확정만(파랑) / 확정부족(빨강) / 빈슬롯(회색)
- 셀 클릭 → 배치된 인원 drill-down

---

## 8. 자동화 흐름

### 전체 파이프라인

```
[유입]
 │  메타광고 / 알바몬 / 당근·50+ / 카카오 오픈채팅
 ▼
[1] /apply 폼 작성 (+ 마케팅 수신동의 체크박스)
 │
 ▼
[2] Supabase 저장 + (슬랙 알림 off) + 구글 시트 동기화
 │  filterPass 자동 판정 → status = '연락대기' or '부적합'
 ▼
[3] 알림톡 ① 서류접수 안내 자동 발송 (SMS 폴백)
 │  messages 테이블에 기록
 ▼
[4] 완료 페이지: 카카오톡 채널 추가 CTA
 │
 ▼
[5] 24h 무응답자 크론 (매일 10:00 UTC = KST 19:00)
 │  status ∈ {서류심사, 연락대기} AND filter_pass='Y' AND reminder_sent_at IS NULL AND created_at < now()-24h
 │  → 알림톡 ② 발송 + reminder_sent_at 기록
 ▼
[6] 관리자: 전화 스크리닝 + 대시보드에서 [스크리닝 완료] 클릭
 │  → 알림톡 ⑥ 가이드 자동 발송 + status='온보딩'
 ▼
[7] 관리자: 상세 패널에서 인라인 편집
 │  confirmed_slot / confirmed_branch / start_date 지정
 │  status → '확정' 또는 '대기'
 │  ※ 확정/대기 알림톡 ③/④ 발송은 향후 자동화 예정 (현재는 수동 트리거)
 ▼
[8] 근무 시작 시 current_branch 입력 → status='현장투입'
 │  확정 슬롯 매트릭스에 카운트 반영
 ▼
[9] 이탈 시 status='이탈' → churned_at + current_branch=null 자동
 │
 ▼
[10] 재모집 시 희망 슬롯 매트릭스 + drill-down 리스트 활용
```

### 크론/트리거

| 트리거 | 실행 | 구현 |
|--------|------|-----|
| 폼 제출 | 저장 + 알림톡 ① + 시트 | `app/api/apply/route.ts` |
| 스크리닝 완료 | 알림톡 ⑥ + 온보딩 | `app/api/admin/screening/route.ts` |
| 24h 무응답 | 알림톡 ② 리마인더 | `app/api/admin/cron/reminder/route.ts` + `vercel.json` (일 1회, UTC 10:00) |
| 지원자 필드 변경 | Supabase 즉시 업데이트 | `app/api/admin/applicants/[id]/route.ts` (PATCH) |
| 전용 폰 SMS 수신 | messages 저장 + 트리거 | SMS Gateway + DB trigger |
| 전용 폰 heartbeat | 5분마다 | SMS Gateway |

### 슬랙 알림 현재 상태
- **off** (주석 처리됨) — 운영 판단에 따라 임시 비활성화
- 복구: `app/api/apply/route.ts`의 슬랙 알림 블록 주석 해제

---

## 9. 알림톡 템플릿 (6종)

SOLAPI 발신프로필 `KA01PF260418064924102qnJOZkePrns` (채널: `@nayil` 내이루리_배송&스케쥴) 사용.
템플릿 심사 승인 전에는 **SMS 폴백**으로 대체 동작 → 운영 영향 없음.

| # | 키 (env 접미) | 상태 | 용도 |
|--|--|--|--|
| ① | `APPLY_RECEIVED` | 심사 제출 필요 | 지원 접수 직후 자동 |
| ② | `REMINDER` | 심사 제출 필요 | 24h 무응답 리마인더 |
| ③ | `CONFIRM` | 심사 제출 필요 | 근무 확정 공지 (버튼: 가이드) |
| ④ | `WAIT` | 심사 제출 필요 | 대기자 안내 |
| ⑤ | `ATTENDANCE` | 심사 제출 필요 | 출근 전날 확인 (버튼 2개) |
| ⑥ | `GUIDE` | 심사 제출 필요 | 가이드 공유 (스크리닝 완료 시) |

본문/변수/버튼 상세는 기존 v5 문서 보존 — 템플릿 본문은 심사 제출 시 그대로 사용.

---

## 10. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프론트엔드 | Next.js 14 | 지원 폼 + 관리자 대시보드 |
| DB | Supabase | applicants/messages/device_heartbeat |
| 배포 | Vercel **Hobby** | cron 하루 1회 제한 준수 |
| 발신 메시징 | SOLAPI 알림톡 + SMS 폴백 | pfId: `KA01PF260418064924102qnJOZkePrns` |
| 카카오 채널 | 내이루리_배송&스케쥴 | `@nayil` / `https://pf.kakao.com/_xnxaxaib` |
| 문자 수신 | Android SMS Gateway | 전용 폰 → Supabase |
| 알림 | Slack Webhook | **현재 off** |
| 광고 | Meta Ads | 지원자 유입 |

---

## 11. 진행 현황

| Phase | 내용 | 상태 |
|------|------|------|
| 1 | 지원 폼 + Supabase + Vercel 배포 | ✅ 완료 |
| 2 | 구글 시트 연동 + 슬랙 알림 | ✅ 완료 (슬랙은 현재 off) |
| 3 | 관리자 대시보드 (지원자 + 스크리닝) | ✅ 완료 |
| 4 | 스크리닝 완료 → SOLAPI SMS 발송 | ✅ 완료 |
| 5 | 문자 송수신 (대화 화면 + SMS Gateway) | ✅ 완료 |
| 6 | 전용 폰 heartbeat | ✅ 완료 |
| 7 | 알림톡 전환 기반 (폴백 래퍼 + 템플릿 ①⑥ 연결) | ✅ 완료 (템플릿 심사 대기) |
| 8 | 리마인더 크론 (템플릿 ②) | ✅ 완료 (Hobby 호환: 일 1회) |
| 9 | 상태 추적 컬럼 (confirmed/current/churn/start_date 등) | ✅ 완료 |
| 10 | 희망/확정 슬롯 매트릭스 뷰 + 인라인 편집 | ✅ 완료 |
| 11 | 확정/대기 알림톡 ③/④ 자동 발송 연결 | ⏳ 예정 |
| 12 | 출근 전날 확인 크론 (템플릿 ⑤ + 버튼 웹훅) | ⏳ 예정 |
| 13 | 외부 채널 수동 입력 폼 (`/admin/manual-entry`) | ⏳ 예정 |
| 14 | 광고성 일괄 발송 (친구톡/SMS 분기) | ⏳ 예정 |
| 15 | 카카오 홍보봇 + 메타 광고 URL 세팅 | ⏳ 예정 |

---

## 12. 리스크 매트릭스

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| 알림톡 템플릿 심사 반려 | 중 | 중 | SMS 폴백 자동 동작, 재제출 |
| 카카오톡 미가입자 | 중 | 낮 | SMS 자동 폴백 |
| Vercel Hobby cron 빈도 제한 | - | - | 일 1회 리마인더로 고정 |
| 알바몬 "홈페이지 접수" 정책 제한 | 중 | 낮 | 자체 폼 병행 |
| 메타 광고 타겟팅 제한 | 중 | 중 | "특별 광고 카테고리(고용)" 설정 |
| 중복 지원자 혼선 | 중 | 중 | 전화번호 중복 자동 감지 |
| 이탈자 재연락 사고 | 중 | 중 | `current_branch`/`churned_at` 기반 필터 |
| 대시보드 동시 편집 충돌 | 낮 | 낮 | 30초 폴링으로 수렴 (마지막 저장자 우선) |

---

## 13. 향후 확장 계획

| 시기 | 내용 |
|------|------|
| 지금 | SOLAPI 콘솔에서 템플릿 6종 심사 제출 (1~2영업일) |
| 심사 승인 후 | `.env` + Vercel에 `SOLAPI_TEMPLATE_*` 6개 입력 → 알림톡 자동 전환 |
| 운영 1~2주 | 희망/확정 매트릭스 활용도 측정, 리마인더 효과 측정 |
| 운영 1개월 | 확정/대기 알림톡 ③/④ 자동 발송 + 출근 확인 크론 ⑤ |
| 운영 2개월 | 외부 채널 수동 입력 + 광고성 일괄 발송 |
| 운영 3개월 | Supabase Realtime (폴링 → push) |
| 장기 | AI 콜봇 / 당근비즈니스 입점 |
