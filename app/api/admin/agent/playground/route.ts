/**
 * POST /api/admin/agent/playground
 *
 * 시뮬레이션 전용 — 실제 stage 모듈을 그대로 호출하지만
 * DB 저장 / SMS 발송 / 알림톡 발송 / transitions 부수효과는 전혀 일어나지 않는다.
 *
 * 클라이언트가 가짜 컨텍스트를 만들어 보내면 stage.process() 결과만 그대로 반환.
 *
 * 또한 transition === "advance" 시, 실제 운영에서 자동 발송될 텍스트도 미리보기로 같이 반환.
 */

import { NextRequest, NextResponse } from "next/server";
import { explorationStage } from "@/lib/agent/stages/exploration";
import { onboardingStage } from "@/lib/agent/stages/onboarding";
import { screeningStage } from "@/lib/agent/stages/screening";
import { activeStage } from "@/lib/agent/stages/active";
import {
  buildScreeningAnnouncement,
  buildOnboardingGuideText,
  buildFirstDayRules,
} from "@/lib/agent/transitions";
import type {
  AgentState,
  ApplicantContext,
  ConversationTurn,
  JobContext,
  Stage,
  StageContext,
  StageName,
} from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STAGES: Record<Exclude<StageName, "paused" | "abort">, Stage> = {
  exploration: explorationStage,
  screening: screeningStage,
  onboarding: onboardingStage,
  active: activeStage,
};

interface PlaygroundRequest {
  stage: "exploration" | "screening" | "onboarding" | "active";
  job: JobContext | null;
  applicant: ApplicantContext;
  history: ConversationTurn[];
  state: AgentState;
  inbound_text: string;
}

export async function POST(req: NextRequest) {
  let payload: PlaygroundRequest;
  try {
    payload = (await req.json()) as PlaygroundRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.stage || !STAGES[payload.stage]) {
    return NextResponse.json({ error: "stage 값 필수: exploration/screening/onboarding/active" }, { status: 400 });
  }
  if (!payload.applicant || !payload.applicant.phone) {
    return NextResponse.json({ error: "applicant.phone 필수" }, { status: 400 });
  }
  if (!payload.inbound_text?.trim()) {
    return NextResponse.json({ error: "inbound_text 필수" }, { status: 400 });
  }

  const stage = STAGES[payload.stage];
  const ctx: StageContext = {
    job: payload.job,
    applicant: payload.applicant,
    history: payload.history ?? [],
    state: payload.state ?? {},
  };

  const result = await stage.process(ctx, payload.inbound_text.trim());

  // transition: advance 시 실제 운영에서 보내질 자동 발송 텍스트 미리보기
  let auto_messages_preview: string[] = [];
  if (result.transition.kind === "advance") {
    const name = payload.applicant.name ?? "지원자";
    if (result.transition.to === "screening") {
      auto_messages_preview = [buildScreeningAnnouncement(name)];
    } else if (result.transition.to === "onboarding") {
      auto_messages_preview = [buildOnboardingGuideText(name)];
    } else if (result.transition.to === "active") {
      auto_messages_preview = [buildFirstDayRules(name)];
    }
  }

  return NextResponse.json({
    ok: true,
    result,
    auto_messages_preview,
  });
}

// 자동 발송 텍스트는 lib/agent/transitions.ts 에서 import — 중복 제거
