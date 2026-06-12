"use client";

/**
 * 지원자 미니 상세 모달 — 어디서 띄워도 동일한 6+1 섹션(인적/거주지/차량/희망/온보딩/확정/메모)
 * 편집 UI를 제공한다. 섹션별 편집 + PATCH /api/admin/applicants/:id 로 저장.
 *
 * 호출 화면: 당근/배민 후보 대화창, 확정슬롯 PPC 표, ...
 *
 * 부모는 onPatched 콜백으로 변경된 필드를 받아 자기 로컬 리스트를 sync한다.
 */

import { useEffect, useState } from "react";

const SLOTS = ["평일오전", "평일오후", "주말오전", "주말오후"] as const;
type SlotKey = (typeof SLOTS)[number];

const STATUS_OPTIONS = [
  "스크리닝 전",
  "스크리닝 중",
  "스크리닝 완료",
  "기타",
  "확정인력",
  "대기자",
  "부적합",
  "이탈",
];

const STATUS_BG: Record<string, string> = {
  "스크리닝 전":   "#9CA3AF",
  "스크리닝 중":   "#6b7280",
  "스크리닝 완료": "#0EA5E9",
  "기타":          "#8B5CF6",
  "확정인력":      "#10b981",
  "대기자":        "#f59e0b",
  "부적합":        "#ef4444",
  "이탈":          "#7f1d1d",
};

// 호출자(당근의 Candidate, admin의 Applicant)가 다 만족할 수 있도록 nullable 위주의 permissive 타입.
export interface MiniApplicant {
  id: number;
  name: string;
  phone: string;
  created_at: string;
  birth_date?: string | null;
  status?: string | null;
  source?: string | null;
  location?: string | null;
  bname?: string | null;
  sigungu?: string | null;
  own_vehicle?: string | null;
  license_type?: string | null;
  vehicle_type?: string | null;
  self_ownership?: string | null;
  branch1?: string | null;
  branch2?: string | null;
  work_hours?: string | null;
  available_date?: string | null;
  baemin_id?: string | null;
  kakao_channel_friend?: boolean | null;
  guide_sent?: boolean | null;
  onboarding_call_status?: string | null;
  confirmed_branch?: string | null;
  confirmed_slot?: string | null;
  current_branch?: string | null;
  start_date?: string | null;
  churned_at?: string | null;
  churn_reason?: string | null;
  memo?: string | null;
}

export type MiniApplicantPatch = Partial<MiniApplicant>;

const SECTION_FIELDS: Record<string, (keyof MiniApplicant)[]> = {
  personal: ["name", "birth_date", "phone", "status", "source"],
  address: ["location"],
  vehicle: ["own_vehicle", "license_type", "vehicle_type", "self_ownership"],
  hope: ["branch1", "branch2", "work_hours", "available_date"],
  onboarding: ["baemin_id", "kakao_channel_friend", "guide_sent", "onboarding_call_status"],
  confirmed: ["confirmed_branch", "confirmed_slot", "current_branch", "start_date", "churn_reason"],
  memo: ["memo"],
};

function matchesSlot(workHours: string | null | undefined, slot: SlotKey): boolean {
  if (!workHours) return false;
  const wantPyeongil = slot.startsWith("평일");
  const wantMorning = slot.endsWith("오전");
  return workHours.split(",").map((t) => t.trim()).some((tok) => {
    const dayOk = wantPyeongil ? tok.includes("평일") : tok.includes("주말");
    const timeOk = wantMorning ? tok.includes("오전") : tok.includes("오후");
    return dayOk && timeOk;
  });
}

