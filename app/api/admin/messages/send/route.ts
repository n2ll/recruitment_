import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendSms } from "@/lib/solapi";

export async function POST(req: NextRequest) {
  try {
    const { applicant_id, phone, body, sent_by } = await req.json();

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

    return NextResponse.json({ success: true, message: data });
  } catch (err) {
    console.error("[send message error]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
