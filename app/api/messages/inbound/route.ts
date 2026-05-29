/**
 * POST /api/messages/inbound
 *
 * SMS Gateway(전용 폰) → 본 라우트가 인입의 단일 진입점.
 *
 * 흐름:
 *   1) 인증 (헤더 시크릿)
 *   2) phone으로 applicant 매칭
 *   3) messages INSERT (direction=inbound, job_id=현재 진행중 공고)
 *   4) applicants.unread_count++, last_message_at 갱신
 *   5) job_candidates.responded_at 갱신 (첫 응답이면)
 *   6) agent_stage 분기:
 *        - screening/onboarding/active → router.runAgentForCandidate()
 *        - paused/abort/null → 에이전트 호출 없이 종료 (매니저 직접 응대)
 *
 * 멱등성: (applicant_phone, body, received_at) 기반 best-effort 중복 차단.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { runAgentForCandidate } from "@/lib/agent/router";

export const dynamic = "force-dynamic";
// 답장 텀(최대 45s 슬립) + AI(~5~10s) + 발송 — 60s 안에 마치도록 maxDuration 60.
// (Vercel Hobby 한도 = 60s. Pro면 더 늘려도 무방.)
export const maxDuration = 60;

interface InboundPayload {
  from: string;            // 발신 번호 ("010-1234-5678" 또는 "01012345678")
  text: string;            // SMS 본문
  received_at?: string;    // 가능하면 ISO8601, 없으면 서버 now()
  device_id?: string;      // 전용 폰 식별자
  external_id?: string;    // Gateway가 부여한 고유 ID (멱등성)
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export async function POST(req: NextRequest) {
  // 1) 인증
  const expected = process.env.INBOUND_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[inbound] INBOUND_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const provided = req.headers.get("x-webhook-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = (await req.json()) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.from || !payload.text) {
    return NextResponse.json({ error: "from, text 필수" }, { status: 400 });
  }

  const phone = normalizePhone(payload.from);
  const text = payload.text.trim();
  const supabase = createServiceClient();
  const receivedAt = payload.received_at || new Date().toISOString();

  // 2) applicant 매칭 (phone 일치, 가장 최근 1명)
  const { data: applicants } = await supabase
    .from("applicants")
    .select("id, current_job_id, name")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);
  const applicant = applicants?.[0] ?? null;

  // 3) 멱등성 — external_id 있으면 messages.solapi_msg_id 자리에 stash
  if (payload.external_id) {
    const { data: dup } = await supabase
      .from("messages")
      .select("id")
      .eq("solapi_msg_id", payload.external_id)
      .eq("direction", "inbound")
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ ok: true, dedup: true });
    }
  }

  // 진행 중인 job 확인 (active job_candidate 우선)
  let activeJobId: number | null = null;
  let candidateRow: { id: number; agent_stage: string | null } | null = null;
  if (applicant) {
    const { data: jc } = await supabase
      .from("job_candidates")
      .select("id, job_id, agent_stage, responded_at")
      .eq("applicant_id", applicant.id)
      .not("agent_stage", "is", null)
      .neq("agent_stage", "abort")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jc) {
      activeJobId = jc.job_id as number;
      candidateRow = { id: jc.id as number, agent_stage: jc.agent_stage as string | null };
      // 첫 응답이면 responded_at 기록
      if (!jc.responded_at) {
        await supabase
          .from("job_candidates")
          .update({ responded_at: receivedAt })
          .eq("id", jc.id);
      }
    }
  }

  // 4) messages INSERT
  const { data: inserted, error: insertErr } = await supabase
    .from("messages")
    .insert({
      applicant_id: applicant?.id ?? null,
      applicant_phone: phone,
      direction: "inbound",
      body: text,
      status: "received",
      sent_by: payload.device_id ?? "sms-gateway",
      solapi_msg_id: payload.external_id ?? null,
      message_type: "sms",
      job_id: activeJobId,
      created_at: receivedAt,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[inbound] messages insert", insertErr);
    return NextResponse.json({ error: "메시지 저장 실패" }, { status: 500 });
  }

  // 5) applicants 카운터
  if (applicant) {
    await supabase.rpc("increment_unread", { p_applicant_id: applicant.id }).then(
      () => {},
      async () => {
        // RPC 없으면 폴백: 직접 UPDATE
        const { data: a } = await supabase
          .from("applicants")
          .select("unread_count")
          .eq("id", applicant.id)
          .single();
        await supabase
          .from("applicants")
          .update({
            unread_count: (a?.unread_count ?? 0) + 1,
            last_message_at: receivedAt,
          })
          .eq("id", applicant.id);
      }
    );
  }

  // 6) Agent 호출
  if (!candidateRow || !candidateRow.agent_stage) {
    return NextResponse.json({
      ok: true,
      message_id: inserted.id,
      agent_invoked: false,
      reason: applicant ? "no active job_candidate" : "unknown applicant",
    });
  }

  if (candidateRow.agent_stage === "paused") {
    return NextResponse.json({
      ok: true,
      message_id: inserted.id,
      agent_invoked: false,
      reason: "candidate paused — manager handles",
    });
  }

  const agentResult = await runAgentForCandidate({
    supabase,
    candidate_id: candidateRow.id,
    inbound_message_id: inserted.id,
    inbound_text: text,
    received_at: receivedAt, // 인입 시각 기준 답장 텀 적용 (router에서 대기)
  });

  return NextResponse.json({
    ok: true,
    message_id: inserted.id,
    agent_invoked: true,
    agent: agentResult,
  });
}
