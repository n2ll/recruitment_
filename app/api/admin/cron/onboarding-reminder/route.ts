/**
 * GET /api/admin/cron/onboarding-reminder
 *
 * 온보딩 가이드(앱설치 안내) 발송 후 24시간이 지났는데도 배민 아이디·차량번호가
 * 둘 다 수신되지 않은 후보에게 '회신 요청' 리마인더 SMS를 1회 발송.
 *
 * 트리거 조건 (AND):
 *  - job_candidates.agent_stage = 'onboarding'
 *  - agent_state.meta.onboarding_entered_at < now - 24h
 *  - agent_state.meta.onboarding_reminder_sent_at IS NULL  (1회 발송 한도)
 *  - agent_state.onboarding.배민_아이디_수신 ≠ true OR 차량번호_수신 ≠ true
 *
 * 발송 후 agent_state.meta.onboarding_reminder_sent_at에 발송 시각 기록.
 *
 * 본문은 system_message 'onboarding_reminder' (admin에서 편집). 없으면 기본 fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendSms } from "@/lib/solapi";
import { fillTemplate, getSystemMessage } from "@/lib/agent/system-messages";
import { mergeAgentState } from "@/lib/agent/checklist";
import type { AgentState } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

const DEADLINE_MS = 24 * 60 * 60 * 1000;

const FALLBACK_BODY = (name: string) =>
  [
    `${name}님, 아직 배민 아이디·차량번호 회신이 확인되지 않습니다.`,
    "",
    "진행을 위해 두 정보 모두 회신 부탁드립니다.",
    "1. 배민 커넥트 아이디 (마이페이지 > 내 정보)",
    "2. 차량번호",
    "",
    "* 회신이 없을 경우 진행이 자동 중단될 수 있습니다.",
  ].join("\n");

export async function GET(req: NextRequest) {
  // 인증 — Vercel cron 또는 Bearer CRON_SECRET
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  const secret = process.env.CRON_SECRET;
  const expected = secret ? `Bearer ${secret}` : null;
  if (!isVercelCron && (!expected || req.headers.get("authorization") !== expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - DEADLINE_MS).toISOString();

  // 후보 후보군 로드 — onboarding 단계 + 진입 24h 경과
  // (JSONB 깊은 조건 필터는 JS에서 처리)
  const { data: rows, error } = await supabase
    .from("job_candidates")
    .select(`
      id, applicant_id, job_id, agent_state,
      applicants:applicant_id (id, name, phone, source)
    `)
    .eq("agent_stage", "onboarding")
    .limit(500);

  if (error) {
    console.error("[onboarding-reminder cron] query error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ candidate_id: number; success: boolean; reason?: string; error?: string }> = [];

  for (const row of rows ?? []) {
    const state = (row.agent_state ?? {}) as AgentState;
    const meta = (state.meta ?? {}) as Record<string, string | undefined>;
    const ob = state.onboarding ?? {};

    if (!meta.onboarding_entered_at) {
      results.push({ candidate_id: row.id as number, success: false, reason: "no onboarding_entered_at" });
      continue;
    }
    if (meta.onboarding_entered_at > cutoff) {
      // 24h 미경과
      continue;
    }
    if (meta.onboarding_reminder_sent_at) {
      // 이미 리마인더 발송됨 (1회 제한)
      continue;
    }
    if (ob.배민_아이디_수신 === true && ob.차량번호_수신 === true) {
      // 둘 다 받았으면 리마인더 불필요
      continue;
    }

    const applicant = row.applicants as unknown as { id: number; name: string | null; phone: string; source: string | null };
    if (!applicant?.phone) {
      results.push({ candidate_id: row.id as number, success: false, reason: "no phone" });
      continue;
    }
    if (applicant.source === "danggeun_practice") {
      // 연습용은 실 발송 안 함 — 그래도 리마인더 전송 기록은 남겨 같은 후보가 매 cron마다 후보군에 또 잡히지 않게.
      const merged = mergeAgentState(state, {
        meta: { onboarding_reminder_sent_at: new Date().toISOString() },
      });
      await supabase.from("job_candidates").update({ agent_state: merged }).eq("id", row.id);
      results.push({ candidate_id: row.id as number, success: true, reason: "practice — skipped real SMS" });
      continue;
    }

    const stored = (await getSystemMessage(supabase, "onboarding_reminder"))?.trim();
    const name = applicant.name ?? "지원자";
    const body = stored
      ? fillTemplate(stored, { 이름: name })
      : FALLBACK_BODY(name);

    const send = await sendSms(applicant.phone, body);
    if (!send.success) {
      console.error("[onboarding-reminder cron] send fail", row.id, send.error);
      results.push({ candidate_id: row.id as number, success: false, error: send.error });
      continue;
    }

    // 발송 기록 + meta 갱신
    const sentAt = new Date().toISOString();
    await supabase.from("messages").insert({
      applicant_id: applicant.id,
      applicant_phone: applicant.phone,
      direction: "outbound",
      body,
      status: "sent",
      sent_by: "system-onboarding-reminder",
      solapi_msg_id: send.messageId ?? null,
      message_type: "sms",
      job_id: row.job_id as number,
    });
    const merged = mergeAgentState(state, {
      meta: { onboarding_reminder_sent_at: sentAt },
    });
    await supabase.from("job_candidates").update({ agent_state: merged }).eq("id", row.id);

    results.push({ candidate_id: row.id as number, success: true });
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    results,
  });
}
