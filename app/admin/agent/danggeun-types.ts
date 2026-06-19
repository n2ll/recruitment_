export interface Candidate {
  id: number;
  name: string;
  phone: string;
  branch: string | null;
  branch1: string | null;
  branch2: string | null;
  status: string | null;
  created_at: string;
  last_message_at: string | null;
  unread_count: number;
  agent_stage: string | null;
  work_hours: string | null;
  birth_date: string | null;
  location: string | null;
  bname: string | null;
  sigungu: string | null;
  own_vehicle: string | null;
  license_type: string | null;
  vehicle_type: string | null;
  self_ownership: string | null;
  available_date: string | null;
  source: string | null;
  baemin_id: string | null;
  guide_sent: boolean | null;
  onboarding_call_status: string | null;
  kakao_channel_friend: boolean | null;
  confirmed_branch: string | null;
  current_branch: string | null;
  start_date: string | null;
  churned_at: string | null;
  churn_reason: string | null;
  note: string | null;
  memo: string | null;
  introduction: string | null;
  experience: string | null;
}

export interface Message {
  id: string | number;
  applicant_id: number | null;
  applicant_phone: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  sent_by: string | null;
  created_at: string;
  reasoning?: string | null;
}

export type AgentState = {
  screening?: Record<string, boolean>;
  onboarding?: Record<string, boolean>;
};

export const STAGE_LABEL: Record<string, string> = {
  exploration: "탐색",
  screening: "스크리닝 중",
  onboarding: "스크리닝 완료",
  active: "스크리닝 완료",
  paused: "매니저 인계",
  abort: "중단",
};

export const STAGE_COLOR: Record<string, { bg: string; fg: string }> = {
  exploration: { bg: "#eaf3f5", fg: "#3a4444" },
  screening: { bg: "#f7eedd", fg: "#65451d" },
  onboarding: { bg: "#efecf4", fg: "#453b60" },
  active: { bg: "#d3e5e9", fg: "#151515" },
  paused: { bg: "#f4e8ea", fg: "#5c2529" },
  abort: { bg: "#e5e6e1", fg: "#3a4444" },
};

export function stageBadge(stage: string | null) {
  if (!stage) return { label: "—", bg: "#e5e6e1", fg: "#808080" };
  return {
    label: STAGE_LABEL[stage] ?? stage,
    bg: STAGE_COLOR[stage]?.bg ?? "#e5e6e1",
    fg: STAGE_COLOR[stage]?.fg ?? "#3a4444",
  };
}

export const STATUS_OPTIONS = [
  "스크리닝 전",
  "스크리닝 중",
  "스크리닝 완료",
  "기타",
  "확정인력",
  "대기자",
  "부적합",
  "이탈",
];

export const STATUS_TONE_DEFAULT = { bg: "#e5e6e1", fg: "#3a4444" };
export const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  "스크리닝 전":   { bg: "#e5e6e1", fg: "#3a4444" },
  "스크리닝 중":   { bg: "#d3e5e9", fg: "#151515" },
  "스크리닝 완료": { bg: "#efecf4", fg: "#453b60" },
  "기타":          { bg: "#e5e6e1", fg: "#3a4444" },
  "확정인력":      { bg: "#f4e8ea", fg: "#5c2529" },
  "대기자":        { bg: "#f7eedd", fg: "#65451d" },
  "부적합":        { bg: "#5c2529", fg: "#ffffff" },
  "이탈":          { bg: "#5c2529", fg: "#ffffff" },
};

export function statusTone(s: string | null | undefined) {
  return STATUS_TONE[s ?? ""] ?? STATUS_TONE_DEFAULT;
}

export interface ModeConfig {
  source: string;
  title: string;
  emoji: string;
  helpLine: string;
  replyPlaceholder: string;
  sendButtonLabel: string;
  practice: boolean;
  channelLabel: string;
  needsStartMessage: boolean;
}

export const MODE_CONFIG: Record<"live" | "practice" | "baemin", ModeConfig> = {
  live: {
    source: "danggeun",
    title: "당근 후보",
    emoji: "🥕",
    helpLine: "당근 유입 후보 — 실 SMS 발송 / Realtime",
    replyPlaceholder: "매니저 답장을 직접 작성하면 즉시 실 발송됩니다",
    sendButtonLabel: "보내기",
    practice: false,
    channelLabel: "당근",
    needsStartMessage: true,
  },
  practice: {
    source: "danggeun_practice",
    title: "연습 후보",
    emoji: "🧪",
    helpLine: "연습 모드 — 실 SMS 발송 X. 입력은 지원자 빙의 (AI 자동 응답)",
    replyPlaceholder: "지원자가 보낸 문자처럼 입력 → AI가 자동 응답합니다",
    sendButtonLabel: "지원자로 보내기",
    practice: true,
    channelLabel: "연습용",
    needsStartMessage: true,
  },
  baemin: {
    source: "baemin",
    title: "배민 후보",
    emoji: "📱",
    helpLine: "배민 유입 후보 — 지원자가 먼저 SMS / AI 자동 응대 / Realtime",
    replyPlaceholder: "매니저 답장을 직접 작성하면 즉시 실 발송됩니다",
    sendButtonLabel: "보내기",
    practice: false,
    channelLabel: "배민",
    needsStartMessage: false,
  },
};
