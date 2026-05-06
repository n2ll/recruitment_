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
import JobCreateModal from "./JobCreateModal";
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
  status: string;
  sent_by: string | null;
  created_at: string;
  job_id: number | null;
}

export default function AgentJobsView({ branches }: AgentJobsViewProps) {
  // ── 공고 목록 ───────────────────────────────────────────
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  // ── 선택된 공고의 후보 ─────────────────────────────────
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [candLoading, setCandLoading] = useState(false);

  // ── 슬라이드 패널 ─────────────────────────────────────
  const [panelCid, setPanelCid] = useState<number | null>(null);
  const [panelMessages, setPanelMessages] = useState<ChatMessage[]>([]);
  const [panelMsgsLoading, setPanelMsgsLoading] = useState(false);
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
    } finally {
      setJobsLoading(false);
    }
  }, [selectedJobId]);

  const loadCandidates = useCallback(async (jobId: number) => {
    setCandLoading(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/candidates`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "후보 로드 실패");
      setCandidates(json.candidates ?? []);
    } catch (e) {
      console.error("[candidates load]", e);
    } finally {
      setCandLoading(false);
    }
  }, []);

  const loadPanelMessages = useCallback(async (applicantId: number, jobId: number) => {
    setPanelMsgsLoading(true);
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
      alert(e instanceof Error ? e.message : "오류");
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
      alert(e instanceof Error ? e.message : "오류");
    } finally {
      setPanelMsgSending(false);
    }
  };

  const closeJob = async () => {
    if (!selectedJob) return;
    if (!confirm(`"${selectedJob.title}" 공고를 마감 처리할까요?`)) return;
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
      alert(e instanceof Error ? e.message : "오류");
    }
  };

  // ── 렌더 ───────────────────────────────────────────────
  const visibleJobs = showClosed ? closedJobs : activeJobs;

  return (
    <div className="ajv">
      {/* 상단 공고 셀렉터 (가로 칩) */}
      <header className="ajv-top">
        <button className="ajv-create-btn" onClick={() => setShowCreate(true)}>
          + 새 공고
        </button>

        <div className="ajv-top-toggle">
          <button
            className={`ajv-tt-btn ${!showClosed ? "ajv-tt-on" : ""}`}
            onClick={() => setShowClosed(false)}
          >
            활성 {activeJobs.length}
          </button>
          <button
            className={`ajv-tt-btn ${showClosed ? "ajv-tt-on" : ""}`}
            onClick={() => setShowClosed(true)}
          >
            마감 {closedJobs.length}
          </button>
        </div>

        <div className="ajv-chips">
          {jobsLoading ? (
            <span className="ajv-chip-empty">로딩 중...</span>
          ) : visibleJobs.length === 0 ? (
            <span className="ajv-chip-empty">
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
      <div className="ajv-body">
      <section className="ajv-main">
        {!selectedJob ? (
          <div className="ajv-empty">왼쪽에서 공고를 선택하거나 [+ 새 공고]를 만들어주세요.</div>
        ) : (
          <>
            {/* 공고 헤더 */}
            <div className="ajv-job-header">
              <div className="ajv-job-h-l">
                <h2>{selectedJob.title}</h2>
                <div className="ajv-job-meta">
                  {selectedJob.branch && <span>{selectedJob.branch}</span>}
                  {selectedJob.slot && <span>· {selectedJob.slot}</span>}
                  {selectedJob.start_date && <span>· {selectedJob.start_date} 시작</span>}
                  <span>· 정원 {selectedJob.capacity}명</span>
                  <span>· {selectedJob.vehicle_required ? "🚗 자차" : "도보 가능"}</span>
                  {selectedJob.status !== "active" && (
                    <span className="ajv-status-badge ajv-st-closed">마감됨</span>
                  )}
                </div>
              </div>
              <div className="ajv-job-h-r">
                {selectedJob.status === "active" && (
                  <button className="ajv-btn-secondary" onClick={closeJob}>
                    공고 마감
                  </button>
                )}
              </div>
            </div>

            {/* 칸반 */}
            <div className="ajv-kanban">
              {STAGE_ORDER.map((stage) => {
                const list = candByStage[stage] ?? [];
                const label = STAGE_LABEL[stage] ?? stage;
                const color = STAGE_COLOR[stage] ?? "#6b7280";
                return (
                  <div key={stage} className="ajv-kan-col">
                    <div className="ajv-kan-h" style={{ borderColor: color }}>
                      <span className="ajv-kan-dot" style={{ background: color }} />
                      {label} <span className="ajv-kan-count">{list.length}</span>
                    </div>
                    <div className="ajv-kan-cards">
                      {list.length === 0 ? (
                        <div className="ajv-kan-empty">—</div>
                      ) : (
                        list.map((c) => (
                          <div
                            key={c.id}
                            className={`ajv-kan-card ${c.id === panelCid ? "ajv-kan-active" : ""}`}
                            onClick={() => setPanelCid(c.id)}
                          >
                            <div className="ajv-kan-card-name">
                              {c.applicants.name ?? "(이름 없음)"}
                            </div>
                            <div className="ajv-kan-card-meta">
                              {c.applicants.unread_count > 0 && (
                                <span className="ajv-unread">{c.applicants.unread_count}</span>
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
            <div className="ajv-table-wrap">
              <table className="ajv-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>전화</th>
                    <th>단계</th>
                    <th>진행</th>
                    <th>발송</th>
                    <th>첫응답</th>
                    <th>마지막대화</th>
                    <th>지점/슬롯</th>
                  </tr>
                </thead>
                <tbody>
                  {candLoading ? (
                    <tr><td colSpan={8} className="ajv-loading">로딩 중...</td></tr>
                  ) : candidates.length === 0 ? (
                    <tr><td colSpan={8} className="ajv-loading">후보자 없음</td></tr>
                  ) : (
                    candidates.map((c) => {
                      const stageKey = c.agent_stage ?? "sent";
                      return (
                        <tr
                          key={c.id}
                          className={`ajv-tr ${c.id === panelCid ? "ajv-tr-active" : ""}`}
                          onClick={() => setPanelCid(c.id)}
                        >
                          <td className="ajv-bold">
                            {c.applicants.name ?? "(이름 없음)"}
                            {c.applicants.unread_count > 0 && (
                              <span className="ajv-unread" style={{ marginLeft: 6 }}>
                                {c.applicants.unread_count}
                              </span>
                            )}
                          </td>
                          <td>{c.applicants.phone}</td>
                          <td>
                            <span
                              className="ajv-stage-badge"
                              style={{ background: STAGE_COLOR[stageKey] }}
                            >
                              {STAGE_LABEL[stageKey] ?? stageKey}
                            </span>
                          </td>
                          <td><ProgressBadge candidate={c} /></td>
                          <td>{c.sent_at ? formatTime(c.sent_at) : "-"}</td>
                          <td>{c.responded_at ? formatTime(c.responded_at) : "-"}</td>
                          <td>{c.applicants.last_message_at ? formatTime(c.applicants.last_message_at) : "-"}</td>
                          <td className="ajv-meta-text">
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
        <aside className="ajv-panel">
          <div className="ajv-panel-h">
            <div>
              <h3>{panelCandidate.applicants.name ?? "(이름 없음)"}</h3>
              <div className="ajv-panel-sub">
                {panelCandidate.applicants.phone} ·{" "}
                <span className="ajv-stage-badge"
                  style={{ background: STAGE_COLOR[panelCandidate.agent_stage ?? "sent"] }}>
                  {STAGE_LABEL[panelCandidate.agent_stage ?? "sent"] ?? panelCandidate.agent_stage}
                </span>
              </div>
            </div>
            <button className="ajv-panel-close" onClick={() => setPanelCid(null)}>✕</button>
          </div>

          <div className="ajv-panel-body">
            <ApplicantInfo applicant={panelCandidate.applicants} />

            <Checklist candidate={panelCandidate} />

            <ChatHistory messages={panelMessages} loading={panelMsgsLoading} />

            <ManagerActions
              candidate={panelCandidate}
              busy={panelActionBusy}
              onPatch={(b) => patchCandidate(panelCandidate.id, b)}
            />

            <div className="ajv-panel-input-wrap">
              <textarea
                className="ajv-panel-input"
                placeholder="매니저 직접 메시지... (Enter 발송)"
                rows={2}
                value={panelMsgInput}
                onChange={(e) => setPanelMsgInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendManagerMessage();
                  }
                }}
                disabled={panelMsgSending}
              />
              <button
                className="ajv-btn-primary"
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

      <style jsx>{`
        .ajv {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 33px);    /* phone-bar(약 33px) 제외 */
          background: #f5f5f0;
          font-size: 13px;
          color: #1a1a1a;
        }

        /* 상단 셀렉터 */
        .ajv-top {
          background: #fff;
          border-bottom: 1px solid #e8e8e0;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }
        .ajv-create-btn {
          padding: 8px 14px;
          background: #1a1a1a;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
        }
        .ajv-top-toggle {
          display: flex;
          background: #f3f4f6;
          border-radius: 8px;
          padding: 2px;
          flex-shrink: 0;
        }
        .ajv-tt-btn {
          padding: 6px 12px;
          background: none;
          border: none;
          border-radius: 6px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          cursor: pointer;
        }
        .ajv-tt-on {
          background: #fff;
          color: #1a1a1a;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
        }
        .ajv-chips {
          flex: 1;
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding: 2px 0;
        }
        .ajv-chip-empty {
          font-size: 12px;
          color: #9ca3af;
          padding: 6px 8px;
        }

        /* 메인 + 패널 가로 컨테이너 */
        .ajv-body {
          flex: 1;
          display: flex;
          min-height: 0;
          overflow: hidden;
        }

        /* 메인 */
        .ajv-main {
          flex: 1;
          padding: 24px 28px;
          overflow-y: auto;
        }
        .ajv-empty {
          padding: 80px;
          text-align: center;
          color: #9ca3af;
          font-size: 14px;
        }
        .ajv-job-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e8e8e0;
        }
        .ajv-job-header h2 { font-size: 18px; font-weight: 700; }
        .ajv-job-meta {
          margin-top: 6px;
          font-size: 12px;
          color: #6b7280;
          display: flex; gap: 6px; flex-wrap: wrap;
        }
        .ajv-status-badge { padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
        .ajv-st-closed { background: #e5e7eb; color: #4b5563; }

        /* 칸반 */
        .ajv-kanban {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
          margin-bottom: 24px;
        }
        .ajv-kan-col {
          background: #fff;
          border-radius: 10px;
          border: 1px solid #e8e8e0;
          overflow: hidden;
        }
        .ajv-kan-h {
          padding: 10px 12px;
          font-weight: 700;
          font-size: 12px;
          border-bottom: 2px solid;
          display: flex; align-items: center; gap: 6px;
        }
        .ajv-kan-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .ajv-kan-count {
          margin-left: auto;
          background: #f3f4f6;
          padding: 1px 8px;
          border-radius: 8px;
          font-size: 11px;
        }
        .ajv-kan-cards {
          padding: 8px;
          display: flex; flex-direction: column; gap: 6px;
          min-height: 120px;
          max-height: 280px;
          overflow-y: auto;
        }
        .ajv-kan-empty { color: #d1d5db; font-size: 12px; text-align: center; padding: 12px; }
        .ajv-kan-card {
          background: #f9fafb;
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
          border: 1.5px solid transparent;
          transition: all 0.1s;
        }
        .ajv-kan-card:hover { background: #f3f4f6; }
        .ajv-kan-active {
          border-color: #F5C518 !important;
          background: #FFFBEB !important;
        }
        .ajv-kan-card-name { font-weight: 600; font-size: 12px; margin-bottom: 4px; }
        .ajv-kan-card-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #6b7280; }

        /* 표 */
        .ajv-table-wrap {
          background: #fff;
          border-radius: 10px;
          border: 1px solid #e8e8e0;
          overflow: hidden;
        }
        .ajv-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .ajv-table th {
          background: #f9fafb;
          padding: 10px 12px;
          text-align: left;
          font-weight: 700;
          color: #4b5563;
          border-bottom: 1px solid #e8e8e0;
        }
        .ajv-table td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
        .ajv-tr { cursor: pointer; }
        .ajv-tr:hover { background: #f9fafb; }
        .ajv-tr-active { background: #FFFBEB; }
        .ajv-bold { font-weight: 700; }
        .ajv-meta-text { color: #6b7280; font-size: 11px; }
        .ajv-loading { text-align: center; padding: 30px; color: #9ca3af; }
        .ajv-stage-badge {
          padding: 2px 8px; border-radius: 6px;
          color: #fff; font-size: 11px; font-weight: 600;
        }
        .ajv-unread {
          background: #ef4444; color: #fff;
          font-size: 10px; font-weight: 700;
          padding: 1px 6px; border-radius: 8px;
        }

        /* 슬라이드 패널 */
        .ajv-panel {
          width: 380px;
          flex-shrink: 0;
          background: #fff;
          border-left: 1px solid #e8e8e0;
          display: flex;
          flex-direction: column;
        }
        .ajv-panel-h {
          padding: 14px 18px;
          border-bottom: 1px solid #e8e8e0;
          display: flex; justify-content: space-between; align-items: flex-start;
        }
        .ajv-panel-h h3 { font-size: 15px; font-weight: 700; }
        .ajv-panel-sub { font-size: 11px; color: #6b7280; margin-top: 4px; display: flex; gap: 6px; align-items: center; }
        .ajv-panel-close {
          background: none; border: none; cursor: pointer;
          font-size: 16px; color: #6b7280;
        }
        .ajv-panel-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex; flex-direction: column; gap: 16px;
        }

        .ajv-panel-input-wrap {
          display: flex; gap: 6px; align-items: stretch;
          padding-top: 12px;
          border-top: 1px solid #e8e8e0;
        }
        .ajv-panel-input {
          flex: 1;
          font-family: inherit; font-size: 12px;
          padding: 8px 10px;
          border: 1.5px solid #e8e8e0;
          border-radius: 8px;
          resize: none; outline: none;
        }
        .ajv-panel-input:focus { border-color: #F5C518; }

        /* 공통 버튼 */
        .ajv-btn-primary, .ajv-btn-secondary {
          padding: 8px 14px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid;
        }
        .ajv-btn-primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
        .ajv-btn-primary:disabled { background: #9ca3af; border-color: #9ca3af; cursor: not-allowed; }
        .ajv-btn-secondary { background: #fff; color: #1a1a1a; border-color: #e8e8e0; }
        .ajv-btn-secondary:disabled { color: #9ca3af; cursor: not-allowed; }
      `}</style>
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
    <button className={`jc ${selected ? "jc-active" : ""}`} onClick={onClick}>
      <span className="jc-title">{job.title}</span>
      <span className="jc-meta">
        {active}/{job.capacity}확정 · {total}진행
      </span>
      <style jsx>{`
        .jc {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          background: #fff;
          border: 1.5px solid #e8e8e0;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: all 0.1s;
        }
        .jc:hover { background: #f9fafb; }
        .jc-active {
          background: #FFFBEB !important;
          border-color: #F5C518 !important;
        }
        .jc-title {
          font-size: 12px;
          font-weight: 600;
          color: #1a1a1a;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .jc-meta {
          font-size: 11px;
          color: #9ca3af;
          padding-left: 6px;
          border-left: 1px solid #e8e8e0;
        }
      `}</style>
    </button>
  );
}

function ProgressBadge({ candidate }: { candidate: CandidateRow }) {
  const stage = candidate.agent_stage;
  if (stage === "screening") {
    const cl = candidate.agent_state?.screening ?? {};
    const done = SCREENING_KEYS.filter((k) => (cl as Record<string, boolean>)[k] === true).length;
    return <span className="pb">{done}/{SCREENING_KEYS.length}</span>;
  }
  if (stage === "onboarding") {
    const cl = candidate.agent_state?.onboarding ?? {};
    const done = ONBOARDING_KEYS.filter((k) => (cl as Record<string, boolean>)[k] === true).length;
    return (
      <>
        <span className="pb">{done}/{ONBOARDING_KEYS.length}</span>
        <style jsx>{`.pb {
          display: inline-block; padding: 1px 6px; border-radius: 6px;
          background: #f3f4f6; font-size: 10px; color: #4b5563;
        }`}</style>
      </>
    );
  }
  return <span style={{ color: "#9ca3af" }}>—</span>;
}

function ApplicantInfo({ applicant }: { applicant: ApplicantSummary }) {
  return (
    <div className="ai">
      <h4>📋 지원자 정보</h4>
      <div className="ai-grid">
        <div><span className="ai-l">전화</span>{applicant.phone}</div>
        <div><span className="ai-l">희망 지점</span>{applicant.branch1 ?? "-"}{applicant.branch2 ? ` / ${applicant.branch2}` : ""}</div>
        <div><span className="ai-l">희망 시간</span>{applicant.work_hours ?? "-"}</div>
        <div><span className="ai-l">시작가능일</span>{applicant.available_date ?? "-"}</div>
        <div><span className="ai-l">자차</span>{applicant.own_vehicle ?? "-"}</div>
        <div><span className="ai-l">차종</span>{applicant.vehicle_type ?? "-"}</div>
        <div><span className="ai-l">면허</span>{applicant.license_type ?? "-"}</div>
        <div><span className="ai-l">거주지</span>{applicant.location ?? "-"}</div>
      </div>
      <style jsx>{`
        .ai h4 { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
        .ai-grid { display: grid; grid-template-columns: 1fr; gap: 4px; font-size: 12px; }
        .ai-l {
          display: inline-block; min-width: 70px;
          color: #9ca3af; font-size: 11px; font-weight: 600;
        }
      `}</style>
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
    <div className="cl">
      <h4>✅ {stage === "screening" ? "스크리닝" : "온보딩"} 체크리스트</h4>
      <ul>
        {keys.map((k) => {
          const v = (cl as Record<string, boolean>)[k] === true;
          return (
            <li key={k} className={v ? "cl-on" : ""}>
              <span className="cl-mark">{v ? "✓" : "☐"}</span> {k.replace(/_/g, " ")}
            </li>
          );
        })}
      </ul>
      <style jsx>{`
        .cl h4 { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
        .cl ul { list-style: none; padding: 0; }
        .cl li {
          padding: 4px 0; font-size: 12px; color: #6b7280;
        }
        .cl-on { color: #10b981; font-weight: 600; }
        .cl-mark { display: inline-block; width: 18px; }
      `}</style>
    </div>
  );
}

function ChatHistory({ messages, loading }: { messages: ChatMessage[]; loading: boolean }) {
  return (
    <div className="ch">
      <h4>💬 대화 내역</h4>
      <div
        className="ch-list"
        ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
      >
        {loading ? (
          <div className="ch-empty">로딩 중...</div>
        ) : messages.length === 0 ? (
          <div className="ch-empty">대화 없음</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`ch-row ${m.direction === "outbound" ? "ch-r" : "ch-l"}`}>
              <div className={`ch-bub ${m.direction === "outbound" ? "ch-out" : "ch-in"}`}>
                <p>{m.body}</p>
                <div className="ch-time">
                  {m.sent_by && <span>{m.sent_by} · </span>}
                  {new Date(m.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <style jsx>{`
        .ch h4 { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
        .ch-list {
          background: #f9fafb;
          border-radius: 8px;
          padding: 10px;
          max-height: 280px;
          overflow-y: auto;
          display: flex; flex-direction: column; gap: 6px;
        }
        .ch-empty { padding: 24px; text-align: center; color: #9ca3af; font-size: 12px; }
        .ch-row { display: flex; }
        .ch-l { justify-content: flex-start; }
        .ch-r { justify-content: flex-end; }
        .ch-bub { max-width: 80%; padding: 7px 10px; border-radius: 8px; }
        .ch-in { background: #fff; border: 1px solid #e8e8e0; }
        .ch-out { background: #FFEB99; }
        .ch-bub p { font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
        .ch-time { font-size: 10px; color: #9ca3af; margin-top: 3px; }
      `}</style>
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
  const stage = candidate.agent_stage;
  const isPaused = stage === "paused";
  const isAbort = stage === "abort";

  const pause = async () => {
    const reason = prompt("일시정지 사유 (선택):") ?? "";
    await onPatch({ agent_stage: "paused", paused_reason: reason || "manager pause" });
  };

  const resume = async () => {
    const target = confirm("스크리닝 단계로 재개할까요?\n(취소 = 온보딩으로 재개)") ? "screening" : "onboarding";
    await onPatch({ agent_stage: target });
  };

  const abort = async () => {
    if (!confirm("부적합 처리할까요? 이 후보는 종료됩니다.")) return;
    const reason = prompt("부적합 사유 (선택):") ?? "";
    await onPatch({ agent_stage: "abort", closed_reason: reason || "manager: 부적합" });
  };

  return (
    <div className="ma">
      <h4>🛠 매니저 액션</h4>
      {candidate.paused_reason && (
        <div className="ma-paused">
          ⏸ <strong>일시정지</strong>: {candidate.paused_reason}
        </div>
      )}
      <div className="ma-row">
        {!isPaused && !isAbort && stage !== "active" && (
          <button className="ma-btn" onClick={pause} disabled={busy}>일시정지</button>
        )}
        {isPaused && (
          <button className="ma-btn ma-btn-ok" onClick={resume} disabled={busy}>AI 재개</button>
        )}
        {!isAbort && (
          <button className="ma-btn ma-btn-warn" onClick={abort} disabled={busy}>부적합 처리</button>
        )}
      </div>
      <style jsx>{`
        .ma h4 { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
        .ma-paused {
          padding: 8px 10px; background: #fef3c7;
          border-radius: 6px; font-size: 12px; color: #92400e;
          margin-bottom: 8px;
        }
        .ma-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .ma-btn {
          padding: 6px 12px;
          background: #fff; border: 1.5px solid #e8e8e0;
          border-radius: 6px; font-family: inherit;
          font-size: 12px; cursor: pointer;
        }
        .ma-btn-ok { background: #10b981; color: #fff; border-color: #10b981; }
        .ma-btn-warn { background: #fff; color: #ef4444; border-color: #fecaca; }
        .ma-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
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
