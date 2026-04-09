# 구인 자동화 — 세팅 가이드

> 최종 수정: 2026.04.09

## 프로젝트 구조

```
app/
├── apply/
│   └── page.tsx              ← 지원 폼 UI
├── admin/
│   └── page.tsx              ← 관리자 대시보드 (지원자 목록 + 스크리닝 + 문자 대화)
├── api/
│   ├── apply/
│   │   └── route.ts          ← 지원 API (Supabase 저장)
│   └── admin/
│       ├── applicants/
│       │   └── route.ts      ← 지원자 목록 조회
│       ├── screening/
│       │   └── route.ts      ← 스크리닝 완료 + 온보딩 문자 발송
│       ├── messages/
│       │   ├── send/
│       │   │   └── route.ts  ← 문자 발송 (솔라피) + messages 저장
│       │   └── [applicantId]/
│       │       └── route.ts  ← 대화 내역 조회 + 안읽음 초기화
│       └── heartbeat/
│           └── route.ts      ← 전용 폰 heartbeat 조회
├── layout.tsx
└── page.tsx                  ← / 접속 시 /apply로 리다이렉트
lib/
├── supabase.ts               ← Supabase 클라이언트
├── solapi.ts                  ← 솔라피 SMS 발송 유틸
├── google-sheets.ts           ← 구글 시트 동기화
└── slack.ts                   ← 슬랙 알림
sms-gateway/                   ← Android SMS 게이트웨이 앱 (전용 폰용)
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| DB | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 문자 발송 | SOLAPI |
| 문자 수신 | Android SMS Gateway → Supabase |
| 대시보드 | 관리자 웹 (Next.js) + 구글 시트 |
| 알림 | Slack Webhook |

---

## 환경변수 (.env.local)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://lrktxyfzxwwpjffzltnq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# SOLAPI
SOLAPI_API_KEY=<api key>
SOLAPI_API_SECRET=<api secret>
```

Vercel 배포 시: Settings → Environment Variables에 동일하게 추가

---

## Supabase 테이블

### applicants

`supabase-schema.sql` 참고. 주요 컬럼:

| 컬럼 | 설명 |
|------|------|
| name | 성함 |
| birth_date | 생년월일 6자리 |
| phone | 휴대폰 번호 (중복 체크 기준) |
| location | 거주지 |
| own_vehicle | 자기명의 차량 여부 |
| license_type | 운전면허 종류 |
| vehicle_type | 차종 |
| branch1 / branch2 | 희망지점 1·2지망 |
| work_hours | 희망 근무 시간대 |
| introduction | 자기소개 및 지원동기 |
| experience | 배달 업무 관련 경력 |
| available_date | 업무 시작 가능일 |
| self_ownership | 본인 명의 업무/정산 가능 여부 |
| status | 진행상황 (기본: 서류심사) |
| branch | 지점 태그 (URL 파라미터) |
| source | 유입 채널 (URL 파라미터) |
| note | 비고 (중복지원 등) |
| last_message_at | 마지막 문자 시각 (트리거 자동 갱신) |
| unread_count | 안읽은 수신 메시지 수 |

### messages

`supabase-migration-messages.sql` 참고.

| 컬럼 | 설명 |
|------|------|
| id | uuid PK |
| applicant_id | applicants FK (nullable, phone으로 자동 매칭) |
| applicant_phone | 발신/수신 전화번호 |
| direction | inbound (수신) / outbound (발신) |
| body | 문자 내용 |
| status | received / sent / synced / failed |
| sent_by | 발송자 (outbound일 때 팀원 이름) |
| solapi_msg_id | 솔라피 응답 messageId |
| device_id | SMS Gateway 폰 ID |
| created_at | 메시지 시각 |

### device_heartbeat

| 컬럼 | 설명 |
|------|------|
| device_id | 전용 폰 고유 ID (PK) |
| last_seen_at | 마지막 ping 시각 |
| pending_count | 미전송 메시지 수 |
| battery_level | 배터리 % |
| app_version | 앱 버전 |

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

- [x] Next.js 프로젝트 초기화
- [x] Supabase 프로젝트 생성 + 테이블 생성
- [x] Vercel 배포 + 환경변수 설정
- [x] 폼 제출 → Supabase 저장 테스트 완료
- [x] 구글 시트 연동 (Supabase → 시트 동기화)
- [x] 슬랙 알림 (새 지원자 알림)
- [x] 관리자 대시보드 (지원자 목록 + 스크리닝 + 대시보드)
- [x] 스크리닝 완료 → SOLAPI 문자 자동 발송
- [x] 문자 송수신 기능 (대화 화면 + 솔라피 발송)
- [x] 전용 폰 상태 모니터링 (heartbeat)
- [x] SMS Gateway Android 앱 (sms-gateway/)
- [ ] Supabase 마이그레이션 실행 (supabase-migration-messages.sql)
- [ ] SMS Gateway APK 빌드 + 전용 폰 설치
- [ ] 카카오 홍보봇
- [ ] 메타 광고 랜딩 URL 세팅

---

## SMS Gateway (전용 폰)

`sms-gateway/` 디렉토리에 Android 프로젝트가 있음.

### 설정
1. `sms-gateway/local.properties`에 Supabase URL/Key 설정
2. Android Studio에서 빌드
3. 전용 폰에 APK 설치 후 SMS 권한 허용

### 동작
- 지원자가 전용 폰 번호로 문자 발송 → 앱이 수신 → Supabase messages 테이블에 저장
- 관리자 대시보드에서 실시간 확인 + 답장 가능
- 5분마다 heartbeat 전송 → 대시보드 상단에 폰 상태 표시
