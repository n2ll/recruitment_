# `docs/design/` — 옹보딩 디자인 시스템 레퍼런스

옹보딩 UI/UX 리디자인의 단일 출처(source of truth). Phase 0에서 이 토큰들을 `app/globals.css`로 이식한다.

## 레퍼런스

- **원본 사이트**: https://www.huddle.works/
- **무드**: 라이트 에디토리얼 / 페이퍼 화이트 캔버스 + 뮤트 파스텔 카테고리 카드 + 완전 플랫(box-shadow 금지, 1px 헤어라인 보더)

## 파일

| 파일 | 내용 |
|---|---|
| `DESIGN.md` | 스타일 가이드 원문 — 컬러/타이포/스페이싱/컴포넌트/Do·Don't |
| `tokens.json` | 디자인 토큰 (W3C Design Tokens 포맷) |
| `theme.css` | Tailwind v4 `@theme` 블록 (토큰을 Tailwind 유틸로 노출) |
| `variables.css` | 순수 CSS 커스텀 프로퍼티(`:root`) — 비-Tailwind 참조용 |

## 한국어 폰트 (확정)

- **본문·UI: Pretendard** — 레퍼런스의 Nng 대체(Inter 계열). `--font-nng` → Pretendard 매핑.
- **디스플레이 헤드라인: Wanted Sans** — 44~69px 라이트 웨이트 에디토리얼 헤드라인용. `--font-display`로 분리.
- 헤드라인은 라이트 웨이트(300~400) 유지. bold 헤드라인 금지(에디토리얼 시그니처).

## 컬러 = 상태 분류 매핑 (옹보딩 적용)

| 색 | 토큰 | 옹보딩 상태 |
|---|---|---|
| Sage `#d3e5e9` | `--color-pale-sage` | 스크리닝 진행(전/중) |
| Lavender `#bbb2ce` | `--color-lavender-mist` | 스크리닝 완료/온보딩(활성) |
| Dusty rose `#cb9da2` | `--color-dusty-rose` | 확정인력(배치 완료) |
| Honey gold `#e4b976` | `--color-honey-gold` | 대기자(하이라이트) |
| Burgundy `#5c2529` | `--color-burgundy` | 부적합/이탈 |
| Deep violet `#453b60` | `--color-deep-violet` | 활성/링크/인터랙션 |

## 라운드 위계 (의미별)

badge 4px → card 8px → list-item 24px → large-card 40px → tag/secondary 100px → **primary 버튼만 1000px(완전 핀)**

## 핵심 규칙 (DESIGN.md Do/Don't 요약)

- box-shadow로 elevation 만들지 말 것 — 헤어라인 보더 + 배경 톤 대비로만 분리.
- 채도 높은 비비드 컬러 금지 — 전부 뮤트/디새추레이트.
- 파스텔 카드 위 흰 텍스트 금지 — 제목은 `#151515` 또는 활성은 deep-violet.
- 한 카드 안에서 카테고리 색 섞지 말 것.
- 본문/설명은 좌측 정렬(디스플레이 헤드라인 제외).
