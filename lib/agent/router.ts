/**
 * 에이전트 라우터.
 *
 * SMS Gateway → /api/messages/inbound → runAgentForCandidate()
 *
 * 1) job_candidates row 로드
 * 2) agent_stage에 맞는 stage 모듈 dispatch
 * 3) Claude 호출 (stage.process)
 * 4) 응답 발송 (SOLAPI)
 * 5) transitions.applyTransition() — 단계 전이 + 자동 발송 + state 저장
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "../solapi";
import { applyTransition } from "./transitions";
import { explorationStage } from "./stages/exploration";
import { onboardingStage } from "./stages/onboarding";
import { screeningStage } from "./stages/screening";
import { activeStage } from "./stages/active";
import type {
  AgentState,
  ApplicantContext,
  ConversationTurn,
  JobContext,
  Stage,
  StageContext,
  StageName,
} from "./types";

const STAGES: Record<Exclude<StageName, "paused" | "abort">, Stage> = {
  exploration: explorationStage,
  screening: screeningStage,
  onboarding: onboardingStage,
  active: activeStage,
};

export interface RunAgentInput {
  supabase: SupabaseClient;
  candidate_id: number;
  inbound_message_id: string;
  inbound_text: string;
}

export interface RunAgentResult {
  ok: boolean;
  skipped?: string;            // 스킵 사유
  reply_sent?: boolean;
  next_stage?: StageName | null;
  auto_sent_messages?: number;
  reasoning?: string;
  error?: string;
}

export async function runAgentForCandidate(input: RunAgentInput): Promise<RunAgentResult> {
  const { supabase, candidate_id, inbound_message_id, inbound_text } = input;

  // 1) job_candidate + 관련 데이터 로드
  const { data: jc, error: jcErr } = await supabase
    .from("job_candidates")
    .select(`
      id, job_id, applicant_id, agent_stage, agent_state,
      jobs:job_id (
        id, title, body, branch, slot, start_date, vehicle_required, pickup_address, site_manager_id
      ),
      applicants:applicant_id (
        id, name, phone, birth_date, location, own_vehicle, license_type, vehicle_type,
        branch1, branch2, work_hours, available_date, self_ownership, introduction, experience
      )
    `)
    .eq("id", candidate_id)
    .single();

  if (jcErr || !jc) {
    return { ok: false, error: `job_candidate not found: ${jcErr?.message}` };
  }

  const stageName = jc.agent_stage as StageName | null;
  // onboarding에 진입하면 AI 응답은 끈다 — 자동 발송(앱설치·만남장소 안내 등)은 transitions.ts가 별도로 수행.
  // 사용자 정책: 온보딩부터는 매니저가 직접 응대.
  if (
    !stageName ||
    stageName === "paused" ||
    stageName === "abort" ||
    stageName === "onboarding"
  ) {
    return { ok: true, skipped: `stage=${stageName ?? "null"} — agent skipped` };
  }

  const stage = STAGES[stageName];
  if (!stage) {
    return { ok: false, error: `unknown stage: ${stageName}` };
  }

  // 2) 대화 history (이번 인입 제외)
  const { data: msgs } = await supabase
    .from("messages")
    .select("direction, body, created_at")
    .eq("job_id", jc.job_id)
    .neq("id", inbound_message_id)
    .order("created_at", { ascending: true })
    .limit(50);

  const stripPrefix = (s: string) =>
    s.replace(/^\s*\[(?:Web발신|국제발신|광고)\]\s*/i, "").trim();

  const history: ConversationTurn[] = (msgs ?? []).map((m) => ({
    direction: m.direction as "inbound" | "outbound",
    body: stripPrefix(m.body as string),
    created_at: m.created_at as string,
  }));

  const cleanInbound = stripPrefix(inbound_text);

  // 3) Stage 호출
  // Supabase 조인 응답은 단일 FK여도 객체/배열이 섞여 들어올 수 있어 unknown 경유
  const job = (jc.jobs ?? null) as unknown as JobContext | null;
  const applicant = jc.applicants as unknown as ApplicantContext;
  const state = (jc.agent_state ?? {}) as AgentState;

  const ctx: StageContext = { job, applicant, history, state };
  const result = await stage.process(ctx, cleanInbound);

  // 4) 응답 발송
  let replySent = false;
  let outboundId: string | null = null;
  if (result.reply_text) {
    const send = await sendSms(applicant.phone, result.reply_text);
    if (send.success) {
      const { data: outMsg } = await supabase
        .from("messages")
        .insert({
          applicant_id: applicant.id,
          applicant_phone: applicant.phone,
          direction: "outbound",
          body: result.reply_text,
          status: "sent",
          sent_by: "agent",
          solapi_msg_id: send.messageId ?? null,
          message_type: "sms",
          job_id: jc.job_id,
        })
        .select("id")
        .single();
      replySent = true;
      outboundId = outMsg?.id ?? null;

      // AI 응답의 reasoning + transition을 message_drafts에 status='auto_sent'로 보관.
      // 매니저가 UI에서 메시지별로 왜 그렇게 답했는지 사후 조회할 수 있게 한다.
      if (outboundId) {
        const transitionLabel =
          result.transition.kind === "advance"
            ? `→ ${result.transition.to} (${result.transition.reason})`
            : result.transition.kind === "pause"
            ? `⏸ pause: ${result.transition.reason}`
            : result.transition.kind === "abort"
            ? `⛔ abort: ${result.transition.reason}`
            : "";
        const reasoningWithTransition = transitionLabel
          ? `[${transitionLabel}]\n${result.reasoning ?? ""}`
          : (result.reasoning ?? "");
        await supabase.from("message_drafts").insert({
          applicant_id: applicant.id,
          inbound_message_id,
          draft_text: result.reply_text,
          reasoning: reasoningWithTransition,
          status: "auto_sent",
          used_message_id: outboundId,
          resolved_at: new Date().toISOString(),
        });
      }
    } else {
      // 발송 실패 — pause로 강제 전환
      result.transition = { kind: "pause", reason: `SMS 발송 실패: ${send.error ?? "unknown"}` };
      console.error("[router] SMS send failed", send.error);
    }
  }

  // 5) Transition + state 저장 + 자동 발송
  const apply = await applyTransition({
    supabase,
    candidate_id: jc.id,
    applicant_id: applicant.id,
    applicant_name: applicant.name,
    applicant_phone: applicant.phone,
    job_id: jc.job_id,
    job,
    current_stage: stageName,
    state_update: result.state_update,
    transition: result.transition,
  });

  return {
    ok: true,
    reply_sent: replySent,
    next_stage: apply.next_stage,
    auto_sent_messages: apply.auto_sent_messages,
    reasoning: result.reasoning,
  };
}
