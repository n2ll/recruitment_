import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateDraftReply, AgentApplicantContext, AgentTurn } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface TestBody {
  applicant_id?: number | null;
  inbound_text: string;
  // 수동 컨텍스트 (applicant_id 없이 직접 입력 시)
  manual?: Partial<AgentApplicantContext>;
  // 수동 히스토리 (추가 턴 직접 입력 가능)
  manual_history?: AgentTurn[];
  // 기존 지원자의 실제 메시지 히스토리도 불러올지
  use_real_history?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TestBody;
    const inboundText = (body.inbound_text || "").trim();
    if (!inboundText) {
      return NextResponse.json(
        { error: "인입 메시지를 입력해주세요." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 1) 컨텍스트 구성
    let applicant: AgentApplicantContext;
    if (body.applicant_id) {
      const { data } = await supabase
        .from("applicants")
        .select(
          "id, name, phone, branch1, branch2, confirmed_branch, current_branch, work_hours, status, available_date, own_vehicle, introduction"
        )
        .eq("id", body.applicant_id)
        .single();
      if (!data) {
        return NextResponse.json(
          { error: "지원자를 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      applicant = data as AgentApplicantContext;
    } else {
      applicant = {
        id: null,
        name: body.manual?.name || null,
        phone: body.manual?.phone || "(테스트번호)",
        branch1: body.manual?.branch1 || null,
        branch2: body.manual?.branch2 || null,
        confirmed_branch: body.manual?.confirmed_branch || null,
        current_branch: body.manual?.current_branch || null,
        work_hours: body.manual?.work_hours || null,
        status: body.manual?.status || null,
        available_date: body.manual?.available_date || null,
        own_vehicle: body.manual?.own_vehicle || null,
        introduction: body.manual?.introduction || null,
      };
    }

    // 2) 히스토리
    let history: AgentTurn[] = [];
    if (body.applicant_id && body.use_real_history) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("direction, body, created_at")
        .or(
          `applicant_id.eq.${body.applicant_id},applicant_phone.eq.${applicant.phone}`
        )
        .order("created_at", { ascending: false })
        .limit(30);
      const stripPrefix = (s: string) =>
        s.replace(/^\s*\[(?:Web발신|국제발신|광고)\]\s*/i, "").trim();
      history = (msgs || [])
        .slice()
        .reverse()
        .map((m) => ({
          direction: m.direction as "inbound" | "outbound",
          body: stripPrefix(m.body as string),
          created_at: m.created_at as string,
        }));
    }
    if (Array.isArray(body.manual_history)) {
      history = [...history, ...body.manual_history];
    }

    // 3) Claude 호출
    const draft = await generateDraftReply({
      applicant,
      history,
      latestInbound: inboundText,
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Claude 호출 실패 (서버 로그 확인)" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      draft,
      context: {
        applicant,
        history_turn_count: history.length,
      },
    });
  } catch (err) {
    console.error("[admin/agent/test] exception", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
