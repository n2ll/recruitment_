import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name,
      birthDate,
      phone,
      location,
      ownVehicle,
      licenseType,
      vehicleType,
      branch1,
      branch2,
      workHours,
      introduction,
      experience,
      source,
      availableDate,
      selfOwnership,
    } = body;

    // ── 필수 필드 검증 ─────────────────────────────────────
    if (
      !name?.trim() ||
      !/^\d{6}$/.test(birthDate) ||
      !/^\d{10,11}$/.test(phone) ||
      !location?.trim() ||
      !ownVehicle ||
      !licenseType ||
      !vehicleType?.trim() ||
      !branch1 ||
      !workHours?.length ||
      !introduction?.trim() ||
      !availableDate ||
      !selfOwnership
    ) {
      return NextResponse.json(
        { error: "필수 항목이 누락되었거나 형식이 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // ── 중복 지원 체크 (전화번호 기준) ──────────────────────
    const { data: existing } = await supabase
      .from("applicants")
      .select("id")
      .eq("phone", phone)
      .limit(1);

    const isDuplicate = existing && existing.length > 0;

    // ── Supabase에 저장 ─────────────────────────────────────
    const { error } = await supabase.from("applicants").insert({
      name,
      birth_date: birthDate,
      phone,
      location,
      own_vehicle: ownVehicle,
      license_type: licenseType,
      vehicle_type: vehicleType,
      branch1,
      branch2: branch2 || null,
      work_hours: Array.isArray(workHours) ? workHours.join(", ") : workHours,
      introduction,
      experience: experience || null,
      available_date: availableDate,
      self_ownership: selfOwnership,
      source: source || "direct",
      branch: branch1,
      status: "서류심사",
      note: isDuplicate ? "중복지원" : null,
    });

    if (error) {
      console.error("[Supabase insert error]", error);
      return NextResponse.json(
        { error: "데이터 저장 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      duplicate: isDuplicate,
    });
  } catch (err) {
    console.error("[apply API error]", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
