import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendSms } from "@/lib/solapi";

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
    const { name, phone, branch1, startMessage } = body;

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
        introduction: "당근 수동등록",
        status: "서류심사",
        filter_pass: null,
        note: "당근 수동등록",
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

    // 시작 멘트 SMS 발송
    const sendResult = await sendSms(normalizedPhone, startMessage.trim());
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

    // messages 기록 (outbound)
    await supabase.from("messages").insert({
      applicant_id: inserted.id,
      applicant_phone: normalizedPhone,
      direction: "outbound",
      body: startMessage.trim(),
      status: "sent",
      sent_by: "danggeun-start",
      solapi_msg_id: sendResult.messageId || null,
    });

    return NextResponse.json({ success: true, applicant: inserted });
  } catch (err) {
    console.error("[danggeun start exception]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
