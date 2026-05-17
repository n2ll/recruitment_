"use client";

/**
 * 당근전용 — source='danggeun' 후보 관리 + 실 발송/저장.
 *
 * 좌측 상단: 매니저가 저장하는 고정 시작 멘트 1개 (브라우저 localStorage)
 * 좌측 중단: 새 후보 수동 등록 → INSERT applicants(source='danggeun') + 시작 멘트 실 발송
 * 좌측 하단: 기존 source='danggeun' 후보 리스트
 * 우측: 선택된 후보와의 실 대화창 (DB 메시지 읽기 + SOLAPI 발송)
 *
 * 시작 멘트는 매니저 브라우저별로 저장 — 다른 PC/브라우저에서는 다시 입력해야 함.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface DanggeunViewProps {
  branches: string[];
}

interface Candidate {
  id: number;
  name: string;
  phone: string;
  branch: string | null;
  status: string | null;
  created_at: string;
  last_message_at: string | null;
  unread_count: number;
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
}

const STORAGE_KEY = "danggeun_start_message_v1";

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

export default function DanggeunView({ branches }: DanggeunViewProps) {
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [outbound, setOutbound] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── 초기 로드 (localStorage) ──────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? "";
      setStartMsg(saved);
      setStartMsgDraft(saved);
    } catch {
      // localStorage 비활성 환경 대비
    }
    setStartMsgLoaded(true);
  }, []);

  const fetchCandidates = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/admin/applicants?source=danggeun", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setCandidates(Array.isArray(json.data) ? json.data : []);
      }
    } catch (e) {
      console.error("[danggeun list error]", e);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // 지점 옵션이 비동기로 들어올 수 있어 첫 항목으로 초기화
  useEffect(() => {
    if (!newBranch && branches.length > 0) setNewBranch(branches[0]);
  }, [branches, newBranch]);

  // ── 대화창 로드 ────────────────────────────────────────
  const fetchMessages = useCallback(async (id: number) => {
    setMsgLoading(true);
    try {
      const res = await fetch(`/api/admin/messages/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setMessages(Array.isArray(json.messages) ? json.messages : []);
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
    if (!confirm(`${newName}(${newPhone})에게 시작 멘트를 실제로 발송합니다. 진행할까요?`)) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/agent/danggeun/start", {
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
        if (res.status === 409 && json.existing) {
          alert(`이미 등록된 전화번호입니다 (${json.existing.name}).`);
        } else {
          alert(json.error || "등록 실패");
        }
        return;
      }
      setNewName("");
      setNewPhone("");
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
      const res = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_id: selectedId,
          phone: selected.phone,
          body: outbound,
          sent_by: "danggeun-manual",
        }),
      });
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
    <div className="content" style={{ display: "flex", gap: 16, height: "calc(100vh - 120px)", padding: 0 }}>
      <style>{css}</style>

      {/* 좌측 패널 */}
      <aside className="dg-left">
        <section className="dg-card">
          <div className="dg-card-head">
            <h3 className="dg-card-title">당근 시작 멘트</h3>
            {startMsgDirty && <span className="dg-pill dg-pill-warn">미저장</span>}
          </div>
          <p className="dg-card-desc">
            새 당근 후보 등록 시 자동으로 발송되는 첫 메시지. 이 브라우저에만 저장됩니다.
          </p>
          <textarea
            className="dg-textarea"
            rows={5}
            placeholder="예) 안녕하세요. 당근에서 연락드린 옹고잉 매니저입니다..."
            value={startMsgDraft}
            onChange={(e) => setStartMsgDraft(e.target.value)}
            disabled={!startMsgLoaded}
          />
          <div className="dg-row-end">
            <button
              className="dg-btn dg-btn-primary"
              onClick={handleSaveStartMsg}
              disabled={startMsgSaving || !startMsgDirty}
            >
              {startMsgSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </section>

        <section className="dg-card">
          <div className="dg-card-head">
            <h3 className="dg-card-title">새 당근 후보 등록</h3>
          </div>
          <p className="dg-card-desc">
            등록과 동시에 위 시작 멘트가 <b>실제로 발송</b>되고 messages에 기록됩니다.
          </p>
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
          <button
            className="dg-btn dg-btn-primary dg-btn-block"
            onClick={handleStart}
            disabled={submitting}
          >
            {submitting ? "발송 중..." : "대화 시작 (실 발송)"}
          </button>
        </section>

        <section className="dg-card dg-card-grow">
          <div className="dg-card-head">
            <h3 className="dg-card-title">당근 후보 {candidates.length}명</h3>
            <button className="dg-btn-ghost" onClick={fetchCandidates} disabled={listLoading}>
              {listLoading ? "..." : "새로고침"}
            </button>
          </div>
          <input
            className="dg-input"
            placeholder="이름 / 전화번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="dg-list">
            {listLoading ? (
              <div className="dg-empty">로딩 중...</div>
            ) : filteredCandidates.length === 0 ? (
              <div className="dg-empty">
                {candidates.length === 0 ? "아직 등록된 당근 후보가 없습니다." : "검색 결과 없음"}
              </div>
            ) : (
              filteredCandidates.map((c) => (
                <button
                  key={c.id}
                  className={`dg-list-item ${selectedId === c.id ? "dg-list-active" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="dg-list-row">
                    <span className="dg-list-name">{c.name}</span>
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
              ))
            )}
          </div>
        </section>
      </aside>

      {/* 우측 대화창 */}
      <main className="dg-right">
        {selectedCandidate == null ? (
          <div className="dg-placeholder">
            <p>좌측에서 후보를 선택하거나 새로 등록하세요.</p>
          </div>
        ) : (
          <>
            <header className="dg-conv-head">
              <div>
                <div className="dg-conv-name">{selectedCandidate.name}</div>
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

            <div className="dg-conv-input">
              <textarea
                className="dg-textarea"
                rows={3}
                placeholder="매니저 답장을 직접 작성하면 즉시 실 발송됩니다"
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
                {sending ? "발송 중..." : "보내기"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const css = `
  .dg-left {
    width: 380px;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }
  .dg-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
  }
  .dg-card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dg-card-grow { flex: 1; min-height: 220px; }
  .dg-card-head { display: flex; align-items: center; justify-content: space-between; }
  .dg-card-title { font-size: 14px; font-weight: 700; color: #111827; margin: 0; }
  .dg-card-desc { font-size: 12px; color: #6b7280; margin: 0; }
  .dg-pill { font-size: 11px; padding: 2px 8px; border-radius: 99px; }
  .dg-pill-warn { background: #FEF3C7; color: #92400E; }
  .dg-field { display: flex; flex-direction: column; gap: 4px; }
  .dg-label { font-size: 12px; font-weight: 600; color: #374151; }
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
  .dg-row-end { display: flex; justify-content: flex-end; }
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
  .dg-btn-block { width: 100%; padding: 10px; }
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

  .dg-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; }
  .dg-list-item {
    text-align: left;
    background: #fff;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 8px 10px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: inherit;
  }
  .dg-list-item:hover { background: #f9fafb; }
  .dg-list-active { background: #FFFBEB !important; border-color: #F5C518; }
  .dg-list-row { display: flex; align-items: center; justify-content: space-between; }
  .dg-list-name { font-weight: 600; font-size: 13px; color: #111827; }
  .dg-list-meta { font-size: 11px; color: #6b7280; display: flex; gap: 4px; align-items: center; }
  .dg-badge {
    background: #ef4444;
    color: #fff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 99px;
    font-weight: 700;
  }
  .dg-empty { padding: 16px; text-align: center; color: #9ca3af; font-size: 12px; }

  .dg-placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    font-size: 13px;
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
`;
