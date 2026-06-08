"use client";

/**
 * 당근마켓구인 — source='danggeun' 후보 관리 + 실 발송/저장.
 *
 * 상단 툴바: 새 당근 후보 / 추천 받기 / 새로고침 (시작 멘트는 클로드 조련하기에서 관리)
 * 메인: 좌(후보 목록) + 우(대화창)
 * 모달: 시작 멘트 편집, 새 후보 등록
 *
 * Realtime: applicants(source='danggeun') / messages / job_candidates 구독.
 * 시작 멘트는 매니저 브라우저 localStorage(다른 PC/브라우저에는 적용 안 됨).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { SCREENING_KEYS } from "./types";
import { sentByLabel } from "./sent-by-label";

interface DanggeunViewProps {
  mode?: "live" | "practice" | "baemin";
  branches?: string[];
}

const STATUS_OPTIONS = [
  "스크리닝 전",
  "스크리닝 중",
  "스크리닝 완료",
  "확정인력",
  "대기자",
  "부적합",
];

const STATUS_BG: Record<string, string> = {
  "스크리닝 전":   "#9CA3AF",
  "스크리닝 중":   "#6b7280",
  "스크리닝 완료": "#0EA5E9",
  "확정인력":      "#10b981",
  "대기자":        "#f59e0b",
  "부적합":        "#ef4444",
};

interface ModeConfig {
  source: string;
  title: string;
  emoji: string;
  helpLine: string;
  replyPlaceholder: string;
  sendButtonLabel: string;
  practice: boolean;
  channelLabel: string;          // 빈 목록 안내 등에서 사용 ("당근" / "배민" / "연습")
  showRecommend: boolean;        // ⭐ 추천 받기 버튼 노출 여부
  needsStartMessage: boolean;    // 시작 멘트 발송 채널인지 (배민은 X — 지원자가 먼저 보냄)
}

// 새 후보 등록은 [지원자 목록 → + 지원자 추가]로 일원화됨.
// 이 View는 등록된 채널별 후보의 대화·진행 상태 모니터링만 담당.
const MODE_CONFIG: Record<"live" | "practice" | "baemin", ModeConfig> = {
  live: {
    source: "danggeun",
    title: "당근 후보",
    emoji: "🥕",
    helpLine: "당근 유입 후보 — 실 SMS 발송 / Realtime",
    replyPlaceholder: "매니저 답장을 직접 작성하면 즉시 실 발송됩니다",
    sendButtonLabel: "보내기",
    practice: false,
    channelLabel: "당근",
    showRecommend: true,
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
    showRecommend: false,
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
    showRecommend: false,
    needsStartMessage: false,
  },
};

// API GET /api/admin/applicants?source=X 는 select("*") 라 모든 컬럼을 반환한다.
// 풀스크린 상세를 따로 만들지 않고 이 객체를 그대로 미니 상세 모달에 넘긴다.
interface Candidate {
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
  introduction: string | null;
  experience: string | null;
}

type ApplicantPatch = Partial<Omit<Candidate, "id" | "created_at" | "last_message_at" | "unread_count" | "agent_stage" | "churned_at">>;

const SLOTS = ["평일오전", "평일오후", "주말오전", "주말오후"] as const;
type SlotKey = (typeof SLOTS)[number];

function matchesSlot(workHours: string | null | undefined, slot: SlotKey): boolean {
  if (!workHours) return false;
  const wantPyeongil = slot.startsWith("평일");
  const wantMorning = slot.endsWith("오전");
  return workHours.split(",").map((t) => t.trim()).some((tok) => {
    const dayOk = wantPyeongil ? tok.includes("평일") : tok.includes("주말");
    const timeOk = wantMorning ? tok.includes("오전") : tok.includes("오후");
    return dayOk && timeOk;
  });
}

function calcAge(birth: string | null): number | null {
  if (!birth || !/^\d{6}$/.test(birth)) return null;
  const yy = parseInt(birth.slice(0, 2), 10);
  const mm = parseInt(birth.slice(2, 4), 10);
  const dd = parseInt(birth.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const fullYear = yy >= 50 ? 1900 + yy : 2000 + yy;
  const today = new Date();
  let age = today.getFullYear() - fullYear;
  const beforeBirthday =
    today.getMonth() + 1 < mm ||
    (today.getMonth() + 1 === mm && today.getDate() < dd);
  if (beforeBirthday) age--;
  return age;
}

function sourceLabelLocal(s: string | null): string {
  if (!s) return "—";
  if (s === "danggeun" || s === "danggeun_practice") return "당근";
  if (s === "baemin") return "배민";
  if (s === "manual") return "수기";
  if (s === "direct") return "직접";
  return s;
}

interface Message {
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

type AgentState = {
  screening?: Record<string, boolean>;
  onboarding?: Record<string, boolean>;
};

interface FactsItem {
  id: number;
  category: string;
  title: string;
  body: string;
  sort_order: number;
}

interface RecCandidate {
  id: number;
  source: "applicant" | "legacy";
  name: string;
  phone: string;
  score: { total: number; distance: number; vehicle: number; recency: number; distanceKm: number };
  sigungu?: string | null;
  location?: string | null;
}


const STAGE_LABEL: Record<string, string> = {
  exploration: "탐색",
  screening: "스크리닝 중",
  onboarding: "스크리닝 완료",  // 내부적으로 onboarding/active 모두 '스크리닝 완료'로 표시
  active: "스크리닝 완료",
  paused: "매니저 인계",
  abort: "중단",
};

const STAGE_COLOR: Record<string, { bg: string; fg: string }> = {
  exploration: { bg: "#DBEAFE", fg: "#1E40AF" },
  screening: { bg: "#FEF3C7", fg: "#92400E" },
  onboarding: { bg: "#E9D5FF", fg: "#6B21A8" },
  active: { bg: "#D1FAE5", fg: "#065F46" },
  paused: { bg: "#FEE2E2", fg: "#991B1B" },
  abort: { bg: "#F3F4F6", fg: "#6B7280" },
};

function stageBadge(stage: string | null) {
  if (!stage) return { label: "—", bg: "#F3F4F6", fg: "#9CA3AF" };
  return {
    label: STAGE_LABEL[stage] ?? stage,
    bg: STAGE_COLOR[stage]?.bg ?? "#F3F4F6",
    fg: STAGE_COLOR[stage]?.fg ?? "#6B7280",
  };
}

// progress 2단계 — 스크리닝 중 → 스크리닝 완료.
// 내부적으로 onboarding/active도 모두 '스크리닝 완료' 노드(=onboarding)에 매핑된다.
const STAGE_FLOW = ["screening", "onboarding"] as const;
type FlowStage = (typeof STAGE_FLOW)[number];

function StageProgress({
  stage,
  onStageClick,
}: {
  stage: string | null;
  onStageClick?: (target: FlowStage) => void;
}) {
  // paused / abort는 별도 표시
  const isPaused = stage === "paused";
  const isAbort = stage === "abort";
  // exploration → screening 노드. active도 onboarding 노드(='스크리닝 완료')에 매핑.
  const effective =
    stage === "exploration" ? "screening"
    : stage === "active" ? "onboarding"
    : stage;
  const currentIdx = STAGE_FLOW.indexOf(effective as FlowStage);
  const clickable = !!onStageClick && !isAbort; // abort 상태에선 단계 변경 불가

  return (
    <div className="dg-progress">
      {STAGE_FLOW.map((s, i) => {
        const done = currentIdx > i;
        const current = currentIdx === i;
        const isClickable = clickable && !current;
        return (
          <div
            key={s}
            className={`dg-progress-step ${isClickable ? "dg-progress-step-clickable" : ""}`}
            onClick={isClickable ? () => onStageClick(s) : undefined}
            role={isClickable ? "button" : undefined}
            title={isClickable ? `'${STAGE_LABEL[s]}' 단계로 이동` : undefined}
          >
            <div
              className={`dg-progress-node ${done ? "dg-node-done" : current ? "dg-node-current" : "dg-node-pending"}`}
            >
              {done ? "✓" : i + 1}
            </div>
            <div className={`dg-progress-label ${current ? "dg-label-current" : done ? "dg-label-done" : ""}`}>
              {STAGE_LABEL[s]}
            </div>
            {i < STAGE_FLOW.length - 1 && (
              <div className={`dg-progress-line ${done ? "dg-line-done" : ""}`} />
            )}
          </div>
        );
      })}
      {(isPaused || isAbort) && (
        <div className={`dg-progress-flag ${isAbort ? "dg-flag-abort" : "dg-flag-pause"}`}>
          {isPaused ? "⏸ 매니저 인계" : "⛔ 중단"}
        </div>
      )}
    </div>
  );
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

// 희망 근무 시간대 축약 — "평일(월~금) 오전 타임 (08:00~13:00), 주말..." → "평일오전, 주말오후"
function shortWorkHours(wh: string | null): string {
  if (!wh || wh === "미확인") return "";
  const parts = wh.split(",").map((s) => s.trim()).filter(Boolean);
  const out = parts
    .map((p) => {
      const day = p.includes("주말") ? "주말" : p.includes("평일") ? "평일" : "";
      const time = p.includes("오전") ? "오전" : p.includes("오후") ? "오후" : "";
      return day + time;
    })
    .filter(Boolean);
  return Array.from(new Set(out)).join(", ");
}

export default function DanggeunView({ mode = "live", branches = [] }: DanggeunViewProps) {
  const cfg = MODE_CONFIG[mode];
  // 지점 필터(목록 좌측 패널) — '전체' / 미배정 / 각 지점
  const [branchFilter, setBranchFilter] = useState<string>("전체");
  // 인라인 상태 변경 중인 후보 (낙관적 표시용; 실패 시 fetch로 복구)
  const [statusSaving, setStatusSaving] = useState<number | null>(null);
  // '상세정보' 미니 모달 — 우측 대화창 위에 오버레이로 뜸. 페이지 이동 없음.
  const [detailOpen, setDetailOpen] = useState(false);
  // ── 시작 멘트 (편집은 클로드 조련하기에서. 여기선 등록 검증·발송용으로 읽기만) ──
  const [startMsg, setStartMsg] = useState("");
  const [startMsgLoaded, setStartMsgLoaded] = useState(false);

  // ── 새 후보 폼 ──────────────────────────────────────────
  // ── facts (AI 참고자료 — 공고 정보, 추천 모달에서 사용) ──
  const [factsList, setFactsList] = useState<FactsItem[]>([]);

  // ── 추천 모달 (live 모드만) ───────────────────────────
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [recommendMemo, setRecommendMemo] = useState("");
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendResult, setRecommendResult] = useState<RecCandidate[]>([]);
  const [recommendSending, setRecommendSending] = useState<number | null>(null);

  // ── 후보 목록 ──────────────────────────────────────────
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ── 우측 대화창 ────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [outbound, setOutbound] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [agentStage, setAgentStage] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── 연습 데이터 초기화 (practice 모드 전용) ──────────
  const [resetting, setResetting] = useState(false);

  // ── 초기 로드 ─────────────────────────────────────────
  // 시작 멘트(danggeun_start)는 클로드 조련하기 > 자동 발송 메시지에서 관리.
  // 여기선 등록 검증·발송용으로 읽기만 한다.
  useEffect(() => {
    fetch("/api/admin/prompt-examples?category=system_message", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const items = Array.isArray(json.data) ? json.data : [];
        const dbRow = items.find((it: { title?: string }) => it.title === "danggeun_start");
        setStartMsg(dbRow?.body ?? "");
      })
      .catch((e) => console.error("[danggeun start msg load]", e))
      .finally(() => setStartMsgLoaded(true));
  }, []);

  const fetchCandidates = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setListLoading(true);
    try {
      const res = await fetch(`/api/admin/applicants?source=${cfg.source}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setCandidates(Array.isArray(json.data) ? json.data : []);
      }
    } catch (e) {
      console.error("[danggeun list error]", e);
    } finally {
      if (!opts.silent) setListLoading(false);
    }
  }, [cfg.source]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // facts 목록 로드 (새 등록 시 공고 지정 select용)
  useEffect(() => {
    fetch("/api/admin/prompt-examples?category=facts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.data)) setFactsList(j.data as FactsItem[]);
      })
      .catch((e) => console.error("[danggeun facts load]", e));
  }, []);

  // ── 대화창 로드 ────────────────────────────────────────
  // silent=true: 로딩 스피너 안 띄우고 조용히 데이터만 갱신 (발송 직후 reasoning/배지 매핑용)
  const fetchMessages = useCallback(async (id: number, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setMsgLoading(true);
    try {
      const res = await fetch(`/api/admin/messages/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setMessages(Array.isArray(json.messages) ? json.messages : []);
        setAgentStage(json.agent_stage ?? null);
        setAgentState((json.agent_state ?? {}) as AgentState);
      }
    } catch (e) {
      console.error("[danggeun messages error]", e);
    } finally {
      if (!opts.silent) setMsgLoading(false);
    }
  }, []);

  // ── Realtime ──────────────────────────────────────────
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("danggeun-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applicants" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Candidate & { source?: string };
            if (row.source !== cfg.source) return;
            setCandidates((prev) =>
              prev.some((c) => c.id === row.id) ? prev : [row, ...prev]
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Candidate & { source?: string };
            if (row.source !== cfg.source) return;
            setCandidates((prev) =>
              prev.map((c) => (c.id === row.id ? { ...c, ...row } : c))
            );
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: number };
            setCandidates((prev) => prev.filter((c) => c.id !== old.id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          const currentId = selectedIdRef.current;
          if (currentId != null && msg.applicant_id === currentId) {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_candidates" },
        (payload) => {
          // Realtime이 잡은 job_candidates 변경 — 사이드바 목록 갱신 (로딩 스피너 X)
          fetchCandidates({ silent: true });
          // 열려있는 후보의 변경이면 단계/체크리스트 배지도 다시 fetch.
          // (실 지원자 답장 → AI 자동 진행 시 fetchMessages가 안 불려 배지가 얼어붙던 버그 수정)
          const row = payload.new as { applicant_id?: number } | null;
          const currentId = selectedIdRef.current;
          if (currentId != null && row?.applicant_id === currentId) {
            fetchMessages(currentId, { silent: true });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCandidates, fetchMessages, cfg.source]);

  useEffect(() => {
    if (selectedId == null) {
      setMessages([]);
      return;
    }
    fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── 핸들러 ─────────────────────────────────────────────
  // ── 연습 데이터 초기화 (practice 모드 전용) ────────────
  const handleResetPractice = async () => {
    if (!confirm("연습 데이터(연습용 후보·대화)를 전부 삭제합니다.\n라이브 당근 데이터는 안 건드립니다. 진행할까요?")) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/admin/agent/danggeun-practice/reset", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "초기화 실패");
        return;
      }
      setSelectedId(null);
      setMessages([]);
      await fetchCandidates();
      alert(`${json.deleted}명 삭제됨. 깨끗하게 초기화되었습니다.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "초기화 실패");
    } finally {
      setResetting(false);
    }
  };

  const handleRecommend = async () => {
    if (!recommendMemo.trim()) {
      alert("공고 메모를 입력해주세요. (예: 강북미아 평일오전 자차)");
      return;
    }
    setRecommendLoading(true);
    setRecommendResult([]);
    try {
      const res = await fetch("/api/admin/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting: recommendMemo,
          sourceFilter: "danggeun",
          topN: 30,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "추천 실패");
        return;
      }
      setRecommendResult(json.candidates || []);
      if ((json.candidates || []).length === 0) {
        alert("당근 후보 풀에 적합한 사람이 없습니다.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "추천 실패");
    } finally {
      setRecommendLoading(false);
    }
  };

  // 추천 후보 클릭 → 그 사람에게 시작 멘트 발송 (이미 등록된 applicant이므로 send만)
  const handleRecommendSend = async (c: RecCandidate) => {
    if (!startMsg.trim()) {
      alert("시작 멘트를 먼저 저장해주세요.");
      return;
    }
    if (!confirm(`${c.name}(${formatPhone(c.phone)})에게 시작 멘트를 발송합니다. 진행할까요?`)) {
      return;
    }
    setRecommendSending(c.id);
    try {
      const res = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_id: c.id,
          phone: c.phone,
          body: startMsg,
          sent_by: "danggeun-recommend",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "발송 실패");
        return;
      }
      alert(`${c.name}님에게 시작 멘트가 발송되었습니다.`);
      await fetchCandidates({ silent: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setRecommendSending(null);
    }
  };

  const handleSendReply = async () => {
    if (!outbound.trim() || selectedId == null) return;
    // 빠른 더블 클릭/엔터 동기 차단 — setSending은 비동기라 그 사이에 두 번 호출 가능
    if (sendingRef.current) return;
    sendingRef.current = true;
    const selected = candidates.find((c) => c.id === selectedId);
    if (!selected) {
      sendingRef.current = false;
      return;
    }
    setSending(true);
    try {
      let res: Response;
      if (cfg.practice) {
        // 연습 모드: 지원자 빙의 — inbound로 기록 + router 호출 (실 SMS X)
        res = await fetch("/api/admin/agent/danggeun/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicant_id: selectedId,
            text: outbound,
          }),
        });
      } else {
        // 라이브: 매니저로 실 발송
        res = await fetch("/api/admin/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicant_id: selectedId,
            phone: selected.phone,
            body: outbound,
            sent_by: "danggeun-manual",
          }),
        });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "발송 실패");
        return;
      }
      setOutbound("");
      // Realtime이 새 메시지를 자동 추가하지만 reasoning/agent_state 매핑을 위해 silent fetch.
      // 로딩 스피너는 안 띄움 — 깜빡임 방지.
      await fetchMessages(selectedId, { silent: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  // 후보 인라인 상태 변경 — 지원자목록 탭과 동일하게 PATCH /api/admin/applicants/:id
  const handleStatusChange = async (applicantId: number, newStatus: string) => {
    setStatusSaving(applicantId);
    // 낙관적 업데이트
    setCandidates((prev) =>
      prev.map((c) => (c.id === applicantId ? { ...c, status: newStatus } : c))
    );
    try {
      const res = await fetch(`/api/admin/applicants/${applicantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "상태 변경 실패");
        await fetchCandidates({ silent: true });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "상태 변경 실패");
      await fetchCandidates({ silent: true });
    } finally {
      setStatusSaving(null);
    }
  };

  // ── 파생 ───────────────────────────────────────────────
  const filteredCandidates = useMemo(() => {
    const q = search.trim();
    return candidates.filter((c) => {
      if (branchFilter !== "전체") {
        if (branchFilter === "미배정") {
          if (c.branch) return false;
        } else if (c.branch !== branchFilter) {
          return false;
        }
      }
      if (q && !(c.name.includes(q) || c.phone.includes(q.replace(/-/g, ""))))
        return false;
      return true;
    });
  }, [candidates, search, branchFilter]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId]
  );

  // ── 렌더 ───────────────────────────────────────────────
  return (
    <div className="content" style={{ display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - 60px)", boxSizing: "border-box" }}>
      <style>{css}</style>

      {/* 상단 툴바 */}
      <div className="dg-toolbar">
        <div className="dg-toolbar-left">
          <h2 className="dg-title">
            <span style={{ marginRight: 6 }}>{cfg.emoji}</span>
            {cfg.title} <span className="dg-count">{candidates.length}명</span>
          </h2>
          <span className="dg-help">{cfg.helpLine}</span>
        </div>
        <div className="dg-toolbar-actions">
          {cfg.needsStartMessage && startMsgLoaded && !startMsg && (
            <span className="dg-btn dg-btn-warn" style={{ cursor: "default" }}>
              ⚠ 시작 멘트 미설정 — 클로드 조련하기에서 설정
            </span>
          )}
          {cfg.showRecommend && (
            <button
              className="dg-btn dg-btn-ghost-bordered"
              onClick={() => setShowRecommendModal(true)}
            >
              ⭐ 추천 받기
            </button>
          )}
          {cfg.practice && (
            <button
              className="dg-btn dg-btn-ghost-bordered"
              onClick={handleResetPractice}
              disabled={resetting}
            >
              {resetting ? "초기화 중..." : "🗑 연습 데이터 초기화"}
            </button>
          )}
          <button className="dg-btn-ghost" onClick={() => fetchCandidates()} disabled={listLoading}>
            {listLoading ? "..." : "새로고침"}
          </button>
        </div>
      </div>

      {/* 본문: 좌(목록) + 우(대화) */}
      <div className="dg-body">
        <aside className="dg-list-pane">
          <div className="dg-filters">
            <select
              className="dg-input dg-filter-select"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              title="지점 필터"
            >
              <option value="전체">전체 지점</option>
              <option value="미배정">미배정</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <input
              className="dg-input dg-search"
              placeholder="이름 / 전화번호 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="dg-list">
            {listLoading ? (
              <div className="dg-empty">로딩 중...</div>
            ) : filteredCandidates.length === 0 ? (
              <div className="dg-empty">
                {candidates.length === 0
                  ? `아직 등록된 ${cfg.channelLabel} 후보가 없습니다. [지원자 목록 → + 지원자 추가]에서 지원경로를 '${cfg.channelLabel}'으로 등록하면 여기 나타납니다.`
                  : "검색 결과 없음"}
              </div>
            ) : (
              filteredCandidates.map((c) => {
                const sb = stageBadge(c.agent_stage);
                return (
                  <button
                    key={c.id}
                    className={`dg-list-item ${selectedId === c.id ? "dg-list-active" : ""}`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="dg-list-row">
                      <span className="dg-list-name">{c.name}</span>
                      <span className="dg-stage" style={{ background: sb.bg, color: sb.fg }}>
                        {sb.label}
                      </span>
                      {c.unread_count > 0 && <span className="dg-badge">{c.unread_count}</span>}
                    </div>
                    <div className="dg-list-meta">
                      <span>{formatPhone(c.phone)}</span>
                      <span>·</span>
                      <span>{c.branch ?? "-"}</span>
                      {shortWorkHours(c.work_hours) && (
                        <>
                          <span>·</span>
                          <span className="dg-list-slot">🕑 {shortWorkHours(c.work_hours)}</span>
                        </>
                      )}
                      {c.last_message_at && (
                        <>
                          <span>·</span>
                          <span>{timeAgo(c.last_message_at)}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="dg-right">
          {selectedCandidate == null ? (
            <div className="dg-placeholder">
              <p>좌측에서 후보를 선택하세요. 새 후보 등록은 [지원자 목록 → + 지원자 추가]에서 진행합니다.</p>
            </div>
          ) : (
            <>
              <header className="dg-conv-head">
                <div>
                  <div className="dg-conv-name">
                    {selectedCandidate.name}
                    <button
                      className="dg-btn-detail"
                      onClick={() => setDetailOpen(true)}
                      title="지원자 상세 정보(편집 가능) 열기"
                    >
                      📋 상세정보
                    </button>
                    {(() => {
                      const sb = stageBadge(selectedCandidate.agent_stage);
                      return (
                        <span
                          className="dg-stage"
                          style={{ background: sb.bg, color: sb.fg, marginLeft: 8 }}
                        >
                          {sb.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="dg-conv-sub">
                    {formatPhone(selectedCandidate.phone)} · {selectedCandidate.branch ?? "-"} ·{" "}
                    <span
                      className="dg-status-wrap"
                      style={{ background: STATUS_BG[selectedCandidate.status ?? ""] || "#6b7280" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        className="dg-status-select"
                        value={selectedCandidate.status ?? "스크리닝 중"}
                        disabled={statusSaving === selectedCandidate.id}
                        onChange={(e) => handleStatusChange(selectedCandidate.id, e.target.value)}
                        title="진행 상태 변경"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <span className="dg-status-arrow" aria-hidden="true">▾</span>
                    </span>
                  </div>
                </div>
                <div className="dg-conv-actions">
                  {(agentStage === "screening" || agentStage === "onboarding" || agentStage === "active") && (
                    <button
                      className="dg-btn-pause"
                      onClick={async () => {
                        if (selectedId == null) return;
                        if (
                          !confirm(
                            "AI 응답을 일시정지합니다.\n\n• 이 후보가 보내는 새 메시지에 AI가 답하지 않습니다.\n• 매니저가 직접 답변하세요.\n• 재개하려면 '▶ AI 응답 재개' 버튼을 누르세요.\n\n진행할까요?"
                          )
                        ) {
                          return;
                        }
                        try {
                          const res = await fetch("/api/admin/agent/pause", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ applicant_id: selectedId }),
                          });
                          const json = await res.json();
                          if (!res.ok) {
                            alert(json.error || "일시정지 실패");
                            return;
                          }
                          await fetchMessages(selectedId, { silent: true });
                        } catch (e) {
                          alert(e instanceof Error ? e.message : "일시정지 실패");
                        }
                      }}
                    >
                      ⏸ AI 일시정지
                    </button>
                  )}
                  <button
                    className="dg-btn-ghost"
                    onClick={() => selectedId != null && fetchMessages(selectedId)}
                  >
                    새로고침
                  </button>
                </div>
              </header>

              <StageProgress
                stage={agentStage}
                onStageClick={async (target) => {
                  if (selectedId == null) return;
                  const targetLabel = STAGE_LABEL[target];
                  const note =
                    target === "screening"
                      ? "스크리닝부터 다시 진행합니다. (진행 상태 = 스크리닝 중)"
                      : "스크리닝 체크리스트를 완료한 것으로 처리하고 정보 수집(배민 아이디) 단계로 넘어갑니다. 앱설치 안내가 자동 발송됩니다. (진행 상태 = 스크리닝 완료)";
                  if (!confirm(`'${targetLabel}' 단계로 변경합니다.\n\n${note}\n\n진행할까요?`)) return;
                  try {
                    const res = await fetch("/api/admin/agent/set-stage", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ applicant_id: selectedId, target_stage: target }),
                    });
                    const json = await res.json();
                    if (!res.ok) {
                      alert(json.error || "단계 변경 실패");
                      return;
                    }
                    await fetchMessages(selectedId, { silent: true });
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "단계 변경 실패");
                  }
                }}
              />

              {agentStage === "onboarding" && (
                <div className="dg-banner dg-banner-info">
                  📦 <b>스크리닝 완료 — AI가 배민 아이디 수집 중.</b> 받으면 "곧 연락드리겠습니다"로 마무리 + 슬랙 '준비 완료' 알림이 갑니다.
                </div>
              )}
              {agentStage === "paused" && (
                <div className="dg-banner dg-banner-warn">
                  <div className="dg-paused-row">
                    <div className="dg-paused-text">
                      ⏸ <b>매니저 인계 상태</b> — AI 자동 응답이 꺼져 있습니다.<br />
                      <span className="dg-paused-help">
                        매니저가 직접 답변한 뒤, 아래 버튼을 누르면 <b>그 후 새로 들어오는 후보 답장부터</b> AI가 다시 응답합니다.
                        (이미 와 있는 메시지는 재처리되지 않습니다)
                      </span>
                    </div>
                    <button
                      className="dg-btn dg-btn-resume"
                      onClick={async () => {
                        if (selectedId == null) return;
                        if (
                          !confirm(
                            "AI 응답을 재개합니다.\n\n• 이 버튼을 누른 시점 이후 후보가 새로 보내는 메시지부터 AI가 응답합니다.\n• 이미 도착해 있는 메시지에는 자동 응답하지 않습니다.\n• 매니저 직접 응답은 그대로 가능합니다.\n\n진행할까요?"
                          )
                        ) {
                          return;
                        }
                        try {
                          const res = await fetch("/api/admin/agent/resume", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ applicant_id: selectedId }),
                          });
                          const json = await res.json();
                          if (!res.ok) {
                            alert(json.error || "재개 실패");
                            return;
                          }
                          alert(`AI 재개됨 (stage='${json.restored_stage}'). 다음 후보 답장부터 적용됩니다.`);
                          await fetchMessages(selectedId, { silent: true });
                        } catch (e) {
                          alert(e instanceof Error ? e.message : "재개 실패");
                        }
                      }}
                    >
                      ▶ AI 응답 재개
                    </button>
                  </div>
                </div>
              )}

              {(agentStage === "screening" || agentStage === "onboarding" || agentStage === "active") && (
                <div className="dg-checklist">
                  <div className="dg-checklist-title">
                    스크리닝 체크리스트
                    {(() => {
                      const sc = agentState.screening ?? {};
                      const ob = agentState.onboarding ?? {};
                      const doneScreening = SCREENING_KEYS.filter((k) => sc[k] === true).length;
                      const doneId = ob["배민_아이디_수신"] === true ? 1 : 0;
                      const totalItems = SCREENING_KEYS.length + 1;
                      return (
                        <span className="dg-checklist-count">
                          {doneScreening + doneId} / {totalItems}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="dg-checklist-items">
                    {SCREENING_KEYS.map((k) => {
                      const sc = agentState.screening ?? {};
                      const done = sc[k] === true;
                      return (
                        <span key={k} className={`dg-checklist-item ${done ? "dg-chk-done" : ""}`}>
                          {done ? "✓" : "·"} {k.replace(/_/g, " ")}
                        </span>
                      );
                    })}
                    {(() => {
                      const ob = agentState.onboarding ?? {};
                      const done = ob["배민_아이디_수신"] === true;
                      return (
                        <span className={`dg-checklist-item ${done ? "dg-chk-done" : ""}`}>
                          {done ? "✓" : "·"} 배민 아이디 수신
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div className="dg-conv-body">
                {msgLoading ? (
                  <div className="dg-empty">로딩 중...</div>
                ) : messages.length === 0 ? (
                  <div className="dg-empty">대화 내역 없음</div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`dg-msg ${m.direction === "outbound" ? "dg-msg-out" : "dg-msg-in"}`}
                    >
                      <div className="dg-msg-bubble">{m.body}</div>
                      {m.reasoning && (
                        <div className="dg-msg-reasoning">
                          <div className="dg-reasoning-label">🧠 AI 판단 근거</div>
                          <div className="dg-reasoning-body">{m.reasoning}</div>
                        </div>
                      )}
                      <div className="dg-msg-meta">
                        {m.direction === "outbound" && m.sent_by ? `${sentByLabel(m.sent_by)} · ` : ""}
                        {new Date(m.created_at).toLocaleString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  ))
                )}
                {sending && (
                  <div className={`dg-msg ${cfg.practice ? "dg-msg-in" : "dg-msg-out"} dg-typing`}>
                    <div className="dg-msg-bubble dg-typing-bubble">
                      <span className="dg-typing-dot" />
                      <span className="dg-typing-dot" />
                      <span className="dg-typing-dot" />
                      <span className="dg-typing-text">
                        {cfg.practice ? "AI 응답 생성 중..." : "전송 중..."}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className={`dg-conv-input ${cfg.practice ? "dg-conv-input-practice" : ""}`}>
                <textarea
                  className="dg-textarea"
                  rows={3}
                  placeholder={cfg.replyPlaceholder}
                  value={outbound}
                  onChange={(e) => setOutbound(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply();
                  }}
                />
                <button
                  className="dg-btn dg-btn-primary"
                  onClick={handleSendReply}
                  disabled={sending || !outbound.trim()}
                >
                  {sending ? "처리 중..." : cfg.sendButtonLabel}
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      {/* 모달: 지원자 미니 상세 정보 (편집 가능) */}
      {detailOpen && selectedCandidate && (
        <ApplicantMiniDetail
          applicant={selectedCandidate}
          branches={branches}
          onClose={() => setDetailOpen(false)}
          onPatched={(patch) => {
            setCandidates((prev) =>
              prev.map((c) =>
                c.id === selectedCandidate.id ? { ...c, ...patch } : c
              )
            );
          }}
        />
      )}

      {/* 모달: 추천 받기 (live 모드만) */}
      {showRecommendModal && (
        <div className="dg-modal-bg" onClick={() => setShowRecommendModal(false)}>
          <div className="dg-modal dg-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="dg-modal-head">
              <h3 className="dg-modal-title">⭐ 당근 후보 추천 받기</h3>
              <button className="dg-btn-ghost" onClick={() => setShowRecommendModal(false)}>×</button>
            </div>
            <p className="dg-modal-desc">
              AI 참고자료에서 공고를 선택하거나 직접 메모를 입력하세요.
              source='danggeun' 후보 풀에서 점수순(거리/차량/최신성)으로 추천합니다.
              한 명을 클릭하면 저장된 시작 멘트가 그 사람에게 실 발송됩니다.
            </p>
            <div className="dg-field">
              <label className="dg-label">
                AI 참고자료에서 공고 불러오기 <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(선택 안 해도 됨)</span>
              </label>
              <select
                className="dg-input"
                value=""
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  if (id == null) return;
                  const f = factsList.find((x) => x.id === id);
                  if (f) setRecommendMemo(`[${f.title}]\n${f.body}`);
                }}
              >
                <option value="">— 직접 입력하거나 facts 선택 —</option>
                {factsList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
              {factsList.length === 0 && (
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>
                  AI 참고자료 탭에서 공고 정보를 먼저 추가하면 여기서 빠르게 불러올 수 있습니다.
                </p>
              )}
            </div>
            <div className="dg-field">
              <label className="dg-label">공고 메모</label>
              <textarea
                className="dg-textarea"
                rows={6}
                placeholder="예) 강북미아 평일오전 자차, 시급 1.5~2만 / 픽업 서울 강북구 도봉로 34"
                value={recommendMemo}
                onChange={(e) => setRecommendMemo(e.target.value)}
              />
            </div>
            <div className="dg-row-end">
              <button
                className="dg-btn dg-btn-primary"
                onClick={handleRecommend}
                disabled={recommendLoading}
              >
                {recommendLoading ? "추천 중..." : "추천 받기"}
              </button>
            </div>

            {recommendResult.length > 0 && (
              <div className="dg-rec-list">
                <div className="dg-rec-head">
                  <span className="dg-rec-head-name">이름</span>
                  <span className="dg-rec-head-meta">전화 · 지역 · 거리</span>
                  <span className="dg-rec-head-score">점수</span>
                  <span />
                </div>
                {recommendResult.map((c) => (
                  <div key={c.id} className="dg-rec-item">
                    <span className="dg-rec-name">{c.name}</span>
                    <span className="dg-rec-meta">
                      {formatPhone(c.phone)} · {c.sigungu ?? c.location ?? "-"} ·{" "}
                      {c.score.distanceKm != null ? `${c.score.distanceKm.toFixed(1)}km` : "-"}
                    </span>
                    <span className="dg-rec-score">{c.score.total.toFixed(1)}</span>
                    <button
                      className="dg-btn dg-btn-primary"
                      onClick={() => handleRecommendSend(c)}
                      disabled={recommendSending === c.id}
                    >
                      {recommendSending === c.id ? "발송 중..." : "시작 멘트 발송"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 미니 상세 모달 — 지원자 목록 풀스크린 상세와 동일한 섹션 구성을
// 모달 오버레이 안에 압축해서 보여준다. 섹션 단위로 편집 가능.
// ─────────────────────────────────────────────────────────────────────
const SECTION_FIELDS: Record<string, (keyof Candidate)[]> = {
  personal: ["name", "birth_date", "phone", "status", "source"],
  address: ["location"],
  vehicle: ["own_vehicle", "license_type", "vehicle_type", "self_ownership"],
  hope: ["branch1", "branch2", "work_hours", "available_date"],
  onboarding: ["baemin_id", "kakao_channel_friend", "guide_sent", "onboarding_call_status"],
  confirmed: ["confirmed_branch", "current_branch", "start_date", "churn_reason"],
};

function ApplicantMiniDetail({
  applicant,
  branches,
  onClose,
  onPatched,
}: {
  applicant: Candidate;
  branches: string[];
  onClose: () => void;
  onPatched: (patch: ApplicantPatch) => void;
}) {
  const [draft, setDraft] = useState<Partial<Candidate>>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 모달이 닫혔다 다시 열릴 때 다른 후보로 바뀌면 편집 상태 초기화
  useEffect(() => {
    setDraft({});
    setEditingSection(null);
  }, [applicant.id]);

  const a = applicant;
  const draftVal = <K extends keyof Candidate>(k: K): Candidate[K] =>
    (k in draft ? (draft[k] as Candidate[K]) : a[k]);
  const setD = <K extends keyof Candidate>(k: K, v: Candidate[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const saveSection = async (section: string) => {
    const fields = SECTION_FIELDS[section] ?? [];
    const patch: ApplicantPatch = {};
    for (const k of fields) {
      if (k in draft) (patch as Record<string, unknown>)[k] = draft[k];
    }
    if (Object.keys(patch).length === 0) {
      setEditingSection(null);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/applicants/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "저장 실패");
        return;
      }
      // 서버가 변환·자동 보정한 최종 값으로 부모에게 통지
      onPatched(json.data as ApplicantPatch);
      setDraft((prev) => {
        const next = { ...prev };
        for (const k of fields) delete next[k];
        return next;
      });
      setEditingSection(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const cancelSection = (section: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const k of SECTION_FIELDS[section] ?? []) delete next[k];
      return next;
    });
    setEditingSection(null);
  };

  const SectionHead = ({ section, title }: { section: string; title: string }) => (
    <div className="dgd-sec-head">
      <h4 className="dgd-sec-title">{title}</h4>
      {editingSection === section ? (
        <div className="dgd-sec-actions">
          <button className="dgd-btn dgd-btn-ghost" onClick={() => cancelSection(section)} disabled={saving}>취소</button>
          <button className="dgd-btn dgd-btn-primary" onClick={() => saveSection(section)} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      ) : (
        <button
          className="dgd-btn-edit"
          onClick={() => {
            if (editingSection && editingSection !== section) cancelSection(editingSection);
            setEditingSection(section);
          }}
        >✏️ 편집</button>
      )}
    </div>
  );

  const editing = (s: string) => editingSection === s;

  return (
    <div className="dgd-bg" onClick={onClose}>
      <div className="dgd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dgd-head">
          <h3 className="dgd-title">📋 {a.name} 상세정보</h3>
          <button className="dgd-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="dgd-body">
          {/* 👤 인적사항 */}
          <SectionHead section="personal" title="👤 인적사항" />
          <div className="dgd-grid">
            <div>
              <span className="dgd-dl">성함</span>
              {editing("personal") ? (
                <input className="dgd-input" value={(draftVal("name") as string) || ""} onChange={(e) => setD("name", e.target.value)} />
              ) : (a.name)}
            </div>
            <div>
              <span className="dgd-dl">나이 (생년월일)</span>
              {editing("personal") ? (
                <input className="dgd-input" maxLength={6} placeholder="YYMMDD"
                  value={(draftVal("birth_date") as string) || ""}
                  onChange={(e) => setD("birth_date", e.target.value.replace(/[^\d]/g, "").slice(0, 6))} />
              ) : (
                <>
                  {calcAge(a.birth_date) ?? "—"}
                  {a.birth_date ? ` (${a.birth_date.slice(0, 2)}/${a.birth_date.slice(2, 4)}/${a.birth_date.slice(4, 6)})` : ""}
                </>
              )}
            </div>
            <div>
              <span className="dgd-dl">전화</span>
              {editing("personal") ? (
                <input className="dgd-input" value={(draftVal("phone") as string) || ""} onChange={(e) => setD("phone", e.target.value)} />
              ) : (a.phone)}
            </div>
            <div>
              <span className="dgd-dl">진행 상태</span>
              {editing("personal") ? (
                <select className="dgd-input" value={(draftVal("status") as string) || ""} onChange={(e) => setD("status", e.target.value)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className="dgd-status-badge" style={{ background: STATUS_BG[a.status ?? ""] || "#6b7280" }}>{a.status ?? "—"}</span>
              )}
            </div>
            <div>
              <span className="dgd-dl">지원경로</span>
              {editing("personal") ? (
                <select className="dgd-input" value={(draftVal("source") as string) || ""} onChange={(e) => setD("source", e.target.value)}>
                  <option value="danggeun">당근</option>
                  <option value="baemin">배민</option>
                  <option value="manual">수기</option>
                  <option value="direct">기타</option>
                </select>
              ) : sourceLabelLocal(a.source)}
            </div>
            <div><span className="dgd-dl">지원일</span>{new Date(a.created_at).toLocaleDateString("ko-KR")}</div>
          </div>

          {/* 🏠 거주지 */}
          <SectionHead section="address" title="🏠 거주지" />
          <div className="dgd-grid">
            <div className="dgd-wide">
              <span className="dgd-dl">주소</span>
              {editing("address") ? (
                <input className="dgd-input" value={(draftVal("location") as string) || ""} onChange={(e) => setD("location", e.target.value)} />
              ) : (a.location || "—")}
            </div>
            <div><span className="dgd-dl">동(자동)</span>{a.bname || "—"}</div>
            <div><span className="dgd-dl">시군구(자동)</span>{a.sigungu || "—"}</div>
          </div>

          {/* 🚗 차량·면허 */}
          <SectionHead section="vehicle" title="🚗 차량·면허" />
          <div className="dgd-grid">
            <div>
              <span className="dgd-dl">자차</span>
              {editing("vehicle") ? (
                <select className="dgd-input" value={(draftVal("own_vehicle") as string) || ""} onChange={(e) => setD("own_vehicle", e.target.value)}>
                  <option value="">—</option>
                  <option value="있음">있음</option>
                  <option value="없음">없음</option>
                </select>
              ) : (a.own_vehicle || "—")}
            </div>
            <div>
              <span className="dgd-dl">면허</span>
              {editing("vehicle") ? (
                <select className="dgd-input" value={(draftVal("license_type") as string) || ""} onChange={(e) => setD("license_type", e.target.value)}>
                  <option value="">—</option>
                  <option value="1종 보통">1종 보통</option>
                  <option value="2종 보통">2종 보통</option>
                  <option value="1종 대형">1종 대형</option>
                  <option value="없음">없음</option>
                </select>
              ) : (a.license_type || "—")}
            </div>
            <div>
              <span className="dgd-dl">차종</span>
              {editing("vehicle") ? (
                <input className="dgd-input" value={(draftVal("vehicle_type") as string) || ""} onChange={(e) => setD("vehicle_type", e.target.value)} />
              ) : (a.vehicle_type || "—")}
            </div>
            <div>
              <span className="dgd-dl">본인명의</span>
              {editing("vehicle") ? (
                <select className="dgd-input" value={(draftVal("self_ownership") as string) || ""} onChange={(e) => setD("self_ownership", e.target.value)}>
                  <option value="">—</option>
                  <option value="문제 없음">문제 없음</option>
                  <option value="문제 있음">문제 있음</option>
                </select>
              ) : (a.self_ownership || "—")}
            </div>
          </div>

          {/* 📍 희망 지점·시간 */}
          <SectionHead section="hope" title="📍 희망 지점·시간" />
          <div className="dgd-grid">
            <div>
              <span className="dgd-dl">1지망</span>
              {editing("hope") ? (
                <select className="dgd-input" value={(draftVal("branch1") as string) || ""} onChange={(e) => setD("branch1", e.target.value)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.branch1 || "—")}
            </div>
            <div>
              <span className="dgd-dl">2지망</span>
              {editing("hope") ? (
                <select className="dgd-input" value={(draftVal("branch2") as string) || ""} onChange={(e) => setD("branch2", e.target.value || null)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.branch2 || "—")}
            </div>
            <div className="dgd-wide">
              <span className="dgd-dl">희망시간 (복수)</span>
              {editing("hope") ? (
                <div className="dgd-slot-row">
                  {SLOTS.map((s) => {
                    const raw = (draftVal("work_hours") as string) || "";
                    const set = new Set(raw.split(",").map((t) => t.trim()).filter(Boolean));
                    const on = set.has(s);
                    return (
                      <button
                        key={s} type="button"
                        className={`dgd-slot-btn ${on ? "dgd-slot-on" : ""}`}
                        onClick={() => {
                          const next = new Set(set);
                          if (on) next.delete(s); else next.add(s);
                          const joined = SLOTS.filter((x) => next.has(x)).join(", ");
                          setD("work_hours", joined);
                        }}
                      >{s}</button>
                    );
                  })}
                </div>
              ) : (a.work_hours || "—")}
            </div>
            <div>
              <span className="dgd-dl">시작가능일</span>
              {editing("hope") ? (
                <input type="date" className="dgd-input" value={(draftVal("available_date") as string) || ""} onChange={(e) => setD("available_date", e.target.value || null)} />
              ) : (a.available_date || "—")}
            </div>
          </div>

          {/* 📱 온보딩 진행 */}
          <SectionHead section="onboarding" title="📱 온보딩 진행" />
          <div className="dgd-grid">
            <div>
              <span className="dgd-dl">배민 아이디</span>
              {editing("onboarding") ? (
                <input className="dgd-input" value={(draftVal("baemin_id") as string) || ""} onChange={(e) => setD("baemin_id", e.target.value || null)} />
              ) : (a.baemin_id || <span className="dgd-muted">미수집</span>)}
            </div>
            <div>
              <span className="dgd-dl">카톡 채널</span>
              {editing("onboarding") ? (
                <label className="dgd-check">
                  <input type="checkbox" checked={!!draftVal("kakao_channel_friend")} onChange={(e) => setD("kakao_channel_friend", e.target.checked)} />
                  친구추가됨
                </label>
              ) : (a.kakao_channel_friend ? "✓ 친구추가됨" : "—")}
            </div>
            <div>
              <span className="dgd-dl">가이드 전달</span>
              {editing("onboarding") ? (
                <label className="dgd-check">
                  <input type="checkbox" checked={!!draftVal("guide_sent")} onChange={(e) => setD("guide_sent", e.target.checked)} />
                  전달완료
                </label>
              ) : (a.guide_sent ? "✓ 전달완료" : "—")}
            </div>
            <div>
              <span className="dgd-dl">온보딩 통화</span>
              {editing("onboarding") ? (
                <input className="dgd-input" value={(draftVal("onboarding_call_status") as string) || ""} onChange={(e) => setD("onboarding_call_status", e.target.value || null)} />
              ) : (a.onboarding_call_status || "—")}
            </div>
          </div>

          {/* ✓ 확정·근무 */}
          <SectionHead section="confirmed" title="✓ 확정·근무" />
          <div className="dgd-grid">
            <div>
              <span className="dgd-dl">확정지점</span>
              {editing("confirmed") ? (
                <select className="dgd-input" value={(draftVal("confirmed_branch") as string) || ""} onChange={(e) => setD("confirmed_branch", e.target.value || null)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.confirmed_branch || "—")}
            </div>
            <div className="dgd-wide">
              <span className="dgd-dl">슬롯 (희망시간대 그대로 사용)</span>
              <div className="dgd-chip-row">
                {SLOTS.filter((s) => matchesSlot(a.work_hours, s)).map((s) => (
                  <span key={s} className="dgd-chip">{s}</span>
                ))}
                {!SLOTS.some((s) => matchesSlot(a.work_hours, s)) && <span className="dgd-muted">—</span>}
              </div>
              <div className="dgd-hint">편집은 위 [📍 희망 지점·시간] 섹션에서 진행</div>
            </div>
            <div>
              <span className="dgd-dl">현재 근무지점</span>
              {editing("confirmed") ? (
                <select className="dgd-input" value={(draftVal("current_branch") as string) || ""} onChange={(e) => setD("current_branch", e.target.value || null)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.current_branch || "—")}
            </div>
            <div>
              <span className="dgd-dl">시작일</span>
              {editing("confirmed") ? (
                <input type="date" className="dgd-input" value={(draftVal("start_date") as string) || ""} onChange={(e) => setD("start_date", e.target.value || null)} />
              ) : (a.start_date || "—")}
            </div>
            <div><span className="dgd-dl">이탈일(자동)</span>{a.churned_at ? new Date(a.churned_at).toLocaleDateString("ko-KR") : "—"}</div>
            <div className="dgd-wide">
              <span className="dgd-dl">이탈/대기 사유</span>
              {editing("confirmed") ? (
                <input className="dgd-input" value={(draftVal("churn_reason") as string) || ""} onChange={(e) => setD("churn_reason", e.target.value || null)} />
              ) : (a.churn_reason || "—")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const css = `
  .dg-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
    gap: 12px;
  }
  .dg-toolbar-left { display: flex; align-items: center; gap: 8px; }
  .dg-toolbar-actions { display: flex; gap: 8px; align-items: center; }
  .dg-title { font-size: 18px; font-weight: 700; color: #111827; margin: 0; }
  .dg-count { color: #6b7280; font-weight: 500; margin-left: 4px; }
  .dg-help { font-size: 11px; color: #6b7280; margin-left: 10px; }
  .dg-conv-input-practice {
    background: linear-gradient(to bottom, #FEF3C7, #fff);
  }
  .dg-conv-input-practice .dg-textarea {
    border-color: #F5C518;
    background: #FFFEF7;
  }

  .dg-body {
    display: flex;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }
  .dg-list-pane {
    flex: 1;
    max-width: 480px;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px;
  }
  .dg-search { flex: 1; min-width: 0; }
  .dg-filters {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .dg-filter-select {
    flex: 0 0 auto;
    width: 130px;
    padding: 7px 8px;
    font-size: 12px;
    cursor: pointer;
  }
  .dg-list-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .dg-status-wrap {
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    padding: 0 6px 0 0;
    position: relative;
    line-height: 1;
  }
  .dg-status-select {
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    border: none;
    background: transparent;
    padding: 3px 16px 3px 8px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    font-family: inherit;
    line-height: 1.4;
  }
  .dg-status-select::-ms-expand { display: none; }
  .dg-status-select:focus { outline: 2px solid rgba(245,197,24,0.6); outline-offset: 1px; }
  .dg-status-select:disabled { opacity: 0.5; cursor: wait; }
  /* 펼친 옵션 메뉴는 흰 배경이라 흰글씨가 안 보임 — 옵션만 검정으로 복구 */
  .dg-status-select option {
    color: #111827;
    background: #fff;
    font-weight: 500;
  }
  .dg-status-arrow {
    pointer-events: none;
    color: #fff;
    font-size: 10px;
    margin-left: -12px;
    margin-right: 2px;
    line-height: 1;
  }
  .dg-btn-detail {
    margin-left: 10px;
    padding: 3px 10px;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #374151;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    vertical-align: middle;
  }
  .dg-btn-detail:hover { background: #FFFBEB; border-color: #F5C518; color: #92650A; }
  .dg-right {
    flex: 2;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    min-width: 0;
  }

  .dg-input, .dg-textarea {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    background: #fff;
    color: #111827;
  }
  .dg-textarea { resize: vertical; min-height: 60px; }
  .dg-input:focus, .dg-textarea:focus {
    outline: none;
    border-color: #F5C518;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }

  .dg-field { display: flex; flex-direction: column; gap: 4px; }
  .dg-label { font-size: 12px; font-weight: 600; color: #374151; }

  .dg-btn {
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid transparent;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .dg-btn-primary { background: #1f2937; color: #fff; }
  .dg-btn-primary:hover:not(:disabled) { background: #111827; }
  .dg-btn-primary:disabled { background: #9ca3af; cursor: not-allowed; }
  .dg-btn-ghost {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #374151;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .dg-btn-ghost:hover { background: #f3f4f6; }
  .dg-btn-ghost-bordered {
    background: #fff;
    border: 1px solid #d1d5db;
    color: #374151;
  }
  .dg-btn-ghost-bordered:hover { background: #f3f4f6; }
  .dg-btn-warn {
    background: #FEF3C7;
    border: 1px solid #F5C518;
    color: #92400E;
  }
  .dg-btn-warn:hover { background: #FDE68A; }

  .dg-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; min-height: 0; }
  .dg-list-item {
    text-align: left;
    background: #fff;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 10px 12px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: inherit;
  }
  .dg-list-item:hover { background: #f9fafb; }
  .dg-list-active { background: #FFFBEB !important; border-color: #F5C518; }
  .dg-list-row { display: flex; align-items: center; gap: 6px; }
  .dg-list-name { font-weight: 600; font-size: 13px; color: #111827; flex: 1; }
  .dg-list-meta { font-size: 11px; color: #6b7280; display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .dg-list-slot { color: #92650A; font-weight: 600; }
  .dg-badge {
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 99px;
    font-weight: 700;
  }
  .dg-stage {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 99px;
    font-weight: 700;
    display: inline-block;
  }
  .dg-empty { padding: 16px; text-align: center; color: #9ca3af; font-size: 12px; }

  .dg-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    font-size: 13px;
    text-align: center;
    padding: 24px;
  }
  .dg-conv-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }
  .dg-conv-name { font-weight: 700; font-size: 14px; color: #111827; }
  .dg-conv-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
  .dg-conv-actions { display: flex; gap: 6px; }
  .dg-btn-pause {
    background: #FEF3C7;
    border: 1px solid #FCD34D;
    color: #92400E;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .dg-btn-pause:hover { background: #FDE68A; }
  .dg-conv-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #f9fafb;
  }
  .dg-msg { display: flex; flex-direction: column; max-width: 70%; }
  .dg-msg-in { align-self: flex-start; }
  .dg-msg-out { align-self: flex-end; align-items: flex-end; }
  .dg-msg-bubble {
    padding: 10px 12px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .dg-msg-in .dg-msg-bubble { background: #fff; border: 1px solid #e5e7eb; }
  .dg-msg-out .dg-msg-bubble { background: #FEF3C7; color: #1f2937; }
  .dg-msg-meta { font-size: 10px; color: #9ca3af; margin-top: 3px; }
  .dg-msg-reasoning {
    font-size: 11px;
    background: #EFF6FF;
    border-left: 3px solid #3B82F6;
    padding: 6px 10px;
    margin-top: 6px;
    border-radius: 0 6px 6px 0;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 100%;
  }
  .dg-reasoning-label {
    font-size: 10px;
    font-weight: 700;
    color: #1D4ED8;
    margin-bottom: 2px;
    letter-spacing: 0.02em;
  }
  .dg-reasoning-body {
    color: #1E40AF;
  }
  .dg-typing-bubble {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #fff !important;
    border: 1px dashed #d1d5db !important;
    color: #6b7280;
    padding: 8px 12px !important;
  }
  .dg-typing-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9CA3AF;
    animation: dg-typing 1.4s infinite ease-in-out;
  }
  .dg-typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .dg-typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dg-typing {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30% { opacity: 1; transform: translateY(-3px); }
  }
  .dg-typing-text {
    margin-left: 4px;
    font-size: 11px;
    font-weight: 500;
  }
  .dg-checklist {
    padding: 10px 16px;
    background: #FFFBEB;
    border-bottom: 1px solid #F5C518;
    font-size: 11px;
  }
  .dg-checklist-title {
    font-weight: 700;
    color: #92400E;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dg-checklist-count {
    font-weight: 600;
    color: #92650A;
    background: #FEF3C7;
    padding: 1px 8px;
    border-radius: 99px;
  }
  .dg-checklist-items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .dg-checklist-item {
    color: #9ca3af;
    font-weight: 500;
  }
  .dg-chk-done { color: #065F46; font-weight: 700; }

  .dg-banner {
    padding: 10px 16px;
    font-size: 12px;
    line-height: 1.5;
    border-bottom: 1px solid #e5e7eb;
  }
  .dg-banner-info { background: #EFF6FF; color: #1E3A8A; border-bottom-color: #BFDBFE; }
  .dg-banner-warn { background: #FEE2E2; color: #991B1B; border-bottom-color: #FCA5A5; }
  .dg-paused-row {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: space-between;
  }
  .dg-paused-text { flex: 1; line-height: 1.5; }
  .dg-paused-help {
    display: block;
    font-size: 11px;
    font-weight: 400;
    color: #991B1B;
    margin-top: 3px;
    opacity: 0.85;
  }
  .dg-btn-resume {
    background: #15803D;
    color: #fff;
    border: none;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .dg-btn-resume:hover { background: #166534; }

  .dg-progress {
    display: flex;
    align-items: center;
    padding: 14px 24px 10px;
    background: #fff;
    border-bottom: 1px solid #e5e7eb;
    gap: 0;
    position: relative;
  }
  .dg-progress-step {
    display: flex;
    align-items: center;
    flex: 1;
    position: relative;
  }
  .dg-progress-step:last-child { flex: 0 0 auto; }
  .dg-progress-step-clickable { cursor: pointer; }
  .dg-progress-step-clickable:hover .dg-progress-node {
    transform: scale(1.08);
    transition: transform 80ms ease-out;
  }
  .dg-progress-step-clickable:hover .dg-progress-label {
    color: #2563EB;
    text-decoration: underline;
  }
  .dg-progress-node {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
    z-index: 1;
  }
  .dg-node-done {
    background: #10B981;
    color: #fff;
  }
  .dg-node-current {
    background: #F5C518;
    color: #3D2B00;
    box-shadow: 0 0 0 3px rgba(245,197,24,0.25);
  }
  .dg-node-pending {
    background: #E5E7EB;
    color: #9CA3AF;
  }
  .dg-progress-label {
    margin-left: 6px;
    font-size: 12px;
    color: #9CA3AF;
    font-weight: 500;
    white-space: nowrap;
  }
  .dg-label-done { color: #065F46; font-weight: 600; }
  .dg-label-current { color: #92650A; font-weight: 700; }
  .dg-progress-line {
    flex: 1;
    height: 2px;
    background: #E5E7EB;
    margin: 0 8px;
    min-width: 20px;
  }
  .dg-line-done { background: #10B981; }
  .dg-progress-flag {
    position: absolute;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
    padding: 4px 10px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 700;
  }
  .dg-flag-pause { background: #FEE2E2; color: #991B1B; }
  .dg-flag-abort { background: #1F2937; color: #fff; }
  .dg-conv-input {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    align-items: flex-end;
    background: #fff;
  }
  .dg-conv-input .dg-textarea { flex: 1; }
  .dg-conv-input .dg-btn { white-space: nowrap; }

  /* 모달 */
  .dg-modal-bg {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 24px;
  }
  .dg-modal {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dg-modal-head { display: flex; align-items: center; justify-content: space-between; }
  .dg-modal-title { margin: 0; font-size: 16px; font-weight: 700; color: #111827; }
  .dg-modal-desc { font-size: 12px; color: #6b7280; margin: 0; }
  .dg-modal-actions {
    display: flex; justify-content: flex-end; gap: 8px;
    margin-top: 8px;
  }
  .dg-warn {
    padding: 10px 12px;
    background: #FEF3C7;
    border: 1px solid #F5C518;
    border-radius: 6px;
    color: #92400E;
    font-size: 12px;
  }

  .dg-modal-wide { max-width: 800px; }
  .dg-rec-list {
    margin-top: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }
  .dg-rec-head, .dg-rec-item {
    display: grid;
    grid-template-columns: 120px 1fr 60px 130px;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    font-size: 12px;
  }
  .dg-rec-head {
    background: #F9FAFB;
    font-weight: 700;
    color: #6b7280;
    border-bottom: 1px solid #e5e7eb;
  }
  .dg-rec-head-score { text-align: center; }
  .dg-rec-item:not(:last-child) { border-bottom: 1px solid #f3f4f6; }
  .dg-rec-name { font-weight: 600; color: #111827; }
  .dg-rec-meta { color: #6b7280; }
  .dg-rec-score {
    text-align: center;
    font-weight: 700;
    color: #1D4ED8;
    background: #EFF6FF;
    border-radius: 99px;
    padding: 2px 6px;
  }

  /* 미니 상세 모달 */
  .dgd-bg {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; padding: 24px;
  }
  .dgd-panel {
    background: #fff;
    border-radius: 12px;
    width: 100%;
    max-width: 720px;
    max-height: 92vh;
    overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .dgd-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #e5e7eb;
    background: #FFFBEB;
  }
  .dgd-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #111827;
  }
  .dgd-close {
    background: transparent;
    border: none;
    font-size: 24px;
    line-height: 1;
    color: #6b7280;
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 6px;
  }
  .dgd-close:hover { background: #FEF3C7; color: #111827; }
  .dgd-body {
    padding: 16px 20px 24px;
    overflow-y: auto;
    flex: 1;
  }
  .dgd-sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 14px 0 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f3f4f6;
  }
  .dgd-sec-title {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #111827;
  }
  .dgd-sec-actions { display: flex; gap: 6px; }
  .dgd-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .dgd-btn-ghost {
    background: #fff;
    border-color: #d1d5db;
    color: #374151;
  }
  .dgd-btn-ghost:hover { background: #f3f4f6; }
  .dgd-btn-primary {
    background: #F5C518;
    color: #3D2B00;
  }
  .dgd-btn-primary:hover { background: #E6B800; }
  .dgd-btn-primary:disabled, .dgd-btn-ghost:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .dgd-btn-edit {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #6b7280;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .dgd-btn-edit:hover { background: #FFFBEB; border-color: #F5C518; color: #92650A; }
  .dgd-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 16px;
    font-size: 12px;
    color: #111827;
  }
  .dgd-grid > div { display: flex; flex-direction: column; gap: 3px; }
  .dgd-wide { grid-column: 1 / -1; }
  .dgd-dl {
    font-size: 10px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .dgd-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    background: #fff;
    color: #111827;
  }
  .dgd-input:focus {
    outline: none;
    border-color: #F5C518;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }
  .dgd-muted { color: #9CA3AF; }
  .dgd-status-badge {
    display: inline-block;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 99px;
  }
  .dgd-hint {
    font-size: 10px;
    color: #9CA3AF;
    margin-top: 4px;
  }
  .dgd-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #374151;
    cursor: pointer;
  }
  .dgd-slot-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .dgd-slot-btn {
    padding: 4px 10px;
    border: 1px solid #d1d5db;
    border-radius: 99px;
    background: #fff;
    color: #6b7280;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .dgd-slot-on {
    background: #F5C518;
    color: #3D2B00;
    border-color: #F5C518;
  }
  .dgd-chip-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .dgd-chip {
    padding: 2px 8px;
    background: #FFFBEB;
    color: #92650A;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid #F5C518;
  }
`;
