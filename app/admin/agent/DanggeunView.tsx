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

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import ApplicantMiniDetail, { type MiniApplicantPatch } from "../ApplicantMiniDetail";
import { Candidate, Message, AgentState, MODE_CONFIG } from "./danggeun-types";
import DanggeunListPane from "./components/DanggeunListPane";
import DanggeunChatPane from "./components/DanggeunChatPane";

interface DanggeunViewProps {
  mode?: "live" | "practice" | "baemin";
  branches?: string[];
}

export default function DanggeunView({ mode = "live", branches = [] }: DanggeunViewProps) {
  const cfg = MODE_CONFIG[mode];
  const toast = useToast();
  const confirm = useConfirm();
  // 지점 필터(목록 좌측 패널) — '전체' / 미배정 / 각 지점
  const [branchFilter, setBranchFilter] = useState<string>("전체");
  // 인라인 상태 변경 중인 후보 (낙관적 표시용; 실패 시 fetch로 복구)
  const [statusSaving, setStatusSaving] = useState<number | null>(null);
  // '상세정보' 미니 모달 — 우측 대화창 위에 오버레이로 뜸. 페이지 이동 없음.
  const [detailOpen, setDetailOpen] = useState(false);
  // ── 시작 멘트 (편집은 클로드 조련하기에서. 여기선 등록 검증·발송용으로 읽기만) ──
  const [startMsg, setStartMsg] = useState("");
  const [startMsgLoaded, setStartMsgLoaded] = useState(false);

  // ── 후보 목록 ──────────────────────────────────────────
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [search, setSearch] = useState("");

  // ── 우측 대화창 ────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(false);
  const [outbound, setOutbound] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [agentStage, setAgentStage] = useState<string | null>(null);
  const [agentState, setAgentState] = useState<AgentState>({});
  // 대화 헤더 액션(일시정지/단계변경/재개) 진행 중 가드 — 중복 클릭 시 중복 발송 방지.
  const [actionBusy, setActionBusy] = useState(false);
  const actionBusyRef = useRef(false);

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
        setListError(false);
      } else {
        setListError(true);
      }
    } catch (e) {
      console.error("[danggeun list error]", e);
      setListError(true);
    } finally {
      if (!opts.silent) setListLoading(false);
    }
  }, [cfg.source]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

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
        setMessagesError(false);
      } else {
        setMessagesError(true);
      }
    } catch (e) {
      console.error("[danggeun messages error]", e);
      setMessagesError(true);
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

  // ── 핸들러 ─────────────────────────────────────────────
  // ── 연습 데이터 초기화 (practice 모드 전용) ────────────
  const handleResetPractice = async () => {
    const ok = await confirm({
      title: "연습 데이터를 전부 삭제할까요?",
      description: "연습용 후보·대화가 모두 삭제돼요. 라이브 당근 데이터는 안 건드려요.",
      confirmText: "초기화",
      destructive: true,
    });
    if (!ok) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/admin/agent/danggeun-practice/reset", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "초기화에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
        return;
      }
      setSelectedId(null);
      setMessages([]);
      await fetchCandidates();
      toast({ title: `${json.deleted}명 삭제됨`, description: "깨끗하게 초기화됐어요.", tone: "success" });
    } catch (e) {
      toast({ title: "초기화에 실패했어요", description: e instanceof Error ? e.message : "알 수 없는 오류", tone: "error" });
    } finally {
      setResetting(false);
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
        toast({ title: "발송에 실패했어요", description: j.error || "알 수 없는 오류", tone: "error" });
        return;
      }
      setOutbound("");
      // Realtime이 새 메시지를 자동 추가하지만 reasoning/agent_state 매핑을 위해 silent fetch.
      // 로딩 스피너는 안 띄움 — 깜빡임 방지.
      await fetchMessages(selectedId, { silent: true });
    } catch (e) {
      toast({ title: "발송에 실패했어요", description: e instanceof Error ? e.message : "알 수 없는 오류", tone: "error" });
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  // 후보 인라인 상태 변경 — 지원자목록 탭과 동일하게 PATCH /api/admin/applicants/:id
  const handleStatusChange = async (applicantId: number, newStatus: string) => {
    // 종료성 상태(부적합/이탈)는 실수 방지용 확인.
    if (newStatus === "부적합" || newStatus === "이탈") {
      const c = candidates.find((x) => x.id === applicantId);
      const ok = await confirm({
        title: `${c?.name ?? "이 후보"} 님을 '${newStatus}'(으)로 변경할까요?`,
        description: "종료성 상태라 파이프라인에서 빠져요.",
        confirmText: newStatus === "부적합" ? "부적합 처리" : "이탈 처리",
        destructive: true,
      });
      if (!ok) {
        return;
      }
    }
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
        toast({ title: "상태 변경에 실패했어요", description: j.error || "알 수 없는 오류", tone: "error" });
        await fetchCandidates({ silent: true });
      }
    } catch (e) {
      toast({ title: "상태 변경에 실패했어요", description: e instanceof Error ? e.message : "알 수 없는 오류", tone: "error" });
      await fetchCandidates({ silent: true });
    } finally {
      setStatusSaving(null);
    }
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedId) ?? null;

  // ── 렌더 ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-60px)] box-border">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between py-1 gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-semibold text-ink-black m-0 tracking-[-0.01em]">
            <span className="mr-1.5">{cfg.emoji}</span>
            {cfg.title} <span className="text-graphite font-medium ml-1">{candidates.length}명</span>
          </h2>
          <span className="text-[11px] text-graphite ml-2.5">{cfg.helpLine}</span>
        </div>
        <div className="flex items-center gap-2">
          {cfg.needsStartMessage && startMsgLoaded && !startMsg && (
            <span className="bg-amber-soft border border-honey-gold text-burnt-amber py-1 px-2.5 rounded-md text-[12px] font-semibold cursor-default">
              ⚠ 시작 멘트 미설정 — 클로드 조련하기에서 설정
            </span>
          )}
          {cfg.practice && (
            <button
              className="bg-white border border-bone text-ink-black py-1 px-2.5 rounded-md text-[12px] cursor-pointer hover:bg-bone/60"
              onClick={handleResetPractice}
              disabled={resetting}
            >
              {resetting ? "초기화 중..." : "🗑 연습 데이터 초기화"}
            </button>
          )}
        </div>
      </div>

      {/* 본문: 좌(목록) + 우(대화) */}
      <div className="flex gap-4 flex-1 min-h-0">
        <DanggeunListPane
          cfg={cfg}
          candidates={candidates}
          branches={branches}
          branchFilter={branchFilter}
          setBranchFilter={setBranchFilter}
          search={search}
          setSearch={setSearch}
          listLoading={listLoading}
          listError={listError}
          fetchCandidates={fetchCandidates}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />

        <DanggeunChatPane
          cfg={cfg}
          selectedCandidate={selectedCandidate}
          selectedId={selectedId}
          messages={messages}
          msgLoading={msgLoading}
          messagesError={messagesError}
          fetchMessages={fetchMessages}
          outbound={outbound}
          setOutbound={setOutbound}
          sending={sending}
          handleSendReply={handleSendReply}
          agentStage={agentStage}
          agentState={agentState}
          actionBusy={actionBusy}
          setActionBusy={setActionBusy}
          actionBusyRef={actionBusyRef}
          statusSaving={statusSaving}
          handleStatusChange={handleStatusChange}
          setDetailOpen={setDetailOpen}
          confirm={confirm}
          toast={toast}
        />
      </div>

      {/* 모달: 지원자 미니 상세 정보 (편집 가능) — 공용 컴포넌트 */}
      {detailOpen && selectedCandidate && (
        <ApplicantMiniDetail
          applicant={selectedCandidate}
          branches={branches}
          onClose={() => setDetailOpen(false)}
          onPatched={(patch: MiniApplicantPatch) => {
            setCandidates((prev) =>
              prev.map((c) =>
                c.id === selectedCandidate.id ? { ...c, ...patch } : c
              )
            );
          }}
        />
      )}
    </div>
  );
}
