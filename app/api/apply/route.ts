import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendNotification, sendSms } from "@/lib/solapi";
import { geocodeAddress } from "@/lib/kakao-geocode";
import { ensureDanggeunSystemJob } from "@/lib/agent/danggeun-job";
import { getSystemMessage, fillTemplate } from "@/lib/agent/system-messages";

// 희망 근무 시간대 축약 — "평일(월~금) 오전 타임..., 주말..." → "평일오전, 주말오후"
function shortWorkHours(wh: string | null | undefined): string {
  if (!wh || wh === "미확인") return "";
  const out = wh
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const day = p.includes("주말") ? "주말" : p.includes("평일") ? "평일" : "";
      const time = p.includes("오전") ? "오전" : p.includes("오후") ? "오후" : "";
      return day + time;
    })
    .filter(Boolean);
  return Array.from(new Set(out)).join(", ");
}

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

    const autoStatus = filterPass ? "서류심사" : "부적합";

    // ── 주소 지오코딩 (실패해도 저장 진행) ─────────────────
    const geo = location?.trim() ? await geocodeAddress(location) : null;

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
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        sido: geo?.sido ?? null,
        sigungu: geo?.sigungu ?? null,
        bname: geo?.bname ?? null,
        road_address: geo?.road_address ?? null,
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

    // ── 자동 발송 ──────
    // source='danggeun'이면 매니저가 저장한 시작 멘트를, 그 외엔 기본 접수 안내를 보낸다.
    // 둘 다 prompt_examples 테이블의 'system_message' 카테고리에서 매니저가 편집 가능.
    try {
      const receivedAt = new Date().toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
      const defaultReceived = [
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

      // 어떤 멘트를 보낼지 결정 — source별 분기
      let sendBody: string;
      let sentByLabel: string;
      let useTemplate: "danggeun" | "apply_received" = "apply_received";

      if (inserted.source === "danggeun") {
        const danggeunStart = (await getSystemMessage(supabase, "danggeun_start"))?.trim();
        if (danggeunStart) {
          // 시작 멘트 {{이름}}/{{지점}}/{{시간대}} 치환
          sendBody = fillTemplate(danggeunStart, {
            이름: inserted.name,
            지점: inserted.branch ?? "",
            시간대: shortWorkHours(inserted.work_hours),
          });
          sentByLabel = "danggeun-start";
          useTemplate = "danggeun";
        } else {
          // DB에 시작 멘트 미저장 — 폴백으로 접수 안내
          const stored = (await getSystemMessage(supabase, "apply_received"))?.trim();
          sendBody = stored || defaultReceived;
          sentByLabel = "system-auto";
        }
      } else {
        const stored = (await getSystemMessage(supabase, "apply_received"))?.trim();
        sendBody = stored || defaultReceived;
        sentByLabel = "system-auto";
      }

      // 당근 시작 멘트는 알림톡 템플릿이 별도로 없을 가능성이 크니 SMS 직발송,
      // 일반 접수 안내는 기존 알림톡(APPLY_RECEIVED) 우선.
      let sendOk = false;
      let messageId: string | null = null;
      let viaLabel: string = "sms";
      let templateId: string | null = null;

      if (useTemplate === "danggeun") {
        const r = await sendSms(inserted.phone, sendBody);
        sendOk = r.success;
        messageId = r.messageId ?? null;
        if (!r.success) console.error("[apply danggeun-start send]", r.error);
      } else {
        const r = await sendNotification(
          inserted.phone,
          "APPLY_RECEIVED",
          {
            "#{이름}": inserted.name,
            "#{지점}": inserted.branch,
            "#{접수일시}": receivedAt,
          },
          sendBody
        );
        sendOk = r.success;
        messageId = r.messageId ?? null;
        viaLabel = r.via;
        templateId = r.templateId ?? null;
        if (!r.success) console.error("[apply notify error]", r.error);
      }

      if (sendOk) {
        await supabase.from("messages").insert({
          applicant_id: inserted.id,
          applicant_phone: inserted.phone,
          direction: "outbound",
          body: sendBody,
          status: "sent",
          sent_by: sentByLabel,
          solapi_msg_id: messageId,
          message_type: viaLabel,
          template_id: templateId,
        });
      }
    } catch (notifyErr) {
      console.error("[apply notify exception]", notifyErr);
    }

    // source='danggeun'으로 들어온 폼 지원자는 자동 AI 응대 흐름에 올린다.
    // 시스템 더미 공고 + job_candidates(exploration) 자동 생성 → 다음 인입 SMS 시
    // /api/messages/inbound가 router를 태우게 됨.
    if (inserted.source === "danggeun") {
      try {
        const danggeunJobId = await ensureDanggeunSystemJob(supabase);
        // 희망시간대에 '주말'이 없으면 평일 슬롯 → 공휴일 업무 확인 자동 통과
        const isWeekendSlot = String(inserted.work_hours ?? "").includes("주말");
        const { error: jcErr } = await supabase.from("job_candidates").insert({
          job_id: danggeunJobId,
          applicant_id: inserted.id,
          agent_stage: "screening", // 탐색은 base 능력, 프로세스는 스크리닝부터
          agent_state: {
            screening: {
              프로모션_종료가능성_안내: true,
              정산주기_안내: true,
              업무시간_체계_이해: true,
              ...(isWeekendSlot ? {} : { 공휴일_업무여부_확인: true }),
            },
            meta: { screening_entered_at: new Date().toISOString() },
          },
        });
        if (jcErr) {
          console.error("[apply] danggeun job_candidates insert error", jcErr);
        }
      } catch (e) {
        console.error("[apply] ensureDanggeunSystemJob failed", e);
      }
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
