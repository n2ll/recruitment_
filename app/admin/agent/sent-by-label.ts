/**
 * messages.sent_by 원시값 → 대화창에 표시할 사용자 친화 라벨.
 *
 * 매핑 규칙:
 *   - system-auto                       → "자동 발송 메시지"
 *   - danggeun-manual                   → "매니저"
 *   - agent / agent-practice            → "AI 에이전트"
 *   - 그 외 danggeun-* (start / practice-start / recommend) → "AI 에이전트"
 *   - 그 외(관리자/dispatch/system-bulk 등)는 원본 그대로 표시
 */
export function sentByLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  if (raw === "system-auto") return "자동 발송 메시지";
  if (raw === "danggeun-manual") return "매니저";
  if (raw === "agent" || raw === "agent-practice") return "AI 에이전트";
  if (raw.startsWith("danggeun-")) return "AI 에이전트";
  return raw;
}
