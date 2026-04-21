# 구인 자동화 — 세팅 가이드

> 최종 수정: 2026.04.19 (v6)
> 변경: 슬롯 매트릭스 뷰 + 지원자 인라인 편집 PATCH API + 슬랙 off + Vercel Hobby cron(일 1회)

## 프로젝트 구조

```
app/
├── apply/
│   └── page.tsx              ← 지원 폼 UI (+ 마케팅 수신동의 + 카카오 채널 CTA)
├── admin/
│   └── page.tsx              ← 관리자 대시보드 (6개 탭)
├── api/
│   ├── apply/
│   │   └── route.ts          ← 지원 API: 저장 + 알림톡 ① 자동 발송 (슬랙 off)
│   └── admin/
│       ├── applicants/
│       │   ├── route.ts      ← GET 목록
│       │   └── [id]/
│       │       └── route.ts  ← PATCH 개별 필드 업데이트 (status/슬롯/지점/시작일/이탈)
│       ├── screening/
│       │   └── route.ts      ← 스크리닝 완료 → 알림톡 ⑥ 가이드 발송
│       ├── messages/
│       │   ├── send/
│       │   │   └── route.ts  ← 대화 메시지 발송 (SMS)
│       │   └── [applicantId]/
│       │       └── route.ts  ← 대화 내역 조회
│       ├── heartbeat/
│       │   └── route.ts      ← 전용 폰 heartbeat
│       └── cron/
│           └── reminder/
│               └── route.ts  ← 24h 무응답 리마인더 (알림톡 ②)
├── layout.tsx
└── page.tsx                  ← / → /apply 리다이렉트
lib/
├── supabase.ts               ← Supabase 클라이언트
├── solapi.ts                 ← sendSms / sendAlimtalk / sendNotification(폴백 래퍼)
├── google-sheets.ts          ← 구글 시트 동기화
└── slack.ts                  ← 슬랙 웹훅 (현재 호출처 주석 처리됨)
sms-gateway/                  ← Android SMS Gateway 앱
vercel.json                   ← Vercel Cron 설정 (일 1회 UTC 10:00)
supabase-schema.sql           ← 최초 applicants 생성
supabase-migration-messages.sql  ← messages/heartbeat/트리거 추가
supabase-migration-alimtalk.sql  ← 알림톡 전환용 컬럼 14개 + 인덱스 4개
```

## 관리자 대시보드 탭

| 탭 | 경로(UI) | 설명 |
|--|--|--|
| 대시보드 | 지표 + 지점별 현황 |
| 지원자 목록 | 필터 + 상세 패널 (인라인 편집) |
| 스크리닝 | 연락대기 → 온보딩 (알림톡 ⑥ 자동) |
| **희망 슬롯** | 지점×슬롯 매트릭스 (work_hours 희망 분포) |
| **확정 슬롯** | 지점×슬롯 매트릭스 (정원 대비 결원) |
| 배송원 컨택 | 대화 관리 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| DB | Supabase (PostgreSQL) |
| 배포 | Vercel **Hobby** (+ Vercel Cron 일 1회) |
| 발신 메시징 | SOLAPI 알림톡 + SMS 폴백 |
| 문자 수신 | Android SMS Gateway |
| 알림 | Slack Webhook (**현재 off**) |

---

## 환경변수 (.env.local + Vercel)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://lrktxyfzxwwpjffzltnq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service account>
GOOGLE_PRIVATE_KEY=<private key>
GOOGLE_SHEET_ID=<sheet id>

# Slack
SLACK_WEBHOOK_URL=<webhook>

# SOLAPI (알림톡 + SMS)
SOLAPI_API_KEY=<api key>
SOLAPI_API_SECRET=<api secret>
SOLAPI_PFID=KA01PF260418064924102qnJOZkePrns