function calcAge(birth: string | null | undefined): number | null {
  if (!birth || !/^\d{6}$/.test(birth)) return null;
  const yy = parseInt(birth.slice(0, 2), 10);
  const mm = parseInt(birth.slice(2, 4), 10);
  const dd = parseInt(birth.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const fullYear = yy >= 50 ? 1900 + yy : 2000 + yy;
  const today = new Date();
  let age = today.getFullYear() - fullYear;
  const beforeBirthday =
    today.getMonth() + 1 < mm ||
    (today.getMonth() + 1 === mm && today.getDate() < dd);
  if (beforeBirthday) age--;
  return age;
}

function sourceLabel(s: string | null | undefined): string {
  if (!s) return "—";
  if (s === "danggeun" || s === "danggeun_practice") return "당근";
  if (s === "baemin") return "배민";
  if (s === "manual") return "수기";
  if (s === "direct") return "직접";
  return s;
}

export default function ApplicantMiniDetail({
  applicant,
  branches,
  onClose,
  onPatched,
}: {
  applicant: MiniApplicant;
  branches: string[];
  onClose: () => void;
  onPatched: (patch: MiniApplicantPatch) => void;
}) {
  const [draft, setDraft] = useState<Partial<MiniApplicant>>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 모달이 닫혔다 다시 열릴 때 다른 후보로 바뀌면 편집 상태 초기화
  useEffect(() => {
    setDraft({});
    setEditingSection(null);
  }, [applicant.id]);

  const a = applicant;
  const draftVal = <K extends keyof MiniApplicant>(k: K): MiniApplicant[K] =>
    (k in draft ? (draft[k] as MiniApplicant[K]) : a[k]);
  const setD = <K extends keyof MiniApplicant>(k: K, v: MiniApplicant[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const saveSection = async (section: string) => {
    const fields = SECTION_FIELDS[section] ?? [];
    const patch: MiniApplicantPatch = {};
    for (const k of fields) {
      if (k in draft) (patch as Record<string, unknown>)[k] = draft[k];
    }
    if (Object.keys(patch).length === 0) {
      setEditingSection(null);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/applicants/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "저장 실패");
        return;
      }
      onPatched(json.data as MiniApplicantPatch);
      setDraft((prev) => {
        const next = { ...prev };
        for (const k of fields) delete next[k];
        return next;
      });
      setEditingSection(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const cancelSection = (section: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const k of SECTION_FIELDS[section] ?? []) delete next[k];
      return next;
    });
    setEditingSection(null);
  };

  const SectionHead = ({ section, title }: { section: string; title: string }) => (
    <div className="amd-sec-head">
      <h4 className="amd-sec-title">{title}</h4>
      {editingSection === section ? (
        <div className="amd-sec-actions">
          <button className="amd-btn amd-btn-ghost" onClick={() => cancelSection(section)} disabled={saving}>취소</button>
          <button className="amd-btn amd-btn-primary" onClick={() => saveSection(section)} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      ) : (
        <button
          className="amd-btn-edit"
          onClick={() => {
            if (editingSection && editingSection !== section) cancelSection(editingSection);
            setEditingSection(section);
          }}
        >✏️ 편집</button>
      )}
    </div>
  );

  const editing = (s: string) => editingSection === s;

  return (
    <div className="amd-bg" onClick={onClose}>
      <style>{css}</style>
      <div className="amd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="amd-head">
          <h3 className="amd-title">📋 {a.name} 상세정보</h3>
          <button className="amd-close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="amd-body">
          {/* 👤 인적사항 */}
          <SectionHead section="personal" title="👤 인적사항" />
          <div className="amd-grid">
            <div>
              <span className="amd-dl">성함</span>
              {editing("personal") ? (
                <input className="amd-input" value={(draftVal("name") as string) || ""} onChange={(e) => setD("name", e.target.value)} />
              ) : (a.name)}
            </div>
            <div>
              <span className="amd-dl">나이 (생년월일)</span>
              {editing("personal") ? (
                <input className="amd-input" maxLength={6} placeholder="YYMMDD"
                  value={(draftVal("birth_date") as string) || ""}
                  onChange={(e) => setD("birth_date", e.target.value.replace(/[^\d]/g, "").slice(0, 6))} />
              ) : (
                <>
                  {calcAge(a.birth_date) ?? "—"}
                  {a.birth_date && a.birth_date.length === 6
                    ? ` (${a.birth_date.slice(0, 2)}/${a.birth_date.slice(2, 4)}/${a.birth_date.slice(4, 6)})`
                    : ""}
                </>
              )}
            </div>
            <div>
              <span className="amd-dl">전화</span>
              {editing("personal") ? (
                <input className="amd-input" value={(draftVal("phone") as string) || ""} onChange={(e) => setD("phone", e.target.value)} />
              ) : (a.phone)}
            </div>
            <div>
              <span className="amd-dl">진행 상태</span>
              {editing("personal") ? (
                <select className="amd-input" value={(draftVal("status") as string) || ""} onChange={(e) => setD("status", e.target.value)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className="amd-status-badge" style={{ background: STATUS_BG[a.status ?? ""] || "#6b7280" }}>{a.status ?? "—"}</span>
              )}
            </div>
            <div>
              <span className="amd-dl">지원경로</span>
              {editing("personal") ? (
                <select className="amd-input" value={(draftVal("source") as string) || ""} onChange={(e) => setD("source", e.target.value)}>
                  <option value="danggeun">당근</option>
                  <option value="baemin">배민</option>
                  <option value="manual">수기</option>
                  <option value="direct">기타</option>
                </select>
              ) : sourceLabel(a.source)}
            </div>
            <div><span className="amd-dl">지원일</span>{new Date(a.created_at).toLocaleDateString("ko-KR")}</div>
          </div>

          {/* 🏠 거주지 */}
          <SectionHead section="address" title="🏠 거주지" />
          <div className="amd-grid">
            <div className="amd-wide">
              <span className="amd-dl">주소</span>
              {editing("address") ? (
                <input className="amd-input" value={(draftVal("location") as string) || ""} onChange={(e) => setD("location", e.target.value)} />
              ) : (a.location || "—")}
            </div>
            <div><span className="amd-dl">동(자동)</span>{a.bname || "—"}</div>
            <div><span className="amd-dl">시군구(자동)</span>{a.sigungu || "—"}</div>
          </div>

          {/* 🚗 차량·면허 */}
          <SectionHead section="vehicle" title="🚗 차량·면허" />
          <div className="amd-grid">
            <div>
              <span className="amd-dl">자차</span>
              {editing("vehicle") ? (
                <select className="amd-input" value={(draftVal("own_vehicle") as string) || ""} onChange={(e) => setD("own_vehicle", e.target.value)}>
                  <option value="">—</option>
                  <option value="있음">있음</option>
                  <option value="없음">없음</option>
                </select>
              ) : (a.own_vehicle || "—")}
            </div>
            <div>
              <span className="amd-dl">면허</span>
              {editing("vehicle") ? (
                <select className="amd-input" value={(draftVal("license_type") as string) || ""} onChange={(e) => setD("license_type", e.target.value)}>
                  <option value="">—</option>
                  <option value="1종 보통">1종 보통</option>
                  <option value="2종 보통">2종 보통</option>
                  <option value="1종 대형">1종 대형</option>
                  <option value="없음">없음</option>
                </select>
              ) : (a.license_type || "—")}
            </div>
            <div>
              <span className="amd-dl">차종</span>
              {editing("vehicle") ? (
                <input className="amd-input" value={(draftVal("vehicle_type") as string) || ""} onChange={(e) => setD("vehicle_type", e.target.value)} />
              ) : (a.vehicle_type || "—")}
            </div>
            <div>
              <span className="amd-dl">본인명의</span>
              {editing("vehicle") ? (
                <select className="amd-input" value={(draftVal("self_ownership") as string) || ""} onChange={(e) => setD("self_ownership", e.target.value)}>
                  <option value="">—</option>
                  <option value="문제 없음">문제 없음</option>
                  <option value="문제 있음">문제 있음</option>
                </select>
              ) : (a.self_ownership || "—")}
            </div>
          </div>

          {/* 📍 희망 지점·시간 */}
          <SectionHead section="hope" title="📍 희망 지점·시간" />
          <div className="amd-grid">
            <div>
              <span className="amd-dl">1지망</span>
              {editing("hope") ? (
                <select className="amd-input" value={(draftVal("branch1") as string) || ""} onChange={(e) => setD("branch1", e.target.value)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.branch1 || "—")}
            </div>
            <div>
              <span className="amd-dl">2지망</span>
              {editing("hope") ? (
                <select className="amd-input" value={(draftVal("branch2") as string) || ""} onChange={(e) => setD("branch2", e.target.value || null)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.branch2 || "—")}
            </div>
            <div className="amd-wide">
              <span className="amd-dl">희망시간 (복수)</span>
              {editing("hope") ? (
                <div className="amd-slot-row">
                  {SLOTS.map((s) => {
                    const raw = (draftVal("work_hours") as string) || "";
                    const set = new Set(raw.split(",").map((t) => t.trim()).filter(Boolean));
                    const on = set.has(s);
                    return (
                      <button
                        key={s} type="button"
                        className={`amd-slot-btn ${on ? "amd-slot-on" : ""}`}
                        onClick={() => {
                          const next = new Set(set);
                          if (on) next.delete(s); else next.add(s);
                          const joined = SLOTS.filter((x) => next.has(x)).join(", ");
                          setD("work_hours", joined);
                        }}
                      >{s}</button>
                    );
                  })}
                </div>
              ) : (a.work_hours || "—")}
            </div>
            <div>
              <span className="amd-dl">시작가능일</span>
              {editing("hope") ? (
                <input type="date" className="amd-input" value={(draftVal("available_date") as string) || ""} onChange={(e) => setD("available_date", e.target.value || null)} />
              ) : (a.available_date || "—")}
            </div>
          </div>

          {/* 📱 온보딩 진행 */}
          <SectionHead section="onboarding" title="📱 온보딩 진행" />
          <div className="amd-grid">
            <div>
              <span className="amd-dl">배민 아이디</span>
              {editing("onboarding") ? (
                <input className="amd-input" value={(draftVal("baemin_id") as string) || ""} onChange={(e) => setD("baemin_id", e.target.value || null)} />
              ) : (a.baemin_id || <span className="amd-muted">미수집</span>)}
            </div>
            <div>
              <span className="amd-dl">카톡 채널</span>
              {editing("onboarding") ? (
                <label className="amd-check">
                  <input type="checkbox" checked={!!draftVal("kakao_channel_friend")} onChange={(e) => setD("kakao_channel_friend", e.target.checked)} />
                  친구추가됨
                </label>
              ) : (a.kakao_channel_friend ? "✓ 친구추가됨" : "—")}
            </div>
            <div>
              <span className="amd-dl">가이드 전달</span>
              {editing("onboarding") ? (
                <label className="amd-check">
                  <input type="checkbox" checked={!!draftVal("guide_sent")} onChange={(e) => setD("guide_sent", e.target.checked)} />
                  전달완료
                </label>
              ) : (a.guide_sent ? "✓ 전달완료" : "—")}
            </div>
            <div>
              <span className="amd-dl">온보딩 통화</span>
              {editing("onboarding") ? (
                <input className="amd-input" value={(draftVal("onboarding_call_status") as string) || ""} onChange={(e) => setD("onboarding_call_status", e.target.value || null)} />
              ) : (a.onboarding_call_status || "—")}
            </div>
          </div>

          {/* ✓ 확정·근무 */}
          <SectionHead section="confirmed" title="✓ 확정·근무" />
          <div className="amd-grid">
            <div>
              <span className="amd-dl">확정지점</span>
              {editing("confirmed") ? (
                <select className="amd-input" value={(draftVal("confirmed_branch") as string) || ""} onChange={(e) => setD("confirmed_branch", e.target.value || null)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.confirmed_branch || "—")}
            </div>
            <div className="amd-wide">
              <span className="amd-dl">희망슬롯 (지원자 작성, 읽기 전용)</span>
              <div className="amd-chip-row">
                {SLOTS.filter((s) => matchesSlot(a.work_hours, s)).map((s) => (
                  <span key={s} className="amd-chip">{s}</span>
                ))}
                {!SLOTS.some((s) => matchesSlot(a.work_hours, s)) && <span className="amd-muted">—</span>}
              </div>
              <div className="amd-hint">편집은 위 [📍 희망 지점·시간] 섹션에서 진행</div>
            </div>
            <div className="amd-wide">
              <span className="amd-dl">확정슬롯 (매니저 확정 — 미입력 시 희망슬롯 그대로)</span>
              {editing("confirmed") ? (() => {
                const draftRaw = (draftVal("confirmed_slot") as string | null);
                const initial = (draftRaw != null && draftRaw !== "")
                  ? draftRaw
                  : SLOTS.filter((s) => matchesSlot(a.work_hours, s)).join(",");
                const set = new Set(initial.split(",").map((t) => t.trim()).filter(Boolean));
                return (
                  <div className="amd-slot-row">
                    {SLOTS.map((s) => {
                      const on = set.has(s);
                      return (
                        <button
                          key={s} type="button"
                          className={`amd-slot-btn ${on ? "amd-slot-on" : ""}`}
                          onClick={() => {
                            const next = new Set(set);
                            if (on) next.delete(s); else next.add(s);
                            const joined = SLOTS.filter((x) => next.has(x)).join(",");
                            setD("confirmed_slot", joined || null);
                          }}
                        >{s}</button>
                      );
                    })}
                  </div>
                );
              })() : (() => {
                const effective = a.confirmed_slot
                  ? a.confirmed_slot.split(",").map((t) => t.trim()).filter(Boolean)
                  : SLOTS.filter((s) => matchesSlot(a.work_hours, s));
                const usingFallback = !a.confirmed_slot;
                if (!effective.length) return <span className="amd-muted">—</span>;
                return (
                  <>
                    <div className="amd-chip-row">
                      {effective.map((s) => <span key={s} className="amd-chip">{s}</span>)}
                    </div>
                    {usingFallback && <div className="amd-hint">※ 희망슬롯 그대로 사용 중 (편집 시 분리됨)</div>}
                  </>
                );
              })()}
            </div>
            <div className="amd-wide">
              <span className="amd-dl">희망근무일자</span>
              {a.available_date || <span className="amd-muted">—</span>}
            </div>
            <div>
              <span className="amd-dl">현재 근무지점</span>
              {editing("confirmed") ? (
                <select className="amd-input" value={(draftVal("current_branch") as string) || ""} onChange={(e) => setD("current_branch", e.target.value || null)}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (a.current_branch || "—")}
            </div>
            <div>
              <span className="amd-dl">시작일</span>
              {editing("confirmed") ? (
                <input type="date" className="amd-input" value={(draftVal("start_date") as string) || ""} onChange={(e) => setD("start_date", e.target.value || null)} />
              ) : (a.start_date || "—")}
            </div>
            <div><span className="amd-dl">이탈일(자동)</span>{a.churned_at ? new Date(a.churned_at).toLocaleDateString("ko-KR") : "—"}</div>
            <div className="amd-wide">
              <span className="amd-dl">이탈/대기 사유</span>
              {editing("confirmed") ? (
                <input className="amd-input" value={(draftVal("churn_reason") as string) || ""} onChange={(e) => setD("churn_reason", e.target.value || null)} />
              ) : (a.churn_reason || "—")}
            </div>
          </div>

          {/* 📝 매니저 메모 */}
          <SectionHead section="memo" title="📝 메모" />
          <div className="amd-grid">
            <div className="amd-wide">
              {editing("memo") ? (
                <textarea
                  className="amd-input"
                  style={{ minHeight: 70, resize: "vertical", lineHeight: 1.5 }}
                  value={(draftVal("memo") as string) || ""}
                  onChange={(e) => setD("memo", e.target.value || null)}
                  placeholder="자유 메모 — 특이사항·연락 참고 등"
                />
              ) : (
                a.memo
                  ? <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>{a.memo}</p>
                  : <span className="amd-muted">메모 없음</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const css = `
  .amd-bg {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; padding: 24px;
  }
  .amd-panel {
    background: #fff;
    border-radius: 12px;
    width: 100%;
    max-width: 720px;
    max-height: 92vh;
    overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .amd-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #e5e7eb;
    background: #FFFBEB;
  }
  .amd-title { margin: 0; font-size: 16px; font-weight: 700; color: #111827; }
  .amd-close {
    background: transparent;
    border: none;
    font-size: 24px;
    line-height: 1;
    color: #6b7280;
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 6px;
  }
  .amd-close:hover { background: #FEF3C7; color: #111827; }
  .amd-body { padding: 16px 20px 24px; overflow-y: auto; flex: 1; }
  .amd-sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 14px 0 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f3f4f6;
  }
  .amd-sec-title { margin: 0; font-size: 13px; font-weight: 700; color: #111827; }
  .amd-sec-actions { display: flex; gap: 6px; }
  .amd-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .amd-btn-ghost { background: #fff; border-color: #d1d5db; color: #374151; }
  .amd-btn-ghost:hover { background: #f3f4f6; }
  .amd-btn-primary { background: #F5C518; color: #3D2B00; }
  .amd-btn-primary:hover { background: #E6B800; }
  .amd-btn-primary:disabled, .amd-btn-ghost:disabled { opacity: 0.55; cursor: not-allowed; }
  .amd-btn-edit {
    background: transparent;
    border: 1px solid #d1d5db;
    color: #6b7280;
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .amd-btn-edit:hover { background: #FFFBEB; border-color: #F5C518; color: #92650A; }
  .amd-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 16px;
    font-size: 12px;
    color: #111827;
  }
  .amd-grid > div { display: flex; flex-direction: column; gap: 3px; }
  .amd-wide { grid-column: 1 / -1; }
  .amd-dl {
    font-size: 10px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .amd-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    background: #fff;
    color: #111827;
  }
  .amd-input:focus {
    outline: none;
    border-color: #F5C518;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }
  .amd-muted { color: #9CA3AF; }
  .amd-status-badge {
    display: inline-block;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 99px;
  }
  .amd-hint { font-size: 10px; color: #9CA3AF; margin-top: 4px; }
  .amd-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #374151;
    cursor: pointer;
  }
  .amd-slot-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .amd-slot-btn {
    padding: 4px 10px;
    border: 1px solid #d1d5db;
    border-radius: 99px;
    background: #fff;
    color: #6b7280;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
  .amd-slot-on { background: #F5C518; color: #3D2B00; border-color: #F5C518; }
  .amd-chip-row { display: flex; gap: 5px; flex-wrap: wrap; }
  .amd-chip {
    padding: 2px 8px;
    background: #FFFBEB;
    color: #92650A;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid #F5C518;
  }
`;
