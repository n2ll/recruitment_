# 지원 폼 세팅 가이드

## 파일 배치

```
app/
├── apply/
│   └── page.tsx          ← apply-page.tsx 내용 붙여넣기
└── api/
    └── apply/
        └── route.ts      ← apply-route.ts 내용 붙여넣기
```

## 패키지 설치

```bash
npm install googleapis
```

---

## Google Sheets API 세팅 (5단계)

### 1. Google Cloud Console 접속
https://console.cloud.google.com

### 2. 프로젝트 생성
- 새 프로젝트 → 이름: `ongoingrecruit` (아무거나)

### 3. Google Sheets API 활성화
- 왼쪽 메뉴 → API 및 서비스 → 라이브러리
- "Google Sheets API" 검색 → 사용 설정

### 4. 서비스 계정 생성 + JSON 키 발급
- API 및 서비스 → 사용자 인증 정보
- 사용자 인증 정보 만들기 → 서비스 계정
- 이름 입력 후 생성 완료
- 생성된 서비스 계정 클릭 → 키 탭 → 키 추가 → JSON
- JSON 파일 다운로드됨

### 5. 마스터 시트에 서비스 계정 공유
- 다운로드된 JSON 파일에서 `client_email` 값 복사
  (형태: `xxx@xxx.iam.gserviceaccount.com`)
- 마스터 구글 시트 → 공유 → 해당 이메일 편집자로 추가

---

## 환경변수 설정

### 로컬 개발 (.env.local)

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXXX\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

> GOOGLE_SHEET_ID: 구글 시트 URL에서 `/d/` 뒤 ~ `/edit` 앞 부분
> 예: `https://docs.google.com/spreadsheets/d/[여기가 SHEET_ID]/edit`

> GOOGLE_PRIVATE_KEY: JSON 파일의 `private_key` 값 그대로 붙여넣기
> 줄바꿈(\n)이 포함되어 있는데 그대로 사용하면 됨

### Vercel 배포 시

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables
위 3개 동일하게 추가

> GOOGLE_PRIVATE_KEY 입력 시 따옴표 없이 그대로 붙여넣기
> Vercel이 자동으로 처리함

### Railway 배포 시

Railway 대시보드 → 프로젝트 → Variables
위 3개 동일하게 추가

---

## 지원 폼 URL 구조

```
https://[도메인]/apply?source=meta&branch=광진자양
https://[도메인]/apply?source=kakao&branch=강북미아
https://[도메인]/apply?source=albamon&branch=은평
https://[도메인]/apply?source=direct
```

### branch 파라미터 목록
- 은평, 마포상암, 서대문신촌, 용산한남
- 도봉쌍문, 중구명동, 성동옥수, 동대문제기
- 강북미아, 노원중계, 중랑면목, 광진자양

---

## 배포 전 체크리스트

- [ ] `npm install googleapis` 완료
- [ ] `.env.local` 환경변수 3개 세팅
- [ ] 마스터 시트에 서비스 계정 이메일 편집자 공유
- [ ] 로컬에서 폼 제출 테스트 → 시트에 행 추가 확인
- [ ] Vercel/Railway 환경변수 세팅
- [ ] 배포 후 실제 URL로 테스트

---

## 구글 시트 컬럼 순서 (API가 입력하는 순서)

| 순서 | 컬럼명 | 비고 |
|------|--------|------|
| A | 타임스탬프 | 자동 |
| B | 성함 | |
| C | 생년월일 6자리 | |
| D | 휴대폰 번호 | 중복 체크 기준 |
| E | 거주지 | |
| F | 자기명의 차량 여부 | |
| G | 운전면허 종류 | |
| H | 차종 | |
| I | 희망지점 1지망 | |
| J | 희망지점 2지망 | |
| K | 희망 근무 시간대 | |
| L | 자기소개 및 지원동기 | |
| M | 배달 업무 관련 경력 | |
| N | 전화스크리닝 | 담당자 수동 입력 |
| O | 진행상황 | 기본값: 서류심사 |
| P | branch | URL 파라미터 자동 |
| Q | source | URL 파라미터 자동 |
| R | filter_pass | Make가 처리 |
| S | msg1_sent | Make가 처리 |
| T | msg2_sent | Make가 처리 |
| U | 비고 | 중복지원 자동 표시 |
