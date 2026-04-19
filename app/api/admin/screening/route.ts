import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendNotification } from "@/lib/solapi";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "ID가 필요합니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: applicant, error: fetchErr } = await supabase
      .from("applicants")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !applicant) {
      return NextResponse.json({ error: "지원자를 찾을 수 없습니다." }, { status: 404 });
    }

    if (["온보딩", "현장투입"].includes(applicant.status)) {
      return NextResponse.json({ error: "이미 처리된 지원자입니다." }, { status: 400 });
    }

    const startDate = applicant.start_date || applicant.available_date || "추후 안내";
    const fallbackText = [
      "[옹고잉 배송원 업무 가이드 안내]",
      "",
      `${applicant.name}님, 근무 시작 전`,
      "아래 가이드를 반드시 확인해주세요.",
      "",
      `▶ 근무시작일: ${startDate}`,
      `▶ 근무지점: ${applicant.branch}`,
      "",
      "1. 배민 커넥트 앱 설치 후 가입",
      "2. 안전보건교육 영상(2시간) 수강",
      "3. 마이페이지 > 내 정보 > 아이디 회신",
      "",
      "교육 미이수 시 근무가 불가하므로",
      "시작일 전까지 완료 부탁드립니다.",
      "",
      "[가입 가이드 영상]",
      "https://www.youtube.com/watch?v=bMM112zT7JY",
    ].join("\n");

    const notifyResult = await sendNotification(
      applicant.phone,
      "GUIDE",
      {
        "#{이름}": applicant.name,
        "#{시작일}": String(startDate),
        "#{지점}": applicant.branch,
      },
      fallbackText
    );

    if (!notifyResult.success) {
      return NextResponse.json(
        { error: "메시지 발송 실패: " + notifyResult.error },
        { status: 500 }
      );
    }

    await supabase.from("messages").insert({
      applicant_id: applicant.id,
      applicant_phone: applicant.phone,
      direction: "outbound",
      body: fallbackText,
      status: "sent",
      sent_by: "system-screening",
      solapi_msg_id: notifyResult.messageId || null,
      message_type: notifyResult.via,
      template_id: notifyResult.templateId || null,
    });

    const { error: updateErr } = await supabase
      .from("applicants")
      .update({ status: "온보딩", screening: "완료" })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: "상태 업데이트 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true, via: notifyResult.via });
  } catch (err) {
    console.error("[screening API error]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
