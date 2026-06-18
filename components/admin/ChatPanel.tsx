"use client";

/**
 * 카카오톡 스타일 대화 패널 (오버레이).
 *
 * page.tsx에서 분리. 열린 지원자 1명에 대한 메시지 로드/발송/AI 초안 처리와
 * 해당 지원자 범위의 messages·message_drafts Realtime 구독을 자체적으로 소유한다.
 * (page는 applicants·heartbeat Realtime만 유지)
 */

import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { LoadingState, EmptyState } from "@/components/ui/states";
import { type Applicant, type Message } from "@/lib/admin/types";

interface Draft {
  id: string;
  draft_text: string | null;
  reasoning: string | null;
  missing_info: string | null;
  status: "pending" | "need_info";
}

interface ChatPanelProps {
  applicant: Applicant;
  onClose: () => void;
  /** 열람 시 부모 목록의 unread_count를 0으로 맞추기 위한 콜백 */
  onUnreadCleared: (applicantId: number) => void;
}

export function ChatPanel({ applicant, onClose, onUnreadCleared }: ChatPanelProps) {
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftEdited, setDraftEdited] = useState(false);

  // 부모 콜백이 매 렌더 새 참조여도 로드 effect가 재실행되지 않도록 ref로 고정
  const onUnreadClearedRef = useRef(onUnreadCleared);
  useEffect(() => {
    onUnreadClearedRef.current = onUnreadCleared;
  }, [onUnreadCleared]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDraft(null);
    setDraftEdited(false);
    setMsgInput("");
    onUnreadClearedRef.current(applicant.id);
    (async () => {
      try {
        const res = await fetch(`/api/admin/messages/${applicant.id}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        setMessages(json.data || []);
        setDraft(json.draft || null);
      } catch {
        if (!cancelled) console.error("대화 로딩 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applicant.id]);

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`chat-${applicant.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.applicant_id === applicant.id || msg.applicant_phone === applicant.phone) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
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
          if (d.applicant_id === applicant.id || d.applicant_phone === applicant.phone) {
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [applicant.id, applicant.phone]);

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
    if (!text.trim() || msgSending) return;
    setMsgSending(true);
    try {
      const res = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_id: applicant.id,
          phone: applicant.phone,
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
        toast({ title: "발송에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
      }
    } catch {
      toast({ title: "발송 중 오류가 발생했어요", tone: "error" });
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

  return (
    <div className="chat-overlay">
      <div className="chat-panel">
        <div className="chat-header">
          <div>
            <h3 className="chat-name">{applicant.name}</h3>
            <span className="chat-phone">{applicant.phone}</span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="대화 닫기">✕</button>
        </div>

        <div className="chat-messages" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
          {loading ? (
            <LoadingState label="대화 불러오는 중…" />
          ) : messages.length === 0 ? (
            <EmptyState title="아직 주고받은 대화가 없어요" />
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
  );
}
