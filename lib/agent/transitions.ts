/**
 * 단계 전이(transition) 부수효과 처리.
 *
 * router.ts가 stage.process() 결과를 받은 뒤, 응답 발송 직후 이 함수가 호출된다.
 * - applicants.status, current_job_id 갱신
 * - job_candidates.agent_stage / agent_state / 타임스탬프 갱신
 * - 자동 발송 (확정 안내, 앱·교육 안내 등)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification } from "../solapi";
import { mergeAgentState } from "./checklist";
import type { AgentState, JobContext, ScreeningChecklist, StageName, StageTransition } from "./types";

interface ApplyTransitionInput {
  supabase: SupabaseClient;
  candidate_id: number;
  applicant_id: number;
  applicant_name: string | null;
  applicant_phone: string;
  job_id: number;
  job: JobContext | null;           // exploration → screening 시 조건부 자동 true 판정용
  current_stage: StageName;
  state_update: AgentState;        // stage.process가 만든 새 state (이미 merge 완료된 형태)
  transition: StageTransition;
}

export interface ApplyTransitionResult {
  next_stage: StageName | null;
  auto_sent_messages: number;       // advance 시 자동 발송된 메시지 수
}

export async function applyTransition(input: ApplyTransitionInput): Promise<ApplyTransitionResult> {
  const {
    supabase,
    candidate_id,
    applicant_id,
    applicant_name,
    applicant_phone,
    job_id,
    job,
    current_stage,
    state_update,
    transition,
  } = input;

  let nextStage: StageName | null = current_stage;
  let extraStateUpdate: AgentState = {};
  let autoSent = 0;
  const now = new Date().toISOString();

  switch (transition.kind) {
    // ────────────────────────────────────────────────
    case "stay":
      // 단계 유지, state만 갱신
      break;

    // ────────────────────────────────────────────────
    case "pause":
      nextStage = "paused";
      await supabase
        .from("job_candidates")
        .update({ paused_reason: transition.reason })
        .eq("id", candidate_id);
      break;

    // ────────────────────────────────────────────────
    case "abort":
      nextStage = "abort";
      await supabase
        .from("job_candidates")
        .update({
          closed_at: now,
          closed_reason: `abort: ${transition.reason}`,
        })
        .eq("id", candidate_id);
      // applicants.status를 부적합으로
      await supabase
        .from("applicants")
        .update({ status: "부적합", current_job_id: null })
        .eq("id", applicant_id);
      break;

    // ────────────────────────────────────────────────
    case "advance": {
      nextStage = transition.to;

      // ─── exploration → screening: 안내 묶음 자동 발송 + 조건부 자동 true ───
      if (transition.to === "screening") {
        // 1) 안내 묶음 (정산/프로모션/업무시간) 1통 발송
        try {
          const announceText = buildScreeningAnnouncement(applicant_name);
          const r = await sendNotification(
            applicant_phone,
            "SCREENING_ANNOUNCE",
            { "#{이름}": applicant_name ?? "지원자" },
            announceText
          );
          if (r.success) {
            await supabase.from("messages").insert({
              applicant_id,
              applicant_phone,
              direction: "outbound",
              body: announceText,
              status: "sent",
              sent_by: "system-auto",
              solapi_msg_id: r.messageId ?? null,
              message_type: r.via,
              template_id: r.templateId ?? null,
              job_id,
            });
            autoSent++;
          }
        } catch (e) {
          console.error("[transitions] SCREENING_ANNOUNCE send failed", e);
        }

        // 2) 안내 항목 + 조건부 항목 자동 true
        const autoTrue: Partial<ScreeningChecklist> = {
          프로모션_종료가능성_안내: true,
          정산주기_안내: true,
          업무시간_체계_이해: true,
        };
        // 자차 필요 없는 공고면 자차_재확인 자동 통과
        if (job && job.vehicle_required === false) {
          autoTrue.자차_재확인 = true;
        }
        // 주말 슬롯이 아니면 공휴일 항목 자동 통과
        const slot = job?.slot ?? "";
        if (!slot.includes("주말")) {
          autoTrue.공휴일_업무여부_확인 = true;
        }

        extraStateUpdate = {
          screening: autoTrue,
          meta: { screening_entered_at: now },
        };
      }

      if (transition.to === "onboarding") {
        // screening → onboarding: 확정 처리 + 앱·교육 안내 자동 발송
        // (별도 "확정 안내" 메시지는 보내지 않음 — AI의 마지막 응답 + 가이드 본문이 그 역할 대신)
        await supabase
          .from("job_candidates")
          .update({ confirmed_at: now })
          .eq("id", candidate_id);
        await supabase
          .from("applicants")
          .update({ status: "확정" })
          .eq("id", applicant_id);

        // 앱·교육 안내 (가이드 알림톡 ⑥) — 본문은 아래 buildOnboardingGuide 참조
        try {
          const guideText = buildOnboardingGuideText(applicant_name);
          const r2 = await sendNotification(
            applicant_phone,
            "GUIDE",
            { "#{이름}": applicant_name ?? "지원자" },
            guideText
          );
          if (r2.success) {
            await supabase.from("messages").insert({
              applicant_id,
              applicant_phone,
              direction: "outbound",
              body: guideText,
              status: "sent",
              sent_by: "system-auto",
              solapi_msg_id: r2.messageId ?? null,
              message_type: r2.via,
              template_id: r2.templateId ?? null,
              job_id,
            });
            autoSent++;

            // 안내 발송됨 체크리스트 자동 true
            extraStateUpdate = {
              onboarding: { 앱설치_교육_안내발송됨: true },
              meta: { onboarding_entered_at: now },
            };
          }
        } catch (e) {
          console.error("[transitions] GUIDE send failed", e);
        }
      }

      if (transition.to === "active") {
        // onboarding → active: 근무 시작
        await supabase
          .from("job_candidates")
          .update({ activated_at: now })
          .eq("id", candidate_id);
        await supabase
          .from("applicants")
          .update({ current_branch: null /* 라우터에서 job.branch로 채움 */ })
          .eq("id", applicant_id);

        // 첫 출근 룰 안내 자동 발송 (screening-examples.txt 마지막 단락)
        try {
          const rulesText = buildFirstDayRules(applicant_name);
          const r = await sendNotification(
            applicant_phone,
            "ATTENDANCE",
            { "#{이름}": applicant_name ?? "지원자" },
            rulesText
          );
          if (r.success) {
            await supabase.from("messages").insert({
              applicant_id,
              applicant_phone,
              direction: "outbound",
              body: rulesText,
              status: "sent",
              sent_by: "system-auto",
              solapi_msg_id: r.messageId ?? null,
              message_type: r.via,
              template_id: r.templateId ?? null,
              job_id,
            });
            autoSent++;
          }
        } catch (e) {
          console.error("[transitions] ATTENDANCE send failed", e);
        }
      }
      break;
    }
  }

  // job_candidates 갱신
  const merged = mergeAgentState(state_update, extraStateUpdate);
  const jcUpdate: Record<string, unknown> = {
    agent_state: merged,
  };
  if (nextStage !== current_stage) {
    jcUpdate.agent_stage = nextStage;
  }
  await supabase.from("job_candidates").update(jcUpdate).eq("id", candidate_id);

  return { next_stage: nextStage, auto_sent_messages: autoSent };
}

