import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { appendToSheet, appendToScreeningSheet } from "@/lib/google-sheets";
import { sendSlackNotification } from "@/lib/slack";
import { sendNotification } from "@/lib/solapi";

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
      marketingConsent,
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

    // ── 자동 필터 3조건 ──────────────────────────────────────
    const VALID_LICENSES = ["1종 보통", "2종 보통", "1종 대형"];
    const filterPass =
      ownVehicle === "있음" &&
      VALID_LICENSES.includes(licenseType) &&
      selfOwnership === "문제 없음";

    const autoStatus = filterPass ? "연락대기" : "부적합";

    // ── Supabase에 저장 ─────────────────────────────────────
    const consent = marketingConsent === true;
    const { data: inserted, error } = await supabase
      .from("applicants")
      .insert({
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
        status: autoStatus,
        filter_pass: filterPass ? "Y" : "N",
        note: isDuplicate ? "중복지원" : null,
        marketing_consent: consent,
        marketing_consent_at: consent ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error || !inserted) {
      console.error("[Supabase insert error]", error);
      return NextResponse.json(
        { error: "데이터 저장 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    // ── Supabase 데이터 → 구글 시트 동기화 ──────────────────
    try {
      await appendToSheet(inserted);
    } catch (sheetErr) {
      console.error("[시트1 sync error]", sheetErr);
    }

    // ── 필터 통과 시 시트2(스크리닝 관리)에도 추가 ───────────
    if (filterPass) {
      try {
        console.log("[시트2 데이터]", JSON.stringify({
          name: inserted.name,
          phone: inserted.phone,
          branch: inserted.branch,
          available_date: inserted.available_date,
          status: inserted.status,
        }));
        await appendToScreeningSheet({
          name: inserted.name,
          phone: inserted.phone,
          branch: inserted.branch,
          available_date: inserted.available_date,
          status: inserted.status,
        });
      } catch (screenErr) {
        console.error("[시트2 screening error]", screenErr);
      }
    }

    // ── 슬랙 알림 ──────────────────────────────────────────
    try {
      await sendSlackNotification({
        name: inserted.name,
        phone: inserted.phone,
        branch: inserted.branch,
        available_date: inserted.available_date,
        filter_pass: inserted.filter_pass,
        source: inserted.source,
      });
    } catch (slackErr) {
      console.error("[Slack notification error]", slackErr);
    }

    // ── 서류접수 안내 자동 발송 (알림톡 ① / SMS 폴백) ──────
    try {
      const receivedAt = new Date().toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
      const fallbackText = [
        "[옹고잉 배송원 지원 접수 안내]",
        "",
        `${inserted.name}님, 안녕하세요.`,
        "옹고잉 배송원 지원서가 정상 접수되었습니다.",
        "",
        `▶ 지원지점: ${inserted.branch}`,
        `▶ 접수일시: ${receivedAt}`,
        "",
        "서류 검토 후 영업일 기준 1~2일 내",
        "유선으로 연락드릴 예정입니다.",
        "",
        "문의사항은 본 메시지에 회신 주시면",
        "빠르게 안내드리겠습니다.",
      ].join("\n");

      const notifyResult = await sendNotification(
        inserted.phone,
        "APPLY_RECEIVED",
        {
          "#{이름}": inserted.name,
          "#{지점}": inserted.branch,
          "#{접수일시}": receivedAt,
        },
        fallbackText
      );

      if (notifyResult.success) {
        await supabase.from("messages").insert({
          applicant_id: inserted.id,
          applicant_phone: inserted.phone,
          direction: "outbound",
          body: fallbackText,
          status: "sent",
          sent_by: "system-auto",
          solapi_msg_id: notifyResult.messageId || null,
          message_type: notifyResult.via,
          template_id: notifyResult.templateId || null,
        });
      } else {
        console.error("[apply notify error]", notifyResult.error);
      }
    } catch (notifyErr) {
      console.error("[apply notify exception]", notifyErr);
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
