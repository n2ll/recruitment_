import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 매니저가 수정 가능한 모든 컬럼 (시스템 컬럼: id/created_at/churned_at/last_message_at/
// unread_count/lat/lng/sido/sigungu/bname/road_address/marketing_consent_at 등은 제외).
const ALLOWED_FIELDS = new Set([
  "name", "phone", "birth_date", "location",
  "own_vehicle", "license_type", "vehicle_type",
  "branch1", "branch2", "branch",
  "work_hours", "available_date", "self_ownership",
  "introduction", "experience",
  "source", "status", "filter_pass", "note",
  "start_date", "confirmed_slot", "confirmed_branch", "current_branch",
  "churn_reason", "screening",
  "marketing_consent", "kakao_channel_friend",
]);

const VALID_STATUS = new Set([
  "스크리닝",
  "온보딩",
  "온보딩 완료",
  "확정",
  "이탈",
  "부적합",
]);

const VALID_SLOT = new Set(["평일오전", "평일오후", "주말오전", "주말오후"]);

// 콤마로 구분된 confirmed_slot 값 검증 — 각 토큰이 VALID_SLOT에 포함돼야 함.
function isValidConfirmedSlot(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const tokens = v.split(",").map((t) => t.trim()).filter(Boolean);
  return tokens.every((t) => VALID_SLOT.has(t));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;

    if (key === "status" && value && !VALID_STATUS.has(value as string)) {
      return NextResponse.json(
        { error: `invalid status: ${value}` },
        { status: 400 }
      );
    }
    if (key === "confirmed_slot" && value && !isValidConfirmedSlot(value)) {
      return NextResponse.json(
        { error: `invalid confirmed_slot: ${value}` },
        { status: 400 }
      );
    }
    updates[key] = value === "" ? null : value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "no updatable fields" },
      { status: 400 }
    );
  }

  // 상태 이탈로 전환 시 current_branch/churned_at 자동 처리
  if (updates.status === "이탈") {
    updates.current_branch = null;
    updates.churned_at = new Date().toISOString();
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("applicants")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[applicant PATCH error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
