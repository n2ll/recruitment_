/**
 * Slack 알림 — 현재 전체 OFF (운영 판단)
 *
 * 복구하려면 SLACK_NOTIFICATIONS_ENABLED=1 환경변수 설정 후 재배포.
 * 호출부는 그대로 두어도 됨 (각 함수가 진입 시점에 self-disable).
 */

const SLACK_ENABLED = process.env.SLACK_NOTIFICATIONS_ENABLED === "1";

/**
 * 지원자 확정(screening → onboarding 전이) 시 슬랙 알림.
 * 라인명(공고 제목) + 지원자 이름 + 전화번호 + 매니저 정보.
 */
export async function sendSlackConfirmedAlert(data: {
  job_title: string;
  applicant_name: string | null;
  applicant_phone: string;
  branch: string | null;
  site_manager_name: string | null;
}) {
  if (!SLACK_ENABLED) return;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const name = data.applicant_name || "(이름 없음)";
  const branchTag = data.branch ? ` · ${data.branch}` : "";
  const sm = data.site_manager_name ? `\n> *현장 매니저:* ${data.site_manager_name}` : "";

  const message = {
    text:
      `:white_check_mark: *지원자 확정* ${branchTag}\n` +
      `> *라인:* ${data.job_title}\n` +
      `> *지원자:* ${name} (${data.applicant_phone})${sm}`,
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (e) {
    console.error("[slack confirmed alert]", e);
  }
}

/**
 * 후보가 매니저 인계(stage='paused') 상태로 전환됐을 때 알림.
 * AI가 응대 어려운 메시지(시급 등 facts 부족)이라 매니저 응답 요청.
 */
export async function sendSlackPausedAlert(data: {
  applicant_name: string | null;
  applicant_phone: string;
  branch: string | null;
  reason: string;
  inbound_text?: string;
}) {
  if (!SLACK_ENABLED) return;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const name = data.applicant_name || "(이름 없음)";
  const branchTag = data.branch ? ` · ${data.branch}` : "";
  const inboundLine = data.inbound_text
    ? `\n> *받은 메시지:* ${data.inbound_text}`
    : "";

  const message = {
    text:
      `:pause_button: *매니저 인계 필요*${branchTag}\n` +
      `> *지원자:* ${name} (${data.applicant_phone})\n` +
      `> *사유:* ${data.reason}${inboundLine}\n` +
      `\n관리자 페이지에서 직접 응대해주세요.`,
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (e) {
    console.error("[slack paused alert]", e);
  }
}

/**
 * AI 에이전트가 답변 못 만들었을 때 — 매니저 직접 응대 필요 알림
 */
export async function sendSlackAgentAlert(data: {
  applicant_name: string | null;
  applicant_phone: string;
  branch: string | null;
  inbound_text: string;
  missing_info: string;
}) {
  if (!SLACK_ENABLED) return;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const name = data.applicant_name || "(이름 없음)";
  const branch = data.branch ? ` · ${data.branch}` : "";

  const message = {
    text:
      `:warning: *AI 응대 불가 — 매니저 답변 필요*\n` +
      `> *지원자:* ${name} (${data.applicant_phone})${branch}\n` +
      `> *받은 메시지:* ${data.inbound_text}\n` +
      `> *모자란 정보:* ${data.missing_info}\n` +
      `\n관리자 페이지에서 직접 답변해주세요.`,
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch (e) {
    console.error("[slack agent alert]", e);
  }
}

