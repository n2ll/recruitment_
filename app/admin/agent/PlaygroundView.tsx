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

import { useMemo, useState } from "react";
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

type SimStage = "screening" | "onboarding" | "active";

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
  const [stage, setStage] = useState<SimStage>("screening");
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
      alert("메모를 입력해주세요.");
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
        alert(json.error || "공고 생성 실패");
        return;
      }
      setJobBody(json.posting || "");
      setGenerateMissing(Array.isArray(json.missing) ? json.missing : []);
      const firstLine = (json.posting as string).split("\n")[0]?.replace(/[\[\]]/g, "").trim();
      if (firstLine) setJobTitle(firstLine.slice(0, 60));
    } catch {
      alert("공고 생성 중 오류");
    } finally {
      setGenerating(false);
    }
  };

  const fetchRecommendations = async () => {
    if (!jobBody.trim()) {
      alert("공고 본문을 먼저 작성해주세요.");
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
        alert(json.error || "추천 실패");
        return;
      }
      setCandidates(json.candidates || []);
      if (!jobPickup && json.job?.address) setJobPickup(json.job.address);
    } catch {
      alert("추천 중 오류");
    } finally {
      setRecLoading(false);
    }
  };

  const importCandidate = (c: RecCandidate) => {
    setAppName(c.name);
    setAppPhone(c.phone);
    setAppLocation(c.location ?? c.sigungu ?? "");
    setAppOwnVehicle(c.own_vehicle ?? "있음");
    alert(`${c.name}님의 정보를 지원자로 가져왔습니다.`);
  };

  const resetSim = () => {
    if (conversation.length > 0 && !confirm("대화·체크리스트를 초기화할까요?")) return;
    setStage("screening");
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
      const outboundTurn: ConvTurn = {
        direction: "outbound",
        body: result.reply_text || "(응답 없음 — pause/abort)",
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
        auto_preview:
          Array.isArray(json.auto_messages_preview) && json.auto_messages_preview.length > 0
            ? json.auto_messages_preview
            : undefined,
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
    <div className="pg">
      {/* 좌: 시나리오 설정 */}
      <section className="pg-left">
        <h3 className="pg-h">📢 공고</h3>

        <details className="pg-gen" open={!jobBody}>
          <summary>✨ 메모 자동 생성</summary>
          <div className="pg-gen-body">
            <textarea
              className="pg-textarea"
              placeholder="예) 강북미아 토일 장보기 자차, 시급 1.5~2만"
              rows={2}
              value={rough}
              onChange={(e) => setRough(e.target.value)}
            />
            <button className="pg-btn-secondary" onClick={generateBody} disabled={generating}>
              {generating ? "생성 중..." : "본문 자동 생성"}
            </button>
            {generateMissing.length > 0 && (
              <div className="pg-warn">
                ⚠️ 빠진 항목: {generateMissing.join(", ")}
              </div>
            )}
          </div>
        </details>

        <label className="pg-label">제목</label>
        <input className="pg-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />

        <label className="pg-label">본문 (SMS로 보내질 텍스트)</label>
        <textarea
          className="pg-textarea"
          rows={8}
          value={jobBody}
          onChange={(e) => setJobBody(e.target.value)}
          placeholder="공고 본문..."
        />

        <div className="pg-meta-grid">
          <label><span>지점</span>
            <select value={jobBranch} onChange={(e) => setJobBranch(e.target.value)}>
              <option value="">선택 안함</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label><span>슬롯</span>
            <select value={jobSlot} onChange={(e) => setJobSlot(e.target.value)}>
              <option value="">선택 안함</option>
              {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label><span>시작일</span>
            <input type="date" value={jobStartDate} onChange={(e) => setJobStartDate(e.target.value)} />
          </label>
          <label><span>차량</span>
            <select value={jobVehicle ? "1" : "0"} onChange={(e) => setJobVehicle(e.target.value === "1")}>
              <option value="1">필요</option>
              <option value="0">불필요</option>
            </select>
          </label>
          <label className="pg-meta-wide"><span>픽업 주소</span>
            <input value={jobPickup} onChange={(e) => setJobPickup(e.target.value)} placeholder="예) 서울 강북구 도봉로 34" />
          </label>
        </div>

        {/* 추천 (선택) */}
        <div className="pg-rec">
          <button className="pg-btn-secondary" onClick={fetchRecommendations} disabled={recLoading || !jobBody.trim()}>
            {recLoading ? "추천 중..." : "후보 추천 받기 (실제 풀)"}
          </button>
          {candidates.length > 0 && (
            <div className="pg-rec-list">
              <div className="pg-rec-h">{candidates.length}명 추천 — 클릭 시 위 지원자 정보로 임포트</div>
              {candidates.slice(0, 5).map((c) => (
                <button
                  key={`${c.source}-${c.id}`}
                  className="pg-rec-row"
                  onClick={() => importCandidate(c)}
                >
                  <span>#{c.score.total}</span>
                  <strong>{c.name}</strong>
                  <span className="pg-meta-text">{c.phone}</span>
                  <span className="pg-meta-text">{c.score.distanceKm.toFixed(1)}km</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <h3 className="pg-h">🧑 지원자 (빙의 대상)</h3>
        <div className="pg-meta-grid">
          <label><span>이름</span>
            <input value={appName} onChange={(e) => setAppName(e.target.value)} />
          </label>
          <label><span>전화</span>
            <input value={appPhone} onChange={(e) => setAppPhone(e.target.value)} />
          </label>
          <label><span>1지망 지점</span>
            <select value={appBranch1} onChange={(e) => setAppBranch1(e.target.value)}>
              <option value="">자동(공고 지점)</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label><span>희망 시간</span>
            <input value={appWorkHours} onChange={(e) => setAppWorkHours(e.target.value)} />
          </label>
          <label><span>차량(폼)</span>
            <select value={appOwnVehicle} onChange={(e) => setAppOwnVehicle(e.target.value)}>
              <option value="있음">있음</option>
              <option value="없음">없음</option>
            </select>
          </label>
          <label><span>면허(폼)</span>
            <select value={appLicense} onChange={(e) => setAppLicense(e.target.value)}>
              <option value="1종 보통">1종 보통</option>
              <option value="2종 보통">2종 보통</option>
              <option value="1종 대형">1종 대형</option>
              <option value="없음">없음</option>
            </select>
          </label>
          <label><span>본인명의(폼)</span>
            <select value={appSelfOwnership} onChange={(e) => setAppSelfOwnership(e.target.value)}>
              <option value="문제 없음">문제 없음</option>
              <option value="문제 있음">문제 있음</option>
            </select>
          </label>
          <label><span>시작가능일</span>
            <input type="date" value={appAvailableDate} onChange={(e) => setAppAvailableDate(e.target.value)} />
          </label>
          <label className="pg-meta-wide"><span>거주지</span>
            <input value={appLocation} onChange={(e) => setAppLocation(e.target.value)} />
          </label>
        </div>

        <h3 className="pg-h">⚙️ 시뮬 단계</h3>
        <div className="pg-stage-row">
          {(["screening", "onboarding", "active"] as SimStage[]).map((s) => (
            <button
              key={s}
              className={`pg-stage-btn ${stage === s ? "pg-stage-on" : ""}`}
              onClick={() => setStage(s)}
              disabled={conversation.length > 0}
              title={conversation.length > 0 ? "대화 시작 후엔 자동 전이만 가능. 초기화하면 변경 가능." : ""}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>

        <button className="pg-btn-warn" onClick={resetSim} disabled={conversation.length === 0}>
          🔄 시뮬 초기화
        </button>
      </section>

      {/* 우: 채팅 시뮬 */}
      <section className="pg-right">
        <div className="pg-r-h">
          <span className="pg-stage-badge" style={{ background: stageBadgeColor }}>
            {stageBadge}
          </span>
          {progress.total > 0 && (
            <span className="pg-progress">
              체크리스트 {progress.done}/{progress.total}
            </span>
          )}
          <span className="pg-r-h-info">실제 발송 X · DB 저장 X</span>
        </div>

        {/* 체크리스트 시각화 */}
        {progress.total > 0 && (
          <div className="pg-cl">
            {progress.keys.map((k) => (
              <span
                key={k}
                className={`pg-cl-item ${progress.cl[k] ? "pg-cl-on" : ""}`}
              >
                {progress.cl[k] ? "✓" : "·"} {k.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* 채팅 영역 */}
        <div
          className="pg-chat"
          ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}
        >
          {conversation.length === 0 ? (
            <div className="pg-empty">
              아래에 <strong>지원자처럼</strong> 메시지를 입력하면<br/>
              실제 stage 모듈이 호출되어 응답이 옵니다.
            </div>
          ) : (
            conversation.map((t, idx) => (
              <div key={idx} className={`pg-row ${t.direction === "inbound" ? "pg-l" : "pg-r"}`}>
                <div className="pg-bubble-wrap">
                  <div className="pg-role">
                    {t.direction === "inbound" ? "🙋 지원자(빙의)" : "🤖 에이전트"}
                  </div>
                  <div className={`pg-bubble ${t.direction === "outbound" ? "pg-out" : "pg-in"}`}>
                    {t.body}
                  </div>
                  {t.reasoning && (
                    <div className="pg-reason">판단: {t.reasoning}</div>
                  )}
                  {t.transition && (
                    <div className={`pg-transition ${t.transition.startsWith("→") ? "pg-tr-adv" : t.transition.startsWith("⛔") ? "pg-tr-abort" : "pg-tr-pause"}`}>
                      {t.transition}
                    </div>
                  )}
                  {t.auto_preview && t.auto_preview.length > 0 && (
                    <details className="pg-auto">
                      <summary>📨 자동 발송될 메시지 미리보기 ({t.auto_preview.length}건)</summary>
                      {t.auto_preview.map((msg, i) => (
                        <div key={i} className="pg-auto-msg">{msg}</div>
                      ))}
                    </details>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="pg-row pg-r">
              <div className="pg-bubble-wrap">
                <div className="pg-role">🤖 에이전트</div>
                <div className="pg-bubble pg-out pg-typing">⏳ Claude 호출 중...</div>
              </div>
            </div>
          )}
        </div>

        {error && <div className="pg-error">⚠️ {error}</div>}

        <div className="pg-input-row">
          <textarea
            className="pg-textarea"
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
          <div className="pg-input-actions">
            <button className="pg-btn-secondary" onClick={undoLast} disabled={sending || conversation.length === 0}>
              ↶ 되돌리기
            </button>
            <button className="pg-btn-primary" onClick={sendInbound} disabled={sending || !input.trim() || !jobBody.trim()}>
              {sending ? "..." : "전송"}
            </button>
          </div>
        </div>
      </section>

      <style jsx>{`
        .pg {
          display: flex;
          gap: 0;
          height: calc(100vh - 33px);    /* phone-bar(약 33px) 제외 */
          background: #f5f5f0;
          font-size: 13px;
          color: #1a1a1a;
        }

        .pg-left {
          width: 440px;
          flex-shrink: 0;
          background: #fff;
          border-right: 1px solid #e8e8e0;
          padding: 18px 20px;
          overflow-y: auto;
        }
        .pg-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          padding: 18px 24px;
          overflow: hidden;
        }

        .pg-h {
          font-size: 13px;
          font-weight: 700;
          margin: 14px 0 8px;
        }
        .pg-h:first-of-type { margin-top: 0; }
        .pg-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          margin: 8px 0 4px;
        }
        .pg-input, .pg-textarea {
          width: 100%;
          padding: 7px 10px;
          border: 1.5px solid #e8e8e0;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12px;
          background: #fff;
          outline: none;
        }
        .pg-input:focus, .pg-textarea:focus { border-color: #F5C518; }
        .pg-textarea { resize: vertical; min-height: 50px; line-height: 1.55; }

        .pg-gen {
          background: #fffbea;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 10px;
        }
        .pg-gen summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #92400e; }
        .pg-gen-body { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
        .pg-warn { font-size: 11px; color: #92400e; }

        .pg-meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px 12px;
          margin: 8px 0 4px;
        }
        .pg-meta-grid label {
          display: flex; flex-direction: column; gap: 3px;
          font-size: 11px;
        }
        .pg-meta-grid label > span { color: #6b7280; font-weight: 600; }
        .pg-meta-grid input, .pg-meta-grid select {
          padding: 6px 9px;
          border: 1.5px solid #e8e8e0;
          border-radius: 7px;
          font-family: inherit;
          font-size: 12px;
          background: #fff;
          outline: none;
        }
        .pg-meta-wide { grid-column: span 2; }

        .pg-rec { margin-top: 10px; }
        .pg-rec-list {
          margin-top: 8px;
          display: flex; flex-direction: column; gap: 4px;
          max-height: 200px;
          overflow-y: auto;
        }
        .pg-rec-h { font-size: 11px; color: #6b7280; padding: 4px 0; }
        .pg-rec-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: #f9fafb;
          border: 1px solid #e8e8e0;
          border-radius: 7px;
          font-family: inherit;
          font-size: 11px;
          cursor: pointer;
          text-align: left;
        }
        .pg-rec-row:hover { background: #FFFBEB; border-color: #F5C518; }
        .pg-meta-text { color: #9ca3af; }

        .pg-stage-row { display: flex; gap: 6px; margin-bottom: 10px; }
        .pg-stage-btn {
          padding: 7px 14px;
          border: 1.5px solid #e8e8e0;
          background: #fff;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .pg-stage-on {
          background: #1a1a1a !important;
          color: #fff !important;
          border-color: #1a1a1a !important;
        }
        .pg-stage-btn:disabled {
          opacity: 0.5; cursor: not-allowed;
        }

        .pg-btn-primary, .pg-btn-secondary, .pg-btn-warn {
          padding: 8px 14px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid;
        }
        .pg-btn-primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
        .pg-btn-primary:disabled { background: #9ca3af; border-color: #9ca3af; cursor: not-allowed; }
        .pg-btn-secondary { background: #fff; color: #1a1a1a; border-color: #e8e8e0; }
        .pg-btn-warn {
          background: #fff;
          color: #b45309;
          border-color: #fde68a;
        }
        .pg-btn-warn:disabled { color: #9ca3af; border-color: #e8e8e0; cursor: not-allowed; }

        /* 우측 채팅 */
        .pg-r-h {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 12px;
        }
        .pg-stage-badge {
          padding: 3px 10px; border-radius: 8px;
          color: #fff; font-size: 11px; font-weight: 700;
        }
        .pg-progress {
          font-size: 12px; color: #4b5563; font-weight: 600;
        }
        .pg-r-h-info {
          margin-left: auto;
          font-size: 11px;
          color: #9ca3af;
          background: #fef3c7;
          padding: 3px 8px;
          border-radius: 6px;
        }

        .pg-cl {
          display: flex; flex-wrap: wrap; gap: 4px;
          padding: 10px;
          background: #fff;
          border: 1px solid #e8e8e0;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .pg-cl-item {
          font-size: 11px;
          padding: 3px 8px;
          background: #f3f4f6;
          color: #6b7280;
          border-radius: 6px;
        }
        .pg-cl-on {
          background: #d1fae5 !important;
          color: #065f46 !important;
          font-weight: 600;
        }

        .pg-chat {
          flex: 1;
          background: #fff;
          border: 1px solid #e8e8e0;
          border-radius: 10px;
          padding: 14px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .pg-empty {
          padding: 60px 20px;
          text-align: center;
          color: #9ca3af;
          font-size: 13px;
          line-height: 1.6;
        }
        .pg-row { display: flex; }
        .pg-l { justify-content: flex-start; }
        .pg-r { justify-content: flex-end; }
        .pg-bubble-wrap { max-width: 80%; }
        .pg-role {
          font-size: 10px;
          color: #9ca3af;
          font-weight: 600;
          margin-bottom: 3px;
        }
        .pg-bubble {
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .pg-in { background: #f3f4f6; color: #1a1a1a; }
        .pg-out { background: #FFEB99; color: #1a1a1a; }
        .pg-typing { color: #9ca3af; }

        .pg-reason {
          font-size: 11px;
          color: #6b7280;
          margin-top: 4px;
          font-style: italic;
        }
        .pg-transition {
          margin-top: 4px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          display: inline-block;
        }
        .pg-tr-adv { background: #d1fae5; color: #065f46; }
        .pg-tr-pause { background: #fef3c7; color: #92400e; }
        .pg-tr-abort { background: #fee2e2; color: #991b1b; }

        .pg-auto {
          margin-top: 6px;
          background: #f9fafb;
          border-radius: 6px;
          padding: 6px 10px;
        }
        .pg-auto summary {
          cursor: pointer;
          font-size: 11px;
          color: #2563eb;
          font-weight: 600;
        }
        .pg-auto-msg {
          font-size: 11px;
          background: #fff;
          padding: 8px 10px;
          border-radius: 6px;
          margin-top: 6px;
          border: 1px solid #e8e8e0;
          white-space: pre-wrap;
          line-height: 1.5;
        }

        .pg-error {
          margin-top: 8px;
          padding: 8px 12px;
          background: #fee2e2;
          color: #991b1b;
          border-radius: 8px;
          font-size: 12px;
        }

        .pg-input-row {
          margin-top: 12px;
          display: flex; gap: 8px;
          align-items: flex-end;
        }
        .pg-input-row .pg-textarea { flex: 1; }
        .pg-input-actions { display: flex; gap: 6px; }
      `}</style>
    </div>
  );
}
