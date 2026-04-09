import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { applicantId: string } }
) {
  try {
    const applicantId = parseInt(params.applicantId);
    if (isNaN(applicantId)) {
      return NextResponse.json(
        { error: "유효하지 않은 ID" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 대화 내역 조회
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[messages fetch error]", error);
      return NextResponse.json(
        { error: "메시지 조회 실패" },
        { status: 500 }
      );
    }

    // 안읽은 메시지 초기화
    await supabase
      .from("applicants")
      .update({ unread_count: 0 })
      .eq("id", applicantId);

    return NextResponse.json({ data: messages || [] });
  } catch (err) {
    console.error("[messages API error]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
