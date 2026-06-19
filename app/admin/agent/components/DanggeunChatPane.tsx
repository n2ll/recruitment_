import { useRef, useEffect } from "react";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import {
  Candidate,
  Message,
  AgentState,
  ModeConfig,
  stageBadge,
  statusTone,
  STATUS_OPTIONS,
} from "../danggeun-types";
import DanggeunStageProgress from "./DanggeunStageProgress";
import { sentByLabel } from "../sent-by-label";
import { SCREENING_KEYS } from "../types"; // From original types

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

interface DanggeunChatPaneProps {
  cfg: ModeConfig;
  selectedCandidate: Candidate | null;
  selectedId: number | null;
  messages: Message[];
  msgLoading: boolean;
  messagesError: boolean;
  fetchMessages: (id: number, opts?: { silent?: boolean }) => void;
  outbound: string;
  setOutbound: (s: string) => void;
  sending: boolean;
  handleSendReply: () => void;
  agentStage: string | null;
  agentState: AgentState;
  actionBusy: boolean;
  setActionBusy: (b: boolean) => void;
  actionBusyRef: React.MutableRefObject<boolean>;
  statusSaving: number | null;
  handleStatusChange: (id: number, status: string) => void;
  setDetailOpen: (b: boolean) => void;
  confirm: any;
  toast: any;
}

