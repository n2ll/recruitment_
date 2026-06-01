"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase";
import AgentJobsView from "./agent/AgentJobsView";
import PlaygroundView from "./agent/PlaygroundView";
import DanggeunView from "./agent/DanggeunView";
import PromptExamplesView from "./prompts/PromptExamplesView";
import SiteManagersView from "./site-managers/SiteManagersView";
import { sourceLabel } from "@/lib/applicant-source";
import ApplicantFormModal, { type ApplicantFormValue } from "./ApplicantFormModal";
import PendingInboxView from "./inbox/PendingInboxView";

interface Applicant {
  id: number;
  created_at: string;
  name: string;
  birth_date: string;
  phone: string;
  location: string;
  own_vehicle: string;
  license_type: string;
  vehicle_type: string;
  branch1: string;
  branch2: string | null;
  work_hours: string;
  introduction: string | null;
  experience: string | null;
  available_date: string | null;
  self_ownership: string;
  screening: string | null;
  status: string;
  branch: string | null;
  source: string;
  filter_pass: string | null;
  note: string | null;
  last_message_at: string | null;
  unread_count: number;
  start_date: string | null;
  confirmed_slot: string | null;
  confirmed_branch: string | null;
  current_branch: string | null;
  churned_at: string | null;
  churn_reason: string | null;
  agent_stage?: string | null;   // GET 응답에 attached (당근마켓구인과 동일 출처)
}

interface Message {
  id: string;
  applicant_id: number | null;
  applicant_phone: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  sent_by: string | null;
  solapi_msg_id: string | null;
  created_at: string;
  reasoning?: string | null;
}

interface Heartbeat {
  device_id: string;
  last_seen_at: string;
  pending_count: number;
  battery_level: number;
  app_version: string | null;
}

type Tab = "dashboard" | "applicants" | "contact" | "inbox" | "hope-slots" | "confirmed-slots" | "recommend" | "branches" | "site-managers" | "agent" | "playground" | "danggeun" | "baemin" | "danggeun-practice" | "klod";

interface RecommendResponse {
  success: boolean;
  job: {
    address: string;
    lat: number;
    lng: number;
    sigungu?: string | null;
    vehicle_required: boolean;
    schedule?: string;
    summary?: string;
  };
  poolSize: number;
  candidates: Array<{
    id: number;
    source: "applicant" | "legacy";
    name: string;
    phone: string;
    sigungu?: string | null;
    location?: string | null;
    own_vehicle?: string | null;
    created_at: string;
    birth_date?: string | null;
    score: {
      total: number;
      distance: number;
      vehicle: number;
      recency: number;
      distanceKm: number;
    };
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  "스크리닝 전":   "#9CA3AF",  // 회색 (대기/시작 전)
  "스크리닝 중":   "#6b7280",  // 진한 회색
  "스크리닝 완료": "#0EA5E9",  // 하늘색
  "확정인력":      "#10b981",  // 초록 (매니저 확정)
  "대기자":        "#f59e0b",  // 주황 (매니저 보류)
  "부적합":        "#ef4444",  // 빨강
};

const ALL_STATUSES = [
  "스크리닝 전", "스크리닝 중", "스크리닝 완료", "확정인력", "대기자", "부적합",
];

interface Branch {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
  slot_capacity?: Record<string, number>;
}

const SLOTS = ["평일오전", "평일오후", "주말오전", "주말오후"] as const;
type SlotKey = typeof SLOTS[number];

const DEFAULT_SLOT_CAPACITY: Record<SlotKey, number> = {
  평일오전: 2,
  평일오후: 2,
  주말오전: 2,
  주말오후: 2,
};

function getSlotCapacity(branch: Branch | undefined, slot: SlotKey): number {
  const v = branch?.slot_capacity?.[slot];
  return typeof v === "number" ? v : DEFAULT_SLOT_CAPACITY[slot];
}

// work_hours 값을 짧은 표기로 ("평일(월~금) 오전 타임 (09:00 ~ 14:00)" → "평일 오전")
function shortWorkHours(wh: string | null | undefined): string {
  if (!wh) return "";
  return wh
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const day = token.includes("주말") ? "주말" : token.includes("평일") ? "평일" : "";
      const time = token.includes("오전") ? "오전" : token.includes("오후") ? "오후" : "";
      return day && time ? `${day} ${time}` : token;
    })
    .join(", ");
}

// work_hours 텍스트(콤마 join된 4슬롯 중 선택값) → 슬롯 매칭
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

const ACTIVE_STATUSES = ["스크리닝 전", "스크리닝 중", "스크리닝 완료", "확정인력", "대기자"];

