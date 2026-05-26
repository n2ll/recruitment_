import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendSms } from "@/lib/solapi";

export async function POST(req: NextRequest) {
  try {
    const { applicant_id, phone, body, sent_by, draft_id, draft_was_edited } = await req.json();

    if (!phone || !body) {
      return NextResponse.json(
        { error: "phone과 body는 필수입니다." },
        { status: 400 }
      );
    }

    // 솔라피로 문자 발송
    const result = await sendSms(phone, body);
    if (!result.success) {
      return NextResponse.json(
        { error: "문자 발송 실패: " + result.error },
        { status: 500 }
      );
    }

    // messages 테이블에 저장
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        applicant_id: applicant_id || null,
        applicant_phone: phone,
        direction: "outbound",
        body,
        status: "sent",
        sent_by: sent_by || "관리자",
        solapi_msg_id: result.messageId || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[messages insert error]", error);
      return NextResponse.json(
        { error: "메시지 저장 실패" },
        { status: 500 }
      );
    }

    // 매니저 발송 직후 — 후보가 paused 상태면 직전 stage로 자동 복귀.
    // (시급 등 facts 부족으로 pause된 후 매니저가 답변 보내주면 AI가 다음 답장부터 다시 인수)
    if (applicant_id) {
      const { data: jc } = await supabase
        .from("job_candidates")
        .select("id, agent_stage, agent_state")
        .eq("applicant_id", applicant_id)
        .not("agent_stage", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (jc?.agent_stage === "paused") {
        const meta = (jc.agent_state as { meta?: { paused_from_stage?: string } } | null)?.meta;
        const restoreStage = (meta?.paused_from_stage as string | undefined) || "exploration";
        await supabase
          .from("job_candidates")
          .update({
            agent_stage: restoreStage,
            paused_reason: null,
          })
          .eq("id", jc.id);
      }
    }

    // 사용된 draft 표시
    if (draft_id) {
      await supabase
        .from("message_drafts")
        .update({
          status: draft_was_edited ? "edited" : "used",
          used_message_id: data.id,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", draft_id);
    } else if (applicant_id) {
      // draft_id 없이 매니저가 직접 입력한 경우 — 해당 지원자의 pending draft를 ignored 처리
      await supabase
        .from("message_drafts")
        .update({
          status: "ignored",
          resolved_at: new Date().toISOString(),
        })
        .eq("applicant_id", applicant_id)
        .in("status", ["pending", "need_info"]);
    }

    return NextResponse.json({ success: true, message: data });
  } catch (err) {
    console.error("[send message error]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
