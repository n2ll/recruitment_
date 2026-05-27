/**
 * POST /api/admin/agent/danggeun-practice/start
 *
 * 당근마켓구인(연습용) — 실 SMS 발송 X. 매니저 시뮬용.
 *
 * 흐름:
 *  1) applicants INSERT (source='danggeun_practice')
 *  2) 시스템 더미 공고 + job_candidates row (agent_stage='exploration')
 *  3) 시작 멘트를 messages에 outbound로 기록만 (SOLAPI 호출 X)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { ensureDanggeunSystemJob } from "@/lib/agent/danggeun-job";
import { fillTemplate } from "@/lib/agent/system-messages";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, branch1, startMessage, targetJobInfo } = body;

    if (!name?.trim() || !/^\d{10,11}$/.test((phone || "").replace(/-/g, "")) || !branch1) {
      return NextResponse.json(
        { error: "이름, 전화번호, 지점은 필수입니다." },
        { status: 400 }
      );
    }
    if (!startMessage?.trim()) {
      return NextResponse.json(
        { error: "시작 멘트가 비어 있습니다." },
        { status: 400 }
      );
    }

    const normalizedPhone = (phone as string).replace(/-/g, "");
    const supabase = createServiceClient();

    const PLACEHOLDER = "미확인";

    const { data: inserted, error: insertErr } = await supabase
      .from("applicants")
      .insert({
        name: name.trim(),
        phone: normalizedPhone,
        branch1,
        branch: branch1,
        source: "danggeun_practice",
        birth_date: PLACEHOLDER,
        location: PLACEHOLDER,
        own_vehicle: PLACEHOLDER,
        license_type: PLACEHOLDER,
        vehicle_type: PLACEHOLDER,
        work_hours: PLACEHOLDER,
        introduction: targetJobInfo?.trim() || "당근 연습용 (테스트 데이터)",
        status: "연습",
        filter_pass: null,
        note: targetJobInfo?.trim()
          ? `당근 연습용 — 공고: ${targetJobInfo.trim().slice(0, 80)}`
          : "당근 연습용 — 실 SMS 발송 안 됨",
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      console.error("[danggeun-practice start insert error]", insertErr);
      return NextResponse.json(
        { error: insertErr?.message || "지원자 등록 중 오류" },
        { status: 500 }
      );
    }

    // 시스템 더미 공고 + job_candidates row 생성
    let jobIdForMsg: number | null = null;
    try {
      const danggeunJobId = await ensureDanggeunSystemJob(supabase);
      jobIdForMsg = danggeunJobId;
      const { error: jcErr } = await supabase.from("job_candidates").insert({
        job_id: danggeunJobId,
        applicant_id: inserted.id,
        agent_stage: "screening", // 스크리닝부터 시작
        agent_state: {},
      });
      if (jcErr) {
        console.error("[danggeun-practice] job_candidates insert error", jcErr);
      }
    } catch (e) {
      console.error("[danggeun-practice] system job ensure failed", e);
    }

    // 시작 멘트 placeholder 치환 + messages에 outbound 기록만 (실 SMS X)
    const filledStart = fillTemplate(startMessage.trim(), {
      이름: name.trim(),
      지점: branch1,
      시간대: "",
    });
    await supabase.from("messages").insert({
      applicant_id: inserted.id,
      applicant_phone: normalizedPhone,
      direction: "outbound",
      body: filledStart,
      status: "sent",
      sent_by: "danggeun-practice-start",
      job_id: jobIdForMsg,
    });

    return NextResponse.json({ success: true, applicant: inserted });
  } catch (err) {
    console.error("[danggeun-practice start exception]", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
