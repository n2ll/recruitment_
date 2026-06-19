"use client";

/**
 * 플레이그라운드 — 구인 에이전트 풀 시뮬레이션.
 *
 * 실제 발송 X · DB 저장 X. 매니저가 "지원자에 빙의"해서 답장을 입력하면
 * 백엔드 stage 모듈이 그대로 호출되어 응답·체크리스트 갱신·단계 전이를 보여준다.
 *
 * 좌측: 시나리오 설정 (공고 자동 생성 + 지원자 정보 입력 + 추천 1명 임포트)
 * 우측: 채팅 시뮬 + 단계 배지 + 체크리스트 + 자동 발송 미리보기
 */

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import {
  AgentState,
  ONBOARDING_KEYS,
  SCREENING_KEYS,
  STAGE_COLOR,
  STAGE_LABEL,
} from "./types";

interface PlaygroundViewProps {
  branches: string[];
}

interface SiteManager {
  id: number;
  name: string;
  phone: string;
  branch: string | null;
  active: boolean;
}

interface RecCandidate {
  id: number;
  source: "applicant" | "legacy";
  name: string;
  phone: string;
  birth_date?: string | null;
  own_vehicle?: string | null;
  location?: string | null;
  sigungu?: string | null;
  score: { total: number; distance: number; vehicle: number; recency: number; distanceKm: number };
}

type SimStage = "exploration" | "screening" | "onboarding" | "active";

interface ConvTurn {
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
  reasoning?: string;
  transition?: string;
  auto_preview?: string[];
}

const SLOTS = ["평일오전", "평일오후", "주말오전", "주말오후"] as const;

