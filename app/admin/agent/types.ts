/**
 * /admin 구인 에이전트 탭 UI에서 사용하는 DTO 타입.
 * 백엔드 응답 그대로 받는 형태에 가깝다.
 */

export type AgentStage =
  | "exploration"
  | "screening"
  | "onboarding"
  | "active"
  | "paused"
  | "abort"
  | null;

export interface JobRow {
  id: number;
  title: string;
  body: string;
  branch: string | null;
  slot: string | null;
  start_date: string | null;
  vehicle_required: boolean;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  capacity: number;
  status: "active" | "closed" | "paused";
  site_manager_id: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  /** stage 별 후보 수 (배지용) */
  counts?: Record<string, number>;
}

export interface ApplicantSummary {
  id: number;
  name: string | null;
  phone: string;
  branch1: string | null;
  branch2: string | null;
  work_hours: string | null;
  location: string | null;
  own_vehicle: string | null;
  license_type: string | null;
  vehicle_type: string | null;
  available_date: string | null;
  status: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface CandidateRow {
  id: number;
  job_id: number;
  applicant_id: number;
  agent_stage: AgentStage;
  agent_state: AgentState;
  paused_reason: string | null;
  sent_at: string | null;
  responded_at: string | null;
  confirmed_at: string | null;
  activated_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
  applicants: ApplicantSummary;
}

export interface AgentState {
  screening?: Partial<{
    자차_재확인: boolean;
    프로모션_종료가능성_안내: boolean;
    정산주기_안내: boolean;
    공휴일_업무여부_확인: boolean;
    본인명의_정산_문제없음: boolean;
    업무시간_체계_이해: boolean;
    지원자_질문_해소: boolean;
  }>;
  onboarding?: Partial<{
    앱설치_교육_안내발송됨: boolean;
    배민_아이디_수신: boolean;
    만남장소_안내발송됨: boolean;
  }>;
  meta?: Record<string, unknown>;
}

export const SCREENING_KEYS = [
  "자차_재확인",
  "프로모션_종료가능성_안내",
  "정산주기_안내",
  "공휴일_업무여부_확인",
  "본인명의_정산_문제없음",
  "업무시간_체계_이해",
  "지원자_질문_해소",
] as const;

export const ONBOARDING_KEYS = [
  "앱설치_교육_안내발송됨",
  "배민_아이디_수신",
  "만남장소_안내발송됨",
] as const;

export const STAGE_LABEL: Record<string, string> = {
  null: "발송됨",
  sent: "발송됨",
  exploration: "탐색",
  screening: "스크리닝",
  onboarding: "온보딩",
  active: "완료",
  paused: "일시정지",
  abort: "부적합",
};

export const STAGE_COLOR: Record<string, string> = {
  sent: "#9ca3af",
  null: "#9ca3af",
  exploration: "#06b6d4",
  screening: "#3b82f6",
  onboarding: "#f59e0b",
  active: "#10b981",
  paused: "#a855f7",
  abort: "#ef4444",
};

export const STAGE_ORDER: ReadonlyArray<string> = [
  "sent",
  "exploration",
  "screening",
  "onboarding",
  "active",
  "paused",
  "abort",
];
