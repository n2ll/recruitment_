"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const BRANCHES = [
  "은평", "마포상암", "서대문신촌", "용산한남",
  "도봉쌍문", "중구명동", "성동옥수", "동대문제기",
  "강북미아", "노원중계", "중랑면목", "광진자양",
];

const TIMESLOTS = [
  { label: "평일 오전", sub: "월~금 08:00 ~ 13:00", value: "평일(월~금) 오전 타임 (08:00 ~ 13:00)" },
  { label: "평일 오후", sub: "월~금 11:00 ~ 16:00", value: "평일(월~금) 오후 타임 (11:00 ~ 16:00)" },
  { label: "주말 오전", sub: "토~일 08:00 ~ 13:00", value: "주말(토~일) 오전 타임 (08:00 ~ 13:00)" },
  { label: "주말 오후", sub: "토~일 11:00 ~ 16:00", value: "주말(토~일) 오후 타임 (11:00 ~ 16:00)" },
];

const LICENSE_TYPES = ["1종 보통", "2종 보통", "1종 대형", "없음"];

interface FormData {
  name: string;
  birthDate: string;
  phone: string;
  location: string;
  ownVehicle: string;
  licenseType: string;
  vehicleType: string;
  branch1: string;
  branch2: string;
  workHours: string[];
  introduction: string;
  experience: string;
  availableDate: string;
  selfOwnership: string;
  marketingConsent: boolean;
}

const KAKAO_CHANNEL_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || "https://pf.kakao.com/";

