import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { geocodeAddress } from "@/lib/kakao-geocode";

export const dynamic = "force-dynamic";

// 매니저가 수기로 INSERT 가능한 컬럼 화이트리스트 (시스템 컬럼 제외)
const CREATE_FIELDS = new Set([
  "name", "phone", "birth_date", "location",
  "own_vehicle", "license_type", "vehicle_type",
  "branch1", "branch2", "branch",
  "work_hours", "available_date", "self_ownership",
  "introduction", "experience",
  "source", "status", "filter_pass", "note",
  "start_date", "confirmed_slot", "confirmed_branch", "current_branch",
  "churn_reason", "marketing_consent", "kakao_channel_friend",
]);

const VALID_STATUS_SET = new Set(["스크리닝", "온보딩", "확정", "이탈", "부적합"]);
const VALID_SLOT_SET = new Set(["평일오전", "평일오후", "주말오전", "주말오후"]);

function validConfirmedSlot(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const tokens = v.split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.every((t) => VALID_SLOT_SET.has(t));
}

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

/**
 * POST /api/admin/applicants — 매니저 수기 등록.
 * 필수: name, phone, branch1. 그 외는 옵셔널 (어떤 컬럼도 비워둘 수 있음).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").replace(/-/g, "");
    const branch1 = String(body.branch1 ?? "").trim();

    if (!name) return NextResponse.json({ error: "이름은 필수입니다." }, { status: 400 });
    if (!/^\d{10,11}$/.test(phone)) {
      return NextResponse.json({ error: "전화번호 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (!branch1) return NextResponse.json({ error: "1지망 지점은 필수입니다." }, { status: 400 });

    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!CREATE_FIELDS.has(k)) continue;
      row[k] = v === "" ? null : v;
    }
    if (row.status && !VALID_STATUS_SET.has(row.status as string)) {
      return NextResponse.json({ error: `invalid status: ${row.status}` }, { status: 400 });
    }
    if (row.confirmed_slot && !validConfirmedSlot(row.confirmed_slot)) {
      return NextResponse.json({ error: "invalid confirmed_slot" }, { status: 400 });
    }

    // 기본값 보강
    row.name = name;
    row.phone = phone;
    row.branch1 = branch1;
    row.branch = row.branch ?? branch1;
    row.source = row.source ?? "manual";
    row.status = row.status ?? "스크리닝";
    if (row.marketing_consent === true) {
      row.marketing_consent_at = new Date().toISOString();
    }

    // 주소 지오코딩 (실패해도 INSERT 진행)
    const location = (row.location as string | null) ?? null;
    if (location && location.trim()) {
      try {
        const geo = await geocodeAddress(location);
        if (geo) {
          row.lat = geo.lat;
          row.lng = geo.lng;
          row.sido = geo.sido;
          row.sigungu = geo.sigungu;
          row.bname = geo.bname;
          row.road_address = geo.road_address;
        }
      } catch (e) {
        console.warn("[applicants POST] geocode skipped", e);
      }
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.from("applicants").insert(row).select().single();
    if (error) {
      console.error("[applicants POST] insert error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[applicants POST] exception", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
