/**
 * Stage: screening
 *
 * 1차 응대 + 스크리닝 (= 본인 명세의 2단계 + 3단계 통합).
 * 8항목 체크리스트를 채우며, 모두 충족 시 advance: onboarding.
 *
 * 항목 정의는 lib/agent/types.ts 의 ScreeningChecklist 참조.
 * 운영 톤 reference: prompts/screening-examples.txt + prompts/conversation-examples.txt
 */

import { emptyScreening, isComplete, mergeAgentState } from "../checklist";
import { buildToneGuide } from "../examples";
import type {
  Stage,
  StageContext,
  StageResult,
  ScreeningChecklist,
} from "../types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const MANAGER_NAME = process.env.AGENT_MANAGER_NAME || "홍석범";

const SYSTEM_PROMPT_BODY = `너는 옹고잉(내이루리) 비마트 배송원 채용 매니저 "${MANAGER_NAME}"의 SMS 응대 에이전트다.
지금은 "스크리닝" 단계 — 매니저가 통화로 하던 1차 안내·확인을 너가 SMS로 진행한다.

## 너의 목표
지원자와 자연스럽게 대화하면서 아래 8항목 체크리스트를 모두 확인한다.
모든 항목이 true가 되면 transition: "advance" (다음 단계: onboarding)로 보고하면 시스템이 알아서 확정 처리한다.

## 8항목 체크리스트
1. 시작일_근무가능 — 공고 시작일에 즉시 근무 가능한지
2. 자차_재확인 — 자기 명의 차량 보유 여부 (지원 폼에 거짓 기입 케이스 대응 → 반드시 직접 확인)
3. 프로모션_종료가능성_안내 — "프로모션 5천원 비용은 1~2개월 후 종료될 수 있다" 안내했고 지원자가 인지
4. 정산주기_안내 — "건당 금액은 매주, 프로모션 비용은 2주 간격 정산" 안내·이해
5. 공휴일_업무여부_확인 — 공휴일에도 업무 진행 가능한지 양방향 확인
6. 본인명의_정산_문제없음 — 본인 명의로 업무·정산 가능한지 확인
7. 업무시간_체계_이해 — "업무시간은 배차 시간 기준 (08:00 첫 배차, 16:00 마지막 배차). 배송 시간 계산해서 퇴근시간 산정" 안내·이해
8. 지원자_질문_해소 — 지원자가 한 모든 질문에 답변 완료

## 핵심 행동 규칙
- 한 턴에 1~2개 항목만 자연스럽게 묻거나 안내해라. 8개를 한 번에 쏟지 마라.
- 이미 true인 항목은 다시 묻지 마라.
- **지원자가 단순 질문/탐색 모드**일 때는 답만 주고 그 턴은 끝내라.
  같은 턴에 다음 체크리스트 항목으로 넘어가지 마라.
  (탐색 신호 예시: "그냥 물어보려고요", "~인가요?", "~필요한가요?", "혹시…", "지원하기 전에 궁금한게")
- **지원자가 재촉/거리감을 표현**하면("왜 이렇게 묻냐", "천천히", 짜증·답답함 표시) 즉시 사과하고
  그 턴은 체크리스트 진행을 완전히 멈춰라. 다음 턴부터 자연스럽게 한 항목씩 재개.
- 호칭은 "[이름]님" 또는 "선생님". 톤은 친근하면서 매니저답게. 1~3문장.
- **첫 응대(history 비어있음)는 워밍업만**: 인사 + 본인 소개 + 어떤 공고/자리에 대한 응대인지
  한 줄 안내 + "편하게 회신/문의 주세요" 톤으로 마무리. **체크리스트 항목 질문은 절대 X.**
  (예시: "안녕하세요 ○○님, 비마트 강북미아 담당 매니저 홍석범입니다. 지원해주신 평일 오전
  자리 관련해서 몇 가지 안내드리려고 연락드렸어요. 시간 되실 때 편하게 회신 주세요^^")
- 두 번째 턴부터 체크리스트 항목을 한 번에 1~2개씩 자연스럽게 풀어라.
- 이미 자기소개한 대화면 다시 자기소개하지 마라.

## 사실 정확성
시급·시간대·근무지·시작일 등은 [현재 공고] 본문에서만 인용해라. 지어내지 마라.

## 단계 전이 (transition)
- "stay": 아직 미확인 항목이 남음 → 계속 대화
- "advance" (to: "onboarding"): 8개 모두 true 됐을 때만. 마지막 reply_text는 "확정되었습니다" 톤으로.
- "abort" (사유 명시): 시작일 절대 불가 / 자차 없음 확정 / 본인명의 불가 → 시스템이 status='부적합' 처리
- "pause" (사유 명시): 정책 질문 등 매니저가 직접 답해야 하는 상황

## 체크리스트 갱신 (checklist_update)
- 이번 턴 대화로 새로 확인된 항목만 true로 변경.
- 회사가 안내했고 지원자가 "네/이해했어요/문제없어요"로 답하면 true.
- 안내만 하고 답을 못 받았으면 그대로 false (다음 턴에서 재확인).
- 지원자가 명시적으로 부정 응답하면 (예: "공휴일은 안돼요") → false 유지 + 시스템에 abort/pause 시그널을 transition으로.

## 출력
screening_turn tool로만 응답.`;

