import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendNotification } from "@/lib/solapi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  const secret = process.env.CRON_SECRET;
  const expected = secret ? `Bearer ${secret}` : null;

  if (!isVercelCron && (!expected || authHeader !== expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: targets, error } = await supabase
    .from("applicants")
    .select("id, name, phone, branch, created_at")
    .in("status", ["연락대기", "서류심사"])
    .eq("filter_pass", "Y")
    .is("reminder_sent_at", null)
    .lt("created_at", cutoff);

  if (error) {
    console.error("[reminder cron] query error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    id: number;
    success: boolean;
    via?: string;
    error?: string;
  }> = [];

  for (const applicant of targets || []) {
    const appliedAt = new Date(applicant.created_at).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

    const fallbackText = [
      "[옹고잉 배송원 지원 확인 요청]",
      "",
      `${applicant.name}님, 지원 접수 후 회신이 없어`,
      "다시 한 번 안내드립니다.",
      "",
      `▶ 지원지점: ${applicant.branch}`,
      `▶ 지원일시: ${appliedAt}`,
      "",
      "현재도 지원 의사가 있으시다면",
      '본 메시지에 "네" 회신 부탁드립니다.',
      "",
      "* 회신이 없을 경우 지원이 자동 취소될 수 있습니다.",
    ].join("\n");

    const notifyResult = await sendNotification(
      applicant.phone,
      "REMINDER",
      {
        "#{이름}": applicant.name,
        "#{지점}": applicant.branch,
        "#{지원일시}": appliedAt,
      },
      fallbackText
    );

    if (notifyResult.success) {
      await supabase
        .from("applicants")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", applicant.id);

      await supabase.from("messages").insert({
        applicant_id: applicant.id,
        applicant_phone: applicant.phone,
        direction: "outbound",
        body: fallbackText,
        status: "sent",
        sent_by: "system-reminder",
        solapi_msg_id: notifyResult.messageId || null,
        message_type: notifyResult.via,
        template_id: notifyResult.templateId || null,
      });

      results.push({ id: applicant.id, success: true, via: notifyResult.via });
    } else {
      console.error("[reminder cron] send fail", applicant.id, notifyResult.error);
      results.push({ id: applicant.id, success: false, error: notifyResult.error });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    results,
  });
}
