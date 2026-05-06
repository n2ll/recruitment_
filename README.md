# 옹고잉 구인 자동화

배송원 채용 전 과정(지원 → 서류심사 → 스크리닝 → 온보딩 → 운영)을 한 곳에서 운영하는 Next.js 기반 사내 시스템.

## 빠른 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

배포는 Vercel. 환경변수는 Vercel 프로젝트 설정에서 관리.

## 화면

| 경로 | 용도 |
|------|------|
| `/apply` | 지원자용 공개 폼 |
| `/admin` | 매니저용 관리 페이지 (탭 단위) |

`/admin` 탭: 대시보드 / 지원자 목록 / 희망 슬롯 / 확정 슬롯 / 추천 받기 / 배송원 컨택 / 지점 관리 / 구인 에이전트 / 플레이그라운드.

## 기술 스택

- Next.js 14 (App Router)
- Supabase (Postgres + Realtime)
- SOLAPI (알림톡 / SMS)
- Claude API (구인 에이전트)
- Kakao Local API (주소 → 위경도)

## 주요 디렉토리

```
app/        Next.js 라우트 (UI + API)
  admin/    매니저 페이지
  apply/    지원자 폼
  api/      API 엔드포인트
lib/        도메인 로직 + 외부 통합
  agent/    구인 에이전트 (stage 라우터)
prompts/    Claude 프롬프트용 예시 텍스트
scripts/    일회성 스크립트 (필요 시)
```

## 기능 설명

비전공자도 읽을 수 있는 기능별 동작 설명: [docs/기능설명서.md](docs/기능설명서.md)
