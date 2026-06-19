"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { getBrowserClient } from "@/lib/supabase";
import { useIncrementalList } from "@/lib/admin/useIncrementalList";
import AgentJobsView from "./agent/AgentJobsView";
import PlaygroundView from "./agent/PlaygroundView";
import DanggeunView from "./agent/DanggeunView";
import PromptExamplesView from "./prompts/PromptExamplesView";
import SiteManagersView from "./site-managers/SiteManagersView";
import { sourceLabel } from "@/lib/applicant-source";
import ApplicantFormModal, { type ApplicantFormValue } from "./ApplicantFormModal";
import PendingInboxView from "./inbox/PendingInboxView";
import ApplicantMiniDetail from "./ApplicantMiniDetail";
import { AppShell } from "@/components/admin/AppShell";
import { PipelineView } from "@/components/admin/PipelineView";
import { DashboardView } from "@/components/admin/DashboardView";
import type { UsageDailyCost } from "@/components/admin/CostCard";
import { RecommendView } from "@/components/admin/RecommendView";
import { BranchAdminView } from "@/components/admin/BranchAdminView";
import { HopeSlotsView } from "@/components/admin/HopeSlotsView";
import { ConfirmedSlotsView } from "@/components/admin/ConfirmedSlotsView";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { ApplicantDetailView } from "@/components/admin/ApplicantDetailView";
import { useToast } from "@/components/ui/toast";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import {
  type Applicant,
  type Heartbeat,
  type Branch,
  type Tab,
  STATUS_COLORS,
  ALL_STATUSES,
  SLOTS,
  calcAge,
  shortWorkHours,
  matchesSlot,
} from "@/lib/admin/types";

const SIDEBAR_PIN_KEY = "admin_sidebar_pinned";

