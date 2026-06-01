"use client";

/**
 * 지원자 추가/편집 모달 — Supabase applicants 컬럼과 1:1 대응.
 *
 * mode='create' : POST /api/admin/applicants
 * mode='edit'   : PATCH /api/admin/applicants/[id]
 */

import { useState } from "react";

export interface ApplicantFormValue {
  id?: number;
  name?: string;
  phone?: string;
  birth_date?: string | null;
  location?: string | null;
  own_vehicle?: string | null;
  license_type?: string | null;
  vehicle_type?: string | null;
  branch1?: string;
  branch2?: string | null;
  branch?: string | null;
  work_hours?: string | null;        // "평일오전, 주말오후" 형태
  available_date?: string | null;
  self_ownership?: string | null;
  introduction?: string | null;
  experience?: string | null;
  source?: string | null;
  status?: string | null;
  filter_pass?: string | null;       // 'Y' | 'N' | null
  note?: string | null;
  start_date?: string | null;
  confirmed_slot?: string | null;    // 콤마 join (다중)
  confirmed_branch?: string | null;
  current_branch?: string | null;
  churn_reason?: string | null;
  marketing_consent?: boolean | null;
  kakao_channel_friend?: boolean | null;
}

const SLOTS = ["평일오전", "평일오후", "주말오전", "주말오후"] as const;
const LICENSE_TYPES = ["1종 보통", "2종 보통", "1종 대형", "1종 자동", "2종 자동", "없음"];
const SELF_OWNERSHIP_OPTIONS = ["문제 없음", "문제 있음 (지원불가)", "확인 필요"];
const STATUSES = ["스크리닝 전", "스크리닝 중", "스크리닝 완료", "확정인력", "대기자", "부적합"];
const SOURCES: Array<{ value: string; label: string }> = [
  { value: "manual", label: "수기 등록" },
  { value: "danggeun", label: "당근 (자동 AI 응대 + 시작 멘트 발송)" },
  { value: "baemin", label: "배민 (자동 AI 응대, 시작 멘트 없음)" },
  { value: "facebook", label: "페이스북" },
  { value: "naver", label: "네이버 검색" },
  { value: "direct", label: "해당없음" },
  { value: "danggeun_practice", label: "🧪 당근 (연습용)" },
];

interface Props {
  mode: "create" | "edit";
  initial: ApplicantFormValue | null;
  branches: string[];        // 활성 지점
  allBranches: string[];     // 전체 지점
  onClose: () => void;
  onSaved: () => void;
}

