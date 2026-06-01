/**
 * POST /api/webhooks/supabase-new-message
 *
 * Supabase Database Webhook 진입점.
 * SMS Gateway가 messages 테이블에 직접 INSERT(REST API)하기 때문에 우리 /api/messages/inbound가
 * 호출되지 않는다. 그래서 Supabase가 INSERT 이벤트를 받아 이 라우트로 webhook을 쏘게 한다.
 *
 * 처리:
 *  1. Supabase Webhook payload 검증
 *  2. record.direction='inbound' + classification IS NULL이면 (idempotent guard)
 *  3. phone으로 applicants 매칭 시도
 *     a. 매칭됨 → 메시지에 applicant_id 채우고 router.runAgentForCandidate
 *     b. 매칭 안 됨 → 하드 필터 / Haiku triage 분기
 *        - hard spam → classification='other'
 *        - is_baemin + conf ≥ 0.7 → applicants 자동 생성 + job_candidates + router
 *        - 그 외 → classification='pending' (매니저 인박스로)
 *
 * 인증: 헤더 Authorization = `Bearer ${SUPABASE_WEBHOOK_SECRET}`
 *
 * Supabase Dashboard에서 다음 webhook 만들어야 함:
 *   Table: messages
 *   Events: INSERT
 *   HTTP method: POST
 *   URL: https://recruitment-z9vp.vercel.app/api/webhooks/supabase-new-message
 *   Headers: Authorization: Bearer <SUPABASE_WEBHOOK_SECRET 값>
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { runAgentForCandidate } from "@/lib/agent/router";
import { triageInbound, isHardSpam } from "@/lib/agent/baemin-triage";
import { ensureBaeminSystemJob } from "@/lib/agent/baemin-job";

export const dynamic = "force-dynamic";
// router는 응답 텀(최대 45s) + AI + 발송으로 60s 가까이 가니 충분히 잡아둠
export const maxDuration = 90;

interface SupabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

interface MessageRecord {
  id: string | number;
  applicant_id: number | null;
  applicant_phone: string;
  direction: string;
  body: string;
  classification: string | null;
  created_at: string;
  job_id: number | null;
}

export async function POST(req: NextRequest) {
  // 1) 인증
  const expected = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[supabase-webhook] SUPABASE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) Payload 파싱
  let payload: SupabaseWebhookPayload;
  try {
    payload = (await req.json()) as SupabaseWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (payload.type !== "INSERT" || payload.table !== "messages" || !payload.record) {
    return NextResponse.json({ ok: true, skipped: "not a messages INSERT" });
  }
  const msg = payload.record as unknown as MessageRecord;
  if (msg.direction !== "inbound") {
    return NextResponse.json({ ok: true, skipped: "not inbound" });
  }
  // 이미 분류된 행이면 멱등 종료
  if (msg.classification) {
    return NextResponse.json({ ok: true, skipped: "already classified" });
  }

  const supabase = createServiceClient();
  const phone = String(msg.applicant_phone || "").replace(/[^\d]/g, "");
  const text = String(msg.body || "").trim();
  const receivedAt = msg.created_at;

  // 3) phone으로 기존 applicant 매칭 시도
  let applicant: { id: number; name: string | null } | null = null;
  if (msg.applicant_id) {
    const { data } = await supabase
      .from("applicants")
      .select("id, name")
      .eq("id", msg.applicant_id)
      .maybeSingle();
    applicant = (data as { id: number; name: string | null } | null) ?? null;
  } else {
    const { data: matched } = await supabase
      .from("applicants")
      .select("id, name")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);
    applicant = (matched?.[0] as { id: number; name: string | null } | undefined) ?? null;
  }

  // ───────────────────────────────────────────────────────────────
  // 4a) 매칭됨 → message에 applicant_id 채우고 active candidate에 router 호출
  // ───────────────────────────────────────────────────────────────
  if (applicant) {
    // 활성 candidate 조회
    const { data: jc } = await supabase
      .from("job_candidates")
      .select("id, job_id, agent_stage, responded_at")
      .eq("applicant_id", applicant.id)
      .not("agent_stage", "is", null)
      .neq("agent_stage", "abort")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // message에 applicant_id (+ 가능하면 job_id) 채우기
    const msgUpdate: Record<string, unknown> = { applicant_id: applicant.id };
    if (jc?.job_id) msgUpdate.job_id = jc.job_id;
    await supabase.from("messages").update(msgUpdate).eq("id", msg.id);

    // 첫 응답이면 responded_at 기록
    if (jc && !jc.responded_at) {
      await supabase
        .from("job_candidates")
        .update({ responded_at: receivedAt })
        .eq("id", jc.id);
    }

    // 안 읽음 카운터 증가
    await supabase.rpc("increment_unread", { p_applicant_id: applicant.id }).then(
      () => {},
      async () => {
        const { data: a } = await supabase
          .from("applicants")
          .select("unread_count")
          .eq("id", applicant.id)
          .single();
        await supabase
          .from("applicants")
          .update({
            unread_count: ((a as { unread_count?: number } | null)?.unread_count ?? 0) + 1,
            last_message_at: receivedAt,
          })
          .eq("id", applicant.id);
      }
    );

    // Agent 호출
    if (!jc || !jc.agent_stage) {
      return NextResponse.json({
        ok: true,
        matched: true,
        agent_invoked: false,
        reason: "no active job_candidate",
      });
    }
    if (jc.agent_stage === "paused") {
      return NextResponse.json({
        ok: true,
        matched: true,
        agent_invoked: false,
        reason: "candidate paused — manager handles",
      });
    }
    const agentResult = await runAgentForCandidate({
      supabase,
      candidate_id: jc.id as number,
      inbound_message_id: String(msg.id),
      inbound_text: text,
      received_at: receivedAt,
    });
    return NextResponse.json({
      ok: true,
      matched: true,
      agent_invoked: true,
      agent: agentResult,
    });
  }

  // ───────────────────────────────────────────────────────────────
  // 4b) 매칭 안 됨 → 하드 필터 / triage
  // ───────────────────────────────────────────────────────────────
  if (isHardSpam(phone, text)) {
    await supabase.from("messages").update({ classification: "other" }).eq("id", msg.id);
    return NextResponse.json({
      ok: true,
      matched: false,
      classification: "other",
      reason: "hard-filter spam",
    });
  }

  const triage = await triageInbound({ phone, body: text });
  const isAutoBaemin = triage.is_baemin && triage.confidence >= 0.7;

  if (isAutoBaemin) {
    const ext = triage.extracted;
    const PH = "미확인";
    const isWeekend = String(ext.time_raw ?? "").includes("주말");

    const { data: newApplicant, error: appErr } = await supabase
      .from("applicants")
      .insert({
        name: ext.name?.trim() || "(이름 미확인)",
        phone,
        birth_date: PH,
        location: PH,
        own_vehicle: PH,
        license_type: PH,
        vehicle_type: ext.vehicle?.trim() || PH,
        branch1: PH,
        branch: PH,
        work_hours: ext.time_raw?.trim() || PH,
        available_date: PH,
        self_ownership: PH,
        source: "baemin",
        status: "스크리닝 중",
        filter_pass: null,
        introduction: ext.experience?.trim() || null,
        note: `자동 분류 (배민, conf ${triage.confidence.toFixed(2)}): ${triage.reasoning}`,
      })
      .select("id")
      .single();

    if (appErr || !newApplicant) {
      console.error("[supabase-webhook] baemin applicant create error", appErr);
      await supabase.from("messages").update({ classification: "pending" }).eq("id", msg.id);
      return NextResponse.json({
        ok: true,
        classification: "pending",
        reason: "applicant create failed",
        triage,
      });
    }

    const applicantId = (newApplicant as { id: number }).id;
    let jobId: number | null = null;
    let candidateId: number | null = null;
    try {
      jobId = await ensureBaeminSystemJob(supabase);
      const { data: jcIns } = await supabase
        .from("job_candidates")
        .insert({
          job_id: jobId,
          applicant_id: applicantId,
          agent_stage: "screening",
          agent_state: {
            screening: {
              프로모션_종료가능성_안내: true,
              정산주기_안내: true,
              업무시간_체계_이해: true,
              ...(isWeekend ? {} : { 공휴일_업무여부_확인: true }),
            },
            meta: { screening_entered_at: new Date().toISOString() },
          },
        })
        .select("id")
        .single();
      candidateId = ((jcIns as { id: number } | null)?.id as number) ?? null;
    } catch (e) {
      console.error("[supabase-webhook] baemin job_candidates create failed", e);
    }

    await supabase
      .from("messages")
      .update({
        applicant_id: applicantId,
        classification: "baemin",
        job_id: jobId,
      })
      .eq("id", msg.id);

    if (candidateId != null) {
      const agentResult = await runAgentForCandidate({
        supabase,
        candidate_id: candidateId,
        inbound_message_id: String(msg.id),
        inbound_text: text,
        received_at: receivedAt,
      });
      return NextResponse.json({
        ok: true,
        classification: "baemin",
        applicant_id: applicantId,
        triage,
        agent_invoked: true,
        agent: agentResult,
      });
    }
    return NextResponse.json({
      ok: true,
      classification: "baemin",
      applicant_id: applicantId,
      triage,
      agent_invoked: false,
    });
  }

  // 자신 없음 → pending (매니저 인박스)
  await supabase.from("messages").update({ classification: "pending" }).eq("id", msg.id);
  return NextResponse.json({
    ok: true,
    classification: "pending",
    triage,
  });
}
