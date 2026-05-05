/**
 * Stage: active
 *
 * 근무 진행 중 일반 응대. 기존 lib/agent.ts 의 generateDraftReply 를 그대로 활용한다.
 * (스크리닝/온보딩 같은 체크리스트 진행 X — 자유 대화)
 */

import { generateDraftReply } from "../../agent";
import type { Stage, StageContext, StageResult } from "../types";

export const activeStage: Stage = {
  name: "active",

  async process(ctx: StageContext, inboundText: string): Promise<StageResult> {
    const draft = await generateDraftReply({
      applicant: {
        id: ctx.applicant.id,
        name: ctx.applicant.name,
        phone: ctx.applicant.phone,
        branch1: ctx.applicant.branch1,
        branch2: ctx.applicant.branch2,
        confirmed_branch: ctx.job?.branch ?? null,
        current_branch: ctx.job?.branch ?? null,
        work_hours: ctx.applicant.work_hours,
        status: "확정",
        available_date: ctx.applicant.available_date,
        own_vehicle: ctx.applicant.own_vehicle,
        introduction: ctx.applicant.introduction,
      },
      history: ctx.history,
      latestInbound: inboundText,
      jobPosting: ctx.job?.body ?? null,
    });

    if (!draft) {
      return {
        reply_text: null,
        state_update: { meta: { last_reasoning: "active: Claude 호출 실패" } },
        transition: { kind: "pause", reason: "에이전트 호출 실패 — 매니저 인계" },
        reasoning: "active 호출 실패",
      };
    }

    if (draft.status === "need_info") {
      return {
        reply_text: null,
        state_update: { meta: { last_reasoning: draft.reasoning } },
        transition: { kind: "pause", reason: draft.missing_info || "정보 부족" },
        reasoning: draft.reasoning,
      };
    }

    return {
      reply_text: draft.draft_text,
      state_update: { meta: { last_run_at: new Date().toISOString(), last_reasoning: draft.reasoning } },
      transition: { kind: "stay" },
      reasoning: draft.reasoning,
    };
  },
};
