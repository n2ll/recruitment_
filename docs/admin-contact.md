# 배송원 컨택 탭 (`tab="contact"`)

지원자와의 SMS 양방향 대화 화면. 미읽음 우선 정렬 + 카카오톡 스타일 채팅 패널 + Claude 답변 초안.

- 위치: [app/admin/page.tsx:1955-2012](../app/admin/page.tsx#L1955-L2012)
- 채팅 오버레이: [app/admin/page.tsx:2014-2125](../app/admin/page.tsx#L2014-L2125)
- 메시지 조회: [app/api/admin/messages/[applicantId]/](../app/api/admin/messages/[applicantId]/)
- 메시지 발송: [app/api/admin/messages/send/](../app/api/admin/messages/send/)
- 답변 초안: [app/api/admin/drafts/[id]/](../app/api/admin/drafts/[id]/) + [app/api/agent/draft/](../app/api/agent/draft/)
- 인입(SMS Gateway) → DB 트리거 → 자동 초안 생성 흐름은 [lib/agent.ts](../lib/agent.ts) 및 [supabase-migration-message-drafts.sql](../supabase-migration-message-drafts.sql) 참고

---

## 1. 컨택 리스트

상단 카운트: `last_message_at` 또는 `unread_count > 0` 인 지원자 수.

### 필터
- 지점 (활성 지점)
- 검색 (이름/전화 부분 일치)

### 정렬 우선순위
1. `unread_count` 내림차순 (안읽음 있는 사람 먼저)
2. `last_message_at` 내림차순 (최근 문자 순)
3. `created_at` 내림차순 (대화 없는 사람은 지원일 순)

### 카드 구성
- 이름 / 상태 배지 / 안읽음 카운트 (빨강 배지)
- 전화번호 | 지점
- 우측: 마지막 문자 시각 (`MM/DD HH:mm`) 또는 `대화 없음`
- `contact-unread` 클래스로 미읽음 카드 강조

---

## 2. 대화 패널 (오버레이)

`openChat(a)` 또는 지원자 목록에서 이름 클릭 시 열림.

### 헤더
- 지원자 이름 / 전화번호 / X 닫기

### 메시지 영역
- `chat-messages` 자동 스크롤(맨 아래 고정 — `el.scrollTop = el.scrollHeight`)
- 말풍선:
  - `outbound` → 우측, `bubble-out` 클래스
  - `inbound` → 좌측, `bubble-in`
- 메타: `sent_by` (시스템/매니저 식별자) + 발송 시각

### 입력 영역
- textarea + 발송 버튼
- Enter: 발송 / Shift+Enter: 줄바꿈

발송 → `POST /api/admin/messages/send`
- 텍스트만 보내면 SMS, 단순 안내성은 향후 알림톡 매핑 가능 (현재는 SMS)

---

## 3. 🤖 AI 응대 초안

지원자가 답장(`inbound`)을 보내면 DB 트리거가 `message_drafts`에 row 생성 → Claude 백엔드 호출 → 결과를 채팅 패널 상단에 표시.

### 초안 status

| status | UI |
|--|--|
| `pending` | 🤖 AI 제안 — 초안 텍스트 + 액션 3개 |
| `need_info` | ⚠️ AI 응대 불가 — 모자란 정보 표시 + 슬랙 알림 |

### 액션 (status='pending')

| 버튼 | 동작 |
|--|--|
| 그대로 보내기 | `sendDraftDirect` — 초안 그대로 발송 |
| 수정해서 보내기 | `useDraftAsInput` — 초안을 입력창으로 옮겨 편집 후 발송 |
| 무시 | `ignoreDraft` — DB에서 draft 처리됨으로 표시, UI 닫기 |

`reasoning`(Claude의 판단 근거) 헤더에 노출.

### need_info 분기
- `missing_info` 표시 (예: "지원 지점, 시작 가능일")
- "슬랙으로 알림 보냄. 매니저가 직접 답변하세요."
- 슬랙 알림은 [lib/slack.ts](../lib/slack.ts) — 현재 신규 지원자 알림은 off지만 need_info 알림은 동작 여부 확인 필요

---

## 4. 인입 SMS 처리 파이프라인

```
전용 폰 (Android SMS Gateway) → POST /api/admin/messages/...
  → messages insert (direction='inbound')
  → DB trigger: applicants.unread_count++ + last_message_at 갱신
  → DB trigger: message_drafts insert
  → 백엔드(또는 클라이언트 polling) Claude 호출 → draft_text 채움
  → 클라이언트 Realtime 구독으로 패널에 자동 표시
```

- SMS Gateway 별도 저장소: `C:\sms-gateway` (working directory 등록됨)
- 디바이스 heartbeat: `device_heartbeat` 테이블 (5분마다) — 지연 시 알림 가능

---

## 5. 안읽음 처리

채팅 패널 오픈 시 `unread_count = 0` 으로 리셋 — 정확한 위치는 `openChat` 또는 `closeChat` 핸들러 확인 필요. Realtime 구독으로 다른 매니저 화면도 즉시 동기화.

---

## 6. 환경변수

| 변수 | 용도 |
|--|--|
| `ANTHROPIC_API_KEY` | 답변 초안 (Claude) |
| `SOLAPI_*` | 발송 |
| `SLACK_WEBHOOK_URL` | need_info 알림 (있다면) |

---

## 7. 한계 / 향후

- 카카오 1:1 채팅 답장은 API 미제공 — SMS 양방향만 운영 (사양서 1번 섹션)
- 친구톡(`@nayil` 채널 친구) 발신은 `kakao_channel_friend=true` 일 때만 가능 (현재 분기 미적용 추정)
- 첨부 이미지/파일 미지원
- 검색이 이름/전화번호만 — 본문 검색 없음
- 미읽음 동기화가 다중 디바이스 환경에서 race condition 가능성