export default function PlaygroundView({ branches }: PlaygroundViewProps) {
  const toast = useToast();
  const confirm = useConfirm();
  // ── 공고 ──────────────────────────────────────────────
  const [rough, setRough] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateMissing, setGenerateMissing] = useState<string[]>([]);
  const [jobTitle, setJobTitle] = useState("강북미아 평일오전 자차");
  const [jobBody, setJobBody] = useState("");
  const [jobBranch, setJobBranch] = useState<string>("");
  const [jobSlot, setJobSlot] = useState<string>("");
  const [jobStartDate, setJobStartDate] = useState("");
  const [jobVehicle, setJobVehicle] = useState(true);
  const [jobPickup, setJobPickup] = useState("");
  const [jobSiteManagerId, setJobSiteManagerId] = useState<number | null>(null);
  const [siteManagers, setSiteManagers] = useState<SiteManager[]>([]);

  useEffect(() => {
    fetch("/api/admin/site-managers", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.data)) {
          setSiteManagers((j.data as SiteManager[]).filter((m) => m.active));
        }
      })
      .catch((e) => console.error("[playground] site-managers load", e));
  }, []);

  // ── 지원자 (가짜) ─────────────────────────────────────
  const [appName, setAppName] = useState("홍길동");
  const [appPhone, setAppPhone] = useState("010-0000-0000");
  const [appBranch1, setAppBranch1] = useState<string>("");
  const [appWorkHours, setAppWorkHours] = useState("평일 오전");
  const [appAvailableDate, setAppAvailableDate] = useState("");
  const [appOwnVehicle, setAppOwnVehicle] = useState("있음");
  const [appLicense, setAppLicense] = useState("1종 보통");
  const [appLocation, setAppLocation] = useState("서울 강북구 미아동");
  const [appSelfOwnership, setAppSelfOwnership] = useState("문제 없음");

  // ── 후보 추천 (실제 호출, 후보 1명 임포트용) ──────────
  const [recLoading, setRecLoading] = useState(false);
  const [candidates, setCandidates] = useState<RecCandidate[]>([]);

  // ── 시뮬 상태 ─────────────────────────────────────────
  const [stage, setStage] = useState<SimStage>("exploration");
  const [agentState, setAgentState] = useState<AgentState>({});
  const [conversation, setConversation] = useState<ConvTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageBadge = STAGE_LABEL[stage] ?? stage;
  const stageBadgeColor = STAGE_COLOR[stage];

  const progress = useMemo(() => {
    if (stage === "screening") {
      const cl = (agentState.screening ?? {}) as Record<string, boolean>;
      const done = SCREENING_KEYS.filter((k) => cl[k] === true).length;
      return { done, total: SCREENING_KEYS.length, keys: SCREENING_KEYS, cl };
    }
    if (stage === "onboarding") {
      const cl = (agentState.onboarding ?? {}) as Record<string, boolean>;
      const done = ONBOARDING_KEYS.filter((k) => cl[k] === true).length;
      return { done, total: ONBOARDING_KEYS.length, keys: ONBOARDING_KEYS, cl };
    }
    return { done: 0, total: 0, keys: [] as readonly string[], cl: {} as Record<string, boolean> };
  }, [stage, agentState]);

  // ── 액션 ──────────────────────────────────────────────

  const generateBody = async () => {
    if (!rough.trim()) {
      toast({ title: "메모를 입력해주세요", tone: "info" });
      return;
    }
    setGenerating(true);
    setGenerateMissing([]);
    try {
      const res = await fetch("/api/admin/recommend/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rough }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "공고 생성에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
        return;
      }
      setJobBody(json.posting || "");
      setGenerateMissing(Array.isArray(json.missing) ? json.missing : []);
      const firstLine = (json.posting as string).split("\n")[0]?.replace(/[\[\]]/g, "").trim();
      if (firstLine) setJobTitle(firstLine.slice(0, 60));
    } catch {
      toast({ title: "공고 생성 중 오류가 발생했어요", tone: "error" });
    } finally {
      setGenerating(false);
    }
  };

  const fetchRecommendations = async () => {
    if (!jobBody.trim()) {
      toast({ title: "공고 본문을 먼저 작성해주세요", tone: "info" });
      return;
    }
    setRecLoading(true);
    try {
      const res = await fetch("/api/admin/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          posting: jobBody,
          vehicle_required: jobVehicle,
          manual_address: jobPickup || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "추천에 실패했어요", description: json.error || "알 수 없는 오류", tone: "error" });
        return;
      }
      setCandidates(json.candidates || []);
      if (!jobPickup && json.job?.address) setJobPickup(json.job.address);
    } catch {
      toast({ title: "추천 중 오류가 발생했어요", tone: "error" });
    } finally {
      setRecLoading(false);
    }
  };

  const importCandidate = (c: RecCandidate) => {
    setAppName(c.name);
    setAppPhone(c.phone);
    setAppLocation(c.location ?? c.sigungu ?? "");
    setAppOwnVehicle(c.own_vehicle ?? "있음");
    toast({ title: `${c.name}님의 정보를 지원자로 가져왔어요`, tone: "success" });
  };

  const resetSim = async () => {
    if (conversation.length > 0) {
      const ok = await confirm({
        title: "대화·체크리스트를 초기화할까요?",
        confirmText: "초기화",
        destructive: true,
      });
      if (!ok) return;
    }
    setStage("exploration");
    setAgentState({});
    setConversation([]);
    setInput("");
    setError(null);
  };

  const sendInbound = async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setError(null);

    // 1) 구직자(빙의) 메시지를 대화에 추가
    const inboundTurn: ConvTurn = {
      direction: "inbound",
      body: text,
      created_at: new Date().toISOString(),
    };
    const newConv = [...conversation, inboundTurn];
    setConversation(newConv);
    setInput("");

    // 2) 백엔드 stage 모듈 호출
    try {
      const res = await fetch("/api/admin/agent/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stage,
          job: {
            id: 0,
            title: jobTitle,
            body: jobBody,
            branch: jobBranch || null,
            slot: jobSlot || null,
            start_date: jobStartDate || null,
            vehicle_required: jobVehicle,
            pickup_address: jobPickup || null,
            site_manager_id: jobSiteManagerId,
          },
          applicant: {
            id: 0,
            name: appName,
            phone: appPhone,
            birth_date: null,
            location: appLocation,
            own_vehicle: appOwnVehicle,
            license_type: appLicense,
            vehicle_type: null,
            branch1: appBranch1 || jobBranch || null,
            branch2: null,
            work_hours: appWorkHours,
            available_date: appAvailableDate || null,
            self_ownership: appSelfOwnership,
            introduction: null,
            experience: null,
          },
          history: conversation.map((t) => ({
            direction: t.direction,
            body: t.body,
            created_at: t.created_at,
          })),
          state: agentState,
          inbound_text: text,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "에이전트 호출 실패");
        return;
      }
      const result = json.result;

      // 3) 응답 turn 추가
      // AI 응답이 비어 있으면(advance 직전 / 만남장소 자동발송 직전 등),
      // 시스템 자동 발송 메시지를 에이전트 말풍선의 본문으로 사용한다.
      // 그 외 케이스는 본문 + 자동발송 미리보기 분리 표시.
      const autoMessages = Array.isArray(json.auto_messages_preview)
        ? (json.auto_messages_preview as string[])
        : [];
      const replyEmpty = !result.reply_text || !String(result.reply_text).trim();
      const useAutoAsBody = replyEmpty && autoMessages.length > 0;
      const fallbackEmpty =
        result.transition.kind === "pause"
          ? "(pause — 매니저 인계 대기)"
          : result.transition.kind === "abort"
          ? "(abort — 종료)"
          : "(응답 없음)";

      const outboundTurn: ConvTurn = {
        direction: "outbound",
        body: useAutoAsBody
          ? autoMessages.join("\n\n────────────\n\n")
          : result.reply_text || fallbackEmpty,
        created_at: new Date().toISOString(),
        reasoning: result.reasoning,
        transition:
          result.transition.kind === "advance"
            ? `→ ${result.transition.to} (${result.transition.reason})`
            : result.transition.kind === "pause"
            ? `⏸ pause: ${result.transition.reason}`
            : result.transition.kind === "abort"
            ? `⛔ abort: ${result.transition.reason}`
            : undefined,
        // useAutoAsBody일 땐 본문에 이미 들어갔으므로 별도 preview 영역 안 보여줌
        auto_preview: !useAutoAsBody && autoMessages.length > 0 ? autoMessages : undefined,
      };
      setConversation([...newConv, outboundTurn]);

      // 4) state 갱신 (stage.process가 만든 state_update를 그대로 적용)
      setAgentState(result.state_update);

      // 5) 단계 전이
      if (result.transition.kind === "advance") {
        setStage(result.transition.to as SimStage);
      } else if (result.transition.kind === "pause") {
        // playground에선 pause 시각적 표시만, stage는 유지
      } else if (result.transition.kind === "abort") {
        // 시뮬 종료 안내
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setSending(false);
    }
  };

  const undoLast = () => {
    if (conversation.length === 0) return;
    // 마지막 outbound + 그 직전 inbound를 되돌림
    const next = [...conversation];
    while (next.length > 0 && next[next.length - 1].direction === "outbound") next.pop();
    if (next.length > 0 && next[next.length - 1].direction === "inbound") next.pop();
    setConversation(next);
    // state는 보존 (정확한 되돌림은 어렵, 단순화)
  };

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-0 h-[calc(100vh-33px)] bg-bone/30 text-[13px] text-ink-black">
      {/* 좌: 시나리오 설정 */}
      <section className="w-[440px] shrink-0 bg-paper-white border-r border-bone py-[18px] px-[20px] overflow-y-auto">
        <h3 className="text-[13px] font-bold mt-0 mb-2">📢 공고</h3>

        <details className="bg-sand border border-honey-gold rounded-lg py-2.5 px-3 mb-2.5" open={!jobBody}>
          <summary className="cursor-pointer text-[12px] font-semibold text-burnt-amber">메모 자동 생성</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            <textarea
              className="w-full py-[7px] px-[10px] border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none focus:border-honey-gold resize-y min-h-[50px] leading-[1.55]"
              placeholder="예) 강북미아 토일 장보기 자차, 시급 1.5~2만"
              rows={2}
              value={rough}
              onChange={(e) => setRough(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={generateBody} disabled={generating}>
              {generating ? "생성 중..." : "본문 자동 생성"}
            </Button>
            {generateMissing.length > 0 && (
              <div className="text-[11px] text-burnt-amber">
                ⚠️ 빠진 항목: {generateMissing.join(", ")}
              </div>
            )}
          </div>
        </details>

        <label className="block text-[11px] font-semibold text-graphite mt-2 mb-1">제목</label>
        <input className="w-full py-[7px] px-[10px] border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none focus:border-honey-gold" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />

        <label className="block text-[11px] font-semibold text-graphite mt-2 mb-1">본문 (SMS로 보내질 텍스트)</label>
        <textarea
          className="w-full py-[7px] px-[10px] border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none focus:border-honey-gold resize-y min-h-[50px] leading-[1.55]"
          rows={8}
          value={jobBody}
          onChange={(e) => setJobBody(e.target.value)}
          placeholder="공고 본문..."
        />

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 mb-1">
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">지점</span>
            <select className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={jobBranch} onChange={(e) => setJobBranch(e.target.value)}>
              <option value="">선택 안함</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">슬롯</span>
            <select className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={jobSlot} onChange={(e) => setJobSlot(e.target.value)}>
              <option value="">선택 안함</option>
              {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">시작일</span>
            <input className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" type="date" value={jobStartDate} onChange={(e) => setJobStartDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">차량</span>
            <select className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={jobVehicle ? "1" : "0"} onChange={(e) => setJobVehicle(e.target.value === "1")}>
              <option value="1">필요</option>
              <option value="0">불필요</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">픽업 주소</span>
            <input className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={jobPickup} onChange={(e) => setJobPickup(e.target.value)} placeholder="예) 서울 강북구 도봉로 34" />
          </label>
          <label className="col-span-2 flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">현장 매니저 (만남장소 안내·확정 알림에 사용)</span>
            <select
              className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none"
              value={jobSiteManagerId ?? ""}
              onChange={(e) => setJobSiteManagerId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">선택 안함</option>
              {siteManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.phone}){m.branch ? ` — ${m.branch}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 추천 (선택) */}
        <div className="mt-2.5">
          <Button variant="outline" size="sm" onClick={fetchRecommendations} disabled={recLoading || !jobBody.trim()}>
            {recLoading ? "추천 중..." : "후보 추천 받기 (실제 풀)"}
          </Button>
          {candidates.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 max-h-[200px] overflow-y-auto">
              <div className="text-[11px] text-graphite py-1">{candidates.length}명 추천 — 클릭 시 위 지원자 정보로 임포트</div>
              {candidates.slice(0, 5).map((c) => (
                <button
                  key={`${c.source}-${c.id}`}
                  className="flex items-center gap-2 py-1.5 px-2.5 bg-stone-50 border border-bone rounded-lg font-inherit text-[11px] cursor-pointer text-left hover:bg-sand hover:border-honey-gold"
                  onClick={() => importCandidate(c)}
                >
                  <span>#{c.score.total}</span>
                  <strong>{c.name}</strong>
                  <span className="text-stone-400">{c.phone}</span>
                  <span className="text-stone-400">{c.score.distanceKm.toFixed(1)}km</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <h3 className="text-[13px] font-bold mt-[14px] mb-2">🧑 지원자 (빙의 대상)</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 mb-1">
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">이름</span>
            <input className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appName} onChange={(e) => setAppName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">전화</span>
            <input className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appPhone} onChange={(e) => setAppPhone(e.target.value)} />
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">1지망 지점</span>
            <select className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appBranch1} onChange={(e) => setAppBranch1(e.target.value)}>
              <option value="">자동(공고 지점)</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">희망 시간</span>
            <input className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appWorkHours} onChange={(e) => setAppWorkHours(e.target.value)} />
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">차량(폼)</span>
            <select className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appOwnVehicle} onChange={(e) => setAppOwnVehicle(e.target.value)}>
              <option value="있음">있음</option>
              <option value="없음">없음</option>
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">면허(폼)</span>
            <select className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appLicense} onChange={(e) => setAppLicense(e.target.value)}>
              <option value="1종 보통">1종 보통</option>
              <option value="2종 보통">2종 보통</option>
              <option value="1종 대형">1종 대형</option>
              <option value="없음">없음</option>
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">본인명의(폼)</span>
            <select className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appSelfOwnership} onChange={(e) => setAppSelfOwnership(e.target.value)}>
              <option value="문제 없음">문제 없음</option>
              <option value="문제 있음">문제 있음</option>
            </select>
          </label>
          <label className="flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">시작가능일</span>
            <input className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" type="date" value={appAvailableDate} onChange={(e) => setAppAvailableDate(e.target.value)} />
          </label>
          <label className="col-span-2 flex flex-col gap-[3px] text-[11px]"><span className="text-graphite font-semibold">거주지</span>
            <input className="py-1.5 px-2 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none" value={appLocation} onChange={(e) => setAppLocation(e.target.value)} />
          </label>
        </div>

        <h3 className="text-[13px] font-bold mt-[14px] mb-2">⚙️ 시뮬 단계</h3>
        <div className="flex gap-1.5 mb-2.5">
          {(["exploration", "screening", "onboarding", "active"] as SimStage[]).map((s) => (
            <button
              key={s}
              className={`py-1.5 px-3.5 border-[1.5px] border-bone rounded-lg font-inherit text-[12px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${stage === s ? "bg-ink-black text-paper-white border-ink-black" : "bg-paper-white"}`}
              onClick={() => setStage(s)}
              disabled={conversation.length > 0}
              title={conversation.length > 0 ? "대화 시작 후엔 자동 전이만 가능. 초기화하면 변경 가능." : ""}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>

        <Button variant="danger" size="sm" onClick={resetSim} disabled={conversation.length === 0}>
          🔄 시뮬 초기화
        </Button>
      </section>

      {/* 우: 채팅 시뮬 */}
      <section className="flex-1 flex flex-col py-[18px] px-[24px] overflow-hidden bg-paper-white">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="py-[3px] px-2.5 rounded-lg text-paper-white text-[11px] font-bold" style={{ background: stageBadgeColor }}>
            {stageBadge}
          </span>
          {progress.total > 0 && (
            <span className="text-[12px] text-graphite font-semibold">
              체크리스트 {progress.done}/{progress.total}
            </span>
          )}
          <span className="ml-auto text-[11px] text-stone-400 bg-sand py-[3px] px-2 rounded-md">실제 발송 X · DB 저장 X</span>
        </div>

        {/* 체크리스트 시각화 */}
        {progress.total > 0 && (
          <div className="flex flex-wrap gap-1 p-2.5 bg-paper-white border border-bone rounded-lg mb-3">
            {progress.keys.map((k) => (
              <span
                key={k}
                className={`text-[11px] py-[3px] px-2 rounded-md ${progress.cl[k] ? "bg-lavender-soft text-deep-violet font-semibold" : "bg-stone-100 text-graphite"}`}
              >
                {progress.cl[k] ? "✓" : "·"} {k.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* 채팅 영역 */}
        <div
          className="flex-1 bg-paper-white border border-bone rounded-xl p-3.5 overflow-y-auto flex flex-col gap-2.5"
          ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
        >
          {conversation.length === 0 ? (
            <EmptyState
              title="지원자처럼 메시지를 입력해보세요"
              hint="입력하면 실제 stage 모듈이 호출되어 응답이 옵니다."
            />
          ) : (
            conversation.map((t, idx) => (
              <div key={idx} className={`flex ${t.direction === "inbound" ? "justify-start" : "justify-end"}`}>
                <div className="max-w-[80%]">
                  <div className="text-[10px] text-stone-400 font-semibold mb-[3px]">
                    {t.direction === "inbound" ? "🙋 지원자(빙의)" : "🤖 에이전트"}
                  </div>
                  <div className={`py-2 px-3 rounded-xl text-[12px] leading-[1.6] whitespace-pre-wrap ${t.direction === "outbound" ? "bg-lavender-soft text-ink-black" : "bg-stone-100 text-ink-black"}`}>
                    {t.body}
                  </div>
                  {t.reasoning && (
                    <div className="text-[11px] text-graphite mt-1 italic">판단: {t.reasoning}</div>
                  )}
                  {t.transition && (
                    <div className={`mt-1 py-[3px] px-2 rounded-md text-[11px] font-bold inline-block ${t.transition.startsWith("→") ? "bg-lavender-soft text-deep-violet" : t.transition.startsWith("⛔") ? "bg-rose-soft text-burgundy" : "bg-sand text-burnt-amber"}`}>
                      {t.transition}
                    </div>
                  )}
                  {t.auto_preview && t.auto_preview.length > 0 && (
                    <details className="mt-1.5 bg-stone-50 rounded-md py-1.5 px-2.5">
                      <summary className="cursor-pointer text-[11px] text-deep-violet font-semibold">📨 자동 발송될 메시지 미리보기 ({t.auto_preview.length}건)</summary>
                      {t.auto_preview.map((msg, i) => (
                        <div key={i} className="text-[11px] bg-paper-white py-2 px-2.5 rounded-md mt-1.5 border border-bone whitespace-pre-wrap leading-[1.5]">{msg}</div>
                      ))}
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-end">
              <div className="max-w-[80%]">
                <div className="text-[10px] text-stone-400 font-semibold mb-[3px]">🤖 에이전트</div>
                <div className="py-2 px-3 rounded-xl text-[12px] leading-[1.6] whitespace-pre-wrap bg-lavender-soft text-stone-400">⏳ Claude 호출 중...</div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="mt-2 py-2 px-3 bg-rose-soft text-burgundy rounded-lg text-[12px]">⚠️ {error}</div>}

        <div className="mt-3 flex gap-2 items-end">
          <textarea
            className="flex-1 w-full py-[7px] px-[10px] border-[1.5px] border-bone rounded-lg font-inherit text-[12px] bg-paper-white outline-none focus:border-honey-gold resize-y min-h-[50px] leading-[1.55]"
            rows={2}
            placeholder="지원자처럼 답장 입력 (Enter 전송, Shift+Enter 줄바꿈)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendInbound();
              }
            }}
            disabled={sending}
          />
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={undoLast} disabled={sending || conversation.length === 0}>
              ↶ 되돌리기
            </Button>
            <Button variant="primary" size="sm" onClick={sendInbound} disabled={sending || !input.trim() || !jobBody.trim()}>
              {sending ? "..." : "전송"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