const SIDEBAR_PIN_KEY = "admin_sidebar_pinned";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarExpanded = sidebarPinned || sidebarHovered;
  const [showOther, setShowOther] = useState(false);

  // 사이드바 핀 상태 — localStorage 복구
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_PIN_KEY);
      if (saved !== null) setSidebarPinned(saved === "true");
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_PIN_KEY, String(sidebarPinned));
    } catch {
      // ignore
    }
  }, [sidebarPinned]);
  const [data, setData] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 지원자 추가/편집 모달
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [modalInitial, setModalInitial] = useState<ApplicantFormValue | null>(null);

  // 문자 대화 관련 state
  const [chatApplicant, setChatApplicant] = useState<Applicant | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [draft, setDraft] = useState<{
    id: string;
    draft_text: string | null;
    reasoning: string | null;
    missing_info: string | null;
    status: "pending" | "need_info";
  } | null>(null);
  const [draftEdited, setDraftEdited] = useState(false);

  // 구인 에이전트 테스트 탭 (세션 기반 — 공고만으로 응대 시뮬레이션)
  type AgentSessionTurn = {
    direction: "inbound" | "outbound";
    body: string;
    status?: "reply" | "need_info";
    reasoning?: string;
    missing_info?: string;
  };

  const [agentJobPosting, setAgentJobPosting] = useState("");
  const [agentNextInbound, setAgentNextInbound] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentSession, setAgentSession] = useState<AgentSessionTurn[]>([]);

  const resetAgentSession = () => {
    setAgentSession([]);
    setAgentNextInbound("");
  };

  const runAgentTest = async () => {
    const inbound = agentNextInbound.trim();
    if (!inbound) {
      alert("인입 메시지를 입력해주세요.");
      return;
    }
    setAgentLoading(true);

    const newInbound: AgentSessionTurn = { direction: "inbound", body: inbound };
    const sessionWithInbound = [...agentSession, newInbound];
    setAgentSession(sessionWithInbound);
    setAgentNextInbound("");

    try {
      const manualHistory = agentSession.map((t) => ({
        direction: t.direction,
        body: t.body,
        created_at: new Date().toISOString(),
      }));

      const res = await fetch("/api/admin/agent/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inbound_text: inbound,
          job_posting: agentJobPosting.trim() || null,
          manual_history: manualHistory.length > 0 ? manualHistory : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "테스트 실패");
        setAgentSession([
          ...sessionWithInbound,
          {
            direction: "outbound",
            body: `[에러: ${json.error || "실패"}]`,
            status: "need_info",
            reasoning: "API 호출 실패",
          },
        ]);
        return;
      }

      const draft = json.draft;
      const outboundBody =
        draft.status === "reply"
          ? draft.draft_text || "(빈 답변)"
          : `(need_info — 모자란 정보: ${draft.missing_info || "?"})`;

      setAgentSession([
        ...sessionWithInbound,
        {
          direction: "outbound",
          body: outboundBody,
          status: draft.status,
          reasoning: draft.reasoning,
          missing_info: draft.missing_info,
        },
      ]);
    } catch (e) {
      console.error(e);
      alert("테스트 중 오류");
    } finally {
      setAgentLoading(false);
    }
  };

  const editAgentTurn = (idx: number, newBody: string) => {
    setAgentSession((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, body: newBody } : t))
    );
  };

  const deleteAgentTurnsFrom = (idx: number) => {
    setAgentSession((prev) => prev.slice(0, idx));
  };

  // 전용 폰 heartbeat
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);

  // 슬롯 뷰 셀 선택 (drill-down 용)
  const [slotCell, setSlotCell] = useState<{ branch: string; slot: SlotKey } | null>(null);

  // 상세 패널 임시 편집 상태 (명시적 저장)
  const [editDraft, setEditDraft] = useState<Partial<Applicant>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  useEffect(() => { setEditDraft({}); }, [selectedId]);

  // 추천 받기 state
  const [recPosting, setRecPosting] = useState("");
  const [recManualAddr, setRecManualAddr] = useState("");
  const [recVehicleRequired, setRecVehicleRequired] = useState(true);
  const [recLoading, setRecLoading] = useState(false);
  const [recResult, setRecResult] = useState<RecommendResponse | null>(null);
  const [recSelected, setRecSelected] = useState<Set<string>>(new Set());
  const [recSending, setRecSending] = useState(false);
  const [recRough, setRecRough] = useState("");
  const [recGenerating, setRecGenerating] = useState(false);
  const [recGenMissing, setRecGenMissing] = useState<string[]>([]);

  const candidateKey = (c: { source: string; id: number }) => `${c.source}-${c.id}`;

  const generateRecPosting = async () => {
    if (!recRough.trim()) {
      alert("간단한 메모를 입력해주세요.");
      return;
    }
    setRecGenerating(true);
    setRecGenMissing([]);
    try {
      const res = await fetch("/api/admin/recommend/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rough: recRough }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "공고 생성 실패");
        return;
      }
      setRecPosting(json.posting || "");
      setRecGenMissing(Array.isArray(json.missing) ? json.missing : []);
    } catch (e) {
      console.error(e);
      alert("공고 생성 중 오류가 발생했습니다.");
    } finally {
      setRecGenerating(false);
    }
  };

  const ageFromBirthDate = (birth: string | null | undefined): number | null => {
    if (!birth) return null;
    const d = birth.replace(/\D/g, "");
    if (d.length !== 6) return null;
    const yy = parseInt(d.slice(0, 2), 10);
    const mm = parseInt(d.slice(2, 4), 10);
    const dd = parseInt(d.slice(4, 6), 10);
    if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null;
    const now = new Date();
    const currentYY = now.getFullYear() % 100;
    const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
    let age = now.getFullYear() - fullYear;
    const beforeBirthday =
      now.getMonth() + 1 < mm ||
      (now.getMonth() + 1 === mm && now.getDate() < dd);
    if (beforeBirthday) age -= 1;
    return age >= 0 && age < 120 ? age : null;
  };

  const runRecommend = async () => {
    if (!recPosting.trim()) {
      alert("공고 내용을 입력해주세요.");
      return;
    }
    setRecLoading(true);
    setRecResult(null);
    setRecSelected(new Set());
    try {
      const res = await fetch("/api/admin/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting: recPosting,
          manualAddress: recManualAddr || undefined,
          manualVehicleRequired: recVehicleRequired,
          topN: 10,
        }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) {
        alert("추천 실패: " + (json.error || "알 수 없는 오류"));
        return;
      }
      setRecResult(json);
      setRecSelected(new Set(json.candidates.map(candidateKey)));
    } catch {
      alert("네트워크 오류");
    } finally {
      setRecLoading(false);
    }
  };

  const loadMoreRec = async () => {
    if (!recResult || recLoading) return;
    const currentCount = recResult.candidates.length;
    const newTopN = currentCount + 10;
    if (newTopN > 50) {
      alert("최대 50명까지 표시 가능합니다.");
      return;
    }
    setRecLoading(true);
    try {
      const res = await fetch("/api/admin/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting: recPosting,
          manualAddress: recManualAddr || undefined,
          manualVehicleRequired: recVehicleRequired,
          topN: newTopN,
        }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) {
        alert("추가 추천 실패: " + (json.error || "알 수 없는 오류"));
        return;
      }
      // 신규 후보만 디폴트 체크 (기존 선택 상태는 유지)
      const previouslyShown = new Set(recResult.candidates.map(candidateKey));
      const next = new Set(recSelected);
      for (const c of json.candidates) {
        const k = candidateKey(c);
        if (!previouslyShown.has(k)) next.add(k);
      }
      setRecResult(json);
      setRecSelected(next);
    } catch {
      alert("네트워크 오류");
    } finally {
      setRecLoading(false);
    }
  };

  const toggleRecPick = (key: string) => {
    setRecSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sendRecMessages = async () => {
    if (!recResult) return;
    const picked = recResult.candidates.filter((c) => recSelected.has(candidateKey(c)));
    if (picked.length === 0) {
      alert("발송 대상을 선택해주세요.");
      return;
    }
    if (!confirm(`${picked.length}명에게 SMS 발송하시겠습니까?`)) return;
    setRecSending(true);
    try {
      const res = await fetch("/api/admin/messages/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: picked.map((c) => ({
            phone: c.phone,
            applicant_id: c.source === "applicant" ? c.id : null,
          })),
          body: recPosting,
        }),
        cache: "no-store",
      });
      const json = await res.json();
      if (json.success) {
        alert(`발송 완료: 성공 ${json.sent}건 / 실패 ${json.failed}건`);
      } else {
        alert("발송 실패: " + (json.error || ""));
      }
    } catch {
      alert("네트워크 오류");
    } finally {
      setRecSending(false);
    }
  };

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/applicants", { cache: "no-store" });
      const json = await res.json();
      setData(json.data || []);
    } catch {
      console.error("데이터 로딩 실패");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const [newBranchName, setNewBranchName] = useState("");
  const [branchSaving, setBranchSaving] = useState(false);
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const userEditedRef = useRef(false);

  // 사용자가 편집 중이면 서버 동기화로 덮어쓰지 않음
  useEffect(() => {
    if (!userEditedRef.current) {
      const sorted = [...branches].sort((a, b) => a.sort_order - b.sort_order);
      setLocalBranches(sorted);
    }
  }, [branches]);

  // 변경 여부 계산 (UI 표시용)
  const branchesDirty = (() => {
    if (localBranches.length !== branches.length) return false; // 길이 다르면 아직 sync 안 된 것
    const serverOrdered = [...branches].sort((a, b) => a.sort_order - b.sort_order);
    for (let i = 0; i < localBranches.length; i++) {
      const lb = localBranches[i];
      const sb = serverOrdered[i];
      if (!sb) return true;
      if (lb.id !== sb.id) return true;
      if (lb.name !== sb.name || lb.active !== sb.active) return true;
      // slot_capacity 변경 감지
      for (const k of SLOTS) {
        if (getSlotCapacity(lb, k) !== getSlotCapacity(sb, k)) return true;
      }
    }
    return false;
  })();

  const markEdited = () => {
    userEditedRef.current = true;
  };

  const updateLocalBranch = (id: number, updates: Partial<Branch>) => {
    markEdited();
    setLocalBranches((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
  };

  const handleDragStart = (id: number) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  };
  const handleDrop = (targetId: number) => {
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    markEdited();
    setLocalBranches((prev) => {
      const fromIdx = prev.findIndex((b) => b.id === dragId);
      const toIdx = prev.findIndex((b) => b.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDragId(null);
    setDragOverId(null);
  };

  const resetBranchChanges = () => {
    userEditedRef.current = false;
    const sorted = [...branches].sort((a, b) => a.sort_order - b.sort_order);
    setLocalBranches(sorted);
  };

  const saveBranchChanges = async () => {
    const byId = new Map(branches.map((b) => [b.id, b]));
    const ops: Array<Promise<{ ok: boolean; id: number; error?: string }>> = [];

    localBranches.forEach((lb, idx) => {
      const sb = byId.get(lb.id);
      if (!sb) return;
      const newSortOrder = (idx + 1) * 10;
      const updates: Partial<Branch> = {};
      if (lb.name !== sb.name) updates.name = lb.name;
      if (lb.active !== sb.active) updates.active = lb.active;
      if (newSortOrder !== sb.sort_order) updates.sort_order = newSortOrder;
      // slot_capacity 변경 감지
      const capDiff = SLOTS.some(
        (k) => getSlotCapacity(lb, k) !== getSlotCapacity(sb, k)
      );
      if (capDiff) {
        const cap: Record<string, number> = {};
        for (const k of SLOTS) cap[k] = getSlotCapacity(lb, k);
        updates.slot_capacity = cap;
      }
      if (Object.keys(updates).length === 0) return;

      // 이름 변경 시 사용 중이면 사전 확인
      if (updates.name) {
        const usage = data.filter(
          (a) =>
            a.branch === sb.name ||
            a.branch1 === sb.name ||
            a.branch2 === sb.name ||
            a.confirmed_branch === sb.name ||
            a.current_branch === sb.name
        ).length;
        if (usage > 0) {
          if (
            !confirm(
              `'${sb.name}' → '${updates.name}' 로 이름이 변경됩니다.\n` +
                `이 지점은 지원자 ${usage}명이 참조 중이며, 기존 데이터의 지점 이름은 자동 변경되지 않습니다.\n계속하시겠어요?`
            )
          ) {
            // 이 한 건만 롤백
            updateLocalBranch(lb.id, { name: sb.name });
            return;
          }
        }
      }

      ops.push(
        fetch(`/api/admin/branches/${lb.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updates),
        }).then(async (res) => {
          const json = await res.json();
          return { ok: res.ok, id: lb.id, error: json.error };
        })
      );
    });

    if (ops.length === 0) return;
    setBranchSaving(true);
    try {
      const results = await Promise.all(ops);
      const fails = results.filter((r) => !r.ok);
      if (fails.length > 0) {
        alert(`${fails.length}건 저장 실패: ${fails[0].error || "오류"}`);
      }
      userEditedRef.current = false;
      await fetchBranchesRef.current?.();
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setBranchSaving(false);
    }
  };

  const addBranch = async () => {
    const name = newBranchName.trim();
    if (!name) {
      alert("지점 이름을 입력해주세요.");
      return;
    }
    setBranchSaving(true);
    try {
      const res = await fetch("/api/admin/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "지점 추가 실패");
        return;
      }
      setNewBranchName("");
      userEditedRef.current = false;
      await fetchBranchesRef.current?.();
    } catch (e) {
      console.error(e);
      alert("지점 추가 중 오류");
    } finally {
      setBranchSaving(false);
    }
  };

  const deleteBranch = async (id: number, name: string) => {
    if (!confirm(`'${name}' 지점을 삭제하시겠어요?\n해당 지점에 지원자가 있으면 비활성화 처리됩니다.`)) return;
    setBranchSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "삭제 실패");
        return;
      }
      if (json.soft) {
        alert(json.message || "지원자가 있어 비활성화 처리했습니다.");
      }
      userEditedRef.current = false;
      await fetchBranchesRef.current?.();
    } catch (e) {
      console.error(e);
      alert("삭제 중 오류");
    } finally {
      setBranchSaving(false);
    }
  };

  const fetchBranchesRef = useRef<(() => Promise<void>) | null>(null);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/branches", { cache: "no-store" });
      const json = await res.json();
      setBranches(json.data || []);
    } catch {
      console.error("지점 목록 로딩 실패");
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranchesRef.current = fetchBranches;
  }, [fetchBranches]);

  const fetchHeartbeats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/heartbeat", { cache: "no-store" });
      const json = await res.json();
      setHeartbeats(json.data || []);
    } catch {
      console.error("Heartbeat 로딩 실패");
    }
  }, []);

  const patchApplicant = useCallback(
    async (id: number, updates: Partial<Applicant>) => {
      // 낙관적 업데이트
      setData((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
      try {
        const res = await fetch(`/api/admin/applicants/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        const json = await res.json();
        if (!json.success) {
          alert("저장 실패: " + (json.error || "알 수 없는 오류"));
          fetchData(true);
          return false;
        }
        setData((prev) => prev.map((a) => (a.id === id ? { ...a, ...json.data } : a)));
        return true;
      } catch (err) {
        console.error("[patchApplicant]", err);
        alert("네트워크 오류");
        fetchData(true);
        return false;
      }
    },
    [fetchData]
  );

  const openChat = async (applicant: Applicant) => {
    setChatApplicant(applicant);
    setChatLoading(true);
    setDraft(null);
    setDraftEdited(false);
    try {
      const res = await fetch(`/api/admin/messages/${applicant.id}`, { cache: "no-store" });
      const json = await res.json();
      setMessages(json.data || []);
      setDraft(json.draft || null);
      // unread_count 로컬 초기화
      setData((prev) =>
        prev.map((a) => (a.id === applicant.id ? { ...a, unread_count: 0 } : a))
      );
    } catch {
      console.error("대화 로딩 실패");
    } finally {
      setChatLoading(false);
    }
  };

  const closeChat = () => {
    setChatApplicant(null);
    setMessages([]);
    setMsgInput("");
    setDraft(null);
    setDraftEdited(false);
  };

  const useDraftAsInput = () => {
    if (!draft?.draft_text) return;
    setMsgInput(draft.draft_text);
    setDraftEdited(false);
  };

  const ignoreDraft = async () => {
    if (!draft) return;
    const id = draft.id;
    setDraft(null);
    try {
      await fetch(`/api/admin/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ignored" }),
      });
    } catch {
      // ignore
    }
  };

  const sendBody = async (text: string, opts: { draftId?: string; edited?: boolean }) => {
    if (!chatApplicant || !text.trim() || msgSending) return;
    setMsgSending(true);
    try {
      const res = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_id: chatApplicant.id,
          phone: chatApplicant.phone,
          body: text.trim(),
          sent_by: "관리자",
          draft_id: opts.draftId,
          draft_was_edited: !!opts.edited,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessages((prev) => [...prev, json.message]);
        setMsgInput("");
        setDraft(null);
        setDraftEdited(false);
      } else {
        alert("발송 실패: " + (json.error || "알 수 없는 오류"));
      }
    } catch {
      alert("발송 중 오류 발생");
    } finally {
      setMsgSending(false);
    }
  };

  const sendMessage = () => {
    if (!msgInput.trim()) return;
    const text = msgInput.trim();
    const usingDraft = !!draft?.draft_text && draft.draft_text === text;
    const editedDraft = !!draft?.draft_text && draft.draft_text !== text && draftEdited;
    sendBody(text, {
      draftId: usingDraft || editedDraft ? draft?.id : undefined,
      edited: editedDraft,
    });
  };

  const sendDraftDirect = () => {
    if (!draft?.draft_text) return;
    sendBody(draft.draft_text, { draftId: draft.id, edited: false });
  };

  // 현재 열려있는 chat applicant 참조 — Realtime 핸들러 안에서 최신 값 접근용
  const chatApplicantRef = useRef<Applicant | null>(null);
  useEffect(() => { chatApplicantRef.current = chatApplicant; }, [chatApplicant]);

  useEffect(() => {
    fetchData();
    fetchHeartbeats();
    fetchBranches();
    // 폴링은 Realtime 끊김 시 fallback (60초)
    const dataInterval = setInterval(() => fetchData(true), 60000);
    const hbInterval = setInterval(fetchHeartbeats, 60000);
    return () => { clearInterval(dataInterval); clearInterval(hbInterval); };
  }, [fetchData, fetchHeartbeats, fetchBranches]);

  // ── Realtime 구독: applicants / messages / device_heartbeat ──
  useEffect(() => {
    const supabase = getBrowserClient();

    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applicants" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newRow = payload.new as Applicant;
            setData((prev) =>
              prev.some((a) => a.id === newRow.id) ? prev : [newRow, ...prev]
            );
          } else if (payload.eventType === "UPDATE") {
            const newRow = payload.new as Applicant;
            setData((prev) =>
              prev.map((a) => (a.id === newRow.id ? { ...a, ...newRow } : a))
            );
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Applicant;
            setData((prev) => prev.filter((a) => a.id !== oldRow.id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          const current = chatApplicantRef.current;
          if (
            current &&
            (msg.applicant_id === current.id || msg.applicant_phone === current.phone)
          ) {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_drafts" },
        (payload) => {
          const d = payload.new as {
            id: string;
            applicant_id: number | null;
            applicant_phone: string;
            draft_text: string | null;
            reasoning: string | null;
            missing_info: string | null;
            status: string;
          };
          if (d.status !== "pending" && d.status !== "need_info") return;
          const current = chatApplicantRef.current;
          if (
            current &&
            (d.applicant_id === current.id || d.applicant_phone === current.phone)
          ) {
            setDraft({
              id: d.id,
              draft_text: d.draft_text,
              reasoning: d.reasoning,
              missing_info: d.missing_info,
              status: d.status as "pending" | "need_info",
            });
            setDraftEdited(false);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "device_heartbeat" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldHb = payload.old as Heartbeat;
            setHeartbeats((prev) => prev.filter((h) => h.device_id !== oldHb.device_id));
          } else {
            const newHb = payload.new as Heartbeat;
            setHeartbeats((prev) => {
              const without = prev.filter((h) => h.device_id !== newHb.device_id);
              return [newHb, ...without];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 전용 폰 상태 판별
  const phoneStatus = (() => {
    if (heartbeats.length === 0) return { online: false, label: "미연결", hb: null as Heartbeat | null };
    const latest = heartbeats[0];
    const diff = Date.now() - new Date(latest.last_seen_at).getTime();
    const online = diff < 10 * 60 * 1000; // 10분
    return { online, label: online ? "온라인" : "오프라인", hb: latest };
  })();

  const filtered = data.filter((a) => {
    if (branchFilter !== "전체" && a.branch !== branchFilter) return false;
    if (statusFilter !== "전체" && a.status !== statusFilter) return false;
    if (search && !a.name.includes(search) && !a.phone.includes(search)) return false;
    return true;
  });

  const stats = {
    total: data.length,
    today: data.filter((a) => {
      const d = new Date(a.created_at);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length,
    screeningPre: data.filter((a) => a.status === "스크리닝 전").length,
    screeningInProg: data.filter((a) => a.status === "스크리닝 중").length,
    screeningDone: data.filter((a) => a.status === "스크리닝 완료").length,
    confirmed: data.filter((a) => a.status === "확정인력").length,
    waiting: data.filter((a) => a.status === "대기자").length,
  };

  // 지점 on/off는 /apply(공개 폼)에만 영향. 매니저용 admin 화면은 모든 지점 노출.
  const allBranchNames = branches.map((b) => b.name);
  const branchStats = allBranchNames.map((b) => ({
    name: b,
    total: data.filter((a) => a.branch === b).length,
    screening: data.filter((a) => a.branch === b && a.status === "스크리닝 중").length,
  }));

  const selected = data.find((a) => a.id === selectedId);

  return (
    <>
      <style>{css}</style>
      <div className={`admin ${sidebarPinned ? "pinned" : ""}`}>
        {/* 사이드바 */}
        <nav
          className={`sidebar ${sidebarExpanded ? "sidebar-expanded" : "sidebar-collapsed"}`}
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          <div className="sidebar-logo">
            <img src="/logo.png" alt="옹고잉" className="logo-sm-img" />
            <span className="sidebar-title">옹고잉 관리자</span>
          </div>

          <div className="nav-group-label">AI 에이전트</div>
          <button className={`nav-btn ${tab === "danggeun" ? "nav-active" : ""}`}
            onClick={() => setTab("danggeun")} title="당근마켓구인">
            <span style={{ fontSize: 18, lineHeight: 1, width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>🥕</span>
            <span className="nav-label">당근마켓구인</span>
          </button>
          <button className={`nav-btn ${tab === "baemin" ? "nav-active" : ""}`}
            onClick={() => setTab("baemin")} title="배달의민족구인">
            <span style={{ fontSize: 18, lineHeight: 1, width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>📱</span>
            <span className="nav-label">배달의민족구인</span>
          </button>
          <button className={`nav-btn ${tab === "klod" ? "nav-active" : ""}`}
            onClick={() => setTab("klod")} title="클로드 조련하기">
            <span style={{ fontSize: 18, lineHeight: 1, width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>🧠</span>
            <span className="nav-label">클로드 조련하기</span>
          </button>

          <div className="nav-group-label">운영</div>
          <button className={`nav-btn ${tab === "dashboard" ? "nav-active" : ""}`}
            onClick={() => setTab("dashboard")} title="대시보드">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>
            <span className="nav-label">대시보드</span>
          </button>
          <button className={`nav-btn ${tab === "applicants" ? "nav-active" : ""}`}
            onClick={() => setTab("applicants")} title="지원자 목록">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M13 15v-1.5a3 3 0 00-3-3H8a3 3 0 00-3 3V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
            <span className="nav-label">지원자 목록</span>
            {stats.screeningInProg > 0 && <span className="badge">{stats.screeningInProg}</span>}
          </button>
          <button className={`nav-btn ${tab === "contact" ? "nav-active" : ""}`}
            onClick={() => setTab("contact")} title="배송원 컨택">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4.5h14a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1v-8a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M1 4.5l8 5 8-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span className="nav-label">배송원 컨택</span>
            {data.reduce((s, a) => s + (a.unread_count || 0), 0) > 0 && <span className="badge">{data.reduce((s, a) => s + (a.unread_count || 0), 0)}</span>}
          </button>
          <button className={`nav-btn ${tab === "inbox" ? "nav-active" : ""}`}
            onClick={() => setTab("inbox")} title="미분류 인박스">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 10v4a1 1 0 001 1h12a1 1 0 001-1v-4M2 10l3-6h8l3 6M2 10h4l1 2h4l1-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            <span className="nav-label">미분류 인박스</span>
          </button>

          <div className="nav-group-label">매트릭스</div>
          <button className={`nav-btn ${tab === "confirmed-slots" ? "nav-active" : ""}`}
            onClick={() => setTab("confirmed-slots")} title="확정 슬롯">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2h5v5H2zM11 2h5v5h-5zM2 11h5v5H2zM11 11h5v5h-5z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
            <span className="nav-label">확정 슬롯</span>
          </button>

          <div className="nav-group-label">관리</div>
          <button className={`nav-btn ${tab === "branches" ? "nav-active" : ""}`}
            onClick={() => setTab("branches")} title="지점 관리">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1l7 4v8l-7 4-7-4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            <span className="nav-label">지점 관리</span>
          </button>

          {/* 기타 — collapsible, 디폴트 접힘. 1차 목표(당근마켓구인) 외 메뉴들. */}
          <button
            className="nav-group-toggle"
            onClick={() => setShowOther((v) => !v)}
            title={showOther ? "기타 접기" : "기타 펼치기"}
          >
            <span className="nav-group-label-inline">
              기타 {showOther ? "▾" : "▸"}
            </span>
          </button>
          {showOther && (
            <>
              <button className={`nav-btn ${tab === "agent" ? "nav-active" : ""}`}
                onClick={() => setTab("agent")} title="구인 에이전트">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M6 8h.01M12 8h.01M6 11s1 2 3 2 3-2 3-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <span className="nav-label">구인 에이전트</span>
              </button>
              <button className={`nav-btn ${tab === "hope-slots" ? "nav-active" : ""}`}
                onClick={() => setTab("hope-slots")} title="희망 슬롯">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="2" fill="currentColor"/><rect x="2" y="8" width="14" height="2" fill="currentColor" opacity="0.6"/><rect x="2" y="12" width="14" height="2" fill="currentColor" opacity="0.3"/></svg>
                <span className="nav-label">희망 슬롯</span>
              </button>
              <button className={`nav-btn ${tab === "recommend" ? "nav-active" : ""}`}
                onClick={() => setTab("recommend")} title="추천 받기">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1l2 5 5 1-4 4 1 5-4-3-4 3 1-5-4-4 5-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                <span className="nav-label">추천 받기</span>
              </button>
              <button className={`nav-btn ${tab === "site-managers" ? "nav-active" : ""}`}
                onClick={() => setTab("site-managers")} title="현장 매니저">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M3 16c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <span className="nav-label">현장 매니저</span>
              </button>
              <button className={`nav-btn ${tab === "playground" ? "nav-active" : ""}`}
                onClick={() => setTab("playground")} title="플레이그라운드">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5"/></svg>
                <span className="nav-label">플레이그라운드</span>
              </button>
            </>
          )}

          {/* 연습용 — 사이드바 맨 아래 별도 위치 */}
          <button className={`nav-btn ${tab === "danggeun-practice" ? "nav-active" : ""}`}
            onClick={() => setTab("danggeun-practice")} title="당근마켓구인 (연습용)"
            style={{ marginTop: 12 }}>
            <span style={{ fontSize: 18, lineHeight: 1, width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>🧪</span>
            <span className="nav-label">당근마켓구인 (연습용)</span>
          </button>

          <div className="sidebar-footer">
            <button className="nav-btn" onClick={() => fetchData()} title="새로고침">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M1.5 9a7.5 7.5 0 0113.1-5M16.5 9a7.5 7.5 0 01-13.1 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span className="nav-label">새로고침</span>
            </button>
            <button
              className="nav-btn nav-pin"
              onClick={() => setSidebarPinned((p) => !p)}
              title={sidebarPinned ? "사이드바 펼침 고정 해제" : "사이드바 펼침 고정"}
            >
              {sidebarPinned ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l-2 4-4 1 3 3-1 5 4-2 4 2-1-5 3-3-4-1z" fill="currentColor"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l-2 4-4 1 3 3-1 5 4-2 4 2-1-5 3-3-4-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              )}
              <span className="nav-label">{sidebarPinned ? "고정됨" : "사이드바 고정"}</span>
            </button>
          </div>
        </nav>

        {/* 메인 */}
        <main className="main">
          {/* 전용 폰 상태 바 */}
          <div className={`phone-bar ${phoneStatus.online ? "phone-online" : "phone-offline"}`}>
            <span className={`phone-dot ${phoneStatus.online ? "dot-green" : "dot-red"}`} />
            <span className="phone-label">전용 폰: {phoneStatus.label}</span>
            {phoneStatus.hb && (
              <>
                <span className="phone-info">배터리 {phoneStatus.hb.battery_level}%</span>
                <span className="phone-info">미전송 {phoneStatus.hb.pending_count}건</span>
                <span className="phone-info">
                  마지막 응답: {new Date(phoneStatus.hb.last_seen_at).toLocaleTimeString("ko-KR")}
                </span>
              </>
            )}
            {!phoneStatus.online && <span className="phone-warn">⚠ 10분 이상 미응답</span>}
          </div>

          {loading ? (
            <div className="loading">로딩 중...</div>
          ) : tab === "dashboard" ? (
            <div className="content">
              <h2 className="page-title">대시보드</h2>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-num">{stats.total}</div><div className="stat-label">전체 지원자</div></div>
                <div className="stat-card accent"><div className="stat-num">{stats.today}</div><div className="stat-label">오늘 지원</div></div>
                <div className="stat-card"><div className="stat-num">{stats.screeningPre}</div><div className="stat-label">스크리닝 전</div></div>
                <div className="stat-card warn"><div className="stat-num">{stats.screeningInProg}</div><div className="stat-label">스크리닝 중</div></div>
                <div className="stat-card"><div className="stat-num">{stats.screeningDone}</div><div className="stat-label">스크리닝 완료</div></div>
                <div className="stat-card success"><div className="stat-num">{stats.confirmed}</div><div className="stat-label">확정인력</div></div>
                <div className="stat-card"><div className="stat-num">{stats.waiting}</div><div className="stat-label">대기자</div></div>
              </div>

              <h3 className="section-title">지점별 현황</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>지점</th><th>전체</th><th>스크리닝</th></tr>
                  </thead>
                  <tbody>
                    {branchStats.map((b) => (
                      <tr key={b.name}>
                        <td className="td-bold">{b.name}</td>
                        <td>{b.total}</td>
                        <td>{b.screening > 0 ? <span className="td-warn">{b.screening}</span> : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : tab === "applicants" ? (
            <div className="content">
              <div className="applicants-head">
                <h2 className="page-title">지원자 목록 <span className="count">{filtered.length}명</span></h2>
                <button
                  className="add-applicant-btn"
                  onClick={() => { setModalInitial(null); setModalMode("create"); }}
                >
                  + 지원자 추가
                </button>
              </div>
              <div className="filters">
                <select className="filter-select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  {["전체", ...allBranchNames].map((b) => <option key={b}>{b}</option>)}
                </select>
                <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  {["전체", ...ALL_STATUSES].map((s) => <option key={s}>{s}</option>)}
                </select>
                <input className="filter-input" placeholder="이름 또는 전화번호 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>성함</th><th>연락처</th><th>지점</th><th>차량</th><th>시간대</th><th>시작가능일</th><th>상태</th><th>채널</th><th>지원일</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className={`clickable ${selectedId === a.id ? "row-selected" : ""}`} onClick={() => setSelectedId(selectedId === a.id ? null : a.id)}>
                        <td className="td-bold">
                          <span className="name-link" onClick={(e) => { e.stopPropagation(); openChat(a); }}>{a.name}</span>
                          {a.note === "중복지원" && <span className="dup-tag">중복</span>}
                        </td>
                        <td>{a.phone}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="inline-select inline-branch"
                            value={a.branch ?? ""}
                            onChange={(e) => patchApplicant(a.id, { branch: e.target.value || null })}
                          >
                            <option value="">—</option>
                            {allBranchNames.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </td>
                        <td>{a.own_vehicle}</td>
                        <td className="td-muted">{shortWorkHours(a.work_hours) || "—"}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="date"
                            className="inline-date"
                            value={a.available_date ?? ""}
                            onChange={(e) => patchApplicant(a.id, { available_date: e.target.value || null })}
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="inline-select inline-status"
                            value={a.status}
                            onChange={(e) => patchApplicant(a.id, { status: e.target.value })}
                            style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}
                          >
                            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td>{sourceLabel(a.source)}</td>
                        <td>{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected && (() => {
                const draftVal = <K extends keyof Applicant>(key: K): Applicant[K] =>
                  (key in editDraft ? editDraft[key] : selected[key]) as Applicant[K];
                const setDraft = <K extends keyof Applicant>(key: K, value: Applicant[K]) =>
                  setEditDraft((prev) => ({ ...prev, [key]: value }));
                const hasChanges = Object.keys(editDraft).length > 0;
                const currentStatus = (draftVal("status") as string) || "";
                const saveEdits = async () => {
                  if (!hasChanges || savingEdit) return;
                  setSavingEdit(true);
                  const ok = await patchApplicant(selected.id, editDraft);
                  setSavingEdit(false);
                  if (ok) setEditDraft({});
                };
                const cancelEdits = () => setEditDraft({});

                return (
                <div className="detail-panel">
                  <div className="detail-header">
                    <h3>
                      {selected.name} 상세 정보
                      {hasChanges && <span className="dirty-tag">변경됨</span>}
                    </h3>
                    <div className="detail-actions">
                      <button
                        className="cancel-btn"
                        onClick={() => { setModalInitial(selected as ApplicantFormValue); setModalMode("edit"); }}
                      >
                        ✏️ 전체 편집
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={cancelEdits}
                        disabled={!hasChanges || savingEdit}
                      >
                        취소
                      </button>
                      <button
                        className="save-btn"
                        onClick={saveEdits}
                        disabled={!hasChanges || savingEdit}
                      >
                        {savingEdit ? "저장 중..." : "저장"}
                      </button>
                      <button className="close-btn" onClick={() => setSelectedId(null)}>X</button>
                    </div>
                  </div>

                  {/* 편집 가능 영역 (명시적 저장) */}
                  <div className="edit-grid">
                    <label className="edit-field">
                      <span className="dl">진행 상태</span>
                      <select
                        className="edit-select"
                        value={currentStatus}
                        onChange={(e) => setDraft("status", e.target.value)}
                      >
                        {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <div className="edit-field edit-field-wide">
                      <span className="dl">확정 슬롯 (복수 선택)</span>
                      <div className="slot-toggle-row">
                        {(() => {
                          const raw = (draftVal("confirmed_slot") as string) || "";
                          const selected = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
                          return SLOTS.map((s) => {
                            const on = selected.has(s);
                            return (
                              <button
                                key={s}
                                type="button"
                                className={`slot-toggle ${on ? "slot-toggle-on" : ""}`}
                                onClick={() => {
                                  const next = new Set(selected);
                                  if (on) next.delete(s); else next.add(s);
                                  // 입력 순서를 유지하기 위해 SLOTS 기준으로 재정렬
                                  const joined = SLOTS.filter((x) => next.has(x)).join(",");
                                  setDraft("confirmed_slot", joined || null);
                                }}
                              >
                                {s}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                    <label className="edit-field">
                      <span className="dl">확정 지점</span>
                      <select
                        className="edit-select"
                        value={(draftVal("confirmed_branch") as string) || ""}
                        onChange={(e) => setDraft("confirmed_branch", e.target.value || null)}
                      >
                        <option value="">—</option>
                        {allBranchNames.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    <label className="edit-field">
                      <span className="dl">시작일</span>
                      <input
                        type="date"
                        className="edit-select edit-date"
                        value={(draftVal("start_date") as string) || ""}
                        onChange={(e) => setDraft("start_date", e.target.value || null)}
                        onClick={(e) => {
                          const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                          try { el.showPicker?.(); } catch { /* unsupported */ }
                        }}
                      />
                    </label>
                    {(currentStatus === "부적합" || currentStatus === "대기자") && (
                      <label className="edit-field edit-field-wide">
                        <span className="dl">사유 메모</span>
                        <input
                          type="text"
                          className="edit-select"
                          placeholder="부적합/대기 사유"
                          value={(draftVal("churn_reason") as string) || ""}
                          onChange={(e) => setDraft("churn_reason", e.target.value || null)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="detail-grid">
                    <div><span className="dl">거주지</span>{selected.location}</div>
                    <div><span className="dl">차종</span>{selected.vehicle_type}</div>
                    <div><span className="dl">희망지점</span>{selected.branch1}{selected.branch2 ? ` / ${selected.branch2}` : ""}</div>
                    <div><span className="dl">희망시간</span>{selected.work_hours}</div>
                    <div><span className="dl">본인명의</span>{selected.self_ownership}</div>
                  </div>
                  {selected.introduction && (
                    <div className="detail-section">
                      <span className="dl">자기소개</span>
                      <p className="detail-text">{selected.introduction}</p>
                    </div>
                  )}
                  {selected.experience && (
                    <div className="detail-section">
                      <span className="dl">경력</span>
                      <p className="detail-text">{selected.experience}</p>
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          ) : tab === "hope-slots" ? (
            <div className="content">
              <h2 className="page-title">희망 슬롯 분포</h2>
              <p className="page-desc">
                지원자가 <strong>희망한</strong> 시간대·지점 기준 풀 분포입니다.
                셀을 클릭하면 해당 조건의 지원자 목록이 표시됩니다.
                (활성 상태만 집계 — 부적합 제외)
              </p>

              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th>지점 \ 슬롯</th>
                      {SLOTS.map((s) => <th key={s}>{s}</th>)}
                      <th>지점 합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allBranchNames.map((b) => {
                      const rowTotal = data.filter(
                        (a) =>
                          ACTIVE_STATUSES.includes(a.status) &&
                          (a.branch1 === b || a.branch2 === b)
                      ).length;
                      return (
                        <tr key={b}>
                          <td className="td-bold">{b}</td>
                          {SLOTS.map((s) => {
                            const n = data.filter(
                              (a) =>
                                ACTIVE_STATUSES.includes(a.status) &&
                                (a.branch1 === b || a.branch2 === b) &&
                                matchesSlot(a.work_hours, s)
                            ).length;
                            const active = slotCell?.branch === b && slotCell?.slot === s;
                            return (
                              <td
                                key={s}
                                className={`matrix-cell ${n === 0 ? "cell-zero" : n >= 3 ? "cell-hot" : "cell-some"} ${active ? "cell-active" : ""}`}
                                onClick={() => setSlotCell(active ? null : { branch: b, slot: s })}
                              >
                                {n}
                              </td>
                            );
                          })}
                          <td className="td-total">{rowTotal}</td>
                        </tr>
                      );
                    })}
                    <tr className="matrix-total-row">
                      <td className="td-bold">슬롯 합계</td>
                      {SLOTS.map((s) => (
                        <td key={s} className="td-total">
                          {data.filter(
                            (a) =>
                              ACTIVE_STATUSES.includes(a.status) &&
                              matchesSlot(a.work_hours, s)
                          ).length}
                        </td>
                      ))}
                      <td className="td-total">
                        {data.filter(
                          (a) => ACTIVE_STATUSES.includes(a.status)
                        ).length}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {slotCell && (() => {
                const list = data.filter(
                  (a) =>
                    ACTIVE_STATUSES.includes(a.status) &&
                    (a.branch1 === slotCell.branch || a.branch2 === slotCell.branch) &&
                    matchesSlot(a.work_hours, slotCell.slot)
                );
                return (
                  <div className="slot-drill">
                    <div className="slot-drill-header">
                      <h3>{slotCell.branch} · {slotCell.slot} · {list.length}명</h3>
                      <button className="close-btn" onClick={() => setSlotCell(null)}>X</button>
                    </div>
                    {list.length === 0 ? (
                      <div className="empty">해당 조건의 지원자가 없습니다.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr><th>성함</th><th>연락처</th><th>희망지점</th><th>상태</th><th>시작가능일</th><th>희망시간</th></tr>
                          </thead>
                          <tbody>
                            {list.map((a) => (
                              <tr key={a.id} className="clickable" onClick={() => { setTab("applicants"); setSelectedId(a.id); }}>
                                <td className="td-bold">{a.name}</td>
                                <td>{a.phone}</td>
                                <td>{a.branch1}{a.branch2 ? ` / ${a.branch2}` : ""}</td>
                                <td><span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span></td>
                                <td>{a.available_date}</td>
                                <td className="td-slim">{a.work_hours}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : tab === "confirmed-slots" ? (
            <div className="content">
              <h2 className="page-title">확정 슬롯 현황</h2>
              <p className="page-desc">
                <strong>status='확정'</strong> 지원자 기준 현황입니다. 슬롯별 정원은 [지점 관리] 탭에서 편집할 수 있습니다.
                셀을 클릭하면 배치된 인원이 표시됩니다.
              </p>

              <div className="matrix-legend">
                <span className="lg-dot lg-full" /> 정원 충족
                <span className="lg-dot lg-half" /> 정원 미달 (1명 이상)
                <span className="lg-dot lg-zero" /> 빈 슬롯
              </div>

              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th>지점 \ 슬롯</th>
                      {SLOTS.map((s) => <th key={s}>{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map((branch) => {
                      const b = branch.name;
                      return (
                      <tr key={b}>
                        <td className="td-bold">{b}</td>
                        {SLOTS.map((s) => {
                          const capacity = getSlotCapacity(branch, s);
                          const confirmed = data.filter(
                            (a) =>
                              a.status === "확정인력" &&
                              (a.confirmed_slot ?? "").split(",").map((t) => t.trim()).includes(s) &&
                              a.confirmed_branch === b
                          ).length;
                          const cellClass =
                            capacity > 0 && confirmed >= capacity ? "cell-full"
                            : confirmed >= 1 ? "cell-half"
                            : "cell-zero";
                          const active = slotCell?.branch === b && slotCell?.slot === s;
                          return (
                            <td
                              key={s}
                              className={`matrix-cell ${cellClass} ${active ? "cell-active" : ""}`}
                              onClick={() => setSlotCell(active ? null : { branch: b, slot: s })}
                            >
                              <div className="conf-main">{confirmed}/{capacity}</div>
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {slotCell && (() => {
                const list = data.filter(
                  (a) =>
                    (a.confirmed_slot ?? "").split(",").map((t) => t.trim()).includes(slotCell.slot) &&
                    a.confirmed_branch === slotCell.branch &&
                    a.status === "확정인력"
                );
                return (
                  <div className="slot-drill">
                    <div className="slot-drill-header">
                      <h3>{slotCell.branch} · {slotCell.slot} · 배치된 {list.length}명</h3>
                      <button className="close-btn" onClick={() => setSlotCell(null)}>X</button>
                    </div>
                    {list.length === 0 ? (
                      <div className="empty">배치된 인원이 없습니다. 지원자 목록에서 확정 슬롯/지점을 지정해주세요.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr><th>성함</th><th>연락처</th><th>상태</th><th>시작일</th><th>현재 근무지</th></tr>
                          </thead>
                          <tbody>
                            {list.map((a) => (
                              <tr key={a.id} className="clickable" onClick={() => { setTab("applicants"); setSelectedId(a.id); }}>
                                <td className="td-bold">{a.name}</td>
                                <td>{a.phone}</td>
                                <td><span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span></td>
                                <td>{a.start_date || "-"}</td>
                                <td>{a.current_branch || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : tab === "recommend" ? (
            <div className="content">
              <h2 className="page-title">배송원 추천</h2>
              <p className="page-desc">
                공고 내용을 붙여넣으면 Claude가 상차지 주소를 추출하고, 등록된 후보 풀에서 점수 상위 10명을 추천합니다.
                선택 후 공고 내용을 그대로 SMS로 일괄 발송할 수 있습니다.
              </p>

              <div className="rec-input-wrap">
                <details className="rec-generate" open={!recPosting}>
                  <summary>✨ 공고 자동 생성 (대충 입력하면 Claude가 다듬어줍니다)</summary>
                  <div className="rec-generate-body">
                    <textarea
                      className="rec-input"
                      placeholder="예) 강북미아 토일 장보기 자차, 시급 1.5~2만, 픽업 도봉로 34"
                      rows={3}
                      value={recRough}
                      onChange={(e) => setRecRough(e.target.value)}
                    />
                    <button
                      className="rec-btn-secondary rec-gen-btn"
                      onClick={generateRecPosting}
                      disabled={recGenerating}
                    >
                      {recGenerating ? "생성 중..." : "공고 생성하기"}
                    </button>
                    {recGenMissing.length > 0 && (
                      <div className="rec-gen-missing">
                        ⚠️ 메모에 빠진 항목이 있어 <code>[?]</code>로 표시했습니다 — 직접 채워주세요:&nbsp;
                        {recGenMissing.map((m) => (
                          <span key={m} className="rec-missing-chip">{m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </details>

                <label className="rec-label">공고 내용 <span className="req">*</span></label>
                <textarea
                  className="rec-textarea"
                  placeholder="예) [내이루리] 마포구 상암동 평일 오전 자차 배송원 1명 급구 — 시급 25,000원..."
                  rows={10}
                  value={recPosting}
                  onChange={(e) => setRecPosting(e.target.value)}
                />

                <div className="rec-row">
                  <label className="rec-label">차량 필요 여부 <span className="req">*</span></label>
                  <div className="radio-group">
                    {[
                      { v: true, label: "차량 필요" },
                      { v: false, label: "차량 불필요" },
                    ].map((opt) => (
                      <button
                        key={String(opt.v)}
                        type="button"
                        className={`radio-btn ${recVehicleRequired === opt.v ? "radio-on" : ""}`}
                        onClick={() => setRecVehicleRequired(opt.v)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <details className="rec-advanced">
                  <summary>상차지 주소 (Claude 자동 추출 건너뛰기)</summary>
                  <input
                    className="rec-input"
                    placeholder="예) 서울 마포구 상암동"
                    value={recManualAddr}
                    onChange={(e) => setRecManualAddr(e.target.value)}
                  />
                </details>

                <button className="rec-btn-primary" onClick={runRecommend} disabled={recLoading}>
                  {recLoading ? "추천 중..." : "추천 받기"}
                </button>
              </div>

              {recResult && (
                <div className="rec-result">
                  <div className="rec-job-info">
                    <div><span className="dl">상차지 주소</span>{recResult.job.address}</div>
                    <div><span className="dl">시군구</span>{recResult.job.sigungu || "-"}</div>
                    <div><span className="dl">차량 필요</span>{recResult.job.vehicle_required ? "필요" : "불필요"}</div>
                    {recResult.job.schedule && <div><span className="dl">시간대</span>{recResult.job.schedule}</div>}
                    <div><span className="dl">전체 풀</span>{recResult.poolSize}명</div>
                  </div>

                  <div className="rec-actions">
                    <button
                      className="rec-btn-secondary"
                      onClick={() => setRecSelected(new Set(recResult.candidates.map(candidateKey)))}
                    >
                      전체 선택
                    </button>
                    <button
                      className="rec-btn-secondary"
                      onClick={() => setRecSelected(new Set())}
                    >
                      전체 해제
                    </button>
                    <span className="rec-count">{recSelected.size} / {recResult.candidates.length}명 선택됨</span>
                    {recResult.candidates.length < 50 && (
                      <button
                        className="rec-btn-secondary"
                        onClick={loadMoreRec}
                        disabled={recLoading}
                      >
                        {recLoading ? "불러오는 중..." : "10명 더 받기"}
                      </button>
                    )}
                  </div>

                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}></th>
                          <th>순위</th>
                          <th>이름</th>
                          <th>나이</th>
                          <th>출처</th>
                          <th>거리</th>
                          <th>차량</th>
                          <th>시군구</th>
                          <th>점수</th>
                          <th>세부</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recResult.candidates.map((c, idx) => {
                          const k = candidateKey(c);
                          const age = ageFromBirthDate(c.birth_date);
                          return (
                            <tr key={k}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={recSelected.has(k)}
                                  onChange={() => toggleRecPick(k)}
                                />
                              </td>
                              <td className="td-bold">#{idx + 1}</td>
                              <td>{c.name} <span className="td-meta">{c.phone}</span></td>
                              <td>{age !== null ? `${age}세` : "-"}</td>
                              <td>
                                <span className={`source-badge ${c.source === "legacy" ? "src-legacy" : "src-active"}`}>
                                  {c.source === "legacy" ? "레거시" : "신규"}
                                </span>
                              </td>
                              <td>{c.score.distanceKm.toFixed(1)} km</td>
                              <td>{c.own_vehicle || "-"}</td>
                              <td>{c.sigungu || "-"}</td>
                              <td className="td-bold rec-score-total">{c.score.total}</td>
                              <td className="td-meta">
                                거리 {c.score.distance} · 차량 {c.score.vehicle} · 최신성 {c.score.recency}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {recResult && (
                <div className="rec-preview-inline">
                  <h3 className="section-title">📤 발송 미리보기</h3>
                  <div className="rec-preview-meta">
                    SMS로 발송됩니다. 한 번 발송된 메시지는 회수할 수 없습니다.
                  </div>
                  <div className="rec-message-preview">{recPosting || "(공고 내용을 입력하세요)"}</div>

                  {recSelected.size > 0 ? (
                    <div className="rec-recipients-preview">
                      <strong>수신자 ({recSelected.size}명):</strong>
                      <div className="rec-recipients-list">
                        {recResult.candidates
                          .filter((c) => recSelected.has(candidateKey(c)))
                          .map((c) => (
                            <span key={candidateKey(c)} className="rec-recipient-chip">
                              {c.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rec-empty-recipients">위 표에서 발송 대상을 체크해주세요.</div>
                  )}

                  <button
                    className="rec-btn-primary rec-send-btn"
                    onClick={sendRecMessages}
                    disabled={recSending || recSelected.size === 0}
                  >
                    {recSending
                      ? "발송 중..."
                      : recSelected.size === 0
                      ? "발송 대상 선택 필요"
                      : `${recSelected.size}명에게 발송`}
                  </button>
                </div>
              )}
            </div>
          ) : tab === "branches" ? (
            <div className="content">
              <h2 className="page-title">지점 관리 <span className="count">{localBranches.filter((b) => b.active).length}개 활성</span></h2>
              <p className="page-desc">
                /apply 페이지의 지점 드롭다운과 /admin의 모든 지점 필터·통계가 이 목록을 사용합니다.
                행을 드래그해서 순서를 바꾸고, 변경사항은 [저장] 버튼을 눌러야 반영됩니다.
              </p>

              <div className="branch-add-row">
                <input
                  className="filter-input"
                  placeholder="새 지점 이름 (예: 송파잠실)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addBranch(); }}
                />
                <button
                  className="rec-btn-secondary"
                  onClick={addBranch}
                  disabled={branchSaving}
                >
                  + 지점 추가
                </button>
              </div>

              <div className="branch-save-bar">
                {branchesDirty ? (
                  <span className="branch-dirty-msg">⚠️ 저장되지 않은 변경사항이 있습니다.</span>
                ) : (
                  <span className="branch-clean-msg">변경사항 없음</span>
                )}
                <div className="branch-save-actions">
                  <button
                    className="rec-btn-secondary"
                    onClick={resetBranchChanges}
                    disabled={!branchesDirty || branchSaving}
                  >
                    취소
                  </button>
                  <button
                    className="rec-btn-primary"
                    onClick={saveBranchChanges}
                    disabled={!branchesDirty || branchSaving}
                    style={{ marginTop: 0 }}
                  >
                    {branchSaving ? "저장 중..." : "변경사항 저장"}
                  </button>
                </div>
              </div>

              {branchesLoading ? (
                <div className="loading">로딩 중...</div>
              ) : (
                <div className="table-wrap">
                  <table className="table branch-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}></th>
                        <th>지점명</th>
                        <th style={{ width: 90 }}>활성</th>
                        <th style={{ width: 130 }}>상태</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {localBranches.map((b) => {
                        const usageCount = data.filter(
                          (a) =>
                            a.branch === b.name ||
                            a.branch1 === b.name ||
                            a.branch2 === b.name ||
                            a.confirmed_branch === b.name ||
                            a.current_branch === b.name
                        ).length;
                        const isDragging = dragId === b.id;
                        const isDragOver = dragOverId === b.id && dragId !== b.id;
                        return (
                          <tr
                            key={b.id}
                            draggable
                            onDragStart={() => handleDragStart(b.id)}
                            onDragOver={(e) => handleDragOver(e, b.id)}
                            onDragLeave={() => setDragOverId(null)}
                            onDrop={() => handleDrop(b.id)}
                            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                            className={`branch-row ${isDragging ? "drag-ghost" : ""} ${isDragOver ? "drag-over" : ""}`}
                            style={{ opacity: isDragging ? 0.4 : b.active ? 1 : 0.55 }}
                          >
                            <td className="branch-drag-handle" title="드래그해서 순서 변경">⋮⋮</td>
                            <td>
                              <input
                                type="text"
                                className="branch-name-input"
                                value={b.name}
                                disabled={branchSaving}
                                onChange={(e) => updateLocalBranch(b.id, { name: e.target.value })}
                              />
                            </td>
                            <td>
                              <label className="toggle">
                                <input
                                  type="checkbox"
                                  checked={b.active}
                                  disabled={branchSaving}
                                  onChange={(e) => updateLocalBranch(b.id, { active: e.target.checked })}
                                />
                                <span className="toggle-slider" />
                              </label>
                            </td>
                            <td className="td-meta">
                              {usageCount > 0 ? `지원자 ${usageCount}명` : "사용 0"}
                            </td>
                            <td>
                              <button
                                className="rec-btn-secondary"
                                disabled={branchSaving}
                                onClick={() => deleteBranch(b.id, b.name)}
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 슬롯 정원 매트릭스 */}
              {!branchesLoading && localBranches.length > 0 && (
                <div className="slot-capacity-card">
                  <h3 className="slot-capacity-title">슬롯 정원 매트릭스</h3>
                  <p className="page-desc" style={{ marginTop: 0 }}>
                    지점별 슬롯 정원을 직접 편집합니다. 확정 슬롯 매트릭스와 추천·확정 로직이 이 값을 기준으로 동작합니다.
                  </p>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 120 }}>지점</th>
                          {SLOTS.map((s) => (
                            <th key={s} style={{ textAlign: "center", width: 100 }}>{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {localBranches.filter((b) => b.active).map((b) => (
                          <tr key={b.id}>
                            <td><b>{b.name}</b></td>
                            {SLOTS.map((s) => (
                              <td key={s} style={{ textAlign: "center" }}>
                                <input
                                  type="number"
                                  className="slot-cap-input"
                                  min={0}
                                  max={99}
                                  value={getSlotCapacity(b, s)}
                                  disabled={branchSaving}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => {
                                    // leading-zero('05') 케이스에서도 5가 들어가도록 parseInt 사용 후 clamp.
                                    const raw = e.target.value;
                                    const parsed = raw === "" ? 0 : parseInt(raw, 10);
                                    const n = Math.max(0, Math.min(99, Number.isFinite(parsed) ? parsed : 0));
                                    const prevCap = {
                                      ...DEFAULT_SLOT_CAPACITY,
                                      ...(b.slot_capacity ?? {}),
                                    };
                                    updateLocalBranch(b.id, {
                                      slot_capacity: { ...prevCap, [s]: n },
                                    });
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : tab === "site-managers" ? (
            <SiteManagersView branches={allBranchNames} />
          ) : tab === "agent" ? (
            <AgentJobsView branches={allBranchNames} />
          ) : tab === "playground" ? (
            <PlaygroundView branches={allBranchNames} />
          ) : tab === "danggeun" ? (
            <DanggeunView mode="live" />
          ) : tab === "baemin" ? (
            <DanggeunView mode="baemin" />
          ) : tab === "danggeun-practice" ? (
            <DanggeunView mode="practice" />
          ) : tab === "klod" ? (
            <PromptExamplesView />
          ) : tab === "inbox" ? (
            <PendingInboxView />
          ) : tab === "contact" ? (
            <div className="content">
              <h2 className="page-title">배송원 컨택 <span className="count">{data.filter((a) => a.last_message_at || a.unread_count > 0).length}명</span></h2>
              <p className="page-desc">지원자와의 문자 대화를 관리합니다. 이름을 클릭하면 대화창이 열립니다.</p>

              <div className="filters">
                <select className="filter-select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  {["전체", ...allBranchNames].map((b) => <option key={b}>{b}</option>)}
                </select>
                <input className="filter-input" placeholder="이름 또는 전화번호 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              <div className="contact-list">
                {(() => {
                  const contactList = data
                    .filter((a) => {
                      if (branchFilter !== "전체" && a.branch !== branchFilter) return false;
                      if (search && !a.name.includes(search) && !a.phone.includes(search)) return false;
                      return true;
                    })
                    .sort((a, b) => {
                      // 안읽음 있는 사람 먼저
                      if ((b.unread_count || 0) !== (a.unread_count || 0)) return (b.unread_count || 0) - (a.unread_count || 0);
                      // 그 다음 최근 문자 순
                      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                      if (tb !== ta) return tb - ta;
                      // 문자 없는 사람은 지원일 순
                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    });

                  return contactList.length === 0 ? (
                    <div className="empty">해당하는 지원자가 없습니다.</div>
                  ) : (
                    contactList.map((a) => (
                      <div key={a.id} className={`contact-card ${a.unread_count > 0 ? "contact-unread" : ""}`} onClick={() => openChat(a)}>
                        <div className="contact-left">
                          <div className="contact-name-row">
                            <span className="contact-name">{a.name}</span>
                            <span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span>
                            {a.unread_count > 0 && <span className="unread-badge">{a.unread_count}</span>}
                          </div>
                          <div className="contact-meta">{a.phone} | {a.branch}</div>
                        </div>
                        <div className="contact-right">
                          {a.last_message_at ? (
                            <span className="contact-time">{new Date(a.last_message_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          ) : (
                            <span className="contact-time" style={{ color: "#d1d5db" }}>대화 없음</span>
                          )}
                        </div>
                      </div>
                    ))
                  );
                })()}
              </div>
            </div>
          ) : null}
          {/* 대화 패널 (카카오톡 스타일) */}
          {chatApplicant && (
            <div className="chat-overlay">
              <div className="chat-panel">
                <div className="chat-header">
                  <div>
                    <h3 className="chat-name">{chatApplicant.name}</h3>
                    <span className="chat-phone">{chatApplicant.phone}</span>
                  </div>
                  <button className="close-btn" onClick={closeChat}>✕</button>
                </div>

                <div className="chat-messages" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                  {chatLoading ? (
                    <div className="chat-loading">로딩 중...</div>
                  ) : messages.length === 0 ? (
                    <div className="chat-empty">대화 내역이 없습니다.</div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`chat-bubble-wrap ${msg.direction === "outbound" ? "bubble-right" : "bubble-left"}`}>
                        <div className={`chat-bubble ${msg.direction === "outbound" ? "bubble-out" : "bubble-in"}`}>
                          <p className="bubble-body">{msg.body}</p>
                          {msg.reasoning && (
                            <div className="bubble-reasoning">🤖 {msg.reasoning}</div>
                          )}
                          <div className="bubble-meta">
                            {msg.sent_by && <span>{msg.sent_by}</span>}
                            <span>{new Date(msg.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {draft && (
                  <div className={`ai-draft ${draft.status === "need_info" ? "ai-draft-warn" : ""}`}>
                    <div className="ai-draft-header">
                      <span className="ai-draft-label">
                        {draft.status === "need_info" ? "⚠️ AI 응대 불가" : "🤖 AI 제안"}
                      </span>
                      {draft.reasoning && (
                        <span className="ai-draft-reason">{draft.reasoning}</span>
                      )}
                    </div>
                    {draft.status === "need_info" ? (
                      <div className="ai-draft-body">
                        <p className="ai-draft-need">
                          모자란 정보: <strong>{draft.missing_info}</strong>
                        </p>
                        <p className="ai-draft-need-sub">슬랙으로 알림 보냄. 매니저가 직접 답변하세요.</p>
                        <div className="ai-draft-actions">
                          <button className="ai-draft-btn-secondary" onClick={ignoreDraft}>닫기</button>
                        </div>
                      </div>
                    ) : (
                      <div className="ai-draft-body">
                        <p className="ai-draft-text">{draft.draft_text}</p>
                        <div className="ai-draft-actions">
                          <button
                            className="ai-draft-btn-primary"
                            onClick={sendDraftDirect}
                            disabled={msgSending}
                          >
                            그대로 보내기
                          </button>
                          <button
                            className="ai-draft-btn-secondary"
                            onClick={useDraftAsInput}
                            disabled={msgSending}
                          >
                            수정해서 보내기
                          </button>
                          <button
                            className="ai-draft-btn-ghost"
                            onClick={ignoreDraft}
                            disabled={msgSending}
                          >
                            무시
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="chat-input-area">
                  <textarea
                    className="chat-input"
                    placeholder="메시지를 입력하세요..."
                    value={msgInput}
                    onChange={(e) => {
                      setMsgInput(e.target.value);
                      if (draft?.draft_text && e.target.value !== draft.draft_text) {
                        setDraftEdited(true);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={2}
                  />
                  <button
                    className={`chat-send-btn ${msgSending ? "sc-btn-loading" : ""}`}
                    onClick={sendMessage}
                    disabled={msgSending || !msgInput.trim()}
                  >
                    {msgSending ? "발송중" : "발송"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {modalMode && (
        <ApplicantFormModal
          mode={modalMode}
          initial={modalInitial}
          branches={allBranchNames}
          allBranches={allBranchNames}
          onClose={() => { setModalMode(null); setModalInitial(null); }}
          onSaved={() => { fetchData(); }}
        />
      )}
    </>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans KR', sans-serif; background: #f5f5f0; color: #1a1a1a; }

  .admin { display: flex; min-height: 100vh; }

  .sidebar {
    background: #1a1a1a; color: #fff;
    padding: 20px 12px; display: flex; flex-direction: column; gap: 2px;
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 10;
    transition: width 0.15s ease;
    overflow: hidden;
  }
  .sidebar-collapsed { width: 60px; padding: 20px 8px; }
  .sidebar-expanded { width: 220px; padding: 20px 12px; box-shadow: 4px 0 16px rgba(0,0,0,0.15); }

  .sidebar-logo { display: flex; align-items: center; gap: 10px; padding: 8px; margin-bottom: 20px; min-height: 36px; }
  .logo-sm-img {
    height: 28px; width: auto; max-width: 80px;
    object-fit: contain;
    background: #fff; border-radius: 6px; padding: 3px 6px;
    flex-shrink: 0;
  }
  .sidebar-title {
    font-size: 14px; font-weight: 700;
    white-space: nowrap;
    opacity: 0; transition: opacity 0.15s;
  }
  .sidebar-expanded .sidebar-title { opacity: 1; }

  .nav-group-label {
    font-size: 10px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 14px 12px 4px;
    white-space: nowrap;
    opacity: 0; transition: opacity 0.15s;
    height: 0; overflow: hidden;
  }
  .sidebar-expanded .nav-group-label { opacity: 1; height: auto; }

  .nav-group-toggle {
    background: transparent;
    border: none;
    padding: 12px 12px 4px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    opacity: 0;
    transition: opacity 0.15s;
    height: 0;
    overflow: hidden;
  }
  .sidebar-expanded .nav-group-toggle { opacity: 1; height: auto; }
  .nav-group-label-inline {
    font-size: 11px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }
  .nav-group-toggle:hover .nav-group-label-inline { color: #fff; }

  .nav-btn {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    border: none; background: none; color: #9ca3af; font-size: 13px;
    font-family: inherit; cursor: pointer; border-radius: 8px;
    transition: all 0.15s; width: 100%; text-align: left; font-weight: 500;
    white-space: nowrap;
  }
  .sidebar-collapsed .nav-btn { padding: 10px 8px; justify-content: center; }
  .sidebar-collapsed .nav-btn { gap: 0; }
  .nav-btn svg { flex-shrink: 0; }
  .nav-label {
    opacity: 0; transition: opacity 0.15s;
    overflow: hidden;
  }
  .sidebar-expanded .nav-label { opacity: 1; }
  .sidebar-collapsed .nav-label { width: 0; }

  .nav-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .nav-active { background: rgba(245,197,24,0.15); color: #F5C518; }
  .nav-active:hover { background: rgba(245,197,24,0.2); color: #F5C518; }
  .nav-pin { color: #6b7280; }
  .badge {
    background: #ef4444; color: #fff; font-size: 11px; font-weight: 700;
    padding: 1px 6px; border-radius: 10px; margin-left: auto;
  }
  .sidebar-collapsed .badge {
    position: absolute;
    margin-left: 0;
    transform: translate(8px, -12px);
    font-size: 9px;
    padding: 1px 4px;
  }
  .sidebar-footer { margin-top: auto; }

  .main { flex: 1; min-height: 100vh; transition: margin-left 0.15s ease; }
  .admin.pinned .main { margin-left: 220px; }
  .admin:not(.pinned) .main { margin-left: 60px; }
  .content { padding: 32px; max-width: 1200px; }
  .loading { padding: 100px; text-align: center; color: #9ca3af; font-size: 15px; }

  .page-title { font-size: 20px; font-weight: 700; margin-bottom: 24px; }
  .page-desc { font-size: 13px; color: #6b7280; margin: -16px 0 24px; }
  .count { font-size: 14px; font-weight: 500; color: #9ca3af; margin-left: 8px; }
  .applicants-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px;
  }
  .applicants-head .page-title { margin-bottom: 0; }
  .add-applicant-btn {
    background: #1F2937; color: #fff; border: none; padding: 8px 14px;
    border-radius: 6px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit;
  }
  .add-applicant-btn:hover { background: #111827; }

  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .stat-card {
    background: #fff; border-radius: 12px; padding: 20px;
    border: 1px solid #e8e8e0;
  }
  .stat-card.accent { border-left: 3px solid #2563eb; }
  .stat-card.warn { border-left: 3px solid #f59e0b; }
  .stat-card.success { border-left: 3px solid #10b981; }
  .stat-num { font-size: 28px; font-weight: 700; color: #1a1a1a; }
  .stat-label { font-size: 12px; color: #9ca3af; margin-top: 4px; font-weight: 500; }

  .section-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }

  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-select, .filter-input {
    padding: 8px 12px; border: 1.5px solid #e8e8e0; border-radius: 8px;
    font-size: 13px; font-family: inherit; background: #fff; outline: none;
  }
  .filter-select:focus, .filter-input:focus { border-color: #F5C518; }
  .filter-input { min-width: 200px; }

  .table-wrap { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #e8e8e0; }
  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th {
    text-align: left; padding: 12px 14px; font-weight: 600; font-size: 12px;
    color: #6b7280; border-bottom: 1px solid #e8e8e0; background: #fafaf7;
    white-space: nowrap;
  }
  .table td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
  .table tbody tr:last-child td { border-bottom: none; }
  .clickable { cursor: pointer; transition: background 0.1s; }
  .clickable:hover { background: #FFFBEB; }
  .row-selected { background: #FFFBEB; }
  .td-bold { font-weight: 600; }
  .td-warn { color: #f59e0b; font-weight: 700; }
  .td-muted { color: #9CA3AF; font-size: 11px; }

  .stage-pill {
    display: inline-block; padding: 2px 8px; border-radius: 6px;
    font-size: 11px; font-weight: 600; color: #374151; background: #F3F4F6;
    border: 1px solid #E5E7EB;
  }
  .status-badge {
    display: inline-block; padding: 2px 8px; border-radius: 6px;
    font-size: 11px; font-weight: 600; color: #fff;
  }
  /* 인라인 편집 (지점·시작가능일·상태) — 노션 스타일 */
  .inline-select, .inline-date {
    padding: 3px 6px; border: 1px solid transparent; border-radius: 4px;
    font-size: 12px; font-family: inherit; background: transparent;
    cursor: pointer; outline: none; color: inherit;
  }
  .inline-select:hover, .inline-date:hover {
    border-color: #E5E7EB; background: #FAFAF8;
  }
  .inline-select:focus, .inline-date:focus {
    border-color: #1F2937; background: #fff;
  }
  .inline-status {
    color: #fff; font-weight: 600; font-size: 11px;
    padding: 2px 8px; border-radius: 6px;
    -webkit-appearance: none; appearance: none;
    padding-right: 18px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='white' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 4px center;
  }
  .inline-status option { color: #111827; background: #fff; }
  .inline-branch { min-width: 80px; }
  .inline-date { width: 110px; }
  .dup-tag {
    display: inline-block; padding: 1px 5px; border-radius: 4px;
    font-size: 10px; font-weight: 600; color: #ef4444; background: #fef2f2;
    margin-left: 6px;
  }

  .detail-panel {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 20px; margin-top: 16px;
  }
  .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .detail-header h3 { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .close-btn {
    border: none; background: none; font-size: 16px; cursor: pointer;
    color: #9ca3af; font-weight: 700; padding: 4px 8px;
  }
  .detail-actions { display: flex; gap: 8px; align-items: center; }
  .save-btn {
    padding: 7px 16px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: #E6B800; }
  .save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cancel-btn {
    padding: 7px 14px; background: #fff; color: #6b7280;
    border: 1.5px solid #E8E8E0; border-radius: 8px; font-size: 13px; font-weight: 600;
    font-family: inherit; cursor: pointer; transition: background 0.15s;
  }
  .cancel-btn:hover:not(:disabled) { background: #f9fafb; }
  .cancel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .dirty-tag {
    background: #ef4444; color: #fff; font-size: 10px; font-weight: 700;
    padding: 2px 7px; border-radius: 10px; letter-spacing: 0.02em;
  }
  .edit-date { cursor: pointer; }
  .edit-date::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .dl { font-size: 11px; color: #9ca3af; display: block; margin-bottom: 2px; font-weight: 600; }
  .detail-section { margin-bottom: 12px; }
  .detail-text { font-size: 13px; line-height: 1.6; color: #374151; white-space: pre-wrap; }

  .empty { text-align: center; padding: 60px; color: #9ca3af; font-size: 14px; }

  /* 편집 가능 영역 */
  .edit-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px; padding: 16px; background: #FFFBEB; border: 1px solid #F5C518;
    border-radius: 10px; margin-bottom: 16px;
  }
  .edit-field { display: flex; flex-direction: column; gap: 6px; }
  .edit-field-wide { grid-column: 1 / -1; }
  .slot-toggle-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .slot-toggle {
    padding: 6px 12px; border: 1.5px solid #E8E8E0; border-radius: 99px;
    font-size: 12px; font-family: inherit; background: #fff; cursor: pointer; color: #6b7280;
  }
  .slot-toggle:hover { border-color: #9CA3AF; color: #111827; }
  .slot-toggle-on {
    background: #1F2937; color: #fff; border-color: #1F2937; font-weight: 600;
  }
  .slot-toggle-on:hover { color: #fff; }
  .edit-select {
    padding: 8px 10px; border: 1.5px solid #E8E8E0; border-radius: 8px;
    font-size: 13px; font-family: inherit; background: #fff; outline: none;
    transition: border-color 0.15s;
  }
  .edit-select:focus { border-color: #B8860B; }

  /* 슬롯 매트릭스 */
  .matrix-wrap { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #e8e8e0; margin-bottom: 20px; }
  .matrix {
    width: 100%; border-collapse: collapse; font-size: 13px;
    table-layout: fixed;
  }
  .matrix th {
    text-align: center; padding: 12px 8px; font-weight: 600; font-size: 12px;
    color: #6b7280; border-bottom: 1px solid #e8e8e0; background: #fafaf7;
    white-space: nowrap;
  }
  .matrix th:first-child { text-align: left; padding-left: 14px; width: 140px; }
  .matrix td {
    padding: 10px 8px; border-bottom: 1px solid #f3f4f6; text-align: center;
    vertical-align: middle;
  }
  .matrix td:first-child { text-align: left; padding-left: 14px; font-weight: 600; }
  .matrix-cell {
    cursor: pointer; font-weight: 700; transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .matrix-cell:hover { opacity: 0.8; transform: scale(0.98); }
  .cell-zero { color: #d1d5db; background: #fafafa; }
  .cell-some { color: #3d2b00; background: #fff8dc; }
  .cell-hot { color: #92400e; background: #fef3c7; }
  .cell-full { color: #064e3b; background: #d1fae5; }
  .cell-half { color: #1e3a8a; background: #dbeafe; }
  .cell-short { color: #991b1b; background: #fee2e2; }
  .cell-active { outline: 2px solid #F5C518; outline-offset: -2px; }
  .conf-main { font-size: 14px; font-weight: 700; }
  .conf-sub { font-size: 10px; font-weight: 500; opacity: 0.7; margin-top: 2px; }
  .td-total { font-weight: 700; color: #6b7280; background: #fafaf7; }
  .matrix-total-row td { border-top: 2px solid #e8e8e0; background: #fafaf7; }

  .matrix-legend {
    display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px;
    font-size: 12px; color: #6b7280; align-items: center;
  }
  .lg-dot {
    width: 12px; height: 12px; border-radius: 3px; display: inline-block;
    margin-right: 4px; vertical-align: middle;
  }
  .lg-full { background: #d1fae5; border: 1px solid #10b981; }
  .lg-half { background: #dbeafe; border: 1px solid #3b82f6; }
  .lg-short { background: #fee2e2; border: 1px solid #ef4444; }
  .lg-zero { background: #fafafa; border: 1px solid #d1d5db; }

  .slot-drill {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 16px; margin-top: 12px;
  }
  .slot-drill-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px;
  }
  .slot-drill-header h3 { font-size: 14px; font-weight: 700; }
  .td-slim { font-size: 11px; color: #6b7280; max-width: 280px; white-space: normal; }

  /* 추천 받기 */
  .rec-input-wrap { background: #fff; padding: 20px; border-radius: 12px; border: 1px solid #e8e8e0; margin-bottom: 20px; }
  .rec-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
  .rec-row { margin-top: 14px; }
  .rec-row .radio-group { display: flex; gap: 10px; max-width: 400px; }
  .rec-row .radio-btn {
    flex: 1; padding: 10px;
    border: 1.5px solid #E8E8E0; border-radius: 8px;
    font-size: 13px; font-weight: 500; font-family: inherit;
    color: #6b7280; background: #fff; cursor: pointer;
    transition: all 0.15s;
  }
  .rec-row .radio-on {
    border-color: #F5C518; background: #FFFBEB;
    color: #92650A; font-weight: 700;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }
  .rec-textarea {
    width: 100%; padding: 12px; border: 1.5px solid #e8e8e0; border-radius: 8px;
    font-family: inherit; font-size: 13px; line-height: 1.6; outline: none;
    resize: vertical;
  }
  .rec-textarea:focus { border-color: #F5C518; }
  .rec-input {
    width: 100%; padding: 10px 12px; border: 1.5px solid #e8e8e0; border-radius: 8px;
    font-family: inherit; font-size: 13px; outline: none; margin-top: 8px;
  }
  .rec-input:focus { border-color: #F5C518; }
  .rec-advanced { margin-top: 12px; }
  .rec-advanced summary { font-size: 12px; color: #6b7280; cursor: pointer; padding: 4px 0; }
  .rec-btn-primary {
    margin-top: 14px; padding: 10px 24px;
    background: #F5C518; color: #3D2B00; border: none; border-radius: 8px;
    font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer;
    transition: background 0.15s;
  }
  .rec-btn-primary:hover:not(:disabled) { background: #E6B800; }
  .rec-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .rec-btn-secondary {
    padding: 7px 14px; background: #fff; color: #374151;
    border: 1.5px solid #E8E8E0; border-radius: 8px;
    font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer;
  }
  .rec-btn-secondary:hover { background: #f9fafb; }
  .rec-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

  .rec-generate {
    margin-bottom: 16px; padding: 12px 14px;
    background: #FAF7F0; border: 1px dashed #E8DDB8; border-radius: 10px;
  }
  .rec-generate summary {
    font-size: 13px; font-weight: 600; color: #3D2B00;
    cursor: pointer; padding: 2px 0; outline: none;
  }
  .rec-generate-body { margin-top: 10px; }
  .rec-gen-btn { margin-top: 10px; }
  .rec-gen-missing {
    margin-top: 10px; padding: 8px 10px;
    background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 6px;
    font-size: 12px; color: #78350F; line-height: 1.6;
  }
  .rec-gen-missing code {
    background: #fff; padding: 1px 5px; border-radius: 3px; font-size: 11px;
  }
  .rec-missing-chip {
    display: inline-block; margin: 2px 4px 2px 0; padding: 1px 8px;
    background: #fff; border: 1px solid #FCD34D; border-radius: 10px;
    font-size: 11px; color: #78350F; font-weight: 600;
  }

  .branch-add-row {
    display: flex; gap: 8px; margin-bottom: 12px; max-width: 520px;
  }
  .branch-add-row .filter-input { flex: 1; margin: 0; }
  .branch-add-row .rec-btn-secondary { padding: 10px 18px; white-space: nowrap; }
  .branch-name-input {
    padding: 6px 10px; border: 1px solid #e8e8e0; border-radius: 6px;
    font-family: inherit; font-size: 13px; outline: none; background: #fff;
    width: 100%; max-width: 240px; font-weight: 600;
  }
  .branch-name-input:focus { border-color: #F5C518; }
  .branch-name-input:disabled { background: #f9fafb; }

  .branch-save-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; margin-bottom: 12px;
    background: #fff; border: 1px solid #e8e8e0; border-radius: 8px;
    position: sticky; top: 0; z-index: 5;
  }
  .branch-dirty-msg { font-size: 13px; font-weight: 600; color: #92650A; }
  .branch-clean-msg { font-size: 13px; color: #9ca3af; }
  .branch-save-actions { display: flex; gap: 8px; }

  .branch-table tr.branch-row { cursor: grab; transition: background 0.12s; }
  .branch-table tr.branch-row:active { cursor: grabbing; }
  .branch-table tr.drag-ghost { background: #FFFBEB; }
  .branch-table tr.drag-over { box-shadow: inset 0 2px 0 #F5C518; }
  .branch-drag-handle {
    color: #9ca3af; font-size: 14px; letter-spacing: -2px; user-select: none;
    cursor: grab; width: 32px; text-align: center;
  }

  .slot-capacity-card {
    margin-top: 24px;
    padding: 20px;
    background: #fff;
    border: 1px solid #e8e8e0;
    border-radius: 12px;
  }
  .slot-capacity-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; color: #111827; }
  .slot-cap-input {
    width: 64px;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
    text-align: center;
    color: #111827;
    background: #fff;
  }
  .slot-cap-input:focus {
    outline: none;
    border-color: #F5C518;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }

  .toggle {
    position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer;
  }
  .toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-slider {
    position: absolute; inset: 0; background: #d1d5db; border-radius: 22px;
    transition: background 0.15s;
  }
  .toggle-slider::before {
    content: ""; position: absolute; left: 3px; top: 3px;
    width: 16px; height: 16px; background: #fff; border-radius: 50%;
    transition: transform 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }
  .toggle input:checked + .toggle-slider { background: #10b981; }
  .toggle input:checked + .toggle-slider::before { transform: translateX(18px); }
  .toggle input:disabled + .toggle-slider { opacity: 0.5; cursor: not-allowed; }

  .rec-result { margin-top: 12px; }
  .rec-job-info {
    background: #FFFBEB; padding: 14px 16px; border-radius: 10px; border: 1px solid #F5C518;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px 16px;
    margin-bottom: 16px; font-size: 13px;
  }
  .rec-actions {
    display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;
  }
  .rec-count { font-size: 13px; color: #6b7280; margin-left: auto; }
  .rec-score-total { color: #B8860B; font-size: 15px; }
  .source-badge {
    display: inline-block; padding: 1px 6px; border-radius: 4px;
    font-size: 10px; font-weight: 700;
  }
  .src-active { background: #dbeafe; color: #1e3a8a; }
  .src-legacy { background: #f3f4f6; color: #6b7280; }
  .td-meta { font-size: 11px; color: #9ca3af; }

  .rec-preview-inline {
    margin-top: 24px; background: #fff; padding: 20px; border-radius: 12px;
    border: 1px solid #e8e8e0;
  }
  .rec-preview-inline .section-title { margin-bottom: 12px; }
  .rec-preview-meta {
    font-size: 12px; color: #ef4444; background: #fef2f2; padding: 8px 12px;
    border-radius: 6px; margin-bottom: 14px; font-weight: 500;
  }
  .rec-message-preview {
    background: #FFFBEB; border: 1px solid #F5C518; border-radius: 10px;
    padding: 14px 16px; font-size: 13px; line-height: 1.7;
    white-space: pre-wrap; margin-bottom: 16px; max-height: 240px; overflow-y: auto;
    color: #374151;
  }
  .rec-recipients-preview { font-size: 13px; margin-bottom: 16px; }
  .rec-recipients-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .rec-recipient-chip {
    display: inline-block; padding: 3px 10px;
    background: #f3f4f6; border-radius: 12px; font-size: 12px; color: #374151;
  }
  .rec-empty-recipients {
    font-size: 13px; color: #9ca3af; padding: 12px; background: #fafafa;
    border-radius: 8px; margin-bottom: 16px; text-align: center;
  }
  .rec-send-btn {
    margin-top: 0; width: 100%; padding: 14px;
    font-size: 14px;
  }

  .screening-list { display: flex; flex-direction: column; gap: 12px; }
  .screening-card {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 18px; transition: box-shadow 0.15s;
  }
  .screening-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  .sc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .sc-name { font-size: 15px; font-weight: 700; }
  .sc-info { font-size: 12px; color: #6b7280; margin-top: 2px; }
  .sc-details { font-size: 12px; color: #9ca3af; margin-bottom: 6px; display: flex; gap: 16px; }
  .sc-intro { font-size: 12px; color: #6b7280; line-height: 1.5; }
  .sc-btn {
    padding: 8px 16px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: background 0.15s;
  }
  .sc-btn:hover { background: #E6B800; }
  .sc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .sc-btn-loading { background: #d4a50e; }

  .row-action-btn {
    padding: 5px 10px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 6px; font-size: 11px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: background 0.15s;
  }
  .row-action-btn:hover:not(:disabled) { background: #E6B800; }
  .row-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .row-action-loading { background: #d4a50e; }

  /* 전용 폰 상태 바 */
  .phone-bar {
    display: flex; align-items: center; gap: 10px; padding: 8px 20px;
    font-size: 12px; border-bottom: 1px solid #e8e8e0;
  }
  .phone-online { background: #f0fdf4; }
  .phone-offline { background: #fef2f2; }
  .phone-dot {
    width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;
  }
  .dot-green { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
  .dot-red { background: #ef4444; animation: blink 1s infinite; }
  @keyframes blink { 50% { opacity: 0.4; } }
  .phone-label { font-weight: 600; }
  .phone-info { color: #6b7280; }
  .phone-warn { color: #ef4444; font-weight: 700; margin-left: auto; }

  /* 컨택 리스트 */
  .contact-list { display: flex; flex-direction: column; gap: 8px; }
  .contact-card {
    display: flex; justify-content: space-between; align-items: center;
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 16px 20px; cursor: pointer; transition: all 0.15s;
  }
  .contact-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); border-color: #F5C518; }
  .contact-unread { border-left: 3px solid #ef4444; background: #fffbfb; }
  .contact-left { flex: 1; }
  .contact-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .contact-name { font-size: 15px; font-weight: 700; }
  .contact-meta { font-size: 12px; color: #6b7280; }
  .contact-right { text-align: right; flex-shrink: 0; margin-left: 16px; }
  .contact-time { font-size: 12px; color: #9ca3af; }

  /* 이름 링크 */
  .name-link { cursor: pointer; color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
  .name-link:hover { color: #1d4ed8; }

  /* 안읽음 배지 */
  .unread-badge {
    display: inline-block; background: #ef4444; color: #fff;
    font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px;
  }

  /* 대화 패널 오버레이 */
  .chat-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4); z-index: 100;
    display: flex; align-items: center; justify-content: center;
  }
  .chat-panel {
    width: 440px; max-width: 95vw; height: 80vh; background: #fff;
    border-radius: 16px; display: flex; flex-direction: column;
    overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.2);
  }
  .chat-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid #e8e8e0; background: #fafaf7;
  }
  .chat-name { font-size: 16px; font-weight: 700; }
  .chat-phone { font-size: 12px; color: #6b7280; }

  .chat-messages {
    flex: 1; overflow-y: auto; padding: 16px; background: #e8e4d9;
    display: flex; flex-direction: column; gap: 8px;
  }
  .chat-loading, .chat-empty {
    text-align: center; color: #9ca3af; padding: 40px; font-size: 13px;
  }

  .chat-bubble-wrap { display: flex; }
  .bubble-left { justify-content: flex-start; }
  .bubble-right { justify-content: flex-end; }
  .chat-bubble {
    max-width: 75%; padding: 10px 14px; border-radius: 16px;
    font-size: 13px; line-height: 1.5; word-break: break-word;
  }
  .bubble-in {
    background: #fff; color: #1a1a1a;
    border-top-left-radius: 4px;
  }
  .bubble-out {
    background: #F5C518; color: #3D2B00;
    border-top-right-radius: 4px;
  }
  .bubble-body { margin: 0; white-space: pre-wrap; }
  .bubble-reasoning {
    font-size: 11px;
    color: #6b7280;
    background: rgba(255,255,255,0.7);
    border-left: 2px solid rgba(0,0,0,0.15);
    padding: 4px 8px;
    margin-top: 6px;
    border-radius: 0 4px 4px 0;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .bubble-in .bubble-reasoning { background: #F9FAFB; }
  .bubble-meta {
    display: flex; gap: 8px; justify-content: flex-end;
    font-size: 10px; color: rgba(0,0,0,0.4); margin-top: 4px;
  }

  .agent-test-grid {
    display: grid; grid-template-columns: 280px 1fr; gap: 16px;
    height: calc(100vh - 200px); min-height: 500px;
  }
  @media (max-width: 900px) {
    .agent-test-grid { grid-template-columns: 1fr; height: auto; }
  }
  .agent-input-col, .agent-output-col {
    background: #fff; padding: 16px; border-radius: 12px; border: 1px solid #e8e8e0;
  }
  .agent-section { margin-bottom: 14px; }
  .agent-radio-row { display: flex; gap: 8px; margin-bottom: 10px; }
  .agent-radio-row .radio-btn {
    flex: 1; padding: 8px;
    border: 1.5px solid #E8E8E0; border-radius: 8px;
    font-size: 12px; font-weight: 500; font-family: inherit;
    color: #6b7280; background: #fff; cursor: pointer;
  }
  .agent-radio-row .radio-on {
    border-color: #F5C518; background: #FFFBEB;
    color: #92650A; font-weight: 700;
  }
  .agent-manual-fields { display: flex; flex-direction: column; gap: 6px; }
  .agent-manual-fields .rec-input { margin-top: 0; }
  .agent-applicant-picker .rec-input { margin-top: 0; }
  .agent-checkbox {
    display: flex; align-items: center; gap: 6px;
    margin-top: 10px; font-size: 12px; color: #4b5563; cursor: pointer;
  }
  .agent-stats {
    background: #f9fafb; padding: 10px; border-radius: 8px;
  }
  .agent-stat-row {
    display: flex; justify-content: space-between;
    font-size: 12px; padding: 3px 0; color: #4b5563;
  }
  .agent-stat-row strong { color: #111827; }

  .agent-empty {
    padding: 40px 20px; text-align: center; color: #9ca3af;
    font-size: 13px; line-height: 1.7;
  }

  .agent-chat-col {
    display: flex; flex-direction: column; padding: 0; overflow: hidden;
  }
  .agent-chat-area {
    flex: 1; overflow-y: auto; padding: 16px;
    background: #FAFAF7;
  }
  .agent-chat-list {
    display: flex; flex-direction: column; gap: 10px;
  }
  .agent-turn {
    background: #fff; border-radius: 10px; padding: 10px 12px;
    border: 1px solid #e8e8e0; max-width: 78%;
  }
  .agent-turn-in {
    align-self: flex-start; background: #fff; border-color: #e8e8e0;
  }
  .agent-turn-out {
    align-self: flex-end; background: #FFFBEB; border-color: #FCD34D;
  }
  .agent-turn-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; color: #6b7280;
    margin-bottom: 4px;
  }
  .agent-turn-out .agent-turn-label { color: #92650A; }
  .agent-need-badge {
    background: #FEE2E2; color: #991B1B; padding: 1px 6px;
    border-radius: 10px; font-size: 10px; font-weight: 700;
  }
  .agent-turn-del {
    margin-left: auto; padding: 0 4px; background: transparent;
    border: none; color: #9ca3af; cursor: pointer; font-size: 12px;
  }
  .agent-turn-del:hover { color: #ef4444; }
  .agent-turn-body {
    width: 100%; border: none; padding: 4px 0; background: transparent;
    font-family: inherit; font-size: 13px; line-height: 1.55;
    resize: none; outline: none; color: #111827;
  }
  .agent-turn-reason {
    margin-top: 6px; padding: 6px 8px;
    background: rgba(0,0,0,0.04); border-radius: 6px;
    font-size: 11px; color: #6b7280; line-height: 1.5;
  }
  .agent-typing {
    color: #9ca3af; font-size: 13px; padding: 4px 0;
  }
  .agent-input-row {
    display: flex; gap: 8px; padding: 12px;
    border-top: 1px solid #e8e8e0; background: #fff;
  }
  .agent-input-row .rec-textarea { flex: 1; margin: 0; }
  .agent-send-btn {
    margin-top: 0 !important; padding: 0 20px; min-width: 70px;
  }

  .ai-draft {
    margin: 0 16px 0;
    padding: 10px 12px;
    background: #F0F9FF;
    border: 1px solid #BAE6FD;
    border-radius: 10px 10px 0 0;
    border-bottom: none;
    font-size: 13px;
  }
  .ai-draft-warn {
    background: #FEF3C7; border-color: #FCD34D;
  }
  .ai-draft-header {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 6px;
  }
  .ai-draft-label { font-weight: 700; color: #075985; font-size: 12px; }
  .ai-draft-warn .ai-draft-label { color: #78350F; }
  .ai-draft-reason {
    font-size: 11px; color: #6b7280; flex: 1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ai-draft-text {
    margin: 0 0 8px; padding: 8px 10px;
    background: #fff; border-radius: 6px;
    line-height: 1.55; white-space: pre-wrap; word-break: break-word;
  }
  .ai-draft-need { margin: 0 0 4px; font-size: 13px; color: #78350F; }
  .ai-draft-need-sub { margin: 0 0 8px; font-size: 12px; color: #92400e; }
  .ai-draft-actions { display: flex; gap: 6px; }
  .ai-draft-btn-primary {
    padding: 6px 12px; background: #0EA5E9; color: #fff;
    border: none; border-radius: 6px; font-size: 12px; font-weight: 700;
    cursor: pointer; font-family: inherit;
  }
  .ai-draft-btn-primary:hover:not(:disabled) { background: #0284C7; }
  .ai-draft-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ai-draft-btn-secondary {
    padding: 6px 12px; background: #fff; color: #075985;
    border: 1px solid #BAE6FD; border-radius: 6px;
    font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  }
  .ai-draft-btn-secondary:hover:not(:disabled) { background: #f9fafb; }
  .ai-draft-btn-ghost {
    padding: 6px 12px; background: transparent; color: #6b7280;
    border: none; font-size: 12px; cursor: pointer; font-family: inherit;
  }
  .ai-draft-btn-ghost:hover { color: #374151; }

  .chat-input-area {
    display: flex; gap: 8px; padding: 12px 16px;
    border-top: 1px solid #e8e8e0; background: #fff;
  }
  .chat-input {
    flex: 1; border: 1.5px solid #e8e8e0; border-radius: 10px;
    padding: 10px 12px; font-size: 13px; font-family: inherit;
    resize: none; outline: none;
  }
  .chat-input:focus { border-color: #F5C518; }
  .chat-send-btn {
    padding: 10px 20px; background: #F5C518; color: #3D2B00;
    border: none; border-radius: 10px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    align-self: flex-end;
  }
  .chat-send-btn:hover { background: #E6B800; }
  .chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 768px) {
    /* 좁은 화면은 자동으로 collapsed 형태 강제 (핀 무시) */
    .admin.pinned .sidebar { width: 60px; padding: 20px 8px; box-shadow: none; }
    .admin.pinned .sidebar .sidebar-title,
    .admin.pinned .sidebar .nav-label,
    .admin.pinned .sidebar .nav-group-label { opacity: 0; width: 0; height: 0; }
    .admin.pinned .sidebar .nav-btn { padding: 10px 8px; justify-content: center; gap: 0; }
    .admin.pinned .main { margin-left: 60px; }
    .content { padding: 16px; }
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
    .detail-grid { grid-template-columns: 1fr; }
  }
`;
