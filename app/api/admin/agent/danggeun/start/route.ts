import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendSms } from "@/lib/solapi";
import { ensureDanggeunSystemJob } from "@/lib/agent/danggeun-job";
import { fillTemplate } from "@/lib/agent/system-messages";

export const dynamic = "force-dynamic";

// POST /api/admin/agent/danggeun/start
// body: { name, phone, branch1, startMessage }
// 흐름: applicants에 source='danggeun'으로 INSERT → 시작 멘트 SMS 발송 → messages 저장
//
// 시작 멘트는 클라이언트(매니저 브라우저 localStorage)에서 전달.
// applicants 테이블의 NOT NULL 필수 텍스트 컬럼들은 추후 대화로 수집하므로 placeholder로 채움.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, branch1, startMessage, targetJobInfo } = body;
    // targetJobInfo: 매니저가 새 등록 시 어떤 공고/지점으로 모집할지 명시 (facts 항목 또는 자유 텍스트).
    // applicants.introduction에 저장되어 router → stage 모듈의 컨텍스트에 자동 주입됨.

    if (!name?.trim() || !/^\d{10,11}$/.test((phone || "").replace(/-/g, "")) || !branch1) {
      return NextResponse.json(
        { error: "이름, 전화번호, 지점은 필수입니다." },
        { status: 400 }
      );
    }
    if (!startMessage?.trim()) {
      return NextResponse.json(
        { error: "시작 멘트가 비어 있습니다. 좌측 시작 멘트를 먼저 저장해주세요." },
        { status: 400 }
      );
    }

    const normalizedPhone = (phone as string).replace(/-/g, "");
    const supabase = createServiceClient();

    // 중복 전화번호 체크는 의도적으로 없음 — 매니저가 동일 번호에도 재발송 가능해야 함.

    // NOT NULL 텍스트 컬럼들 → 미확인 placeholder (대화로 채울 예정)
    const PLACEHOLDER = "미확인";

    const { data: inserted, error: insertErr } = await supabase
      .from("applicants")
      .insert({
        name: name.trim(),
        phone: normalizedPhone,
        branch1,
        branch: branch1,
        source: "danggeun",
        birth_date: PLACEHOLDER,
        location: PLACEHOLDER,
        own_vehicle: PLACEHOLDER,
        license_type: PLACEHOLDER,
        vehicle_type: PLACEHOLDER,
        work_hours: PLACEHOLDER,
        introduction: targetJobInfo?.trim() || "당근 수동등록",
        status: "서류심사",
        filter_pass: null,
        note: targetJobInfo?.trim() ? `당근 수동등록 — 공고: ${targetJobInfo.trim().slice(0, 80)}` : "당근 수동등록",
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      console.error("[danggeun start insert error]", insertErr);
      return NextResponse.json(
        { error: insertErr?.message || "지원자 등록 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    // 시작 멘트 placeholder 치환 — {{이름}}/{{지점}}/{{시간대}}
    const filledStart = fillTemplate(startMessage.trim(), {
      이름: name.trim(),
      지점: branch1,
      시간대: "", // 수동 등록은 희망 시간대 미상
    });

    // 시작 멘트 SMS 발송
    const sendResult = await sendSms(normalizedPhone, filledStart);
    if (!sendResult.success) {
      console.error("[danggeun start send error]", sendResult.error);
      return NextResponse.json(
        {
          error: "지원자는 등록되었지만 시작 멘트 발송에 실패했습니다.",
          applicant: inserted,
          sendError: sendResult.error,
        },
        { status: 502 }
      );
    }

    // 시스템 더미 공고 + job_candidates row 생성 — 인입 SMS가 라우터를 타게 함
    let jobIdForMsg: number | null = null;
    try {
      const danggeunJobId = await ensureDanggeunSystemJob(supabase);
      jobIdForMsg = danggeunJobId;
      const { error: jcErr } = await supabase.from("job_candidates").insert({
        job_id: danggeunJobId,
        applicant_id: inserted.id,
        agent_stage: "screening", // 탐색은 base 능력으로 깔고, 프로세스는 스크리닝부터 시작
        // 시작 멘트에 안내 묶음(정산/프로모션/업무시간)이 포함되므로 해당 항목 자동 true
        agent_state: {
          screening: {
            프로모션_종료가능성_안내: true,
            정산주기_안내: true,
            업무시간_체계_이해: true,
          },
          meta: { screening_entered_at: new Date().toISOString() },
        },
      });
      if (jcErr) {
        console.error("[danggeun start] job_candidates insert error", jcErr);
      }
    } catch (e) {
      console.error("[danggeun start] system job ensure failed", e);
    }

    // messages 기록 (outbound)
    await supabase.from("messages").insert({
      applicant_id: inserted.id,
      applicant_phone: normalizedPhone,
      direction: "outbound",
      body: filledStart,
      status: "sent",
      sent_by: "danggeun-start",
      solapi_msg_id: sendResult.messageId || null,
      job_id: jobIdForMsg,
    });

    return NextResponse.json({ success: true, applicant: inserted });
  } catch (err) {
    console.error("[danggeun start exception]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