// ─────────────────────────────────────────────────────────────
// 자동 발송 본문 (운영 텍스트 — prompts/screening-examples.txt 기반)
// ─────────────────────────────────────────────────────────────

/**
 * exploration → screening 진입 시 자동 발송되는 안내 묶음.
 * 매니저가 통화로 풀어주던 6항목 중 "안내" 성격(정산/프로모션/업무시간)을
 * 한 통에 깔끔하게 통보. 이후 AI가 확인질문만 묶어서 진행.
 */
export function buildScreeningAnnouncement(name: string | null): string {
  const n = name ?? "지원자";
  return [
    `${n}님, 본격적인 진행을 위해 몇 가지 안내드릴게요!`,
    "",
    "1) 업무시간은 배차 시간 기준입니다.",
    "   08:00 첫 배차 / 16:00 마지막 배차이고, 배송 시간은 별도로 산정됩니다.",
    "2) 정산은 건당 금액이 매주, 프로모션 비용은 2주 간격으로 진행됩니다.",
    "3) 프로모션 5천원 비용은 1~2개월 후 종료될 수 있는 점 참고 부탁드려요.",
    "",
    "읽어보시고 괜찮으시면 몇 가지만 짧게 여쭤볼게요^^",
  ].join("\n");
}

export function buildOnboardingGuideText(_name: string | null): string {
  // 인사말 없이 바로 본문으로 시작 — 직전 AI 응답("그럼 온보딩 절차로 안내 드릴게요")이 인사 역할을 대신함
  return [
    "업무 진행을 위한 앱설치 및 요청사항을 전달드립니다. 영상교육 수료 후, 회신 부탁드립니다.",
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

export function buildFirstDayRules(name: string | null): string {
  const n = name ?? "지원자";
  return [
    `${n}님 안녕하세요? 첫 근무 관련 안내사항 전달드립니다!`,
    "",
    "1) 08시 경에 나오셔서 카카오 채널로 건물 또는 주차하신 사진 부탁드립니다 (현재 활동 여부 확인용).",
    "2) 배차 들어오면 수락해 주시고(라우트는 자동), 가까운 곳 우선으로 돌아주시면 감사하겠습니다.",
    "3) 식사는 13시 이후로 진행 부탁드립니다.",
    "4) 배차 시점부터 60분 내 배송 완료 부탁드립니다.",
    "5) 상차지에서 배차 받고 10분 대기 후 출발 부탁드립니다.",
  ].join("\n");
}
