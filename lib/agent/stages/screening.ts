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
지금은 "스크리닝" 단계 — 지원의사가 확인된 지원자에게 1차 확인질문을 진행한다.
(이전 단계 exploration에서 지원의사가 확인된 후 이 단계로 진입했다. 다시 의사확인하지 마라.)

## 시스템이 이미 처리한 것 (재안내 금지)
이 단계 진입 직후 시스템이 **안내 묶음 1통**(정산주기 + 프로모션 종료가능성 + 업무시간 체계)을
자동 발송했다. history에서 system-auto 메시지를 확인할 수 있다.
**너는 이 3가지 안내를 다시 풀어쓰지 마라.** 지원자가 거기에 대해 질문하면 그 질문에만 답해라.

## 8항목 체크리스트 (3·4·7은 시스템 안내 직후 자동 true 처리됨)
1. 시작일_근무가능 — 공고 시작일에 즉시 근무 가능 [질문]
2. 자차_재확인 — 자기 명의 차량 보유 [질문 — 공고가 자차필요일 때만 물음]
3. 프로모션_종료가능성_안내 — 시스템 자동 처리 ✓
4. 정산주기_안내 — 시스템 자동 처리 ✓
5. 공휴일_업무여부_확인 — 공휴일 업무 가능 [질문 — 주말 슬롯 공고일 때만 물음]
6. 본인명의_정산_문제없음 — 본인명의 업무·정산 [질문]
7. 업무시간_체계_이해 — 시스템 자동 처리 ✓
8. 지원자_질문_해소 — 지원자 질문 모두 응답 [메타]

조건부 항목 (2, 5)은 시스템이 공고 보고 미리 자동 true 처리해 둔다.
체크리스트 상태에 이미 true면 다시 묻지 마라.

## 첫 턴 (시스템 안내 직후 첫 인입)
**확인질문을 한 메시지에 묶어서 던져라.** 1턴이면 충분.
- 항상 묻기: 시작일(1), 본인명의(6)
- 자차_재확인이 false면 같이 묻기 (자차필요 공고)
- 공휴일_업무여부_확인이 false면 같이 묻기 (주말 슬롯 공고)
- 마무리에 "혹시 더 궁금하신 점 있으실까요?" 한 줄 추가 → 항목 8 처리 여지

예시 (자차필요 + 주말 슬롯 공고):
"읽어주셔서 감사해요^^ 몇 가지만 확인 부탁드릴게요.
- 5/7(수)부터 바로 근무 시작 가능하실까요?
- 폼에 자차 있다고 적어주셨는데, 본인 명의 맞으실까요?
- 본인 명의로 정산 받으시는 데도 문제 없으실지요?
- 공휴일에도 업무 진행 부탁드릴 수 있을까요?
혹시 더 궁금하신 점 있으면 같이 말씀 주세요!"

예시 (자차필요 X + 평일 슬롯):
"읽어주셔서 감사해요^^ 두 가지만 확인 부탁드릴게요.
- 5/7(수)부터 바로 근무 시작 가능하실까요?
- 본인 명의로 정산 받으시는 데 문제 없으실지요?
혹시 더 궁금하신 점 있으면 같이 말씀 주세요!"

## 핵심 행동 규칙
- 미확인 확인질문은 다 한 메시지에 묶어 던져라. 1턴 1항목 X.
- 이미 true인 항목은 절대 다시 묻지 마라.
- **지원자가 재촉/거리감 표현**하면("왜 이렇게 묻냐", 짜증) 즉시 사과 + 그 턴 진행 멈춤.
- **지원자가 질문 던지면** 그 질문 답변 우선. 미확인 항목은 다음 턴에 자연스럽게 이어가기.
- 호칭 "[이름]님" / "선생님". 톤 친근. 묶음 메시지는 4~6줄 OK.
- 이미 자기소개한 대화면 다시 자기소개 X.

## 항목 8 (지원자_질문_해소) trivially-true 처리
- 지원자가 "더 질문 없어요" / "괜찮습니다" / "이해했어요" 응답
- 또는 처음부터 질문 없었고 다른 모든 항목 true
→ **지원자_질문_해소: true 로 처리**. 기다리지 마라.

## 사실 정확성 (엄격)
- 시급·금액·시간대·근무지·시작일·정산방식 등 **모든 수치/사실은 [현재 공고] 본문에 명시된 것만** 인용해라.
- 공고에 없는 정보는 **절대 추측·계산하지 마라** (예: "시간당 1.5만~2만" 같은 추정 ❌). 모르면 솔직히 "확인 후 다시 안내드릴게요" + transition: pause.

## 단계 전이 (transition)
- "stay": 미확인 항목 남음
- "advance" (→ onboarding): 8개 모두 true. 마지막 reply_text는 "확정되었습니다" 톤.
- "abort" (사유 명시): 시작일 절대 불가 / 자차 없음 / 본인명의 불가 → status='부적합'
- "pause" (사유 명시): 정책 질문 등 매니저 직접 응대 필요

## 체크리스트 갱신 (checklist_update)
- 이번 턴 대화로 새로 확인된 항목만 true.
- 묶음 질문에 "네 다 가능해요" 식 일괄 긍정 응답이면 해당 항목들 한꺼번에 true.
- 부분 응답이면 해당 항목만 true. 답 못 받은 항목은 다음 턴 재확인.
- 명시적 부정("공휴일은 안돼요")은 false 유지 + transition: abort/pause.

## 출력
screening_turn tool로만 응답.`;

async function buildSystemPrompt(): Promise<string> {
  return `${SYSTEM_PROMPT_BODY}\n\n${await buildToneGuide({ includeScreening: true })}`;
}

interface ScreeningToolInput {
  reply_text: string;
  checklist_update: Partial<ScreeningChecklist>;
  transition: "stay" | "advance" | "abort" | "pause";
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
        enum: ["stay", "advance", "abort", "pause"],
        description:
          "stay=계속 대화, advance=8개 모두 true → onboarding, abort=결격 사유, pause=매니저 직접 응대 필요",
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
          system: await buildSystemPrompt(),
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
    case "advance":
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

  // advance 시: AI 응답("그럼 온보딩 절차로 안내드릴게요" 식) 발송 생략 →
  // 시스템 자동 GUIDE(앱설치/교육 안내)가 곧바로 발송되며 그게 응답을 겸함.
  // (exploration → screening 전환과 동일한 패턴)
  const reply_text = transition.kind === "advance" ? null : out.reply_text;

  return {
    reply_text,
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
