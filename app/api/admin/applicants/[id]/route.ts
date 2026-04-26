import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set([
  "status",
  "confirmed_slot",
  "confirmed_branch",
  "current_branch",
  "start_date",
  "churn_reason",
  "screening",
  "note",
  "marketing_consent",
  "kakao_channel_friend",
]);

const VALID_STATUS = new Set([
  "서류심사",
  "연락대기",
  "부적합",
  "스크리닝 완료",
  "확정",
  "대기",
  "현장투입",
  "이탈",
]);

const VALID_SLOT = new Set(["평일오전", "평일오후", "주말오전", "주말오후"]);

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
    if (key === "confirmed_slot" && value && !VALID_SLOT.has(value as string)) {
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
