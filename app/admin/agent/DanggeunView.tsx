"use client";

/**
 * 당근마켓구인 — source='danggeun' 후보 관리 + 실 발송/저장.
 *
 * 상단 툴바: 시작 멘트 설정 / 새 당근 후보 / 새로고침
 * 메인: 좌(후보 목록) + 우(대화창)
 * 모달: 시작 멘트 편집, 새 후보 등록
 *
 * Realtime: applicants(source='danggeun') / messages / job_candidates 구독.
 * 시작 멘트는 매니저 브라우저 localStorage(다른 PC/브라우저에는 적용 안 됨).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { SCREENING_KEYS, ONBOARDING_KEYS } from "./types";

interface DanggeunViewProps {
  branches: string[];
  mode?: "live" | "practice";
}

interface ModeConfig {
  source: string;
  storageKey: string;
  startApi: string;
  title: string;
  emoji: string;
  helpLine: string;
  newCandidateLabel: string;
  newCandidateNote: string;
  replyPlaceholder: string;
  sendButtonLabel: string;
  practice: boolean;
}

const MODE_CONFIG: Record<"live" | "practice", ModeConfig> = {
  live: {
    source: "danggeun",
    storageKey: "danggeun_start_message_v1",
    startApi: "/api/admin/agent/danggeun/start",
    title: "당근 후보",
    emoji: "🥕",
    helpLine: "당근 유입 후보 — 실 SMS 발송 / Realtime",
    newCandidateLabel: "+ 새 당근 후보",
    newCandidateNote: "등록과 동시에 저장된 시작 멘트가 실제로 발송됩니다.",
    replyPlaceholder: "매니저 답장을 직접 작성하면 즉시 실 발송됩니다",
    sendButtonLabel: "보내기",
    practice: false,
  },
  practice: {
    source: "danggeun_practice",
    storageKey: "danggeun_practice_start_message_v1",
    startApi: "/api/admin/agent/danggeun-practice/start",
    title: "연습 후보",
    emoji: "🧪",
    helpLine: "연습 모드 — 실 SMS 발송 X. 입력은 지원자 빙의 (AI 자동 응답)",
    newCandidateLabel: "+ 새 연습 후보",
    newCandidateNote: "실 SMS 발송 X. 시작 멘트는 DB에 기록만 됩니다.",
    replyPlaceholder: "지원자가 보낸 문자처럼 입력 → AI가 자동 응답합니다",
    sendButtonLabel: "지원자로 보내기",
    practice: true,
  },
};

interface Candidate {
  id: number;
  name: string;
  phone: string;
  branch: string | null;
  status: string | null;
  created_at: string;
  last_message_at: string | null;
  unread_count: number;
  agent_stage: string | null;
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


const STAGE_LABEL: Record<string, string> = {
  exploration: "탐색",
  screening: "스크리닝",
  onboarding: "온보딩",
  active: "근무중",
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

const STAGE_FLOW = ["exploration", "screening", "onboarding", "active"] as const;
type FlowStage = (typeof STAGE_FLOW)[number];

function StageProgress({ stage }: { stage: string | null }) {
  // paused / abort는 별도 표시
  const isPaused = stage === "paused";
  const isAbort = stage === "abort";
  const currentIdx = STAGE_FLOW.indexOf(stage as FlowStage);

  return (
    <div className="dg-progress">
      {STAGE_FLOW.map((s, i) => {
        const done = currentIdx > i;
        const current = currentIdx === i;
        return (
          <div key={s} className="dg-progress-step">
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

export default function DanggeunView({ branches, mode = "live" }: DanggeunViewProps) {
  const cfg = MODE_CONFIG[mode];
  const STORAGE_KEY = cfg.storageKey;
  // ── 시작 멘트 ──────────────────────────────────────────
  const [startMsg, setStartMsg] = useState("");
  const [startMsgDraft, setStartMsgDraft] = useState("");
  const [startMsgSaving, setStartMsgSaving] = useState(false);
  const [startMsgLoaded, setStartMsgLoaded] = useState(false);

  // ── 새 후보 폼 ──────────────────────────────────────────
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBranch, setNewBranch] = useState(branches[0] ?? "");
  const [submitting, setSubmitting] = useState(false);

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
  const [agentStage, setAgentStage] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── 모달 ──────────────────────────────────────────────
  const [showStartMsgModal, setShowStartMsgModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  // ── 초기 로드 ─────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? "";
      setStartMsg(saved);
      setStartMsgDraft(saved);
    } catch {
      // localStorage 비활성 환경
    }
    setStartMsgLoaded(true);
  }, []);

  const fetchCandidates = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/admin/applicants?source=${cfg.source}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setCandidates(Array.isArray(json.data) ? json.data : []);
      }
    } catch (e) {
      console.error("[danggeun list error]", e);
    } finally {
      setListLoading(false);
    }
  }, [cfg.source]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  useEffect(() => {
    if (!newBranch && branches.length > 0) setNewBranch(branches[0]);
  }, [branches, newBranch]);

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
        () => {
          fetchCandidates();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCandidates, cfg.source]);

  // ── 대화창 로드 ────────────────────────────────────────
  const fetchMessages = useCallback(async (id: number) => {
    setMsgLoading(true);
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
      setMsgLoading(false);
    }
  }, []);

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
  const handleSaveStartMsg = () => {
    if (!startMsgDraft.trim()) {
      alert("시작 멘트를 입력해주세요.");
      return;
    }
    setStartMsgSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, startMsgDraft);
      setStartMsg(startMsgDraft);
      alert("시작 멘트가 저장되었습니다. (이 브라우저 기준)");
      setShowStartMsgModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setStartMsgSaving(false);
    }
  };

  const handleStart = async () => {
    if (!newName.trim() || !newPhone.trim() || !newBranch) {
      alert("이름, 전화번호, 지점은 필수입니다.");
      return;
    }
    if (!startMsg.trim()) {
      alert("시작 멘트를 먼저 저장해주세요.");
      return;
    }
    const confirmMsg = cfg.practice
      ? `${newName}(${newPhone})을 연습용 후보로 등록합니다. (실 SMS 발송 X) 진행할까요?`
      : `${newName}(${newPhone})에게 시작 멘트를 실제로 발송합니다. 진행할까요?`;
    if (!confirm(confirmMsg)) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(cfg.startApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.replace(/-/g, ""),
          branch1: newBranch,
          startMessage: startMsg,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "등록 실패");
        return;
      }
      setNewName("");
      setNewPhone("");
      setShowNewModal(false);
      await fetchCandidates();
      if (json.applicant?.id) setSelectedId(json.applicant.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async () => {
    if (!outbound.trim() || selectedId == null) return;
    const selected = candidates.find((c) => c.id === selectedId);
    if (!selected) return;
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
      await fetchMessages(selectedId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "발송 실패");
    } finally {
      setSending(false);
    }
  };

  // ── 파생 ───────────────────────────────────────────────
  const filteredCandidates = useMemo(() => {
    const q = search.trim();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.name.includes(q) || c.phone.includes(q.replace(/-/g, ""))
    );
  }, [candidates, search]);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId]
  );

  const startMsgDirty = startMsgDraft !== startMsg;

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
          <button
            className={`dg-btn ${startMsg ? "dg-btn-ghost-bordered" : "dg-btn-warn"}`}
            onClick={() => setShowStartMsgModal(true)}
          >
            {startMsg ? "시작 멘트 ✓" : "시작 멘트 설정 필요"}
          </button>
          <button className="dg-btn dg-btn-primary" onClick={() => setShowNewModal(true)}>
            {cfg.newCandidateLabel}
          </button>
          <button className="dg-btn-ghost" onClick={fetchCandidates} disabled={listLoading}>
            {listLoading ? "..." : "새로고침"}
          </button>
        </div>
      </div>

      {/* 본문: 좌(목록) + 우(대화) */}
      <div className="dg-body">
        <aside className="dg-list-pane">
          <input
            className="dg-input dg-search"
            placeholder="이름 / 전화번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="dg-list">
            {listLoading ? (
              <div className="dg-empty">로딩 중...</div>
            ) : filteredCandidates.length === 0 ? (
              <div className="dg-empty">
                {candidates.length === 0
                  ? "아직 등록된 당근 후보가 없습니다. 우측 상단 '+ 새 당근 후보'로 시작하세요."
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
              <p>좌측에서 후보를 선택하거나 우측 상단 '+ 새 당근 후보'로 등록하세요.</p>
            </div>
          ) : (
            <>
              <header className="dg-conv-head">
                <div>
                  <div className="dg-conv-name">
                    {selectedCandidate.name}
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
                    {selectedCandidate.status ?? "-"}
                  </div>
                </div>
                <button
                  className="dg-btn-ghost"
                  onClick={() => selectedId != null && fetchMessages(selectedId)}
                >
                  새로고침
                </button>
              </header>

              <StageProgress stage={agentStage} />

              {(agentStage === "screening" || agentStage === "onboarding") && (
                <div className="dg-checklist">
                  <div className="dg-checklist-title">
                    {agentStage === "screening" ? "스크리닝 체크리스트" : "온보딩 체크리스트"}
                    {(() => {
                      const keys = agentStage === "screening" ? SCREENING_KEYS : ONBOARDING_KEYS;
                      const cl = (agentStage === "screening"
                        ? agentState.screening
                        : agentState.onboarding) ?? {};
                      const done = keys.filter((k) => cl[k] === true).length;
                      return (
                        <span className="dg-checklist-count">
                          {done} / {keys.length}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="dg-checklist-items">
                    {(agentStage === "screening" ? SCREENING_KEYS : ONBOARDING_KEYS).map((k) => {
                      const cl = (agentStage === "screening"
                        ? agentState.screening
                        : agentState.onboarding) ?? {};
                      const done = cl[k] === true;
                      return (
                        <span key={k} className={`dg-checklist-item ${done ? "dg-chk-done" : ""}`}>
                          {done ? "✓" : "·"} {k.replace(/_/g, " ")}
                        </span>
                      );
                    })}
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
                          🤖 {m.reasoning}
                        </div>
                      )}
                      <div className="dg-msg-meta">
                        {m.direction === "outbound" && m.sent_by ? `${m.sent_by} · ` : ""}
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

      {/* 모달: 시작 멘트 */}
      {showStartMsgModal && (
        <div className="dg-modal-bg" onClick={() => !startMsgSaving && setShowStartMsgModal(false)}>
          <div className="dg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dg-modal-head">
              <h3 className="dg-modal-title">당근 시작 멘트</h3>
              <button className="dg-btn-ghost" onClick={() => setShowStartMsgModal(false)}>
                ×
              </button>
            </div>
            <p className="dg-modal-desc">
              새 당근 후보 등록 시 자동으로 발송되는 첫 메시지. 이 브라우저에만 저장됩니다.
            </p>
            <textarea
              className="dg-textarea"
              rows={8}
              placeholder="예) 안녕하세요. 당근에서 연락드린 옹고잉 매니저입니다..."
              value={startMsgDraft}
              onChange={(e) => setStartMsgDraft(e.target.value)}
              disabled={!startMsgLoaded}
            />
            <div className="dg-modal-actions">
              <button
                className="dg-btn dg-btn-ghost-bordered"
                onClick={() => {
                  setStartMsgDraft(startMsg);
                  setShowStartMsgModal(false);
                }}
                disabled={startMsgSaving}
              >
                취소
              </button>
              <button
                className="dg-btn dg-btn-primary"
                onClick={handleSaveStartMsg}
                disabled={startMsgSaving || !startMsgDirty}
              >
                {startMsgSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모달: 새 후보 등록 */}
      {showNewModal && (
        <div className="dg-modal-bg" onClick={() => !submitting && setShowNewModal(false)}>
          <div className="dg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dg-modal-head">
              <h3 className="dg-modal-title">새 당근 후보 등록</h3>
              <button className="dg-btn-ghost" onClick={() => setShowNewModal(false)}>
                ×
              </button>
            </div>
            <p className="dg-modal-desc">{cfg.newCandidateNote}</p>
            {!startMsg && (
              <div className="dg-warn">
                ⚠ 시작 멘트가 아직 저장되지 않았습니다. 먼저 우측 상단에서 시작 멘트를 설정해주세요.
              </div>
            )}
            <div className="dg-field">
              <label className="dg-label">이름</label>
              <input
                className="dg-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="홍길동"
              />
            </div>
            <div className="dg-field">
              <label className="dg-label">전화번호</label>
              <input
                className="dg-input"
                value={newPhone}
                onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
              />
            </div>
            <div className="dg-field">
              <label className="dg-label">희망 지점</label>
              <select
                className="dg-input"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
              >
                {branches.length === 0 && <option value="">지점 로딩 중...</option>}
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="dg-modal-actions">
              <button
                className="dg-btn dg-btn-ghost-bordered"
                onClick={() => setShowNewModal(false)}
                disabled={submitting}
              >
                취소
              </button>
              <button
                className="dg-btn dg-btn-primary"
                onClick={handleStart}
                disabled={submitting || !startMsg}
              >
                {submitting ? "발송 중..." : "대화 시작 (실 발송)"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  .dg-search { flex: 0 0 auto; }
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
  .dg-list-meta { font-size: 11px; color: #6b7280; display: flex; gap: 4px; align-items: center; }
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
    color: #6b7280;
    background: #F9FAFB;
    border-left: 2px solid #D1D5DB;
    padding: 4px 8px;
    margin-top: 4px;
    border-radius: 0 4px 4px 0;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 100%;
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
  .dg-progress-step:last-child { flex: 0; }
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
`;