function Dropdown({
  label, value, options, onChange, placeholder, required, exclude,
}: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  placeholder: string; required?: boolean; exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = options.filter((o) => o !== exclude);

  return (
    <div className="field-wrap" ref={ref} style={{ position: "relative" }}>
      <label className="field-label">
        {label}{required && <span className="req"> *</span>}
      </label>
      <div
        className={`dropdown-trigger ${open ? "dd-open" : ""} ${!value ? "dd-placeholder" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <span>{value || placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d={open ? "M4 10L8 6L12 10" : "M4 6L8 10L12 6"}
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {open && (
        <div className="dropdown-menu">
          {!required && (
            <div className="dd-item" onClick={() => { onChange(""); setOpen(false); }}>
              <span style={{ color: "#9ca3af" }}>선택 안함</span>
            </div>
          )}
          {filtered.map((opt) => (
            <div key={opt} className={`dd-item ${value === opt ? "dd-selected" : ""}`}
              onClick={() => { onChange(opt); setOpen(false); }}>
              {opt}
              {value === opt && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7L5.5 10.5L12 4" stroke="#B8860B" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ApplyPageWrapper() {
  return (
    <Suspense>
      <ApplyPage />
    </Suspense>
  );
}

function ApplyPage() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source") || "direct";
  const branchParam = searchParams.get("branch") || "";

  const [form, setForm] = useState<FormData>({
    name: "", birthDate: "", phone: "", location: "",
    ownVehicle: "", licenseType: "", vehicleType: "",
    branch1: branchParam, branch2: "",
    workHours: [], introduction: "", experience: "",
    availableDate: "", selfOwnership: "",
    marketingConsent: false,
  });

  const [step, setStep] = useState<"form" | "done">("form");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const set = (key: keyof FormData) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const toggleHour = (slot: string) => {
    setForm((f) => ({
      ...f,
      workHours: f.workHours.includes(slot)
        ? f.workHours.filter((s) => s !== slot)
        : [...f.workHours, slot],
    }));
  };

  const validate = () => {
    const e: Partial<Record<string, string>> = {};
    if (!form.name.trim()) e.name = "성함을 입력해주세요";
    if (!/^\d{6}$/.test(form.birthDate)) e.birthDate = "생년월일 6자리를 입력해주세요 (예: 901113)";
    if (!/^\d{10,11}$/.test(form.phone)) e.phone = "휴대폰 번호를 '-' 없이 입력해주세요";
    if (!form.location.trim()) e.location = "거주지를 입력해주세요";
    if (!form.ownVehicle) e.ownVehicle = "차량 여부를 선택해주세요";
    if (!form.licenseType) e.licenseType = "면허 종류를 선택해주세요";
    if (!form.vehicleType.trim()) e.vehicleType = "차종을 입력해주세요";
    if (!form.branch1) e.branch1 = "희망 근무 지점을 선택해주세요";
    if (form.workHours.length === 0) e.workHours = "희망 근무 시간대를 하나 이상 선택해주세요";
    if (!form.introduction.trim()) e.introduction = "자기소개를 작성해주세요";
    if (!form.availableDate) e.availableDate = "업무 시작 가능일을 선택해주세요";
    if (!form.selfOwnership) e.selfOwnership = "본인 명의 여부를 선택해주세요";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      setTimeout(() => {
        document.querySelector(".error-msg")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source }),
      });
      if (!res.ok) throw new Error();
      setStep("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      alert("제출 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <>
        <style>{css}</style>
        <div className="page">
          <div className="done-wrap">
            <div className="done-circle">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M8 20L16 28L32 12" stroke="#3D2B00" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="done-title">지원이 완료되었습니다</h2>
            <p className="done-desc">
              검토 후 빠른 시일 내에 연락드리겠습니다.<br />
              지원해주셔서 감사합니다.
            </p>

            <div className="kakao-cta">
              <p className="kakao-cta-title">📢 카카오톡 채널을 꼭 추가해주세요!</p>
              <p className="kakao-cta-desc">
                <strong>채널 추가 시 서류접수·확정 안내를 가장 빠르게</strong> 받아보실 수 있습니다.<br />
                문자로도 함께 발송되지만, 카톡이 훨씬 빠르고 편리합니다.
              </p>
              <a
                className="kakao-btn"
                href={KAKAO_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2C5.58 2 2 4.79 2 8.23c0 2.15 1.41 4.04 3.54 5.16l-.71 2.57c-.05.2.18.36.35.25L8.2 14.4c.59.08 1.18.13 1.8.13 4.42 0 8-2.79 8-6.23C18 4.79 14.42 2 10 2z" fill="#3D2B00"/>
                </svg>
                카카오톡 채널 추가하기
              </a>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="page">

        {/* 헤더 */}
        <header className="header">
          <img src="/logo.png" alt="옹고잉" className="logo-img" />
          <h1 className="header-title">배송원 지원서</h1>
          <p className="header-sub">B마트 배달 업무</p>
        </header>

        <main className="form-body">

          {/* 01 기본 정보 */}
          <section className="section">
            <div className="section-header">
              <span className="section-num">01</span>
              <h3 className="section-title">기본 정보</h3>
            </div>

            <div className="field-wrap">
              <label className="field-label">성함 <span className="req">*</span></label>
              <input className={`input ${errors.name ? "input-err" : ""}`}
                placeholder="실명을 입력해주세요" value={form.name}
                onChange={(e) => set("name")(e.target.value)} />
              {errors.name && <p className="error-msg">{errors.name}</p>}
            </div>

            <div className="field-wrap">
              <label className="field-label">생년월일 6자리 <span className="req">*</span></label>
              <input className={`input ${errors.birthDate ? "input-err" : ""}`}
                placeholder="예: 901113" maxLength={6} inputMode="numeric"
                value={form.birthDate}
                onChange={(e) => set("birthDate")(e.target.value.replace(/\D/g, ""))} />
              {errors.birthDate && <p className="error-msg">{errors.birthDate}</p>}
            </div>

            <div className="field-wrap">
              <label className="field-label">휴대폰 번호 <span className="req">*</span></label>
              <input className={`input ${errors.phone ? "input-err" : ""}`}
                placeholder="'-' 없이 숫자만 (예: 01012345678)"
                inputMode="numeric" maxLength={11} value={form.phone}
                onChange={(e) => set("phone")(e.target.value.replace(/\D/g, ""))} />
              {errors.phone && <p className="error-msg">{errors.phone}</p>}
            </div>

            <div className="field-wrap">
              <label className="field-label">거주지 (동 단위) <span className="req">*</span></label>
              <input className={`input ${errors.location ? "input-err" : ""}`}
                placeholder="예: 마포구 상암동" value={form.location}
                onChange={(e) => set("location")(e.target.value)} />
              {errors.location && <p className="error-msg">{errors.location}</p>}
            </div>
          </section>

          <div className="divider" />

          {/* 02 차량 정보 */}
          <section className="section">
            <div className="section-header">
              <span className="section-num">02</span>
              <h3 className="section-title">차량 정보</h3>
            </div>

            <div className="field-wrap">
              <label className="field-label">자기 명의 차량 여부 <span className="req">*</span></label>
              <div className="radio-group">
                {["있음", "없음"].map((opt) => (
                  <button key={opt} type="button"
                    className={`radio-btn ${form.ownVehicle === opt ? "radio-on" : ""}`}
                    onClick={() => set("ownVehicle")(opt)}>
                    {opt}
                  </button>
                ))}
              </div>
              {errors.ownVehicle && <p className="error-msg">{errors.ownVehicle}</p>}
            </div>

            <Dropdown label="운전면허 종류" value={form.licenseType}
              options={LICENSE_TYPES} onChange={set("licenseType")}
              placeholder="면허 종류를 선택해주세요" required />
            {errors.licenseType && <p className="error-msg" style={{ marginTop: -10 }}>{errors.licenseType}</p>}

            <div className="field-wrap">
              <label className="field-label">차종 <span className="req">*</span></label>
              <input className={`input ${errors.vehicleType ? "input-err" : ""}`}
                placeholder="예: 투싼, 모닝, 1톤 탑차" value={form.vehicleType}
                onChange={(e) => set("vehicleType")(e.target.value)} />
              {errors.vehicleType && <p className="error-msg">{errors.vehicleType}</p>}
            </div>
          </section>

          <div className="divider" />

          {/* 03 희망 근무 지점 */}
          <section className="section">
            <div className="section-header">
              <span className="section-num">03</span>
              <h3 className="section-title">희망 근무 지점</h3>
            </div>
            <p className="section-desc">1지망은 필수, 2지망은 선택입니다.</p>

            <Dropdown label="1지망" value={form.branch1}
              options={BRANCHES} onChange={set("branch1")}
              placeholder="지점을 선택해주세요" required
              exclude={form.branch2} />
            {errors.branch1 && <p className="error-msg" style={{ marginTop: -10 }}>{errors.branch1}</p>}

            <Dropdown label="2지망 (선택)" value={form.branch2}
              options={BRANCHES} onChange={set("branch2")}
              placeholder="선택 안함"
              exclude={form.branch1} />
          </section>

          <div className="divider" />

          {/* 04 희망 근무 시간대 */}
          <section className="section">
            <div className="section-header">
              <span className="section-num">04</span>
              <h3 className="section-title">희망 근무 시간대 <span className="req">*</span></h3>
            </div>
            <p className="section-desc">중복 선택 가능합니다.</p>

            <div className="timeslot-grid">
              {TIMESLOTS.map(({ label, sub, value: slotValue }) => {
                const isOn = form.workHours.includes(slotValue);
                return (
                  <button key={slotValue} type="button"
                    className={`timeslot-btn ${isOn ? "ts-on" : ""}`}
                    onClick={() => toggleHour(slotValue)}>
                    <div className={`ts-check ${isOn ? "ts-check-on" : ""}`}>
                      {isOn && (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M1.5 5.5L4 8L9.5 2.5" stroke="#fff" strokeWidth="1.8"
                            strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="ts-text">
                      <span className="ts-label">{label}</span>
                      <span className="ts-sub">{sub}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.workHours && <p className="error-msg">{errors.workHours}</p>}
          </section>

          <div className="divider" />

          {/* 05 자기소개 */}
          <section className="section">
            <div className="section-header">
              <span className="section-num">05</span>
              <h3 className="section-title">자기소개 및 지원동기 <span className="req">*</span></h3>
            </div>
            <p className="section-desc">경력, 강점 등을 상세하게 작성해주세요.</p>
            <textarea className={`textarea ${errors.introduction ? "input-err" : ""}`}
              placeholder="자유롭게 작성해주세요." rows={5}
              value={form.introduction}
              onChange={(e) => set("introduction")(e.target.value)} />
            {errors.introduction && <p className="error-msg">{errors.introduction}</p>}
          </section>

          {/* 06 경력 */}
          <section className="section" style={{ marginTop: 24 }}>
            <div className="section-header">
              <span className="section-num">06</span>
              <h3 className="section-title">배달 업무 관련 경력</h3>
            </div>
            <p className="section-desc">없으시면 비워두셔도 됩니다.</p>
            <textarea className="textarea"
              placeholder="예: 배민커넥트 6개월, 자차 택배 배송 3개월"
              rows={3} value={form.experience}
              onChange={(e) => set("experience")(e.target.value)} />
          </section>

          <div className="divider" />

          {/* 07 추가 확인 사항 */}
          <section className="section">
            <div className="section-header">
              <span className="section-num">07</span>
              <h3 className="section-title">추가 확인 사항</h3>
            </div>

            <div className="field-wrap">
              <label className="field-label">업무 시작 가능일 <span className="req">*</span></label>
              <input
                type="date"
                className={`input input-date ${errors.availableDate ? "input-err" : ""}`}
                value={form.availableDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set("availableDate")(e.target.value)}
                onClick={(e) => {
                  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                  try { el.showPicker?.(); } catch { /* unsupported */ }
                }}
              />
              {errors.availableDate && <p className="error-msg">{errors.availableDate}</p>}
            </div>

            <div className="field-wrap">
              <label className="field-label">본인 명의로 업무 진행 및 정산에 문제 없으신가요? <span className="req">*</span></label>
              <div className="radio-group">
                {["문제 없음", "문제 있음 (지원불가)"].map((opt) => (
                  <button key={opt} type="button"
                    className={`radio-btn ${form.selfOwnership === opt ? "radio-on" : ""}`}
                    onClick={() => set("selfOwnership")(opt)}>
                    {opt}
                  </button>
                ))}
              </div>
              {errors.selfOwnership && <p className="error-msg">{errors.selfOwnership}</p>}
            </div>
          </section>

          {/* 마케팅 수신 동의 (선택) */}
          <div className="consent-wrap">
            <label className="consent-row">
              <input
                type="checkbox"
                checked={form.marketingConsent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, marketingConsent: e.target.checked }))
                }
              />
              <span className="consent-text">
                <strong>[선택]</strong> 마케팅 정보 수신 동의
                <span className="consent-sub">
                  추후 모집 공고, 이벤트, 재컨택 등의 안내를 받을 수 있습니다.
                </span>
              </span>
            </label>
          </div>

          {/* 제출 버튼 */}
          <button className={`submit-btn ${submitting ? "submitting" : ""}`}
            onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? <span className="spin-wrap"><span className="spinner" />제출 중...</span>
              : "지원서 제출하기 →"}
          </button>

          <p className="footer-note">입력하신 정보는 채용 목적으로만 사용됩니다.</p>
        </main>
      </div>
    </>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans KR', sans-serif;
    background: #FAFAF7;
    color: #1a1a1a;
    -webkit-font-smoothing: antialiased;
  }
  .page { min-height: 100vh; }

  .header {
    background: #fff;
    padding: 32px 24px 28px;
    text-align: center;
    position: relative;
    border-bottom: 3px solid #F5C518;
  }
  .logo-img {
    height: 56px; width: auto; max-width: 180px;
    display: block; margin: 0 auto 8px;
    object-fit: contain;
  }
  .header-title {
    color: #1a1a1a; font-size: 22px; font-weight: 700;
    letter-spacing: -0.02em; margin-bottom: 4px;
  }
  .header-sub {
    color: #9ca3af; font-size: 12px; font-weight: 500;
  }

  .form-body { padding: 24px 16px 60px; max-width: 520px; margin: 0 auto; }

  .section { margin-bottom: 4px; }
  .section-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 18px;
  }
  .section-num {
    font-size: 11px; font-weight: 700; color: #B8860B;
    background: #FFF8DC; border: 1px solid #F5C518;
    border-radius: 6px; padding: 2px 8px; letter-spacing: 0.05em;
  }
  .section-title { font-size: 15px; font-weight: 700; color: #1a1a1a; }
  .section-desc { font-size: 13px; color: #6b7280; margin: -10px 0 14px; }
  .divider { height: 1px; background: #E8E8E0; margin: 28px 0; }

  .field-wrap { margin-bottom: 16px; }
  .field-label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 7px; }
  .req { color: #ef4444; font-weight: 700; }

  .input, .textarea {
    width: 100%; padding: 13px 14px;
    border: 1.5px solid #E8E8E0; border-radius: 10px;
    font-size: 15px; font-family: inherit; color: #1a1a1a;
    background: #fff; transition: border-color 0.15s, box-shadow 0.15s;
    outline: none; -webkit-appearance: none;
  }
  .input:focus, .textarea:focus {
    border-color: #F5C518;
    box-shadow: 0 0 0 3px rgba(245,197,24,0.15);
  }
  .input::placeholder, .textarea::placeholder { color: #b0b0a8; }
  .textarea { resize: vertical; line-height: 1.6; }
  input[type="date"] { color-scheme: light; }
  input[type="date"]:invalid, input[type="date"][value=""] { color: #b0b0a8; }
  .input-date { cursor: pointer; }
  .input-date::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
  .input-err { border-color: #ef4444 !important; }
  .error-msg { font-size: 12px; color: #ef4444; margin-top: 5px; font-weight: 500; }

  .radio-group { display: flex; gap: 10px; }
  .radio-btn {
    flex: 1; padding: 13px;
    border: 1.5px solid #E8E8E0; border-radius: 10px;
    font-size: 14px; font-weight: 500; font-family: inherit;
    color: #6b7280; background: #fff; cursor: pointer;
    transition: all 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .radio-on {
    border-color: #F5C518; background: #FFFBEB;
    color: #92650A; font-weight: 700;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }

  .dropdown-trigger {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 14px;
    border: 1.5px solid #E8E8E0; border-radius: 10px;
    font-size: 15px; font-family: inherit; color: #1a1a1a;
    background: #fff; cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
    user-select: none; -webkit-tap-highlight-color: transparent;
  }
  .dd-placeholder { color: #b0b0a8; }
  .dd-open { border-color: #F5C518; box-shadow: 0 0 0 3px rgba(245,197,24,0.15); }
  .dropdown-menu {
    position: absolute; left: 0; right: 0; z-index: 100;
    background: #fff; border: 1.5px solid #E8E8E0; border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0,0,0,0.12);
    overflow: hidden; max-height: 260px; overflow-y: auto; margin-top: 4px;
  }
  .dd-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 16px; font-size: 14px; color: #374151;
    cursor: pointer; transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }
  .dd-item:hover { background: #FFFBEB; }
  .dd-selected { color: #92650A; font-weight: 600; background: #FFFBEB; }
  .dd-item + .dd-item { border-top: 1px solid #f3f4f6; }

  .timeslot-grid { display: flex; flex-direction: column; gap: 8px; }
  .timeslot-btn {
    display: flex; align-items: center; gap: 12px; padding: 14px;
    border: 1.5px solid #E8E8E0; border-radius: 10px;
    font-family: inherit; color: #374151;
    background: #fff; cursor: pointer; text-align: left;
    transition: all 0.15s; -webkit-tap-highlight-color: transparent;
  }
  .ts-on {
    border-color: #F5C518; background: #FFFBEB;
    box-shadow: 0 0 0 2px rgba(245,197,24,0.2);
  }
  .ts-check {
    width: 22px; height: 22px; border-radius: 6px;
    border: 1.5px solid #D1D5DB;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 0.15s; background: #fff;
  }
  .ts-check-on { background: #B8860B; border-color: #B8860B; }
  .ts-text { display: flex; flex-direction: column; gap: 2px; }
  .ts-label { font-size: 14px; font-weight: 600; color: #1a1a1a; }
  .ts-on .ts-label { color: #92650A; }
  .ts-sub { font-size: 12px; color: #9ca3af; }
  .ts-on .ts-sub { color: #B8860B; }

  .submit-btn {
    width: 100%; padding: 16px;
    background: #F5C518; color: #3D2B00;
    border: none; border-radius: 12px;
    font-size: 16px; font-weight: 700; font-family: inherit;
    cursor: pointer; margin-top: 32px;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 4px 16px rgba(245,197,24,0.4);
    -webkit-tap-highlight-color: transparent;
    letter-spacing: -0.01em;
  }
  .submit-btn:hover:not(:disabled) {
    background: #E6B800;
    box-shadow: 0 6px 20px rgba(245,197,24,0.5);
  }
  .submit-btn:active:not(:disabled) { transform: scale(0.99); }
  .submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
  .spin-wrap { display: flex; align-items: center; justify-content: center; gap: 8px; }
  .spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(61,43,0,0.3);
    border-top-color: #3D2B00;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .footer-note { text-align: center; font-size: 12px; color: #b0b0a8; margin-top: 14px; }

  .done-wrap { max-width: 420px; margin: 80px auto; text-align: center; padding: 0 24px; }
  .done-circle {
    width: 72px; height: 72px; background: #F5C518; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 24px;
    box-shadow: 0 4px 20px rgba(245,197,24,0.4);
  }
  .done-title { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
  .done-desc { font-size: 14px; color: #6b7280; line-height: 1.8; }

  .kakao-cta {
    margin-top: 36px; padding: 22px 20px;
    background: #FEE500; border-radius: 14px; text-align: left;
    box-shadow: 0 4px 16px rgba(254,229,0,0.4);
  }
  .kakao-cta-title {
    font-size: 15px; font-weight: 700; color: #3D2B00;
    margin-bottom: 10px; text-align: center;
  }
  .kakao-cta-desc {
    font-size: 13px; color: #3D2B00; line-height: 1.7;
    margin-bottom: 16px; text-align: center;
  }
  .kakao-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 14px;
    background: #3D2B00; color: #FEE500; border-radius: 10px;
    font-size: 15px; font-weight: 700; text-decoration: none;
    transition: transform 0.1s;
  }
  .kakao-btn:hover { transform: scale(1.02); }
  .kakao-btn svg path { fill: #FEE500; }

  .consent-wrap {
    margin-top: 20px; padding: 14px 16px;
    background: #FAFAF7; border: 1.5px solid #E8E8E0; border-radius: 10px;
  }
  .consent-row {
    display: flex; align-items: flex-start; gap: 10px; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .consent-row input[type="checkbox"] {
    width: 18px; height: 18px; margin-top: 2px; flex-shrink: 0;
    accent-color: #B8860B; cursor: pointer;
  }
  .consent-text { font-size: 13px; color: #374151; line-height: 1.6; }
  .consent-text strong { color: #B8860B; font-weight: 700; margin-right: 4px; }
  .consent-sub {
    display: block; font-size: 12px; color: #9ca3af; margin-top: 4px;
  }

  @media (min-width: 480px) {
    .form-body { padding: 32px 24px 80px; }
    .header { padding: 40px 24px 32px; }
    .logo-img { height: 64px; max-width: 200px; }
    .header-title { font-size: 26px; }
  }
`;
