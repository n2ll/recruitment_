# `docs/` — 문서

## 파일

| 파일 | 대상 독자 | 내용 |
|---|---|---|
| **[기능설명서.md](기능설명서.md)** | 비개발자(매니저·운영팀) | 시스템 전체 기능 / UI / 데이터 흐름 / 매니저 일과 가이드. 가장 먼저 봐야 할 문서. |
| **[migrations/](migrations/)** | 개발자·운영자 | DB 스키마 변경 SQL 파일 모음 — 적용 순서·멱등 여부 |

## 기능설명서 목차

1. 지원 폼 (/apply)
2. 관리자 대시보드 (/admin) — 사이드바·각 탭·인라인 편집 등
3. 지원자 상태(6종)와 진행 흐름
4. AI 응대 단계
5. 데이터 흐름 / 트리거
6. 자동 발송·리마인더 (cron)
7. 비용 추적 (AI + SMS)
8. 매니저 일과 / 자주 헷갈리는 점
9. 환경변수 / DB 마이그레이션

## 폴더별 README 위치 (개발자용)

| 폴더 | 내용 |
|---|---|
| `lib/agent/README.md` | AI 응대 엔진 구조 |
| `lib/agent/stages/README.md` | 단계 모듈 (screening / onboarding / 등) |
| `lib/README.md` | 공통 유틸 (supabase, claude, solapi, slack 등) |
| `app/api/README.md` | REST API 라우트 전체 매핑 |
| `app/api/webhooks/README.md` | Supabase Database Webhook 진입점 (인입 SMS) |
| `app/admin/README.md` | 어드민 대시보드 UI 구조 |
| `docs/migrations/README.md` | 마이그레이션 인덱스·작성 규칙 |