export default function ApplicantFormModal({ mode, initial, branches, allBranches, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ApplicantFormValue>(() => ({
    name: "", phone: "", birth_date: "", location: "",
    own_vehicle: "", license_type: "", vehicle_type: "",
    branch1: "", branch2: "", work_hours: "",
    available_date: "", self_ownership: "",
    introduction: "", experience: "",
    source: "manual", status: "스크리닝 전", note: "",
    start_date: "", confirmed_slot: "", confirmed_branch: "", current_branch: "",
    churn_reason: "",
    marketing_consent: false, kakao_channel_friend: false,
    ...(initial ?? {}),
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof ApplicantFormValue>(k: K, v: ApplicantFormValue[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const workHourSet = new Set((form.work_hours ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const toggleWorkHour = (s: string) => {
    const next = new Set(workHourSet);
    if (next.has(s)) next.delete(s); else next.add(s);
    set("work_hours", SLOTS.filter((x) => next.has(x)).join(", "));
  };

  const confirmedSlotSet = new Set((form.confirmed_slot ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const toggleConfirmedSlot = (s: string) => {
    const next = new Set(confirmedSlotSet);
    if (next.has(s)) next.delete(s); else next.add(s);
    set("confirmed_slot", SLOTS.filter((x) => next.has(x)).join(","));
  };

  const submit = async () => {
    setErr(null);
    if (!form.name?.trim()) { setErr("이름은 필수입니다."); return; }
    const phoneNorm = (form.phone ?? "").replace(/[^\d]/g, "");
    if (!/^\d{10,11}$/.test(phoneNorm)) { setErr("전화번호 형식이 올바르지 않습니다."); return; }
    if (!form.branch1) { setErr("1지망 지점은 필수입니다."); return; }

    setSaving(true);
    try {
      // 빈 문자열은 null로 전송 (DB에 빈 문자열 들어가지 않게)
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (k === "id") continue;
        if (typeof v === "string" && v.trim() === "") payload[k] = null;
        else payload[k] = v;
      }
      payload.phone = phoneNorm;

      const url = mode === "create"
        ? "/api/admin/applicants"
        : `/api/admin/applicants/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error || "저장 실패");
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
      setSaving(false);
    }
  };

  return (
    <div className="afm-backdrop" onClick={onClose}>
      <div className="afm-modal" onClick={(e) => e.stopPropagation()}>
        <header className="afm-head">
          <h3>{mode === "create" ? "+ 지원자 추가" : `${initial?.name ?? ""} 편집`}</h3>
          <button className="afm-close" onClick={onClose}>✕</button>
        </header>

        <div className="afm-body">
          {err && <div className="afm-err">{err}</div>}

          <section className="afm-section">
            <h4>기본 정보</h4>
            <div className="afm-grid">
              <Field label="이름 *">
                <input className="afm-inp" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="전화번호 *">
                <input className="afm-inp" placeholder="01012345678" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="생년월일 (YYMMDD)">
                <input className="afm-inp" maxLength={6} value={form.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label="지원 경로">
                <select className="afm-inp" value={form.source ?? "manual"} onChange={(e) => set("source", e.target.value)}>
                  {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="거주지" wide>
                <input className="afm-inp" placeholder="시·구·동" value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="afm-section">
            <h4>차량</h4>
            <div className="afm-grid">
              <Field label="차량 보유">
                <select className="afm-inp" value={form.own_vehicle ?? ""} onChange={(e) => set("own_vehicle", e.target.value)}>
                  <option value="">—</option>
                  <option value="있음">있음</option>
                  <option value="없음">없음</option>
                </select>
              </Field>
              <Field label="운전 면허">
                <select className="afm-inp" value={form.license_type ?? ""} onChange={(e) => set("license_type", e.target.value)}>
                  <option value="">—</option>
                  {LICENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="차종">
                <input className="afm-inp" placeholder="예: 모닝" value={form.vehicle_type ?? ""} onChange={(e) => set("vehicle_type", e.target.value)} />
              </Field>
              <Field label="본인 명의">
                <select className="afm-inp" value={form.self_ownership ?? ""} onChange={(e) => set("self_ownership", e.target.value)}>
                  <option value="">—</option>
                  {SELF_OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>
          </section>

          <section className="afm-section">
            <h4>희망</h4>
            <div className="afm-grid">
              <Field label="1지망 지점 *">
                <select className="afm-inp" value={form.branch1 ?? ""} onChange={(e) => { set("branch1", e.target.value); if (!form.branch) set("branch", e.target.value); }}>
                  <option value="">—</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="2지망 지점">
                <select className="afm-inp" value={form.branch2 ?? ""} onChange={(e) => set("branch2", e.target.value)}>
                  <option value="">—</option>
                  {branches.filter((b) => b !== form.branch1).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="희망 시간대" wide>
                <div className="afm-toggle-row">
                  {SLOTS.map((s) => (
                    <button key={s} type="button" className={`afm-toggle ${workHourSet.has(s) ? "on" : ""}`} onClick={() => toggleWorkHour(s)}>{s}</button>
                  ))}
                </div>
              </Field>
              <Field label="시작 가능일">
                <input type="date" className="afm-inp" value={form.available_date ?? ""} onChange={(e) => set("available_date", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="afm-section">
            <h4>상태·확정</h4>
            <div className="afm-grid">
              <Field label="진행 상태">
                <select className="afm-inp" value={form.status ?? "스크리닝 전"} onChange={(e) => set("status", e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="확정 지점">
                <select className="afm-inp" value={form.confirmed_branch ?? ""} onChange={(e) => set("confirmed_branch", e.target.value)}>
                  <option value="">—</option>
                  {allBranches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="현재 근무 지점">
                <select className="afm-inp" value={form.current_branch ?? ""} onChange={(e) => set("current_branch", e.target.value)}>
                  <option value="">— (비근무)</option>
                  {allBranches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="확정 슬롯 (복수)" wide>
                <div className="afm-toggle-row">
                  {SLOTS.map((s) => (
                    <button key={s} type="button" className={`afm-toggle ${confirmedSlotSet.has(s) ? "on" : ""}`} onClick={() => toggleConfirmedSlot(s)}>{s}</button>
                  ))}
                </div>
              </Field>
              <Field label="시작일">
                <input type="date" className="afm-inp" value={form.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} />
              </Field>
              <Field label="이탈 사유">
                <input className="afm-inp" value={form.churn_reason ?? ""} onChange={(e) => set("churn_reason", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="afm-section">
            <h4>메모·자기소개</h4>
            <div className="afm-grid">
              <Field label="메모" wide>
                <input className="afm-inp" value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
              </Field>
              <Field label="자기소개" wide>
                <textarea className="afm-inp afm-area" rows={3} value={form.introduction ?? ""} onChange={(e) => set("introduction", e.target.value)} />
              </Field>
              <Field label="경력" wide>
                <textarea className="afm-inp afm-area" rows={2} value={form.experience ?? ""} onChange={(e) => set("experience", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="afm-section">
            <h4>기타</h4>
            <div className="afm-grid">
              <Field label="마케팅 동의">
                <label className="afm-check"><input type="checkbox" checked={!!form.marketing_consent} onChange={(e) => set("marketing_consent", e.target.checked)} /> 동의함</label>
              </Field>
              <Field label="카카오 채널 친구">
                <label className="afm-check"><input type="checkbox" checked={!!form.kakao_channel_friend} onChange={(e) => set("kakao_channel_friend", e.target.checked)} /> 친구 추가됨</label>
              </Field>
            </div>
          </section>
        </div>

        <footer className="afm-foot">
          <button className="afm-btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button className="afm-btn-primary" onClick={submit} disabled={saving}>
            {saving ? "저장 중..." : (mode === "create" ? "추가" : "저장")}
          </button>
        </footer>

        <style>{css}</style>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`afm-field ${wide ? "afm-field-wide" : ""}`}>
      <span className="afm-label">{label}</span>
      {children}
    </label>
  );
}

const css = `
.afm-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.afm-modal {
  background: #fff; border-radius: 12px; width: min(720px, 95vw); max-height: 90vh;
  display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.2);
}
.afm-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
}
.afm-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #111827; }
.afm-close { background: none; border: none; font-size: 18px; cursor: pointer; color: #6b7280; }
.afm-body { overflow-y: auto; padding: 16px 20px; flex: 1; }
.afm-err {
  background: #FEE2E2; color: #991B1B; padding: 8px 12px; border-radius: 6px;
  font-size: 13px; margin-bottom: 12px;
}
.afm-section { margin-bottom: 18px; }
.afm-section h4 { margin: 0 0 10px 0; font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
.afm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.afm-field { display: flex; flex-direction: column; gap: 4px; }
.afm-field-wide { grid-column: 1 / -1; }
.afm-label { font-size: 12px; color: #374151; font-weight: 600; }
.afm-inp {
  padding: 7px 10px; border: 1.5px solid #E8E8E0; border-radius: 6px;
  font-size: 13px; font-family: inherit; background: #fff; outline: none;
}
.afm-inp:focus { border-color: #1F2937; }
.afm-area { resize: vertical; font-family: inherit; }
.afm-toggle-row { display: flex; gap: 6px; flex-wrap: wrap; }
.afm-toggle {
  padding: 5px 12px; border: 1.5px solid #E8E8E0; border-radius: 99px;
  font-size: 12px; font-family: inherit; background: #fff; cursor: pointer; color: #6b7280;
}
.afm-toggle:hover { border-color: #9CA3AF; color: #111827; }
.afm-toggle.on { background: #1F2937; color: #fff; border-color: #1F2937; font-weight: 600; }
.afm-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; cursor: pointer; }
.afm-foot {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 14px 20px; border-top: 1px solid #e5e7eb;
}
.afm-btn-secondary, .afm-btn-primary {
  padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: inherit; border: none;
}
.afm-btn-secondary { background: #f3f4f6; color: #374151; }
.afm-btn-secondary:hover { background: #e5e7eb; }
.afm-btn-primary { background: #1F2937; color: #fff; }
.afm-btn-primary:hover { background: #111827; }
.afm-btn-primary:disabled, .afm-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
`;