# 알림톡 템플릿 ID (심사 승인 후 입력 — 비어있으면 SMS 폴백)
SOLAPI_TEMPLATE_APPLY_RECEIVED=   # ① 서류접수 안내
SOLAPI_TEMPLATE_REMINDER=         # ② 24h 리마인더
SOLAPI_TEMPLATE_CONFIRM=          # ③ 근무 확정 공지
SOLAPI_TEMPLATE_WAIT=             # ④ 대기자 안내
SOLAPI_TEMPLATE_ATTENDANCE=       # ⑤ 출근 전날 확인
SOLAPI_TEMPLATE_GUIDE=            # ⑥ 업무 가이드 (스크리닝 완료 시)

# 카카오톡 채널
NEXT_PUBLIC_KAKAO_CHANNEL_URL=https://pf.kakao.com/_xnxaxaib

# Cron 인증
CRON_SECRET=<32자 이상 랜덤 문자열>
```

### Vercel에 반드시 등록해야 하는 변수 (All Environments)

- `SOLAPI_PFID`
- `NEXT_PUBLIC_KAKAO_CHANNEL_URL`
- `CRON_SECRET`
- (템플릿 심사 승인 후) `SOLAPI_TEMPLATE_*` 6개

---

## Supabase 테이블 요약

### applicants (확장된 컬럼)

기본: `supabase-schema.sql`
메시지 확장: `supabase-migration-messages.sql`
알림톡/슬롯 확장: `supabase-migration-alimtalk.sql`

신규 컬럼 12개:
- `reminder_sent_at` — 리마인더 중복 방지
- `marketing_consent` / `marketing_consent_at` — 마케팅 동의
- `kakao_channel_friend` — 친구톡 대상 여부
- `start_date` — 확정 시작일
- `confirmed_slot` — `평일오전`/`평일오후`/`주말오전`/`주말오후`
- `confirmed_branch` — 확정 배치 지점
- `current_branch` — 현재 근무 지점 (null=비근무)
- `churned_at` / `churn_reason` — 이탈 추적
- `attendance_response` / `attendance_response_at` — 출근 확인 응답 (향후)

### messages 신규 컬럼

- `message_type` — `sms` / `alimtalk` / `friendtalk`
- `template_id` — 알림톡 템플릿 ID

---

## 마이그레이션 실행 순서

Supabase SQL Editor에서 순서대로:

1. `supabase-schema.sql`
2. `supabase-migration-messages.sql`
3. `supabase-migration-alimtalk.sql` ⭐ v6 신규

SQL Editor: https://supabase.com/dashboard/project/lrktxyfzxwwpjffzltnq/sql/new

---

## 진행 상태(status) 8종

| 상태 | 의미 | 편집 방법 |
|--|--|--|
| 서류심사 | 제출 직후 기본값 | 자동 |
| 연락대기 | 필터 통과, 전화 대기 | 자동 (filterPass=true 시) |
| 부적합 | 필터 탈락 | 자동 |
| 확정 | 슬롯 배치 확정 | 대시보드 상세 패널 드롭다운 |
| 대기 | 슬롯 정원 대기 | 대시보드 상세 패널 드롭다운 |
| 온보딩 | 가이드 발송 완료 | [스크리닝 완료] 버튼 |
| 현장투입 | 실제 근무 중 | 대시보드 상세 패널 드롭다운 |
| 이탈 | 근무 종료 | 상세 패널에서 '이탈' 선택 시 `churned_at` + `current_branch=null` 자동 |

---

## 인라인 편집 (PATCH API)

- 엔드포인트: `PATCH /api/admin/applicants/{id}`
- 허용 필드: `status`, `confirmed_slot`, `confirmed_branch`, `current_branch`, `start_date`, `churn_reason`, `screening`, `note`, `marketing_consent`, `kakao_channel_friend`
- 검증: status 8종 / confirmed_slot 4종 화이트리스트
- 대시보드 상세 패널에서 드롭다운/날짜 변경 시 **즉시 반영 (낙관적 업데이트)**
- 30초 폴링으로 다른 관리자의 변경사항도 수렴

---

## 알림톡 템플릿 심사 (SOLAPI 콘솔)

발신프로필: `KA01PF260418064924102qnJOZkePrns` / 채널: `@nayil` (내이루리_배송&스케쥴)

심사 제출할 템플릿 6종 본문은 `recruitment_system_spec_v2.md`의 "9. 알림톡 템플릿" 참고.

승인되면 각 `templateId`를 `.env.local` + Vercel `SOLAPI_TEMPLATE_*` 에 등록 → 자동으로 알림톡 전환됨.

---

## Vercel Cron (리마인더)

- 설정: `vercel.json` → `"schedule": "0 10 * * *"` (UTC 10:00 = **KST 19:00**)
- Hobby 플랜 제약상 **하루 1회**로 설정 (Pro 업그레이드 시 빈도 조정 가능)
- 인증: `User-Agent: vercel-cron` 자동 통과 또는 `Authorization: Bearer $CRON_SECRET`
- 발동 조건: `status ∈ {서류심사, 연락대기} AND filter_pass='Y' AND reminder_sent_at IS NULL AND created_at < now()-24h`

수동 호출 (개발/검증):
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://recruitment-z9vp.vercel.app/api/admin/cron/reminder
```