export default function AdminPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sidebarPinned, setSidebarPinned] = useState(true);
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
  const [loadError, setLoadError] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState(false);
  const [branchFilter, setBranchFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 지원자 추가/편집 모달
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [modalInitial, setModalInitial] = useState<ApplicantFormValue | null>(null);

  // 문자 대화 — 열린 지원자만 page가 보관(나머지 상태/구독은 ChatPanel이 소유)
  const [chatApplicant, setChatApplicant] = useState<Applicant | null>(null);

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
      toast({ title: "인입 메시지를 입력해주세요", tone: "info" });
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
        toast({ title: json.error || "테스트에 실패했어요", tone: "error" });
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
      toast({ title: "테스트 중 오류가 발생했어요", tone: "error" });
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

  // 대시보드 비용 카드 (usage_daily_cost)
  const [usage, setUsage] = useState<UsageDailyCost[]>([]);

  // PPC 상세에서 '✏️ 편집' 버튼으로 여는 미니 모달 — 지원자 목록과 동일한 섹션 편집 UX.
  const [ppcDetailId, setPpcDetailId] = useState<number | null>(null);

  // 추천 받기 state
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/applicants", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data || []);
      setLoadError(false);
    } catch {
      console.error("데이터 로딩 실패");
      setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/branches", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setBranches(json.data || []);
      setBranchesError(false);
    } catch {
      console.error("지점 목록 로딩 실패");
      setBranchesError(true);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  const fetchHeartbeats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/heartbeat", { cache: "no-store" });
      const json = await res.json();
      setHeartbeats(json.data || []);
    } catch {
      console.error("Heartbeat 로딩 실패");
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/usage", { cache: "no-store" });
      const json = await res.json();
      setUsage(json.data || []);
    } catch {
      console.error("비용 로딩 실패");
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
          toast({ title: "저장에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
          fetchData(true);
          return false;
        }
        setData((prev) => prev.map((a) => (a.id === id ? { ...a, ...json.data } : a)));
        return true;
      } catch (err) {
        console.error("[patchApplicant]", err);
        toast({ title: "네트워크 오류가 발생했어요", tone: "error" });
        fetchData(true);
        return false;
      }
    },
    [fetchData, toast]
  );

  const openChat = (applicant: Applicant) => {
    setChatApplicant(applicant);
  };

  // ChatPanel 열람 시 목록의 unread_count를 0으로 동기화
  const clearUnread = useCallback((applicantId: number) => {
    setData((prev) =>
      prev.map((a) => (a.id === applicantId ? { ...a, unread_count: 0 } : a))
    );
  }, []);

  useEffect(() => {
    fetchData();
    fetchHeartbeats();
    fetchBranches();
    fetchUsage();
    // 폴링은 Realtime 끊김 시 fallback (60초)
    const dataInterval = setInterval(() => fetchData(true), 60000);
    const hbInterval = setInterval(fetchHeartbeats, 60000);
    return () => { clearInterval(dataInterval); clearInterval(hbInterval); };
  }, [fetchData, fetchHeartbeats, fetchBranches, fetchUsage]);

  // ── Realtime 구독: applicants / device_heartbeat (messages·drafts는 ChatPanel이 소유) ──
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
  // 지점 매칭 — 확정/대기는 confirmed_branch 우선, 미확정은 branch1(1지망) fallback.
  // 이래야 status만 바꾸고 confirmed_branch를 안 채운 케이스도 1지망 지점으로 잡힘.
  const branchOf = (a: Applicant): string | null =>
    a.confirmed_branch ?? a.branch1 ?? a.branch;
  const branchStats = allBranchNames.map((b) => {
    const inBranch = data.filter((a) => branchOf(a) === b);
    return {
      name: b,
      total: inBranch.length,
      pre: inBranch.filter((a) => a.status === "스크리닝 전").length,
      inProg: inBranch.filter((a) => a.status === "스크리닝 중").length,
      done: inBranch.filter((a) => a.status === "스크리닝 완료").length,
      confirmed: inBranch.filter((a) => a.status === "확정인력").length,
      waiting: inBranch.filter((a) => a.status === "대기자").length,
    };
  });

  // 최근 14일 일별 지원 수 (대시보드 스파크라인)
  const dailyApplied = (() => {
    const days = 14;
    const buckets = new Array(days).fill(0) as number[];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    data.forEach((a) => {
      const t = new Date(a.created_at).getTime();
      const dayDiff = Math.floor((startOfToday - new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime()) / 86400000);
      if (dayDiff >= 0 && dayDiff < days) buckets[days - 1 - dayDiff] += 1;
    });
    return buckets;
  })();

  // 라이브 티커용 최근 활동 (created_at 최신순 12명)
  const recentActivity = [...data]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 12)
    .map((a) => ({ id: a.id, name: a.name, branch: branchOf(a), status: a.status }));

  // 배송원 컨택 리스트 — 큰 리스트는 점진 렌더링(useIncrementalList)으로 DOM 노드 수 제어
  const contactList = data
    .filter((a) => {
      if (branchFilter !== "전체" && a.branch !== branchFilter) return false;
      if (search && !a.name.includes(search) && !a.phone.includes(search)) return false;
      return true;
    })
    .sort((a, b) => {
      if ((b.unread_count || 0) !== (a.unread_count || 0)) return (b.unread_count || 0) - (a.unread_count || 0);
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const {
    visible: visibleContacts,
    hasMore: hasMoreContacts,
    sentinelRef: contactSentinelRef,
  } = useIncrementalList(contactList, { step: 50, resetKey: `${branchFilter}|${search}` });

  const selected = data.find((a) => a.id === selectedId);

  const navBadges: Record<string, number | undefined> = {
    applicants: stats.screeningInProg,
    contact: data.reduce((s, a) => s + (a.unread_count || 0), 0),
  };

  return (
    <>
      <style suppressHydrationWarning>{css}</style>
      <AppShell
        active={tab}
        onNavigate={(t) => setTab(t as Tab)}
        pinned={sidebarPinned}
        onTogglePin={() => setSidebarPinned((p) => !p)}
        showOther={showOther}
        onToggleOther={() => setShowOther((v) => !v)}
        badges={navBadges}
        onRefresh={() => fetchData()}
      >
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
            <LoadingState label="데이터 불러오는 중…" />
          ) : tab === "dashboard" ? (
            <div className="content">
              {loadError && data.length === 0 ? (
                <ErrorState onRetry={() => fetchData()} />
              ) : (
                <DashboardView stats={stats} branchStats={branchStats} dailyApplied={dailyApplied} recentActivity={recentActivity} usage={usage} />
              )}
            </div>
          ) : tab === "applicants" ? (
            <div className="content">
              {!selected && (
                <PipelineView
                  applicants={filtered}
                  loading={loading}
                  loadError={loadError}
                  onRetry={() => fetchData()}
                  branchNames={allBranchNames}
                  allStatuses={ALL_STATUSES}
                  branchFilter={branchFilter}
                  statusFilter={statusFilter}
                  search={search}
                  onBranchFilter={setBranchFilter}
                  onStatusFilter={setStatusFilter}
                  onSearch={setSearch}
                  onSelect={(id) => setSelectedId(id)}
                  onAdd={() => { setModalInitial(null); setModalMode("create"); }}
                  onPatch={(id, patch) => patchApplicant(id, patch as Partial<Applicant>)}
                  calcAge={calcAge}
                  formatWorkHours={shortWorkHours}
                />
              )}

              {selected && (
                <ApplicantDetailView
                  key={selected.id}
                  applicant={selected}
                  branches={allBranchNames}
                  onClose={() => setSelectedId(null)}
                  onPatch={(id, patch) => patchApplicant(id, patch)}
                />
              )}
            </div>
          ) : tab === "hope-slots" ? (
            <HopeSlotsView
              data={data}
              branchNames={allBranchNames}
              onSelectApplicant={(id) => {
                setTab("applicants");
                setSelectedId(id);
              }}
            />
          ) : tab === "confirmed-slots" ? (
            <ConfirmedSlotsView
              data={data}
              branches={branches}
              onPatch={(id, patch) => patchApplicant(id, patch)}
              onOpenDetail={setPpcDetailId}
            />
          ) : tab === "recommend" ? (
            <RecommendView />
          ) : tab === "branches" ? (
            branchesError && branches.length === 0 ? (
              <ErrorState onRetry={() => fetchBranches()} />
            ) : (
              <BranchAdminView
                branches={branches}
                branchesLoading={branchesLoading}
                data={data}
                onBranchesChanged={fetchBranches}
              />
            )
          ) : tab === "site-managers" ? (
            <SiteManagersView branches={allBranchNames} />
          ) : tab === "agent" ? (
            <AgentJobsView branches={allBranchNames} />
          ) : tab === "playground" ? (
            <PlaygroundView branches={allBranchNames} />
          ) : tab === "danggeun" ? (
            <DanggeunView mode="live" branches={allBranchNames} />
          ) : tab === "baemin" ? (
            <DanggeunView mode="baemin" branches={allBranchNames} />
          ) : tab === "danggeun-practice" ? (
            <DanggeunView mode="practice" branches={allBranchNames} />
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
                {loadError && data.length === 0 ? (
                  <ErrorState onRetry={() => fetchData()} />
                ) : contactList.length === 0 ? (
                  <EmptyState title="대화할 지원자가 없어요" hint="검색어나 필터를 바꿔보세요." />
                ) : (
                  <>
                    {visibleContacts.map((a) => (
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
                    ))}
                    {hasMoreContacts && <div ref={contactSentinelRef} style={{ height: 16 }} aria-hidden />}
                  </>
                )}
              </div>
            </div>
          ) : null}
          {/* 대화 패널 (카카오톡 스타일) — ChatPanel이 메시지/초안/발송/구독 소유 */}
          {chatApplicant && (
            <ChatPanel
              applicant={chatApplicant}
              onClose={() => setChatApplicant(null)}
              onUnreadCleared={clearUnread}
            />
          )}
      </AppShell>

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

      {/* PPC 표에서 ✏️ 클릭 시 — 공용 미니 상세 모달 */}
      {ppcDetailId != null && (() => {
        const a = data.find((x) => x.id === ppcDetailId);
        if (!a) return null;
        return (
          <ApplicantMiniDetail
            applicant={a}
            branches={allBranchNames}
            onClose={() => setPpcDetailId(null)}
            onPatched={(patch) => {
              // 서버 PATCH 응답의 nullable 필드는 Applicant 타입(non-null string)과 어긋날 수 있으나
              // 런타임상 안전 — 매니저가 빈 값으로 비운 컬럼은 화면에서 "—"로 표시되면 충분.
              setData((prev) =>
                prev.map((x) => x.id === a.id ? ({ ...x, ...patch } as Applicant) : x)
              );
            }}
          />
        );
      })()}
    </>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font-sans); background: #ffffff; color: #151515; }

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
  .nav-active { background: rgba(245,197,24,0.15); color: #e4b976; }
  .nav-active:hover { background: rgba(245,197,24,0.2); color: #e4b976; }
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
  .content { padding: 32px; max-width: 1800px; }
  .loading { padding: 100px; text-align: center; color: #9ca3af; font-size: 15px; }

  .page-title { font-size: 20px; font-weight: 700; margin-bottom: 24px; }
  .page-desc { font-size: 13px; color: #4b5563; margin: -16px 0 24px; }
  .count { font-size: 14px; font-weight: 500; color: #6b7280; margin-left: 8px; }
  .applicants-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px;
  }
  .applicants-head .page-title { margin-bottom: 0; }
  .add-applicant-btn {
    background: #e4b976; color: #3D2B00; border: none; padding: 8px 14px;
    border-radius: 6px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: background 0.15s;
  }
  .add-applicant-btn:hover { background: #d2a55f; }

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
  .filter-select:focus, .filter-input:focus { border-color: #e4b976; }
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
  .clickable:hover { background: #f7eedd; }
  .row-selected { background: #f7eedd; }
  .td-bold { font-weight: 600; }
  .td-warn { color: #f59e0b; font-weight: 700; }
  .td-success { color: #10b981; font-weight: 700; }
  .td-orange { color: #f97316; font-weight: 700; }
  .td-muted { color: #D1D5DB; font-size: 12px; }

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

  /* 지원자 목록 — 상세는 풀스크린 토글 (목록과 교차 표시) */
  .applicants-table-wrap { width: 100%; }

  .detail-panel {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 20px; margin-top: 16px;
  }
  .detail-fullscreen { min-height: 70vh; font-size: 13px; }
  .detail-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #F3F4F6; }
  .detail-title { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex: 1; margin: 0; }
  .close-btn {
    border: none; background: none; font-size: 16px; cursor: pointer;
    color: #9ca3af; font-weight: 700; padding: 4px 8px;
  }
  .detail-actions { display: flex; gap: 8px; align-items: center; }
  .save-btn {
    padding: 7px 16px; background: #e4b976; color: #3D2B00;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: #d2a55f; }
  .save-btn:disabled { background: #ECECEC; color: #B0B0B0; cursor: not-allowed; }
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
  .detail-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 24px;
    margin-bottom: 20px; padding: 14px 16px;
    background: #FAFAF8; border-radius: 8px;
    font-size: 13px; color: #1F2937; line-height: 1.5;
  }
  .detail-grid > div { font-size: 13px; }
  .detail-grid .detail-wide { grid-column: span 2; }
  .dl { font-size: 11px; color: #9ca3af; display: block; margin-bottom: 3px; font-weight: 600; letter-spacing: 0.02em; }
  .detail-section { margin-bottom: 16px; font-size: 13px; }
  .detail-section-title {
    font-size: 14px; font-weight: 700; color: #374151;
    margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #F3F4F6;
  }
  .detail-section-title:first-of-type { margin-top: 4px; }
  /* 섹션 헤더 — [편집] 또는 [취소][저장] 버튼이 같은 줄에 */
  .section-header-row {
    display: flex; align-items: center; justify-content: space-between;
    margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #F3F4F6;
  }
  .section-header-row:first-child { margin-top: 4px; }
  .section-title-inline { font-size: 14px !important; margin: 0 !important; padding: 0 !important; border: none !important; }
  .section-edit-btn {
    padding: 3px 10px; border: 1px solid #D1D5DB; border-radius: 6px;
    background: #fff; cursor: pointer; font-size: 11px; font-weight: 500;
    color: #4B5563; font-family: inherit; transition: all 0.1s;
  }
  .section-edit-btn:hover { border-color: #1F2937; color: #111827; background: #FAFAF8; }
  .section-edit-actions { display: flex; gap: 6px; }
  .cancel-btn-sm, .save-btn-sm { font-size: 11px; padding: 4px 10px; }
  .check-label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
  .detail-text { font-size: 13px; line-height: 1.6; color: #374151; white-space: pre-wrap; }

  .empty { text-align: center; padding: 60px; color: #9ca3af; font-size: 14px; }

  /* 편집 가능 영역 */
  .edit-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px; padding: 16px; background: #f7eedd; border: 1px solid #e4b976;
    border-radius: 10px; margin-bottom: 16px;
  }
  .edit-field { display: flex; flex-direction: column; gap: 6px; }
  .edit-field-wide { grid-column: 1 / -1; }
  .slot-toggle-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .slot-toggle {
    padding: 6px 12px; border: 1.5px solid #E8E8E0; border-radius: 99px;
    font-size: 13px; font-family: inherit; background: #fff; cursor: pointer; color: #6b7280;
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
  /* 확정슬롯 매트릭스 — 정원 대비 충원 상태 시각화 */
  .cell-empty    { color: #991b1b; background: #fee2e2; }  /* 0/N — 빨강 */
  .cell-partial  { color: #854d0e; background: #fef9c3; }  /* 1~N미만 — 노랑 */
  .cell-full     { color: #064e3b; background: #d1fae5; }  /* N이상 — 초록 (재정의) */
  .cell-disabled { color: #d1d5db; background: #fafafa; }  /* 정원=0(미운영) — 중립 회색 */
  .cell-active { outline: 2px solid #e4b976; outline-offset: -2px; }
  .conf-main { font-size: 14px; font-weight: 700; }
  .conf-cap { font-size: 11px; font-weight: 500; opacity: 0.55; margin-left: 1px; }
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

  .slot-section-title {
    font-size: 12px; font-weight: 700; color: #065F46;
    margin: 16px 0 6px; letter-spacing: 0.02em;
  }
  .slot-section-title:first-child { margin-top: 0; }
  .slot-section-waiting { color: #92400E; }

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

  /* PPC 상세 — 시트 스타일 (지점 단위 전체 보기 + 인라인 편집) */
  .branch-row { cursor: pointer; transition: background 0.1s; }
  .branch-row:hover { background: #F0F9FF; }
  .branch-row:hover .branch-name-cell { color: #0369A1; }
  .ppc-fullscreen {
    background: #fff; border: 1px solid #e8e8e0; border-radius: 12px;
    padding: 20px; min-height: 70vh;
  }
  .ppc-toolbar {
    display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
    padding-bottom: 16px; border-bottom: 1px solid #F3F4F6;
  }
  .ppc-back-btn {
    padding: 6px 12px; border: 1px solid #D1D5DB; border-radius: 6px;
    background: #fff; cursor: pointer; font-size: 13px; font-weight: 500;
    color: #374151; transition: all 0.1s;
  }
  .ppc-back-btn:hover { background: #F9FAFB; border-color: #9CA3AF; }
  .ppc-title { font-size: 18px; font-weight: 700; flex: 1; margin: 0; }
  .ppc-summary { font-size: 13px; color: #4B5563; font-weight: 600; }
  .ppc-cap {
    font-size: 11px; font-weight: 500; color: #6b7280; margin-left: 10px;
    background: #F3F4F6; padding: 2px 8px; border-radius: 6px;
  }
  .ppc-filter-bar {
    display: flex; align-items: center; gap: 6px; margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .ppc-filter-label { font-size: 12px; color: #6B7280; font-weight: 500; margin-right: 4px; }
  .ppc-filter-clear {
    padding: 2px 8px; background: transparent; border: none; cursor: pointer;
    color: #6B7280; font-size: 11px; font-weight: 500; text-decoration: underline;
  }
  .ppc-filter-clear:hover { color: #111827; }
  .ppc-filtered-of { color: #9CA3AF; font-weight: 400; font-size: 11px; }
  .ppc-table th { font-size: 11px; font-weight: 600; }
  .ppc-table td { vertical-align: middle; padding: 6px 8px; }
  .ppc-check { width: 16px; height: 16px; cursor: pointer; }
  .ppc-edit-btn {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #6b7280;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
    line-height: 1;
  }
  .ppc-edit-btn:hover { background: #f7eedd; border-color: #e4b976; color: #92650A; }
  .ppc-order-buttons {
    display: inline-flex;
    flex-direction: column;
    gap: 1px;
    margin-right: 2px;
  }
  .ppc-order-btn {
    background: transparent;
    border: 1px solid #e5e7eb;
    color: #9ca3af;
    width: 18px;
    height: 14px;
    border-radius: 3px;
    font-size: 8px;
    cursor: pointer;
    font-family: inherit;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .ppc-order-btn:hover:not(:disabled) {
    background: #f7eedd;
    border-color: #e4b976;
    color: #92650A;
  }
  .ppc-order-btn:disabled { opacity: 0.25; cursor: not-allowed; }
  .slot-chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .slot-chip {
    display: inline-block; padding: 2px 7px; border-radius: 10px;
    font-size: 10px; font-weight: 600; white-space: nowrap;
  }
  .slot-chip-btn {
    cursor: pointer; border: 1.5px solid transparent; transition: all 0.1s;
    font-size: 11px; padding: 4px 10px;
  }
  .slot-chip-off { opacity: 0.45; background: #F3F4F6 !important; color: #9CA3AF !important; }
  .slot-chip-on { opacity: 1; border-color: currentColor; }
  .chip-wd-am { background: #FEF3C7; color: #92400E; }   /* 평일오전 - 노랑 */
  .chip-wd-pm { background: #FED7AA; color: #9A3412; }   /* 평일오후 - 주황 */
  .chip-we-am { background: #E0E7FF; color: #3730A3; }   /* 주말오전 - 연보라 */
  .chip-we-pm { background: #DDD6FE; color: #5B21B6; }   /* 주말오후 - 진보라 */

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
    border-color: #e4b976; background: #f7eedd;
    color: #92650A; font-weight: 700;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }
  .rec-textarea {
    width: 100%; padding: 12px; border: 1.5px solid #e8e8e0; border-radius: 8px;
    font-family: inherit; font-size: 13px; line-height: 1.6; outline: none;
    resize: vertical;
  }
  .rec-textarea:focus { border-color: #e4b976; }
  .rec-input {
    width: 100%; padding: 10px 12px; border: 1.5px solid #e8e8e0; border-radius: 8px;
    font-family: inherit; font-size: 13px; outline: none; margin-top: 8px;
  }
  .rec-input:focus { border-color: #e4b976; }
  .rec-advanced { margin-top: 12px; }
  .rec-advanced summary { font-size: 12px; color: #6b7280; cursor: pointer; padding: 4px 0; }
  .rec-btn-primary {
    margin-top: 14px; padding: 10px 24px;
    background: #e4b976; color: #3D2B00; border: none; border-radius: 8px;
    font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer;
    transition: background 0.15s;
  }
  .rec-btn-primary:hover:not(:disabled) { background: #d2a55f; }
  .rec-btn-primary:disabled { background: #ECECEC; color: #B0B0B0; cursor: not-allowed; }
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
    background: #FEF3C7; border: 1px solid #e4b976; border-radius: 6px;
    font-size: 12px; color: #78350F; line-height: 1.6;
  }
  .rec-gen-missing code {
    background: #fff; padding: 1px 5px; border-radius: 3px; font-size: 11px;
  }
  .rec-missing-chip {
    display: inline-block; margin: 2px 4px 2px 0; padding: 1px 8px;
    background: #fff; border: 1px solid #e4b976; border-radius: 10px;
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
  .branch-name-input:focus { border-color: #e4b976; }
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
  .branch-table tr.drag-ghost { background: #f7eedd; }
  .branch-table tr.drag-over { box-shadow: inset 0 2px 0 #e4b976; }
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
    border-color: #e4b976;
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

  /* 지점관리 — AI 참고 정보(ai_facts) 펼침 행 */
  .branch-row-actions { display: flex; gap: 6px; align-items: center; justify-content: flex-end; }
  .branch-ai-btn {
    padding: 4px 10px; border: 1px solid #D1D5DB; border-radius: 6px;
    background: #fff; cursor: pointer; font-size: 12px; font-weight: 500;
    color: #4B5563; font-family: inherit; transition: all 0.1s; white-space: nowrap;
  }
  .branch-ai-btn:hover:not(:disabled) { border-color: #6366F1; color: #4338CA; background: #EEF2FF; }
  .branch-ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .branch-ai-btn-filled { background: #EEF2FF; color: #4338CA; border-color: #C7D2FE; }
  .branch-ai-row td { padding: 0 !important; background: #F9FAFB; border-bottom: 2px solid #E5E7EB; }
  .branch-ai-wrap { padding: 12px 20px 16px; }
  .branch-ai-label { font-size: 12px; color: #4B5563; margin-bottom: 6px; }
  .branch-ai-textarea {
    width: 100%; padding: 10px 12px; border: 1.5px solid #E5E7EB; border-radius: 8px;
    font-size: 13px; font-family: inherit; resize: vertical; min-height: 80px;
    background: #fff; outline: none; transition: border-color 0.15s; line-height: 1.5;
  }
  .branch-ai-textarea:focus { border-color: #6366F1; }
  .branch-ai-hint { font-size: 11px; color: #9CA3AF; margin-top: 6px; }

  .rec-result { margin-top: 12px; }
  .rec-job-info {
    background: #f7eedd; padding: 14px 16px; border-radius: 10px; border: 1px solid #e4b976;
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
  .td-meta { font-size: 11px; color: #6b7280; }

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
    background: #f7eedd; border: 1px solid #e4b976; border-radius: 10px;
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
    padding: 8px 16px; background: #e4b976; color: #3D2B00;
    border: none; border-radius: 8px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: background 0.15s;
  }
  .sc-btn:hover { background: #d2a55f; }
  .sc-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .sc-btn-loading { background: #d4a50e; }

  .row-action-btn {
    padding: 5px 10px; background: #e4b976; color: #3D2B00;
    border: none; border-radius: 6px; font-size: 11px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    transition: background 0.15s;
  }
  .row-action-btn:hover:not(:disabled) { background: #d2a55f; }
  .row-action-btn:disabled { background: #ECECEC; color: #B0B0B0; cursor: not-allowed; }
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
  .contact-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); border-color: #e4b976; }
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
    background: #e4b976; color: #3D2B00;
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
    border-color: #e4b976; background: #f7eedd;
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
    align-self: flex-end; background: #f7eedd; border-color: #e4b976;
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
    background: #FEF3C7; border-color: #e4b976;
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
  .chat-input:focus { border-color: #e4b976; }
  .chat-send-btn {
    padding: 10px 20px; background: #e4b976; color: #3D2B00;
    border: none; border-radius: 10px; font-size: 13px; font-weight: 700;
    font-family: inherit; cursor: pointer; white-space: nowrap;
    align-self: flex-end;
  }
  .chat-send-btn:hover { background: #d2a55f; }
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
    .detail-grid { grid-template-columns: 1fr 1fr; }
    .detail-grid .detail-wide { grid-column: span 2; }
  }

  /* 키보드 포커스 가시화 — 마우스 클릭엔 영향 없음(:focus-visible) */
  .admin a:focus-visible,
  .admin button:focus-visible,
  .admin input:focus-visible,
  .admin select:focus-visible,
  .admin textarea:focus-visible,
  .admin [tabindex]:focus-visible {
    outline: 2px solid #e4b976;
    outline-offset: 2px;
    border-radius: 4px;
  }
`;
