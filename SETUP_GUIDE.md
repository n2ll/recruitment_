# 구인 자동화 — 세팅 가이드

> 최종 수정: 2026.04.06

## 프로젝트 구조

```
app/
├── apply/
│   └── page.tsx          ← 지원 폼 UI
├── api/
│   └── apply/
│       └── route.ts      ← 지원 API (Supabase 저장)
├── layout.tsx
└── page.tsx              ← / 접속 시 /apply로 리다이렉트
lib/
└── supabase.ts           ← Supabase 클라이언트
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| DB | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 문자 발송 | SOLAPI |
| 대시보드 | 구글 시트 (Supabase → 시트 동기화) |
| 상태 변경 감지 | 구글 앱스크립트 (onEdit) |

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
- [ ] 구글 시트 연동 (Supabase → 시트 동기화)
- [ ] 슬랙 알림 (새 지원자 알림)
- [ ] 앱스크립트 + SOLAPI (상태 변경 → 문자 자동 발송)
- [ ] 카카오 홍보봇
- [ ] 메타 광고 랜딩 URL 세팅
