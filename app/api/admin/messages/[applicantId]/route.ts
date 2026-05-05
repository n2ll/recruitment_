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

    // job_id 필터 (선택) — 구인 에이전트 탭에서 공고별 컨텍스트 분리용
    const url = new URL(req.url);
    const jobIdParam = url.searchParams.get("job_id");
    const jobIdFilter = jobIdParam ? Number(jobIdParam) : null;

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
      let q = supabase
        .from("messages")
        .select("*")
        .or(`applicant_id.eq.${applicantId},applicant_phone.eq.${applicant.phone}`)
        .order("created_at", { ascending: true });
      if (jobIdFilter !== null && Number.isFinite(jobIdFilter)) {
        q = q.eq("job_id", jobIdFilter);
      }
      const result = await q;
      messages = result.data;
      error = result.error;
    } else {
      let q = supabase
        .from("messages")
        .select("*")
        .eq("applicant_id", applicantId)
        .order("created_at", { ascending: true });
      if (jobIdFilter !== null && Number.isFinite(jobIdFilter)) {
        q = q.eq("job_id", jobIdFilter);
      }
      const result = await q;
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

    // 가장 최근 pending/need_info 초안 1건
    const { data: latestDraft } = await supabase
      .from("message_drafts")
      .select("id, inbound_message_id, draft_text, reasoning, missing_info, status, created_at")
      .eq("applicant_id", applicantId)
      .in("status", ["pending", "need_info"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      data: messages || [],
      messages: messages || [],   // alias — 신규 호출자가 사용
      draft: latestDraft || null,
    });
  } catch (err) {
    console.error("[messages API error]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
