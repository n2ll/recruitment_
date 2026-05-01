/**
 * 구직자 SMS 자동 답변 초안 생성
 *
 * 인입 SMS마다 Claude로 답변 초안을 만들어 message_drafts에 저장한다.
 * 자동 발송하지 않음 — 매니저가 admin UI에서 검토 후 발송.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface AgentApplicantContext {
  id: number | null;
  name: string | null;
  phone: string;
  branch1: string | null;
  branch2: string | null;
  confirmed_branch: string | null;
  current_branch: string | null;
  work_hours: string | null;
  status: string | null;
  available_date: string | null;
  own_vehicle: string | null;
  introduction: string | null;
}

export interface AgentTurn {
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
}

export interface AgentDraft {
  status: "reply" | "need_info";
  draft_text: string | null;
  reasoning: string;
  missing_info?: string;
}

const MANAGER_NAME = process.env.AGENT_MANAGER_NAME || "홍석범";
const KAKAO_CHANNEL_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || "http://pf.kakao.com/_xnxaxaib";
const APPLY_URL = process.env.AGENT_APPLY_URL || "";

const FEW_SHOT_EXAMPLES = `
## 실제 대화 예시 (톤·길이·스타일 참고용)

### 예시 1 — 지원 직후 안내
구직자: 비마트 지원서입니다. 감사합니다.
구직자: 네 감사합니다. 바로 지원했습니다. 다음은 전화를 기다리면 되는건가요?
에이전트: 네 선생님! 티오 생기면 바로 연락 드릴게요. 감사합니다.

### 예시 2 — 티오 안내 (지점·시간 정확히)
에이전트: 안녕하세요 [이름]님. 비마트 [지점] 배송 담당 매니저 ${MANAGER_NAME}입니다.
에이전트: 평일 오전 티오가 나서 연락 드립니다.
구직자: 안녕하세요 매니저님 지원희망합니다
에이전트: [이름]님 안녕하세요! ㅠㅠ 저희가 여러명에게 문자를 보냈는데 먼저 회신 주신 분이 계셔서 그분 먼저 진행 예정입니다. 티오 추가되면 1순위로 연락드릴게요. 번거롭게 해서 죄송합니다.

### 예시 3 — 시간 협의
구직자: 혹시 몇시부터 몇시일까요??
에이전트: 08시~13시입니다
구직자: 제가 오후 일정이랑 겹쳐서 못갈 것 같아요ㅠㅠ
에이전트: 앗 그러신가요ㅠ 알겠습니다. 12시까지도 가능은 합니다~

### 예시 4 — 통화 전환
구직자: 안녕하세요!! 통화 가능 하신가요?
에이전트: 네 통화 가능하실까요? (매니저가 직접 콜백)

### 예시 5 — 카카오 채널 안내
에이전트: 안녕하세요 [이름]님. 비마트 [지점] 담당자 ${MANAGER_NAME}입니다. [요일/시간] 자리가 생겨서 연락 드렸습니다. 시간 되실 때 전화 주세요:)
에이전트: ${KAKAO_CHANNEL_URL} (내이루리_배송&스케줄 채널 링크)
`;

const SYSTEM_PROMPT = `너는 옹고잉(내이루리) 비마트 배송원 채용 매니저 "${MANAGER_NAME}"의 SMS 응대를 돕는 에이전트다.
구직자가 보낸 문자에 대한 답변 초안을 생성한다. 자동 발송되지 않으니 자연스럽고 정확하게.

## 톤·스타일
- 친근하면서도 매니저답게. 호칭은 "[이름]님" 또는 "[이름] 선생님".
- 짧게. 보통 1~2문장. 이모지 ㅎㅎ ㅠㅠ ^^ :) 적절히 (남발 금지).
- 이미 자기소개를 한 대화면 다시 자기소개하지 마라.
- 첫 메시지(처음 보내는 outbound)면: "안녕하세요 [이름]님. 비마트 [지점] 배송 담당 매니저 ${MANAGER_NAME}입니다." 형태로 시작.

## 사실 정확성 (중요)
다음 구체 사실은 컨텍스트(applicant)에 있는 값만 사용해라. 절대 지어내지 마라:
- 시급/시간대/근무지 주소/지점 위치/시작일/인근 지하철역

위 정보를 **구직자가 직접 질문**했는데 컨텍스트에 없으면:
→ status: "need_info" 반환. 슬랙 알림 가서 매니저가 직접 답변.

## need_info 사용 가이드 (남발 금지)
need_info는 "구체 사실을 물어봤는데 답을 모를 때"만 쓴다.
다음 경우에는 **need_info 쓰지 말고 reply로 응대**해라:

- 일반 인사/지원 문의 ("안녕하세요", "지원하고 싶어요", "비마트 알아보고 있어요") → 환영 + 지원 폼 안내
- 컨텍스트가 비어 있어도(applicant 정보 없음 = 신규/모르는 번호) 일반 응대는 가능. 다음 톤으로:
  "안녕하세요! 비마트 배송 관심 가져주셔서 감사합니다. 옹고잉 지원 폼에서 간단한 정보 작성해주시면 가장 가까운 지점 티오 생길 때 연락드릴게요 :) [지원 폼 URL]"
  (지원 폼 URL이 환경에 없으면 "지원 폼" 또는 "카카오 채널"로 안내)
- 단순 마무리 인사 ("감사합니다", "수고하세요") → "네 감사합니다 선생님!" 같이 자연스럽게
- 통화 요청 ("통화 가능하세요?") → "네 잠시 후 전화 드리겠습니다 :)" 정도 짧게

## 컨텍스트가 비어 있을 때 (이름·지점 모두 null)
신규 또는 미등록 번호에서 온 문자다. 호칭은 "선생님" 또는 생략하고, 지원 폼/카카오 채널로 유도하는 답변을 만들어라. need_info로 매니저를 부르지 마라 — 일반 안내는 에이전트가 처리할 수 있다.

## 안내 링크
- 지원 폼: ${APPLY_URL || "(매니저에게 직접 문의 안내)"}
- 카카오 채널: ${KAKAO_CHANNEL_URL}

## 출력
draft_reply tool로만 응답:
- status: "reply" — 정상 답변 가능 → draft_text에 답변
- status: "need_info" — 컨텍스트에 없는 사실관계 질문 → draft_text는 null, missing_info에 무엇이 모자란지 한국어로 (예: "시급, 인근 지하철역")

reasoning에는 왜 그렇게 답변했는지 한 줄로 설명 (예: "이미 자기소개 끝남, 시간 질문에 work_hours로 답변").

${FEW_SHOT_EXAMPLES}`;

function formatApplicant(a: AgentApplicantContext): string {
  const parts: string[] = [];
  parts.push(`이름: ${a.name || "(없음)"}`);
  parts.push(`전화: ${a.phone}`);
  if (a.branch1) parts.push(`1지망 지점: ${a.branch1}`);
  if (a.branch2) parts.push(`2지망 지점: ${a.branch2}`);
  if (a.confirmed_branch) parts.push(`확정 지점: ${a.confirmed_branch}`);
  if (a.current_branch) parts.push(`현재 근무 지점: ${a.current_branch}`);
  if (a.work_hours) parts.push(`희망 시간대: ${a.work_hours}`);
  if (a.status) parts.push(`상태: ${a.status}`);
  if (a.available_date) parts.push(`근무 가능일: ${a.available_date}`);
  if (a.own_vehicle) parts.push(`차량 보유: ${a.own_vehicle}`);
  return parts.join("\n");
}

function formatHistory(turns: AgentTurn[]): string {
  if (turns.length === 0) return "(이전 대화 없음 — 첫 응대)";
  return turns
    .map((t) => {
      const role = t.direction === "inbound" ? "구직자" : "에이전트";
      return `${role}: ${t.body}`;
    })
    .join("\n");
}

export async function generateDraftReply(input: {
  applicant: AgentApplicantContext;
  history: AgentTurn[];
  latestInbound: string;
}): Promise<AgentDraft | null> {
  const apiKey = process.env.CLAUDE_API;
  if (!apiKey) {
    console.error("[agent] CLAUDE_API env missing");
    return null;
  }

  const userContent = `[지원자 컨텍스트]
${formatApplicant(input.applicant)}

[지금까지의 대화]
${formatHistory(input.history)}

[방금 받은 구직자 메시지]
${input.latestInbound}

위 메시지에 대한 답변 초안을 draft_reply tool로 생성해라.`;

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "draft_reply",
        description:
          "구직자 SMS에 대한 답변 초안을 반환합니다. 사실관계가 모호하면 need_info로.",
        input_schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["reply", "need_info"],
              description:
                "정상 답변이 가능하면 'reply', 컨텍스트에 없는 정보가 필요하면 'need_info'.",
            },
            draft_text: {
              type: ["string", "null"],
              description:
                "발송할 답변문 (reply일 때 필수, need_info면 null). 한국어, 짧게(1~3문장).",
            },
            reasoning: {
              type: "string",
              description: "이 답변을 선택한 이유 한 줄 설명 (한국어).",
            },
            missing_info: {
              type: "string",
              description:
                "need_info일 때 무엇이 모자란지 (예: '시급, 인근 지하철역'). reply면 빈 문자열.",
            },
          },
          required: ["status", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "draft_reply" },
    messages: [{ role: "user", content: userContent }],
  };

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[agent] HTTP", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      content: Array<{ type: string; input?: AgentDraft }>;
    };
    const block = data.content?.find((c) => c.type === "tool_use");
    if (!block?.input) {
      console.error("[agent] no tool_use block");
      return null;
    }
    return block.input;
  } catch (err) {
    console.error("[agent] exception", err);
    return null;
  }
}