export default function DanggeunChatPane({
  cfg,
  selectedCandidate,
  selectedId,
  messages,
  msgLoading,
  messagesError,
  fetchMessages,
  outbound,
  setOutbound,
  sending,
  handleSendReply,
  agentStage,
  agentState,
  actionBusy,
  setActionBusy,
  actionBusyRef,
  statusSaving,
  handleStatusChange,
  setDetailOpen,
  confirm,
  toast,
}: DanggeunChatPaneProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convBodyRef = useRef<HTMLDivElement>(null);
  const lastConvRef = useRef<number | null>(null);

  useEffect(() => {
    const el = convBodyRef.current;
    if (!el) {
      messagesEndRef.current?.scrollIntoView();
      return;
    }
    const isNewConv = selectedId !== lastConvRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNewConv || nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: isNewConv ? "auto" : "smooth" });
      lastConvRef.current = selectedId;
    }
  }, [messages.length, selectedId]);

  if (selectedCandidate == null) {
    return (
      <main className="flex-[2] flex flex-col bg-paper-white border border-bone rounded-xl overflow-hidden min-w-0">
        <div className="flex-1 flex items-center justify-center text-mist-gray text-[13px] text-center p-6">
          <p>좌측에서 후보를 선택하세요. 새 후보 등록은 [지원자 목록 → + 지원자 추가]에서 진행합니다.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-[2] flex flex-col bg-paper-white border border-bone rounded-xl overflow-hidden min-w-0">
      <header className="flex items-center justify-between py-3 px-4 border-b border-bone bg-[#fbfbf9]">
        <div>
          <div className="font-bold text-[14px] text-ink-black flex items-center">
            {selectedCandidate.name}
            <button
              className="ml-2.5 py-[3px] px-2.5 rounded-pill border border-bone bg-paper-white text-ink-black text-[11px] font-semibold cursor-pointer align-middle hover:bg-bone/60"
              onClick={() => setDetailOpen(true)}
              title="지원자 상세 정보(편집 가능) 열기"
            >
              상세정보
            </button>
            {(() => {
              const sb = stageBadge(selectedCandidate.agent_stage);
              return (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-pill font-bold inline-block ml-2"
                  style={{ background: sb.bg, color: sb.fg }}
                >
                  {sb.label}
                </span>
              );
            })()}
          </div>
          <div className="text-[12px] text-slate-gray mt-0.5 flex items-center">
            {formatPhone(selectedCandidate.phone)} · {selectedCandidate.branch ?? "-"} ·{" "}
            <span
              className="inline-flex items-center rounded px-[6px] py-0 relative leading-none ml-1"
              style={{
                background: statusTone(selectedCandidate.status).bg,
                color: statusTone(selectedCandidate.status).fg,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <select
                className="appearance-none border-none bg-transparent py-[3px] pr-4 pl-2 text-[11px] font-bold text-inherit cursor-pointer leading-[1.4] focus:outline-none focus:ring-2 focus:ring-deep-violet/50 disabled:opacity-50 disabled:cursor-wait"
                value={selectedCandidate.status ?? "스크리닝 중"}
                disabled={statusSaving === selectedCandidate.id}
                onChange={(e) => handleStatusChange(selectedCandidate.id, e.target.value)}
                title="진행 상태 변경"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="text-ink-black bg-white font-medium">
                    {s}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none text-inherit text-[10px] -ml-3 mr-0.5 leading-none" aria-hidden="true">
                ▾
              </span>
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          {(agentStage === "screening" || agentStage === "onboarding" || agentStage === "active") && (
            <button
              className="bg-amber-soft border border-honey-gold text-burnt-amber py-1 px-2.5 rounded-md text-[12px] font-semibold cursor-pointer hover:bg-[#f0e0c0] disabled:opacity-60 disabled:cursor-wait"
              disabled={actionBusy}
              onClick={async () => {
                if (selectedId == null) return;
                const ok = await confirm({
                  title: "AI 응답을 일시정지할까요?",
                  description: "이 후보가 보내는 새 메시지에 AI가 답하지 않아요. 매니저가 직접 답변하고, 다시 '▶ AI 응답 재개'를 누르면 재개돼요.",
                  confirmText: "일시정지",
                });
                if (!ok) return;
                if (actionBusyRef.current) return;
                actionBusyRef.current = true;
                setActionBusy(true);
                try {
                  const res = await fetch("/api/admin/agent/pause", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ applicant_id: selectedId }),
                  });
                  const json = await res.json();
                  if (!res.ok) {
                    toast({ title: "일시정지에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
                    return;
                  }
                  await fetchMessages(selectedId, { silent: true });
                } catch (e) {
                  toast({ title: "일시정지에 실패했어요", description: e instanceof Error ? e.message : "알 수 없는 오류", tone: "error" });
                } finally {
                  setActionBusy(false);
                  actionBusyRef.current = false;
                }
              }}
            >
              {actionBusy ? "처리 중…" : "⏸ AI 일시정지"}
            </button>
          )}
        </div>
      </header>

      <DanggeunStageProgress
        stage={agentStage}
        busy={actionBusy}
        onStageClick={async (target) => {
          if (selectedId == null) return;
          const targetLabel = target === "screening" ? "스크리닝 중" : "스크리닝 완료";
          const note =
            target === "screening"
              ? "스크리닝부터 다시 진행합니다. (진행 상태 = 스크리닝 중)"
              : "스크리닝 체크리스트를 완료한 것으로 처리하고 정보 수집(배민 아이디) 단계로 넘어갑니다. 앱설치 안내가 자동 발송됩니다. (진행 상태 = 스크리닝 완료)";
          const ok = await confirm({
            title: `'${targetLabel}' 단계로 변경할까요?`,
            description: note,
            confirmText: "단계 변경",
          });
          if (!ok) return;
          if (actionBusyRef.current) return;
          actionBusyRef.current = true;
          setActionBusy(true);
          try {
            const res = await fetch("/api/admin/agent/set-stage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ applicant_id: selectedId, target_stage: target }),
            });
            const json = await res.json();
            if (!res.ok) {
              toast({ title: "단계 변경에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
              return;
            }
            await fetchMessages(selectedId, { silent: true });
          } catch (e) {
            toast({ title: "단계 변경에 실패했어요", description: e instanceof Error ? e.message : "알 수 없는 오류", tone: "error" });
          } finally {
            setActionBusy(false);
            actionBusyRef.current = false;
          }
        }}
      />

      {agentStage === "onboarding" && (
        <div className="py-2.5 px-4 text-[12px] leading-[1.5] border-b border-pale-sage bg-sage-soft text-slate-gray">
          📦 <b>스크리닝 완료 — AI가 배민 아이디 수집 중.</b> 받으면 "곧 연락드리겠습니다"로 마무리 + 슬랙 '준비 완료' 알림이 갑니다.
        </div>
      )}
      {agentStage === "paused" && (
        <div className="py-2.5 px-4 text-[12px] leading-[1.5] border-b border-blush-border bg-rose-soft text-burgundy">
          <div className="flex items-center gap-3 justify-between">
            <div className="flex-1 leading-[1.5]">
              ⏸ <b>매니저 인계 상태</b> — AI 자동 응답이 꺼져 있습니다.<br />
              <span className="block text-[11px] font-normal text-burgundy mt-[3px] opacity-85">
                매니저가 직접 답변한 뒤, 아래 버튼을 누르면 <b>그 후 새로 들어오는 후보 답장부터</b> AI가 다시 응답합니다.
                (이미 와 있는 메시지는 재처리되지 않습니다)
              </span>
            </div>
            <button
              className="bg-deep-violet text-white border-none py-2 px-3.5 rounded-md text-[13px] font-bold cursor-pointer whitespace-nowrap shrink-0 hover:bg-[#2f2843] disabled:opacity-60 disabled:cursor-wait"
              disabled={actionBusy}
              onClick={async () => {
                if (selectedId == null) return;
                const ok = await confirm({
                  title: "AI 응답을 재개할까요?",
                  description: "이 버튼을 누른 시점 이후 후보가 새로 보내는 메시지부터 AI가 응답해요. 이미 도착한 메시지엔 자동 응답하지 않고, 매니저 직접 응답은 그대로 가능해요.",
                  confirmText: "재개",
                });
                if (!ok) return;
                if (actionBusyRef.current) return;
                actionBusyRef.current = true;
                setActionBusy(true);
                try {
                  const res = await fetch("/api/admin/agent/resume", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ applicant_id: selectedId }),
                  });
                  const json = await res.json();
                  if (!res.ok) {
                    toast({ title: "재개에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
                    return;
                  }
                  toast({ title: "AI 응답을 재개했어요", description: `단계 '${json.restored_stage}' — 다음 후보 답장부터 적용돼요.`, tone: "success" });
                  await fetchMessages(selectedId, { silent: true });
                } catch (e) {
                  toast({ title: "재개에 실패했어요", description: e instanceof Error ? e.message : "알 수 없는 오류", tone: "error" });
                } finally {
                  setActionBusy(false);
                  actionBusyRef.current = false;
                }
              }}
            >
              {actionBusy ? "처리 중…" : "▶ AI 응답 재개"}
            </button>
          </div>
        </div>
      )}

      {(agentStage === "screening" || agentStage === "onboarding" || agentStage === "active") && (
        <div className="py-2.5 px-4 bg-amber-soft border-b border-honey-gold text-[11px]">
          <div className="font-bold text-burnt-amber mb-1.5 flex items-center gap-2">
            스크리닝 체크리스트
            {(() => {
              const sc = agentState.screening ?? {};
              const ob = agentState.onboarding ?? {};
              const doneScreening = SCREENING_KEYS.filter((k) => sc[k as keyof typeof sc] === true).length;
              const doneId = ob["배민_아이디_수신"] === true ? 1 : 0;
              const totalItems = SCREENING_KEYS.length + 1;
              return (
                <span className="font-semibold text-burnt-amber bg-[#fdfaf2] py-[1px] px-2 rounded-pill">
                  {doneScreening + doneId} / {totalItems}
                </span>
              );
            })()}
          </div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {SCREENING_KEYS.map((k) => {
              const sc = agentState.screening ?? {};
              const done = sc[k as keyof typeof sc] === true;
              return (
                <span key={k} className={`${done ? "text-deep-violet font-bold" : "text-mist-gray font-medium"}`}>
                  {done ? "✓" : "·"} {k.replace(/_/g, " ")}
                </span>
              );
            })}
            {(() => {
              const ob = agentState.onboarding ?? {};
              const done = ob["배민_아이디_수신"] === true;
              return (
                <span className={`${done ? "text-deep-violet font-bold" : "text-mist-gray font-medium"}`}>
                  {done ? "✓" : "·"} 배민 아이디 수신
                </span>
              );
            })()}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 bg-[#fbfbf9]" ref={convBodyRef}>
        {msgLoading ? (
          <LoadingState label="대화 불러오는 중…" />
        ) : messagesError ? (
          <ErrorState onRetry={() => selectedId != null && fetchMessages(selectedId)} />
        ) : messages.length === 0 ? (
          <EmptyState title="아직 대화가 없어요" />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col max-w-[70%] ${
                m.direction === "outbound" ? "self-end items-end" : "self-start"
              }`}
            >
              <div
                className={`py-2.5 px-3 rounded-xl text-[13px] leading-[1.4] whitespace-pre-wrap break-words ${
                  m.direction === "outbound"
                    ? "bg-deep-violet text-white"
                    : "bg-white border border-bone text-ink-black"
                }`}
              >
                {m.body}
              </div>
              {m.reasoning && (
                <div className="text-[11px] bg-lavender-soft border-l-[3px] border-deep-violet py-1.5 px-2.5 mt-1.5 rounded-r-md leading-[1.5] whitespace-pre-wrap break-words max-w-full">
                  <div className="text-[10px] font-bold text-deep-violet mb-0.5 tracking-[0.02em]">
                    🧠 AI 판단 근거
                  </div>
                  <div className="text-slate-gray">{m.reasoning}</div>
                </div>
              )}
              <div className="text-[10px] text-mist-gray mt-[3px]">
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
          <div className={`flex flex-col max-w-[70%] ${cfg.practice ? "self-start" : "self-end items-end"}`}>
            <div className="inline-flex items-center gap-1 bg-white border border-dashed border-stone-border text-mist-gray py-2 px-3 rounded-xl text-[13px]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-mist-gray animate-pulse" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-mist-gray animate-pulse delay-75" />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-mist-gray animate-pulse delay-150" />
              <span className="ml-1 text-[11px] font-medium">
                {cfg.practice ? "AI 응답 생성 중..." : "전송 중..."}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div
        className={`flex gap-2 py-3 px-4 border-t border-bone items-end bg-white ${
          cfg.practice ? "bg-gradient-to-b from-[#f7eedd] to-white" : ""
        }`}
      >
        <textarea
          className={`flex-1 py-2 px-2.5 border rounded-lg text-[13px] text-ink-black focus:outline-none focus:border-deep-violet focus:ring-2 focus:ring-deep-violet/20 resize-y min-h-[60px] ${
            cfg.practice ? "border-honey-gold bg-[#fdfaf2]" : "border-stone-border bg-paper-white"
          }`}
          rows={3}
          placeholder={cfg.replyPlaceholder}
          value={outbound}
          onChange={(e) => setOutbound(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply();
          }}
        />
        <Button
          variant="primary"
          className="whitespace-nowrap"
          onClick={handleSendReply}
          disabled={sending || !outbound.trim()}
        >
          {sending ? "처리 중..." : cfg.sendButtonLabel}
        </Button>
      </div>
    </main>
  );
}
