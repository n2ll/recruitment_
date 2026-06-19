"use client";

/**
 * /admin → 구인 에이전트 탭의 메인 뷰.
 *
 * 좌측 사이드바: 공고 목록 (활성/마감 폴딩) + [+ 새 공고]
 * 메인: 선택된 공고 헤더 + 칸반(stage별 카운트) + 후보자 표
 * 우측 슬라이드 패널 (후보자 클릭 시): 정보 + 체크리스트 + 대화 + 매니저 액션
 *
 * Realtime: jobs / job_candidates / messages 변경 구독 → 자동 리로드.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { usePrompt } from "@/components/ui/prompt";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import JobCreateModal from "./JobCreateModal";
import { sentByLabel } from "./sent-by-label";
import {
  ApplicantSummary,
  CandidateRow,
  JobRow,
  ONBOARDING_KEYS,
  SCREENING_KEYS,
  STAGE_COLOR,
  STAGE_LABEL,
  STAGE_ORDER,
} from "./types";

interface AgentJobsViewProps {
  branches: string[];
}

interface ChatMessage {
  id: string;
  applicant_id: number | null;
  applicant_phone: string;
  direction: "inbound" | "outbound";
  body: string;
  reasoning?: string | null;
  status: string;
  sent_by: string | null;
  created_at: string;
  job_id: number | null;
}

export default function AgentJobsView({ branches }: AgentJobsViewProps) {
  const toast = useToast();
  const confirm = useConfirm();
  // ── 공고 목록 ───────────────────────────────────────────
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  // ── 선택된 공고의 후보 ─────────────────────────────────
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [candError, setCandError] = useState(false);

  // ── 슬라이드 패널 ─────────────────────────────────────
  const [panelCid, setPanelCid] = useState<number | null>(null);
  const [panelMessages, setPanelMessages] = useState<ChatMessage[]>([]);
  const [panelMsgsLoading, setPanelMsgsLoading] = useState(false);
  const [panelMsgsError, setPanelMsgsError] = useState(false);
  const [panelMsgInput, setPanelMsgInput] = useState("");
  const [panelMsgSending, setPanelMsgSending] = useState(false);
  const [panelActionBusy, setPanelActionBusy] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );
  const panelCandidate = useMemo(
    () => candidates.find((c) => c.id === panelCid) ?? null,
    [candidates, panelCid]
  );

  // ── 데이터 로드 ────────────────────────────────────────
  const loadJobs = useCallback(async () => {
    setJobsError(false);
    try {
      const res = await fetch("/api/admin/jobs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "공고 로드 실패");
      const list: JobRow[] = json.jobs ?? [];
      setJobs(list);
      // 선택이 비어있으면 첫 활성 공고 자동 선택
      if (list.length > 0 && selectedJobId === null) {
        const firstActive = list.find((j) => j.status === "active") ?? list[0];
        setSelectedJobId(firstActive.id);
      }
    } catch (e) {
      console.error("[jobs load]", e);
      setJobsError(true);
    } finally {
      setJobsLoading(false);
    }
  }, [selectedJobId]);

  const loadCandidates = useCallback(async (jobId: number) => {
    setCandLoading(true);
    setCandError(false);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/candidates`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "후보 로드 실패");
      setCandidates(json.candidates ?? []);
    } catch (e) {
      console.error("[candidates load]", e);
      setCandError(true);
    } finally {
      setCandLoading(false);
    }
  }, []);

  const loadPanelMessages = useCallback(async (applicantId: number, jobId: number) => {
    setPanelMsgsLoading(true);
    setPanelMsgsError(false);
    try {
      const res = await fetch(
        `/api/admin/messages/${applicantId}?job_id=${jobId}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "메시지 로드 실패");
      setPanelMessages(json.messages ?? []);
    } catch (e) {
      console.error("[panel messages]", e);
      setPanelMsgsError(true);
    } finally {
      setPanelMsgsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (selectedJobId) loadCandidates(selectedJobId);
  }, [selectedJobId, loadCandidates]);

  useEffect(() => {
    if (panelCandidate && selectedJobId) {
      loadPanelMessages(panelCandidate.applicant_id, selectedJobId);
    } else {
      setPanelMessages([]);
    }
  }, [panelCandidate, selectedJobId, loadPanelMessages]);

  // ── Realtime 구독 ─────────────────────────────────────
  useEffect(() => {
    const sb = getBrowserClient();
    const channel = sb
      .channel("agent-jobs-view")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        loadJobs();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_candidates" },
        () => {
          if (selectedJobId) loadCandidates(selectedJobId);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const r = payload.new as { applicant_id?: number; job_id?: number };
          if (
            panelCandidate &&
            r.applicant_id === panelCandidate.applicant_id &&
            r.job_id === selectedJobId
          ) {
            loadPanelMessages(panelCandidate.applicant_id, selectedJobId);
          }
        }
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [loadJobs, loadCandidates, loadPanelMessages, selectedJobId, panelCandidate]);

  // ── 그룹: 사이드바 활성/마감 ───────────────────────────
  const activeJobs = jobs.filter((j) => j.status === "active");
  const closedJobs = jobs.filter((j) => j.status !== "active");

  // ── 칸반: stage 별 그룹 ───────────────────────────────
  const candByStage = useMemo(() => {
    const m: Record<string, CandidateRow[]> = {};
    for (const c of candidates) {
      const k = c.agent_stage ?? "sent";
      m[k] ??= [];
      m[k].push(c);
    }
    return m;
  }, [candidates]);

  // ── 매니저 액션 ───────────────────────────────────────
  const patchCandidate = async (cid: number, body: Record<string, unknown>) => {
    if (!selectedJobId) return;
    setPanelActionBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${selectedJobId}/candidates/${cid}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "변경 실패");
      await loadCandidates(selectedJobId);
    } catch (e) {
      toast({ title: "후보 상태 변경에 실패했어요", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setPanelActionBusy(false);
    }
  };

  const sendManagerMessage = async () => {
    if (!panelCandidate || !panelMsgInput.trim() || !selectedJobId) return;
    setPanelMsgSending(true);
    try {
      const res = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicant_id: panelCandidate.applicant_id,
          phone: panelCandidate.applicants.phone,
          body: panelMsgInput.trim(),
          sent_by: "관리자",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "발송 실패");
      setPanelMsgInput("");
      await loadPanelMessages(panelCandidate.applicant_id, selectedJobId);
    } catch (e) {
      toast({ title: "메시지 발송에 실패했어요", description: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setPanelMsgSending(false);
    }
  };

  const closeJob = async () => {
    if (!selectedJob) return;
    const ok = await confirm({
      title: `'${selectedJob.title}' 공고를 마감할까요?`,
      description: "마감하면 이 공고로는 더 이상 후보에게 발송되지 않아요.",
      confirmText: "마감",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/jobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "마감 실패");
      await loadJobs();
    } catch (e) {
      toast({ title: "공고 마감에 실패했어요", description: e instanceof Error ? e.message : undefined, tone: "error" });
    }
  };

  // ── 렌더 ───────────────────────────────────────────────
  const visibleJobs = showClosed ? closedJobs : activeJobs;

  return (
    <div className="flex flex-col h-[calc(100vh-33px)] bg-bone/30 text-[13px] text-ink-black">
      {/* 상단 공고 셀렉터 (가로 칩) */}
      <header className="bg-paper-white border-b border-bone px-6 py-3 flex items-center gap-3.5 shrink-0">
        <button className="px-3.5 py-2 bg-honey-gold text-ink-black border-none rounded-pill text-xs font-semibold cursor-pointer shrink-0 transition-colors hover:brightness-95" onClick={() => setShowCreate(true)}>
          + 새 공고
        </button>

        <div className="flex bg-bone/30 rounded-pill p-0.5 shrink-0">
          <button
            className={`px-3 py-1.5 bg-transparent border-none rounded-pill text-[11px] font-semibold cursor-pointer transition-colors ${!showClosed ? "bg-paper-white text-ink-black border border-bone" : "text-slate-gray"}`}
            onClick={() => setShowClosed(false)}
          >
            활성 {activeJobs.length}
          </button>
          <button
            className={`px-3 py-1.5 bg-transparent border-none rounded-pill text-[11px] font-semibold cursor-pointer transition-colors ${showClosed ? "bg-paper-white text-ink-black border border-bone" : "text-slate-gray"}`}
            onClick={() => setShowClosed(true)}
          >
            마감 {closedJobs.length}
          </button>
        </div>

        <div className="flex-1 flex gap-1.5 overflow-x-auto py-0.5">
          {jobsLoading ? (
            <span className="text-xs text-mist-gray px-2 py-1.5">로딩 중...</span>
          ) : jobsError ? (
            <ErrorState
              title="공고를 불러오지 못했어요"
              onRetry={() => loadJobs()}
              className="py-2"
            />
          ) : visibleJobs.length === 0 ? (
            <span className="text-xs text-mist-gray px-2 py-1.5">
              {showClosed ? "마감된 공고가 없습니다." : "활성 공고가 없습니다. [+ 새 공고]를 눌러 시작하세요."}
            </span>
          ) : (
            visibleJobs.map((j) => (
              <JobChip
                key={j.id}
                job={j}
                selected={j.id === selectedJobId}
                onClick={() => { setSelectedJobId(j.id); setPanelCid(null); }}
              />
            ))
          )}
        </div>
      </header>

      {/* 메인 + 슬라이드 패널 (가로 분할) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
      <section className="flex-1 px-7 py-6 overflow-y-auto">
        {!selectedJob ? (
          <EmptyState
            title="공고를 선택해주세요"
            hint="왼쪽 목록에서 공고를 고르거나 [+ 새 공고]로 새로 만들어보세요."
          />
        ) : (
          <>
            {/* 공고 헤더 */}
            <div className="flex justify-between items-start mb-5 pb-4 border-b border-bone">
              <div className="flex flex-col">
                <h2 className="text-[18px] font-bold">{selectedJob.title}</h2>
                <div className="mt-1.5 text-xs text-slate-gray flex gap-1.5 flex-wrap items-center">
                  {selectedJob.branch && <span>{selectedJob.branch}</span>}
                  {selectedJob.slot && <span>· {selectedJob.slot}</span>}
                  {selectedJob.start_date && <span>· {selectedJob.start_date} 시작</span>}
                  <span>· 정원 {selectedJob.capacity}명</span>
                  <span>· {selectedJob.vehicle_required ? "🚗 자차" : "도보 가능"}</span>
                  {selectedJob.status !== "active" && (
                    <span className="px-2 py-0.5 rounded-pill text-[11px] font-bold bg-bone text-slate-gray">마감됨</span>
                  )}
                </div>
              </div>
              <div>
                {selectedJob.status === "active" && (
                  <button className="px-3.5 py-2 rounded-pill text-xs font-semibold cursor-pointer border-[1.5px] bg-paper-white text-ink-black border-bone transition-colors hover:bg-bone/30 disabled:text-mist-gray disabled:cursor-not-allowed" onClick={closeJob}>
                    공고 마감
                  </button>
                )}
              </div>
            </div>

            {/* 칸반 */}
            <div className="grid grid-cols-6 gap-2.5 mb-6">
              {STAGE_ORDER.map((stage) => {
                const list = candByStage[stage] ?? [];
                const label = STAGE_LABEL[stage] ?? stage;
                const color = STAGE_COLOR[stage] ?? "#6b7280";
                return (
                  <div key={stage} className="bg-paper-white rounded-card border border-bone overflow-hidden flex flex-col">
                    <div className="px-3 py-2.5 font-bold text-xs border-b-2 flex items-center gap-1.5" style={{ borderColor: color }}>
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
                      {label} <span className="ml-auto bg-bone/30 px-2 py-[1px] rounded-pill text-[11px]">{list.length}</span>
                    </div>
                    <div className="p-2 flex flex-col gap-1.5 min-h-[120px] max-h-[280px] overflow-y-auto">
                      {list.length === 0 ? (
                        <div className="text-bone text-xs text-center p-3">—</div>
                      ) : (
                        list.map((c) => (
                          <div
                            key={c.id}
                            className={`px-2.5 py-2 rounded-card cursor-pointer border-[1.5px] transition-all hover:bg-bone/30 ${c.id === panelCid ? "bg-amber-soft border-honey-gold" : "bg-bone/10 border-transparent"}`}
                            onClick={() => setPanelCid(c.id)}
                          >
                            <div className="font-semibold text-xs mb-1">
                              {c.applicants.name ?? "(이름 없음)"}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-gray">
                              {c.applicants.unread_count > 0 && (
                                <span className="bg-burgundy text-paper-white text-[10px] font-bold px-1.5 py-[1px] rounded-pill">{c.applicants.unread_count}</span>
                              )}
                              <ProgressBadge candidate={c} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 후보자 표 */}
            <div className="bg-paper-white rounded-card border border-bone overflow-hidden">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">이름</th>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">전화</th>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">단계</th>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">진행</th>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">발송</th>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">첫응답</th>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">마지막대화</th>
                    <th className="bg-bone/30 px-3 py-2.5 text-left font-bold text-slate-gray border-b border-bone">지점/슬롯</th>
                  </tr>
                </thead>
                <tbody>
                  {candLoading ? (
                    <tr><td colSpan={8} className="text-center p-7 text-mist-gray">로딩 중...</td></tr>
                  ) : candError ? (
                    <tr><td colSpan={8} className="px-3 py-2.5 border-b border-bone/30"><ErrorState title="후보를 불러오지 못했어요" onRetry={() => selectedJobId && loadCandidates(selectedJobId)} /></td></tr>
                  ) : candidates.length === 0 ? (
                    <tr><td colSpan={8} className="text-center p-7 text-mist-gray">후보자 없음</td></tr>
                  ) : (
                    candidates.map((c) => {
                      const stageKey = c.agent_stage ?? "sent";
                      return (
                        <tr
                          key={c.id}
                          className={`cursor-pointer transition-colors hover:bg-bone/30 ${c.id === panelCid ? "bg-amber-soft" : ""}`}
                          onClick={() => setPanelCid(c.id)}
                        >
                          <td className="font-bold px-3 py-2.5 border-b border-bone/30">
                            {c.applicants.name ?? "(이름 없음)"}
                            {c.applicants.unread_count > 0 && (
                              <span className="bg-burgundy text-paper-white text-[10px] font-bold px-1.5 py-[1px] rounded-pill ml-1.5">
                                {c.applicants.unread_count}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 border-b border-bone/30">{c.applicants.phone}</td>
                          <td className="px-3 py-2.5 border-b border-bone/30">
                            <span
                              className="px-2 py-0.5 rounded-pill text-paper-white text-[11px] font-semibold"
                              style={{ background: STAGE_COLOR[stageKey] }}
                            >
                              {STAGE_LABEL[stageKey] ?? stageKey}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 border-b border-bone/30"><ProgressBadge candidate={c} /></td>
                          <td className="px-3 py-2.5 border-b border-bone/30">{c.sent_at ? formatTime(c.sent_at) : "-"}</td>
                          <td className="px-3 py-2.5 border-b border-bone/30">{c.responded_at ? formatTime(c.responded_at) : "-"}</td>
                          <td className="px-3 py-2.5 border-b border-bone/30">{c.applicants.last_message_at ? formatTime(c.applicants.last_message_at) : "-"}</td>
                          <td className="text-slate-gray text-[11px] px-3 py-2.5 border-b border-bone/30">
                            {c.applicants.branch1 ?? "-"}
                            {c.applicants.work_hours && ` · ${c.applicants.work_hours}`}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 슬라이드 패널 */}
      {panelCandidate && (
        <aside className="w-[380px] shrink-0 bg-paper-white border-l border-bone flex flex-col">
          <div className="px-4.5 py-3.5 border-b border-bone flex justify-between items-start">
            <div>
              <h3 className="text-[15px] font-bold">{panelCandidate.applicants.name ?? "(이름 없음)"}</h3>
              <div className="text-[11px] text-slate-gray mt-1 flex gap-1.5 items-center">
                {panelCandidate.applicants.phone} ·{" "}
                <span className="px-2 py-0.5 rounded-pill text-paper-white text-[11px] font-semibold"
                  style={{ background: STAGE_COLOR[panelCandidate.agent_stage ?? "sent"] }}>
                  {STAGE_LABEL[panelCandidate.agent_stage ?? "sent"] ?? panelCandidate.agent_stage}
                </span>
              </div>
            </div>
            <button className="bg-transparent border-none cursor-pointer text-base text-slate-gray hover:text-graphite" onClick={() => setPanelCid(null)}>✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            <ApplicantInfo applicant={panelCandidate.applicants} />

            <Checklist candidate={panelCandidate} />

            <ChatHistory
              messages={panelMessages}
              loading={panelMsgsLoading}
              error={panelMsgsError}
              onRetry={() => {
                if (selectedJobId)
                  loadPanelMessages(panelCandidate.applicant_id, selectedJobId);
              }}
            />

            <ManagerActions
              candidate={panelCandidate}
              busy={panelActionBusy}
              onPatch={(b) => patchCandidate(panelCandidate.id, b)}
            />

            <div className="flex gap-1.5 items-stretch pt-3 border-t border-bone">
              <textarea
                className="flex-1 font-inherit text-xs px-2.5 py-2 border-[1.5px] border-bone rounded-card resize-none outline-none focus:border-honey-gold"
                placeholder="매니저 답장 — Enter는 줄바꿈, [발송]으로 보내기 (⌘/Ctrl+Enter 발송)"
                rows={2}
                value={panelMsgInput}
                onChange={(e) => setPanelMsgInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    sendManagerMessage();
                  }
                }}
                disabled={panelMsgSending}
              />
              <button
                className="px-3.5 py-2 rounded-pill text-xs font-semibold cursor-pointer border-[1.5px] bg-honey-gold text-ink-black border-honey-gold hover:brightness-95 disabled:bg-bone disabled:text-mist-gray disabled:border-bone disabled:cursor-not-allowed"
                onClick={sendManagerMessage}
                disabled={panelMsgSending || !panelMsgInput.trim()}
              >
                {panelMsgSending ? "발송중" : "발송"}
              </button>
            </div>
          </div>
        </aside>
      )}
      </div>

      {/* 공고 작성 모달 */}
      {showCreate && (
        <JobCreateModal
          branches={branches}
          onClose={() => setShowCreate(false)}
          onCreated={(jobId) => {
            setShowCreate(false);
            setSelectedJobId(jobId);
            loadJobs();
          }}
        />
      )}

      
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 보조 컴포넌트
// ─────────────────────────────────────────────────────────────

function JobChip({
  job, selected, onClick,
}: {
  job: JobRow;
  selected: boolean;
  onClick: () => void;
}) {
  const total = job.counts ? Object.values(job.counts).reduce((a, b) => a + b, 0) : 0;
  const active = job.counts?.active ?? 0;
  return (
    <button className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border-[1.5px] font-inherit cursor-pointer whitespace-nowrap shrink-0 transition-all ${selected ? "bg-amber-soft border-honey-gold" : "bg-paper-white border-bone hover:bg-bone/30"}`} onClick={onClick}>
      <span className="text-xs font-semibold text-ink-black max-w-[220px] overflow-hidden text-ellipsis">{job.title}</span>
      <span className="text-[11px] text-mist-gray pl-1.5 border-l border-bone">
        {active}/{job.capacity}확정 · {total}진행
      </span>
      
    </button>
  );
}

function ProgressBadge({ candidate }: { candidate: CandidateRow }) {
  const stage = candidate.agent_stage;
  if (stage === "screening") {
    const cl = candidate.agent_state?.screening ?? {};
    const done = SCREENING_KEYS.filter((k) => (cl as Record<string, boolean>)[k] === true).length;
    return <span className="inline-block px-1.5 py-[1px] rounded-pill bg-bone/30 text-[10px] text-slate-gray">{done}/{SCREENING_KEYS.length}</span>;
  }
  if (stage === "onboarding") {
    const cl = candidate.agent_state?.onboarding ?? {};
    const done = ONBOARDING_KEYS.filter((k) => (cl as Record<string, boolean>)[k] === true).length;
    return (
      <span className="inline-block px-1.5 py-[1px] rounded-pill bg-bone/30 text-[10px] text-slate-gray">{done}/{ONBOARDING_KEYS.length}</span>
    );
  }
  return <span style={{ color: "#9ca3af" }}>—</span>;
}

function ApplicantInfo({ applicant }: { applicant: ApplicantSummary }) {
  return (
    <div className="flex flex-col">
      <h4 className="text-xs font-bold mb-2">지원자 정보</h4>
      <div className="grid grid-cols-1 gap-1 text-xs">
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">전화</span>{applicant.phone}</div>
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">희망 지점</span>{applicant.branch1 ?? "-"}{applicant.branch2 ? ` / ${applicant.branch2}` : ""}</div>
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">희망 시간</span>{applicant.work_hours ?? "-"}</div>
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">시작가능일</span>{applicant.available_date ?? "-"}</div>
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">자차</span>{applicant.own_vehicle ?? "-"}</div>
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">차종</span>{applicant.vehicle_type ?? "-"}</div>
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">면허</span>{applicant.license_type ?? "-"}</div>
        <div><span className="inline-block min-w-[70px] text-mist-gray text-[11px] font-semibold">거주지</span>{applicant.location ?? "-"}</div>
      </div>
      
    </div>
  );
}

function Checklist({ candidate }: { candidate: CandidateRow }) {
  const stage = candidate.agent_stage;
  if (stage !== "screening" && stage !== "onboarding") return null;
  const keys = stage === "screening" ? SCREENING_KEYS : ONBOARDING_KEYS;
  const cl =
    (stage === "screening"
      ? candidate.agent_state?.screening
      : candidate.agent_state?.onboarding) ?? {};
  return (
    <div className="flex flex-col">
      <h4 className="text-xs font-bold mb-2">✅ {stage === "screening" ? "스크리닝" : "온보딩"} 체크리스트</h4>
      <ul className="list-none p-0 m-0">
        {keys.map((k) => {
          const v = (cl as Record<string, boolean>)[k] === true;
          return (
            <li key={k} className={`py-1 text-xs ${v ? "text-deep-violet font-semibold" : "text-slate-gray"}`}>
              <span className="inline-block w-[18px]">{v ? "✓" : "☐"}</span> {k.replace(/_/g, " ")}
            </li>
          );
        })}
      </ul>
      
    </div>
  );
}

function ChatHistory({
  messages,
  loading,
  error,
  onRetry,
}: {
  messages: ChatMessage[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col">
      <h4 className="text-xs font-bold mb-2">💬 대화 내역</h4>
      <div
        className="bg-bone/10 rounded-card p-2.5 max-h-[280px] overflow-y-auto flex flex-col gap-1.5"
        ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
      >
        {loading ? (
          <LoadingState label="대화 불러오는 중…" />
        ) : error ? (
          <ErrorState title="대화를 불러오지 못했어요" onRetry={onRetry} />
        ) : messages.length === 0 ? (
          <EmptyState title="아직 대화가 없어요" />
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-2.5 py-1.5 rounded-card ${m.direction === "outbound" ? "bg-lavender-soft" : "bg-paper-white border border-bone"}`}>
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.body}</p>
                {m.reasoning && <div className={`text-[10px] text-slate-gray border-l-2 border-black/15 px-1.5 py-1 mt-1 rounded-r-sm leading-snug whitespace-pre-wrap break-words ${m.direction === "outbound" ? "bg-white/70" : "bg-bone/10"}`}>🤖 {m.reasoning}</div>}
                <div className="text-[10px] text-mist-gray mt-1">
                  {m.sent_by && <span>{sentByLabel(m.sent_by)} · </span>}
                  {new Date(m.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
    </div>
  );
}

function ManagerActions({
  candidate,
  busy,
  onPatch,
}: {
  candidate: CandidateRow;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const stage = candidate.agent_stage;
  const isPaused = stage === "paused";
  const isAbort = stage === "abort";

  const pause = async () => {
    const reason = await prompt({
      title: "AI 응답을 일시정지할까요?",
      description: "매니저가 직접 대응하는 동안 AI가 답하지 않아요.",
      placeholder: "일시정지 사유 (선택)",
      confirmText: "일시정지",
    });
    if (reason == null) return;
    await onPatch({ agent_stage: "paused", paused_reason: reason || "manager pause" });
  };

  const resume = async () => {
    const target = await prompt({
      title: "어느 단계로 재개할까요?",
      description: "선택한 단계부터 AI 응답이 다시 시작돼요.",
      actions: [
        { label: "스크리닝부터", value: "screening" },
        { label: "온보딩(정보 수집)부터", value: "onboarding" },
      ],
    });
    if (!target) return;
    await onPatch({ agent_stage: target });
  };

  const abort = async () => {
    const ok = await confirm({
      title: "이 후보를 부적합 처리할까요?",
      description: "부적합으로 분류되면 이 후보의 AI 응답은 종료돼요.",
      confirmText: "부적합 처리",
      destructive: true,
    });
    if (!ok) return;
    const reason = await prompt({
      title: "부적합 사유를 남겨주세요",
      placeholder: "부적합 사유 (선택)",
      confirmText: "처리",
    });
    if (reason == null) return;
    await onPatch({ agent_stage: "abort", closed_reason: reason || "manager: 부적합" });
  };

  return (
    <div className="flex flex-col">
      <h4 className="text-xs font-bold mb-2">매니저 액션</h4>
      {candidate.paused_reason && (
        <div className="px-2.5 py-2 bg-amber-soft rounded-card text-xs text-burnt-amber mb-2">
          ⏸ <strong>일시정지</strong>: {candidate.paused_reason}
        </div>
      )}
      <div className="flex gap-1.5 flex-wrap">
        {!isPaused && !isAbort && stage !== "active" && (
          <button className="px-3 py-1.5 bg-paper-white border-[1.5px] border-bone rounded-pill font-inherit text-xs cursor-pointer transition-colors hover:bg-bone/30 disabled:opacity-50 disabled:cursor-not-allowed" onClick={pause} disabled={busy}>일시정지</button>
        )}
        {isPaused && (
          <button className="px-3 py-1.5 bg-deep-violet text-paper-white border-[1.5px] border-deep-violet rounded-pill font-inherit text-xs cursor-pointer transition-colors hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" onClick={resume} disabled={busy}>AI 재개</button>
        )}
        {!isAbort && (
          <button className="px-3 py-1.5 bg-paper-white text-burgundy border-[1.5px] border-blush-border rounded-pill font-inherit text-xs cursor-pointer transition-colors hover:bg-rose-soft disabled:opacity-50 disabled:cursor-not-allowed" onClick={abort} disabled={busy}>부적합 처리</button>
        )}
      </div>
      
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
