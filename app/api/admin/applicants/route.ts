import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServiceClient();
  const source = new URL(req.url).searchParams.get("source");

  let q = supabase
    .from("applicants")
    .select("*")
    .order("created_at", { ascending: false });

  if (source) q = q.eq("source", source);

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 각 applicant의 latest job_candidates.agent_stage를 함께 내려준다.
  // job_candidates가 없는 후보(예: 당근 수동등록)는 null.
  let withStage = data ?? [];
  if (withStage.length > 0) {
    const ids = withStage.map((a) => a.id);
    const { data: jcs } = await supabase
      .from("job_candidates")
      .select("id, applicant_id, agent_stage, created_at")
      .in("applicant_id", ids)
      .order("created_at", { ascending: false });

    const stageByApplicant = new Map<number, string | null>();
    for (const jc of jcs ?? []) {
      if (!stageByApplicant.has(jc.applicant_id as number)) {
        stageByApplicant.set(jc.applicant_id as number, jc.agent_stage as string | null);
      }
    }
    withStage = withStage.map((a) => ({
      ...a,
      agent_stage: stageByApplicant.get(a.id) ?? null,
    }));
  }

  return NextResponse.json({ data: withStage });
}
