/**
 * 슬랙 Webhook으로 알림 발송
 */
export async function sendSlackNotification(data: {
  name: string;
  phone: string;
  branch: string;
  available_date: string;
  filter_pass: string;
  source: string;
}) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const emoji = data.filter_pass === "Y" ? ":white_check_mark:" : ":x:";
  const statusText = data.filter_pass === "Y" ? "스크리닝 대상" : "부적합";

  const message = {
    text: `${emoji} *새 지원자* — ${statusText}\n` +
      `> *성함:* ${data.name}\n` +
      `> *연락처:* ${data.phone}\n` +
      `> *지점:* ${data.branch}\n` +
      `> *시작가능일:* ${data.available_date}\n` +
      `> *유입채널:* ${data.source}\n` +
      (data.filter_pass === "Y"
        ? `\n:bell: 스크리닝 미실시 — <https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit|스크리닝 관리 시트 열기>`
        : ""),
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
}
