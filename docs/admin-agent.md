# 구인 에이전트 테스트 탭 (`tab="agent"`)

공고 텍스트 + 구직자 메시지를 입력하면 Claude가 답변 초안을 즉시 생성. **실제 SMS 발송 / DB 저장 없는 시뮬레이션 환경** — 톤·정확도 튜닝용.

- 위치: [app/admin/page.tsx:1823-1955](../app/admin/page.tsx#L1823-L1955)
- API: [app/api/admin/agent/test/route.ts](../app/api/admin/agent/test/route.ts)
- 프롬프트/대화 샘플: [prompts/conversation-examples.txt](../prompts/conversation-examples.txt)
- Claude 호출 로직: [lib/claude.ts](../lib/claude.ts) + [lib/agent.ts](../lib/agent.ts)

> 최근 커밋 흐름: `93cc5fa` 즉시 초안 → `2d7ac81` 세션 채팅 모드 → `cc023c4` 공고 기반 응대 모드로 단순화 (현재).

---

## 1. 좌측 입력 컬럼

### 📢 구인공고 (`agentJobPosting`)
- 14행 textarea
- 구직자가 보고 문의온 공고 본문을 그대로 붙여넣기
- 공고 변경해도 세션은 자동 초기화되지 않음 — `🔄 대화 초기화` 버튼으로 명시 리셋

### 세션 통계
- 누적 턴 수 표시
- `🔄 대화 초기화` (턴 0이면 비활성, 1+이면 confirm)

---

## 2. 우측 채팅 컬럼

### 채팅 영역 (`agent-chat-area`)
- 비어 있으면 안내 문구
- 턴별 카드 (`agent-turn`):
  - `inbound` → 좌측, "구직자" 라벨
  - `outbound` → 우측, "🤖 에이전트" 라벨 + status 배지
  - 본문 textarea **편집 가능** (`editAgentTurn`) — 다음 호출 시 편집된 내용이 history로 들어감
  - 우상단 ✕ — `deleteAgentTurnsFrom(idx)` 해당 턴부터 끝까지 삭제
  - outbound 카드에는 `reasoning` / `missing_info` 인라인 표시

### 입력 행
- 2행 textarea + `전송` 버튼
- Enter: 전송 / Shift+Enter: 줄바꿈
- 빈 입력은 alert로 거부

---

## 3. API 호출 (`runAgentTest`)

```
POST /api/admin/agent/test
Body: {
  inbound_text: string,         // 새 구직자 메시지
  job_posting: string | null,   // 공고 본문
  manual_history: [{ direction, body, created_at }, ...]  // 직전까지 세션
}
```

응답:
```
{
  draft: {
    status: "reply" | "need_info",
    draft_text: string,
    reasoning: string,
    missing_info: string,
  }
}
```

UI는 `status='reply'` 면 `draft_text` 를 outbound로, `need_info` 면 안내 문구로 변환해 세션에 누적.

---

## 4. 동작 모델 (서버)

[app/api/admin/agent/test/route.ts](../app/api/admin/agent/test/route.ts)는 [lib/agent.ts](../lib/agent.ts)의 초안 생성 로직을 재사용 — 실제 컨택 탭의 자동 초안 생성과 동일한 프롬프트.

- 컨텍스트로 들어가는 것:
  - 공고 본문 (`job_posting`)
  - 대화 히스토리 (`manual_history`, 편집 반영됨)
  - 현재 인입 (`inbound_text`)
  - `prompts/conversation-examples.txt` 의 샘플 (시스템 프롬프트에 포함)
- 컨텍스트로 들어가지 **않는** 것:
  - 지원자 DB 정보 (이름/지점/이력) — 가짜 세션이라 매칭 X
  - 지점 목록, 슬롯 매트릭스 등 운영 데이터

---

## 5. 최근 정책 (커밋 기준)

| 커밋 | 변경 |
|--|--|
| `83ab69b` | need_info 남발 줄이기 — 컨텍스트 비어도 일반 인사·지원 문의는 reply로 응대 |
| `a74abd7` | 대화 맥락 정확도 개선 |
| `cc023c4` | 테스트 탭을 "공고 기반 응대 모드"로 단순화 (지원자 DB 의존 제거) |

→ 현재 테스트 탭은 **공고만으로 응대 시뮬레이션**. 실제 운영(컨택 탭의 자동 초안)은 지원자 DB도 컨텍스트로 사용한다는 점이 차이.

---

## 6. 운영 워크플로

1. 새로운 공고 작성 시 본 탭에서 다양한 구직자 시나리오로 테스트
2. need_info가 과하게 나오면 `prompts/conversation-examples.txt` 보강 + 재배포
3. 톤이 어긋나면 시스템 프롬프트 ([lib/agent.ts](../lib/agent.ts)) 조정
4. 만족스러우면 실제 컨택 탭에서 `이 공고 기반 운영` 적용

---

## 7. 한계 / 향후

- 공고와 실제 운영 데이터(지점·정원)를 함께 테스트하는 모드 없음
- 평가 지표(정확도/응대율) 자동 측정 없음 — 수동 검토
- 프롬프트 변경 사항을 UI에서 즉시 토글하는 메커니즘 없음 (배포 필요)
- `manual_history`에 `created_at`을 호출 시점 ISO로 채우는데 — 시간 격차 시뮬레이션은 불가
- 세션이 브라우저 로컬 상태 — 새로고침 시 휘발
