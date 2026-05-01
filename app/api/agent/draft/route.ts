import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateDraftReply, AgentApplicantContext, AgentTurn } from "@/lib/agent";
import { sendSlackAgentAlert } from "@/lib/slack";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SupabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema?: string;
  record?: {
    id: string;
    applicant_id: number | null;
    applicant_phone: string;
    direction: "inbound" | "outbound";
    body: string;
    created_at: string;
  };
}

export async function POST(req: NextRequest) {
  // 시크릿 헤더 검증 (Supabase webhook 설정에서 동일 값 헤더 추가)
  const expectedSecret = process.env.AGENT_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("[agent/draft] AGENT_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const provided = req.headers.get("x-webhook-secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = (await req.json()) as SupabaseWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // INSERT into messages, direction=inbound 만 처리
  if (payload.type !== "INSERT" || payload.table !== "messages") {
    return NextResponse.json({ skip: "not insert/messages" });
  }
  const rec = payload.record;
  if (!rec || rec.direction !== "inbound") {
    return NextResponse.json({ skip: "not inbound" });
  }

  const supabase = createServiceClient();

  // 같은 inbound에 대한 draft가 이미 있으면 중복 생성 방지
  const { data: existing } = await supabase
    .from("message_drafts")
    .select("id")
    .eq("inbound_message_id", rec.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ skip: "draft already exists" });
  }

  // 지원자 컨텍스트
  let applicant: AgentApplicantContext | null = null;
  if (rec.applicant_id) {
    const { data } = await supabase
      .from("applicants")
      .select(
        "id, name, phone, branch1, branch2, confirmed_branch, current_branch, work_hours, status, available_date, own_vehicle, introduction"
      )
      .eq("id", rec.applicant_id)
      .single();
    if (data) applicant = data as AgentApplicantContext;
  }
  if (!applicant) {
    // phone으로 보강 시도
    const { data } = await supabase
      .from("applicants")
      .select(
        "id, name, phone, branch1, branch2, confirmed_branch, current_branch, work_hours, status, available_date, own_vehicle, introduction"
      )
      .eq("phone", rec.applicant_phone)
      .maybeSingle();
    if (data) applicant = data as AgentApplicantContext;
  }
  if (!applicant) {
    applicant = {
      id: null,
      name: null,
      phone: rec.applicant_phone,
      branch1: null,
      branch2: null,
      confirmed_branch: null,
      current_branch: null,
      work_hours: null,
      status: null,
      available_date: null,
      own_vehicle: null,
      introduction: null,
    };
  }

  // 최근 대화 (최대 20턴, 시간순) — 방금 받은 inbound 포함되므로 그 직전까지만
  const { data: msgs } = await supabase
    .from("messages")
    .select("direction, body, created_at")
    .or(
      applicant.id
        ? `applicant_id.eq.${applicant.id},applicant_phone.eq.${rec.applicant_phone}`
        : `applicant_phone.eq.${rec.applicant_phone}`
    )
    .lt("created_at", rec.created_at)
    .order("created_at", { ascending: true })
    .limit(20);

  const history: AgentTurn[] = (msgs || []).map((m) => ({
    direction: m.direction as "inbound" | "outbound",
    body: m.body as string,
    created_at: m.created_at as string,
  }));

  // Claude 호출
  const draft = await generateDraftReply({
    applicant,
    history,
    latestInbound: rec.body,
  });

  if (!draft) {
    await supabase.from("message_drafts").insert({
      inbound_message_id: rec.id,
      applicant_id: applicant.id,
      applicant_phone: rec.applicant_phone,
      draft_text: null,
      reasoning: "Claude API 호출 실패",
      status: "failed",
    });
    return NextResponse.json({ error: "draft generation failed" }, { status: 500 });
  }

  if (draft.status === "need_info") {
    await supabase.from("message_drafts").insert({
      inbound_message_id: rec.id,
      applicant_id: applicant.id,
      applicant_phone: rec.applicant_phone,
      draft_text: null,
      reasoning: draft.reasoning,
      missing_info: draft.missing_info || "정보 부족",
      status: "need_info",
    });

    // 슬랙 알림
    await sendSlackAgentAlert({
      applicant_name: applicant.name,
      applicant_phone: rec.applicant_phone,
      branch: applicant.confirmed_branch || applicant.branch1,
      inbound_text: rec.body,
      missing_info: draft.missing_info || "정보 부족",
    });

    return NextResponse.json({ status: "need_info" });
  }

  await supabase.from("message_drafts").insert({
    inbound_message_id: rec.id,
    applicant_id: applicant.id,
    applicant_phone: rec.applicant_phone,
    draft_text: draft.draft_text,
    reasoning: draft.reasoning,
    status: "pending",
  });

  return NextResponse.json({ status: "pending", draft_text: draft.draft_text });
}