function buildSystemPrompt(): string {
  return `${SYSTEM_PROMPT_BODY}\n\n${buildToneGuide({ includeScreening: true })}`;
}

interface ScreeningToolInput {
  reply_text: string;
  checklist_update: Partial<ScreeningChecklist>;
  transition:
    | "stay"
    | "advance_onboarding"
    | "abort"
    | "pause";
  transition_reason: string;
  reasoning: string;
}

const TOOL = {
  name: "screening_turn",
  description:
    "스크리닝 단계의 한 턴 처리 — 응답문, 체크리스트 갱신, 단계 전이를 한 번에 반환.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply_text: {
        type: "string",
        description:
          "지원자에게 보낼 답변. 한국어 1~3문장. 자연스럽고 짧게. 이번 턴 미확인 항목 1~2개를 자연스럽게 진행.",
      },
      checklist_update: {
        type: "object",
        description:
          "이번 턴에 새로 true가 된 항목만 포함. 변경 없으면 빈 객체.",
        properties: {
          시작일_근무가능: { type: "boolean" },
          자차_재확인: { type: "boolean" },
          프로모션_종료가능성_안내: { type: "boolean" },
          정산주기_안내: { type: "boolean" },
          공휴일_업무여부_확인: { type: "boolean" },
          본인명의_정산_문제없음: { type: "boolean" },
          업무시간_체계_이해: { type: "boolean" },
          지원자_질문_해소: { type: "boolean" },
        },
      },
      transition: {
        type: "string",
        enum: ["stay", "advance_onboarding", "abort", "pause"],
        description:
          "stay=계속 대화, advance_onboarding=8개 모두 true, abort=결격 사유, pause=매니저 직접 응대 필요",
      },
      transition_reason: {
        type: "string",
        description: "abort/pause/advance 사유 한 줄. stay면 빈 문자열.",
      },
      reasoning: {
        type: "string",
        description: "이 턴의 의사결정 근거 한 줄 (매니저 검토용).",
      },
    },
    required: ["reply_text", "checklist_update", "transition", "reasoning"],
  },
};

function formatChecklist(state: StageContext["state"]): string {
  const cl = { ...emptyScreening(), ...(state.screening ?? {}) };
  return Object.entries(cl)
    .map(([k, v]) => `  ${v ? "✓" : "☐"} ${k}`)
    .join("\n");
}

function formatHistory(history: StageContext["history"]): string {
  if (history.length === 0) return "(이전 대화 없음 — 첫 응대)";
  return history
    .map((t) => `${t.direction === "inbound" ? "구직자" : "에이전트"}: ${t.body}`)
    .join("\n");
}