---

## 지원 폼 URL

```
https://recruitment-sooty.vercel.app/apply?source=meta&branch=광진자양
https://recruitment-sooty.vercel.app/apply?source=kakao&branch=강북미아
https://recruitment-sooty.vercel.app/apply?source=albamon&branch=은평
https://recruitment-sooty.vercel.app/apply?source=direct
```

### branch 파라미터 목록
은평, 마포상암, 서대문신촌, 용산한남, 도봉쌍문, 중구명동, 성동옥수, 동대문제기, 강북미아, 노원중계, 중랑면목, 광진자양

---

## 배포 체크리스트

### 완료
- [x] Next.js 프로젝트 초기화
- [x] Supabase 테이블 3개 생성 + 마이그레이션 3개 적용
- [x] Vercel 배포 + 환경변수 (SOLAPI_PFID, KAKAO_CHANNEL_URL 등)
- [x] 지원 폼 + 마케팅 동의 + 완료 페이지 카톡 채널 CTA
- [x] 관리자 대시보드 6개 탭 (대시보드/지원자/스크리닝/희망슬롯/확정슬롯/컨택)
- [x] 지원자 인라인 편집 PATCH API
- [x] 슬롯 매트릭스 뷰 2종 (희망/확정)
- [x] 알림톡 폴백 래퍼 (`sendNotification`)
- [x] 자동 발송 연결: 지원 직후 ①, 스크리닝 완료 ⑥
- [x] 리마인더 크론 (일 1회, 알림톡 ②)
- [x] 구글 시트 동기화
- [x] SMS 송수신 + SMS Gateway + heartbeat
- [x] 슬랙 알림 임시 off

### 진행 중 / 예정
- [ ] 알림톡 템플릿 6종 SOLAPI 콘솔 심사 제출
- [ ] 승인된 templateId 환경변수 등록
- [ ] 확정/대기 처리 시 알림톡 ③/④ 자동 발송 연결
- [ ] 출근 전날 확인 크론 (템플릿 ⑤) + 응답 웹훅
- [ ] 외부 채널 수동 입력 폼 (`/admin/manual-entry`)
- [ ] 광고성 일괄 발송 UI (친구톡/SMS 분기)
- [ ] 카카오 오픈채팅 홍보봇
- [ ] 메타 광고 랜딩 URL 세팅

---

## SMS Gateway (전용 폰)

`sms-gateway/` 디렉토리에 Android 프로젝트.

### 설정
1. `sms-gateway/local.properties`에 Supabase URL/Key 설정
2. Android Studio에서 빌드
3. 전용 폰에 APK 설치 후 SMS 권한 허용

### 동작
- 지원자가 전용 폰 번호로 문자 발송 → 앱 수신 → Supabase messages 저장
- 관리자 대시보드 실시간 확인 + 답장
- 5분마다 heartbeat 전송 → 상태 바 표시
