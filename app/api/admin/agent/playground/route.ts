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
import { onboardingStage } from "@/lib/agent/stages/onboarding";
import { screeningStage } from "@/lib/agent/stages/screening";
import { activeStage } from "@/lib/agent/stages/active";
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
  screening: screeningStage,
  onboarding: onboardingStage,
  active: activeStage,
};

interface PlaygroundRequest {
  stage: "screening" | "onboarding" | "active";
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
    return NextResponse.json({ error: "stage 값 필수: screening/onboarding/active" }, { status: 400 });
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
    if (result.transition.to === "onboarding") {
      auto_messages_preview = [
        buildConfirmText(name),
        buildOnboardingGuideText(name),
      ];
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

// ─────────────────────────────────────────────────────────────
// transitions.ts와 동일한 본문 (운영 텍스트 — screening-exmamples.txt 기반)
// ─────────────────────────────────────────────────────────────

function buildConfirmText(name: string): string {
  return `안녕하세요 ${name}님, 옹고잉입니다. 근무 확정 안내드립니다 :)
업무 진행을 위한 앱설치 및 요청사항을 곧 별도 안내드릴게요.`;
}

function buildOnboardingGuideText(name: string): string {
  return [
    `안녕하세요 ${name}님? 업무 진행을 위한 앱설치 및 요청사항을 전달드립니다. 영상교육 수료 후, 회신 부탁드립니다.`,
    "",
    "1. 배민 커넥트 앱 설치 후 가입",
    "2. 앱 가입 시 안전보건교육 영상(2시간) 필수 시청 필요",
    "3. 가입 및 교육 수료 후 마이페이지 > 내 정보에서 '아이디' 확인 후, 아이디 회신 부탁드립니다.",
    "4. 차량번호도 함께 회신 부탁드립니다.",
    "",
    "[참고 자료]",
    "가입 가이드: https://www.youtube.com/watch?v=bMM112zT7JY",
    "사용법 가이드: https://www.youtube.com/watch?v=5547PR3fzRs",
  ].join("\n");
}

function buildFirstDayRules(name: string): string {
  return [
    `${name}님 안녕하세요? 첫 근무 관련 안내사항 전달드립니다!`,
    "",
    "1) 08시 경에 나오셔서 카카오 채널로 건물 또는 주차하신 사진 부탁드립니다 (현재 활동 여부 확인용).",
    "2) 배차 들어오면 수락해 주시고(라우트는 자동), 가까운 곳 우선으로 돌아주시면 감사하겠습니다.",
    "3) 식사는 13시 이후로 진행 부탁드립니다.",
    "4) 배차 시점부터 60분 내 배송 완료 부탁드립니다.",
    "5) 상차지에서 배차 받고 10분 대기 후 출발 부탁드립니다.",
  ].join("\n");
}
