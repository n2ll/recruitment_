/**
 * Stage: onboarding
 *
 * screening → onboarding 전이 직후, 시스템이 자동으로 앱설치·교육 안내 + 확정 메시지를 발송한다
 * (transitions.ts의 부수효과). 그 이후 지원자 회신을 받아 배민 아이디·차량번호를 수집한다.
 *
 * 체크리스트 (4항목):
 *   - 앱설치_교육_안내발송됨    : 진입 시 자동 true (transitions.ts에서)
 *   - 배민_아이디_수신          : 지원자 회신에서 추출
 *   - 차량번호_수신             : 지원자 회신에서 추출
 *   - 만남장소_안내발송됨       : 시작일 D-1 cron이 발송 후 자동 true
 *
 * 모두 true + 시작일 D-day 도달 시 → advance: active
 */

import { emptyOnboarding, isComplete, mergeAgentState } from "../checklist";
import { buildToneGuide } from "../examples";
import type {
  OnboardingChecklist,
  Stage,
  StageContext,
  StageResult,
} from "../types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MANAGER_NAME = process.env.AGENT_MANAGER_NAME || "홍석범";

const SYSTEM_PROMPT_BODY = `너는 옹고잉 비마트 배송원 채용 매니저 "${MANAGER_NAME}"의 SMS 응대 에이전트다.
지금은 "온보딩(근무 준비)" 단계 — 지원자가 이미 확정된 상태이며, 근무 시작 전 준비 사항을 챙기고 있다.

## 진입 직후 자동 발송 (이미 시스템이 보냄)
"안녕하세요? 업무 진행을 위한 앱설치 및 요청사항을 전달 드립니다.
1. 배민 커넥트 앱 설치 후 가입
2. 안전보건교육 영상(2시간) 필수 시청
3. 마이페이지 > 내정보의 '아이디' 회신 부탁드립니다
4. 차량번호도 함께 회신 부탁드립니다
[가입/사용법 가이드 영상 링크]"

## 너의 목표
지원자 회신에서 다음 두 가지를 수집한다:
- 배민_아이디_수신: 지원자가 답장에 배민 커넥트 ID(아이디) 보냈는가
- 차량번호_수신: 지원자가 차량번호 보냈는가

이미 받은 항목은 다시 묻지 마라. 둘 다 받으면 "감사합니다, 시작일 전날 오후에 만남 장소 안내드릴게요" 톤으로 마무리.

## 톤
친근하고 짧게. 1~2문장. 호칭은 "[이름]님" 또는 "선생님".

## 사실 정확성
시작일·만남 장소·매니저 연락처는 [현재 공고]·시스템에서 인용. 지어내지 마라.

## 단계 전이
- "stay": 아직 미수집 항목이 있거나 일반 질문 응대 중
- "pause": 지원자가 앱설치/영상 시청에 어려움을 겪거나 정책 질문 등 매니저 도움 필요
- "abort": 지원자가 명시적으로 포기 의사 → 시스템이 처리

(advance: active 전이는 시작일 D-day cron이 자동 처리한다 — AI가 결정하지 않는다)

## 체크리스트 갱신
지원자 회신에서 명시적으로 받은 정보만 true로:
- 영문/숫자 ID로 보이는 텍스트 → 배민_아이디_수신: true
- 한국 차량번호 형식(예: 12가3456, 123가4567) → 차량번호_수신: true

## 출력
onboarding_turn tool로만 응답.`;

function buildSystemPrompt(): string {
  return `${SYSTEM_PROMPT_BODY}\n\n${buildToneGuide()}`;
}

interface OnboardingToolInput {
  reply_text: string;
  checklist_update: Partial<OnboardingChecklist>;
  transition: "stay" | "pause" | "abort";
  transition_reason: string;
  reasoning: string;
}

const TOOL = {
  name: "onboarding_turn",
  description:
    "온보딩 단계의 한 턴 처리 — 응답문, 체크리스트 갱신, 전이 시그널 반환.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply_text: {
        type: "string",
        description: "지원자에게 보낼 답변. 한국어 1~2문장.",
      },
      checklist_update: {
        type: "object",
        description: "이번 턴에 새로 true가 된 항목만.",
        properties: {
          앱설치_교육_안내발송됨: { type: "boolean" },
          배민_아이디_수신: { type: "boolean" },
          차량번호_수신: { type: "boolean" },
          만남장소_안내발송됨: { type: "boolean" },
        },
      },
      transition: {
        type: "string",
        enum: ["stay", "pause", "abort"],
      },
      transition_reason: {
        type: "string",
      },
      reasoning: {
        type: "string",
      },
    },
    required: ["reply_text", "checklist_update", "transition", "reasoning"],
  },
};

function formatChecklist(state: StageContext["state"]): string {
  const cl = { ...emptyOnboarding(), ...(state.onboarding ?? {}) };
  return Object.entries(cl)
    .map(([k, v]) => `  ${v ? "✓" : "☐"} ${k}`)
    .join("\n");
}

function formatHistory(history: StageContext["history"]): string {
  if (history.length === 0) return "(이전 대화 없음)";
  return history
    .map((t) => `${t.direction === "inbound" ? "구직자" : "에이전트"}: ${t.body}`)
    .join("\n");
}

export const onboardingStage: Stage = {
  name: "onboarding",

  async process(ctx: StageContext, inboundText: string): Promise<StageResult> {
    const apiKey = process.env.CLAUDE_API;
    if (!apiKey) return failResult("CLAUDE_API env missing");

    const userContent = `[현재 공고]
${ctx.job ? `${ctx.job.title}\n시작일: ${ctx.job.start_date ?? "-"} / 지점: ${ctx.job.branch ?? "-"}` : "(공고 없음)"}

[지원자]
${ctx.applicant.name ?? ""} (${ctx.applicant.phone})

[현재 체크리스트]
${formatChecklist(ctx.state)}

[지금까지의 대화]
${formatHistory(ctx.history)}

[방금 받은 메시지]
${inboundText}

onboarding_turn tool로 응답해라.`;

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
          max_tokens: 768,
          system: buildSystemPrompt(),
          tools: [TOOL],
          tool_choice: { type: "tool", name: "onboarding_turn" },
          messages: [{ role: "user", content: userContent }],
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("[onboarding] HTTP", res.status, await res.text());
        return failResult(`Claude HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        content: Array<{ type: string; input?: OnboardingToolInput }>;
      };
      const block = data.content?.find((c) => c.type === "tool_use");
      if (!block?.input) return failResult("no tool_use block");

      return toStageResult(block.input, ctx);
    } catch (e) {
      console.error("[onboarding] exception", e);
      return failResult(e instanceof Error ? e.message : "unknown");
    }
  },
};

function toStageResult(out: OnboardingToolInput, ctx: StageContext): StageResult {
  const state_update = mergeAgentState(ctx.state, {
    onboarding: out.checklist_update,
    meta: {
      last_run_at: new Date().toISOString(),
      last_reasoning: out.reasoning,
    },
  });

  let transition: StageResult["transition"];
  switch (out.transition) {
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

  // onboarding → active 전이는 시작일 D-day cron이 트리거 (AI 결정 X)
  // 다만 4항목 모두 true면 메타에 표시
  if (isComplete(state_update, "onboarding")) {
    state_update.meta = { ...(state_update.meta ?? {}), onboarding_complete_at: new Date().toISOString() };
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
    state_update: { meta: { last_reasoning: `onboarding 실패: ${reason}` } },
    transition: { kind: "pause", reason: `에이전트 호출 실패: ${reason}` },
    reasoning: `onboarding 호출 실패 (${reason}) — 매니저 인계`,
  };
}