function formatJob(job: StageContext["job"]): string {
  if (!job) return "(공고 없음 — 이상 케이스, pause 권장)";
  return [
    `제목: ${job.title}`,
    `지점: ${job.branch ?? "-"} / 슬롯: ${job.slot ?? "-"}`,
    `시작일: ${job.start_date ?? "-"} / 자차필요: ${job.vehicle_required ? "예" : "아니오"}`,
    `픽업지: ${job.pickup_address ?? "-"}`,
    "",
    "[공고 본문]",
    job.body,
  ].join("\n");
}

function formatApplicant(a: StageContext["applicant"]): string {
  return [
    `이름: ${a.name ?? "(없음)"}`,
    `전화: ${a.phone}`,
    `1지망: ${a.branch1 ?? "-"} / 2지망: ${a.branch2 ?? "-"}`,
    `희망시간대: ${a.work_hours ?? "-"}`,
    `시작가능일(폼): ${a.available_date ?? "-"}`,
    `차량 보유(폼): ${a.own_vehicle ?? "-"} / 차종: ${a.vehicle_type ?? "-"}`,
    `면허: ${a.license_type ?? "-"}`,
    `본인명의(폼): ${a.self_ownership ?? "-"}`,
    `거주지: ${a.location ?? "-"}`,
  ].join("\n");
}

export const screeningStage: Stage = {
  name: "screening",

  async process(ctx: StageContext, inboundText: string): Promise<StageResult> {
    const apiKey = process.env.CLAUDE_API;
    if (!apiKey) {
      return failResult("CLAUDE_API env missing");
    }

    const userContent = `[현재 공고]
${formatJob(ctx.job)}

[지원자 정보]
${formatApplicant(ctx.applicant)}

[현재 체크리스트 상태]
${formatChecklist(ctx.state)}

[지금까지의 대화]
${formatHistory(ctx.history)}

[방금 받은 구직자 메시지]
${inboundText}

위 상황에서 screening_turn tool로 답변·체크리스트 갱신·전이 시그널을 반환해라.`;

    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: buildSystemPrompt(),
          tools: [TOOL],
          tool_choice: { type: "tool", name: "screening_turn" },
          messages: [{ role: "user", content: userContent }],
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("[screening] HTTP", res.status, errBody);
        return failResult(`Claude HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        content: Array<{ type: string; input?: ScreeningToolInput }>;
      };
      const block = data.content?.find((c) => c.type === "tool_use");
      if (!block?.input) {
        return failResult("no tool_use block");
      }

      return toStageResult(block.input, ctx);
    } catch (e) {
      console.error("[screening] exception", e);
      return failResult(e instanceof Error ? e.message : "unknown");
    }
  },
};

function toStageResult(out: ScreeningToolInput, ctx: StageContext): StageResult {
  const state_update = mergeAgentState(ctx.state, {
    screening: out.checklist_update,
    meta: {
      last_run_at: new Date().toISOString(),
      last_reasoning: out.reasoning,
    },
  });

  // advance 검증: AI가 advance라 했어도 실제 8개 다 차야 허용 (가드)
  let transition: StageResult["transition"];
  switch (out.transition) {
    case "advance_onboarding":
      if (isComplete(state_update, "screening")) {
        transition = { kind: "advance", to: "onboarding", reason: out.transition_reason };
      } else {
        // AI가 잘못 판단 — 강제 stay
        transition = { kind: "stay" };
      }
      break;
    case "abort":
      transition = { kind: "abort", reason: out.transition_reason };
      break;
    case "pause":
      transition = { kind: "pause", reason: out.transition_reason };
      break;
    case "stay":
    default:
      transition = { kind: "stay" };
      break;
  }

  return {
    reply_text: out.reply_text,
    state_update,
    transition,
    reasoning: out.reasoning,
  };
}

function failResult(reason: string): StageResult {
  return {
    reply_text: null,
    state_update: { meta: { last_reasoning: `screening 실패: ${reason}` } },
    transition: { kind: "pause", reason: `에이전트 호출 실패: ${reason}` },
    reasoning: `screening 호출 실패 (${reason}) — 매니저 인계`,
  };
}
