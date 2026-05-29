/**
 * GET /api/admin/cron/onboarding-reminder
 *
 * 가이드 발송 후 24h이 지났는데도 배민 아이디·차량번호가 둘 다 수신되지 않은
 * 온보딩 단계 후보를 매니저에게 슬랙으로 인계.
 *
 *  조건: agent_stage='onboarding' AND
 *        meta.onboarding_entered_at < now - 24h AND
 *        meta.manager_handoff_alerted_at IS NULL AND
 *        (배민_아이디_수신 ≠ true OR 차량번호_수신 ≠ true)
 *  동작: sendSlackOnboardingHandoff 호출 + meta.manager_handoff_alerted_at 기록 (1회만)
 *
 * (자동 SMS 리마인더는 운영 판단으로 비활성화. 24h 미회신 시 곧장 매니저 전화 인계.)
 * 둘 다 수신된 후보는 발동 안 함.
 *
 * Vercel cron schedule: daily (Hobby 플랜 호환). KST 오전 10시(`0 1 * * *` UTC).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendSlackOnboardingHandoff } from "@/lib/slack";
import { mergeAgentState } from "@/lib/agent/checklist";
import type { AgentState } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

const HANDOFF_DELAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // 인증 — Vercel cron 또는 Bearer CRON_SECRET
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  const secret = process.env.CRON_SECRET;
  const expected = secret ? `Bearer ${secret}` : null;
  if (!isVercelCron && (!expected || req.headers.get("authorization") !== expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - HANDOFF_DELAY_MS).toISOString();

  const { data: rows, error } = await supabase
    .from("job_candidates")
    .select(`
      id, applicant_id, job_id, agent_state,
      applicants:applicant_id (id, name, phone, source, branch1)
    `)
    .eq("agent_stage", "onboarding")
    .limit(500);

  if (error) {
    console.error("[onboarding-reminder cron] query error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ candidate_id: number; success: boolean; reason?: string }> = [];

  for (const row of rows ?? []) {
    const state = (row.agent_state ?? {}) as AgentState;
    const meta = (state.meta ?? {}) as Record<string, string | undefined>;
    const ob = state.onboarding ?? {};
    const applicant = row.applicants as unknown as {
      id: number; name: string | null; phone: string;
      source: string | null; branch1: string | null;
    };

    if (ob.배민_아이디_수신 === true && ob.차량번호_수신 === true) continue;
    if (meta.manager_handoff_alerted_at) continue;          // 이미 인계 알림 발송됨
    if (!meta.onboarding_entered_at) {
      results.push({ candidate_id: row.id as number, success: false, reason: "no onboarding_entered_at" });
      continue;
    }
    if (meta.onboarding_entered_at > cutoff) continue;       // 24h 미경과
    if (!applicant?.phone) {
      results.push({ candidate_id: row.id as number, success: false, reason: "no phone" });
      continue;
    }

    // 슬랙 발송 (연습용은 skip)
    if (applicant.source !== "danggeun_practice") {
      try {
        await sendSlackOnboardingHandoff({
          applicant_name: applicant.name,
          applicant_phone: applicant.phone,
          branch: applicant.branch1,
        });
      } catch (e) {
        console.error("[onboarding-reminder cron] slack fail", row.id, e);
      }
    }
    const merged = mergeAgentState(state, {
      meta: { manager_handoff_alerted_at: new Date().toISOString() },
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
