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

    // 지원자 phone 번호 조회
    const { data: applicant } = await supabase
      .from("applicants")
      .select("phone")
      .eq("id", applicantId)
      .single();

    // applicant_id 또는 phone 번호로 대화 내역 조회 (트리거 미실행 대비)
    let messages;
    let error;

    if (applicant?.phone) {
      const result = await supabase
        .from("messages")
        .select("*")
        .or(`applicant_id.eq.${applicantId},applicant_phone.eq.${applicant.phone}`)
        .order("created_at", { ascending: true });
      messages = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from("messages")
        .select("*")
        .eq("applicant_id", applicantId)
        .order("created_at", { ascending: true });
      messages = result.data;
      error = result.error;
    }

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
