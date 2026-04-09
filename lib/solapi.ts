import crypto from "crypto";

const SOLAPI_URL = "https://api.solapi.com/messages/v4/send-many/detail";
const FROM_NUMBER = "01035037252";

function getAuthHeader() {
  const apiKey = process.env.SOLAPI_API_KEY!;
  const apiSecret = process.env.SOLAPI_API_SECRET!;
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export async function sendSms(
  to: string,
  text: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const res = await fetch(SOLAPI_URL, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ to, from: FROM_NUMBER, text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[SOLAPI error]", body);
    return { success: false, error: body };
  }

  const data = await res.json();
  // solapi 응답에서 messageId 추출
  const messageId =
    data?.groupInfo?.groupId ||
    data?.messageList?.[Object.keys(data.messageList || {})[0]]?.messageId ||
    undefined;

  return { success: true, messageId };
}
