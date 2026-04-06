import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "ID가 필요합니다." }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 지원자 정보 조회
    const { data: applicant, error: fetchErr } = await supabase
      .from("applicants")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !applicant) {
      return NextResponse.json({ error: "지원자를 찾을 수 없습니다." }, { status: 404 });
    }

    // 이미 온보딩 이상인 경우
    if (["온보딩", "현장투입"].includes(applicant.status)) {
      return NextResponse.json({ error: "이미 처리된 지원자입니다." }, { status: 400 });
    }

    // SOLAPI 문자 발송
    const message =
      `${applicant.name}님, 함께하게 되어 반갑습니다!\n` +
      `아래 순서로 진행 부탁드립니다.\n\n` +
      `1. 배민 커넥트 앱 설치 후 가입\n` +
      `2. 앱 가입 시 안전보건교육 영상(2시간) 필수 시청\n` +
      `3. 가입 및 교육 수료 후\n` +
      `   마이페이지 > 내 정보에서 아이디 확인 후\n` +
      `   아이디 회신 부탁드립니다.\n\n` +
      `문의사항은 편하게 말씀주세요.\n\n` +
      `[가입 가이드 영상]\n` +
      `https://www.youtube.com/watch?v=bMM112zT7JY`;

    const smsResult = await sendSolapi(applicant.phone, message);

    if (!smsResult.success) {
      return NextResponse.json({ error: "문자 발송 실패: " + smsResult.error }, { status: 500 });
    }

    // 상태 업데이트
    const { error: updateErr } = await supabase
      .from("applicants")
      .update({ status: "온보딩", screening: "완료" })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: "상태 업데이트 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[screening API error]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// ── SOLAPI 발송 ──────────────────────────────────────────
async function sendSolapi(to: string, text: string) {
  const crypto = await import("crypto");

  const apiKey = process.env.SOLAPI_API_KEY!;
  const apiSecret = process.env.SOLAPI_API_SECRET!;
  const from = "01035037252";

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");

  const res = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
    method: "POST",
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ to, from, text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[SOLAPI error]", body);
    return { success: false, error: body };
  }

  return { success: true };
}
