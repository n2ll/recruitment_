"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { DisplayHeadline } from "@/components/ui/display-headline";
import { EditorialCard, EditorialCardTitle, EditorialCardContent } from "@/components/ui/editorial-card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/cn";

const TIMESLOTS = [
  { label: "평일 오전", sub: "월~금 09:00 ~ 14:00", value: "평일(월~금) 오전 타임 (09:00 ~ 14:00)" },
  { label: "평일 오후", sub: "월~금 12:00 ~ 17:00", value: "평일(월~금) 오후 타임 (12:00 ~ 17:00)" },
  { label: "주말 오전", sub: "토~일 09:00 ~ 14:00", value: "주말(토~일) 오전 타임 (09:00 ~ 14:00)" },
  { label: "주말 오후", sub: "토~일 12:00 ~ 17:00", value: "주말(토~일) 오후 타임 (12:00 ~ 17:00)" },
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
  experience: string;
  availableDate: string;
  selfOwnership: string;
  source: string;
  marketingConsent: boolean;
}

const SOURCE_OPTIONS = [
  { label: "당근", value: "danggeun" },
  { label: "배민", value: "baemin" },
];

function normalizeSource(raw: string | null): string {
  const known = SOURCE_OPTIONS.map((s) => s.value);
  if (raw && known.includes(raw)) return raw;
  return "danggeun";
}

const KAKAO_CHANNEL_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || "https://pf.kakao.com/";

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

function parseBirth(raw: string): { ok: boolean; label: string } {
  if (!/^\d{6}$/.test(raw)) return { ok: false, label: "" };
  const yy = parseInt(raw.slice(0, 2), 10);
  const mm = parseInt(raw.slice(2, 4), 10);
  const dd = parseInt(raw.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return { ok: false, label: "월(MM)이 올바르지 않습니다" };
  const daysInMonth = new Date(2000, mm, 0).getDate();
  if (dd < 1 || dd > daysInMonth) return { ok: false, label: "일(DD)이 올바르지 않습니다" };
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  return { ok: true, label: `${year}년 ${mm}월 ${dd}일` };
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (config: {
        oncomplete: (data: {
          sido: string;
          sigungu: string;
          bname: string;
          address: string;
        }) => void;
      }) => { open: () => void };
    };
  }
}

let daumLoadPromise: Promise<void> | null = null;
function loadDaumPostcode(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (daumLoadPromise) return daumLoadPromise;
  daumLoadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("우편번호 스크립트 로딩 실패"));
    document.body.appendChild(s);
  });
  return daumLoadPromise;
}

export default function ApplyPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-gray">로딩 중...</div>}>
      <ApplyPage />
    </Suspense>
  );
}

function ApplyPage() {
  const searchParams = useSearchParams();
  const defaultSource = normalizeSource(searchParams.get("source"));
  const branchParam = searchParams.get("branch") || "";

  const [form, setForm] = useState<FormData>({
    name: "", birthDate: "", phone: "", location: "",
    ownVehicle: "", licenseType: "", vehicleType: "",
    branch1: branchParam, branch2: "",
    workHours: [], experience: "",
    availableDate: "", selfOwnership: "",
    source: defaultSource,
    marketingConsent: false, // B-6: Default false
  });

  const [step, setStep] = useState<1 | 2 | 3 | "done">(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/branches")
      .then((r) => r.json())
      .then((json) => {
        if (alive) {
          setBranches(Array.isArray(json.branches) ? json.branches : []);
          setBranchesLoading(false);
        }
      })
      .catch(() => {
        if (alive) setBranchesLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const update = (key: keyof FormData) => (val: string) => {
    setForm((f) => ({ ...f, [key]: val }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const toggleHour = (slot: string) => {
    setForm((f) => {
      const updated = f.workHours.includes(slot)
        ? f.workHours.filter((s) => s !== slot)
        : [...f.workHours, slot];
      if (updated.length > 0 && errors.workHours) {
        setErrors((e) => ({ ...e, workHours: undefined }));
      }
      return { ...f, workHours: updated };
    });
  };

  const validateStep1 = () => {
    const e: Partial<Record<string, string>> = {};
    if (!form.name.trim()) e.name = "성함을 입력해주세요";
    const birth = parseBirth(form.birthDate);
    if (!/^\d{6}$/.test(form.birthDate)) e.birthDate = "생년월일 6자리를 입력해주세요 (예: 901113)";
    else if (!birth.ok) e.birthDate = birth.label || "생년월일이 올바르지 않습니다";
    if (!/^\d{10,11}$/.test(form.phone)) e.phone = "올바른 휴대폰 번호를 입력해주세요";
    if (!form.location.trim()) e.location = "거주지를 입력해주세요";
    
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Partial<Record<string, string>> = {};
    if (!form.selfOwnership) e.selfOwnership = "본인 명의 여부를 선택해주세요";
    if (form.selfOwnership === "문제 있음 (지원불가)") {
      e.selfOwnership = "본인 명의로 업무가 불가하면 지원이 제한됩니다.";
    }
    if (!form.ownVehicle) e.ownVehicle = "차량 보유 여부를 선택해주세요";
    if (!form.licenseType) e.licenseType = "운전면허 종류를 선택해주세요";
    if (!form.vehicleType.trim()) e.vehicleType = "차종을 입력해주세요";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e: Partial<Record<string, string>> = {};
    if (!form.branch1) e.branch1 = "1지망 근무 지점을 선택해주세요";
    if (form.workHours.length === 0) e.workHours = "희망 근무 시간대를 선택해주세요";
    if (!form.availableDate) e.availableDate = "업무 시작 가능일을 선택해주세요";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const nextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
      window.scrollTo(0, 0);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep3()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: form.source }),
      });
      if (!res.ok) throw new Error();
      setStep("done");
      window.scrollTo(0, 0);
    } catch {
      setSubmitError("지원서 제출에 실패했어요. 네트워크 연결을 확인하고 다시 시도해 주세요."); // B-9 Fix
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <div className="mx-auto flex min-h-screen max-w-[640px] flex-col bg-paper-white px-6 py-16 sm:px-12 sm:py-24">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-sage">
            <CheckCircle2 className="h-10 w-10 text-deep-violet" />
          </div>
          <DisplayHeadline size="md" className="mb-4">지원이 완료되었습니다</DisplayHeadline>
          <p className="text-[16px] leading-relaxed text-slate-gray">
            검토 후 빠른 시일 내에 연락드리겠습니다.<br />지원해주셔서 감사합니다.
          </p>
        </div>

        <EditorialCard tone="amber" eyebrow="필수 확인">
          <EditorialCardTitle className="text-[20px]">카카오톡 채널 추가</EditorialCardTitle>
          <EditorialCardContent className="mb-6">
            채널 추가 시 서류접수 및 확정 안내를 가장 빠르게 받아보실 수 있습니다. 문자로도 발송되지만, 카카오톡이 훨씬 빠르고 편리합니다.
          </EditorialCardContent>
          <Button
            asChild
            size="hero"
            className="w-full bg-[#FEE500] text-[#3D2B00] hover:bg-[#FEE500]/90"
          >
            <a href={KAKAO_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
              카카오톡 채널 추가하기
            </a>
          </Button>
        </EditorialCard>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col bg-paper-white px-6 py-12 sm:px-12 sm:py-20">
      <div className="mb-12">
        <div className="mb-8">
          <Wordmark size="lg" />
        </div>
        <DisplayHeadline size="md" eyebrow={`STEP ${step} OF 3`}>
          {step === 1 && "기본 정보를 알려주세요"}
          {step === 2 && "운행하실 차량을 확인합니다"}
          {step === 3 && "근무 희망 조건을 알려주세요"}
        </DisplayHeadline>
      </div>

      <div className="flex flex-col gap-8">
        {step === 1 && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">성함 <span className="text-burgundy">*</span></Label>
              <Input
                id="name"
                placeholder="실명을 입력해주세요"
                value={form.name}
                onChange={(e) => update("name")(e.target.value)}
                className={errors.name ? "border-burgundy focus-visible:ring-burgundy/20" : ""}
              />
              {errors.name && <p className="text-[13px] text-burgundy">{errors.name}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="birth">생년월일 6자리 <span className="text-burgundy">*</span></Label>
              <Input
                id="birth"
                placeholder="예: 901113 (YYMMDD)"
                maxLength={6}
                inputMode="numeric"
                value={form.birthDate}
                onChange={(e) => update("birthDate")(e.target.value.replace(/\D/g, ""))}
                className={errors.birthDate ? "border-burgundy focus-visible:ring-burgundy/20" : ""}
              />
              {(() => {
                const parsed = parseBirth(form.birthDate);
                if (form.birthDate.length === 6 && parsed.ok) {
                  return <p className="text-[13px] text-deep-violet">{parsed.label}</p>;
                }
                return null;
              })()}
              {errors.birthDate && <p className="text-[13px] text-burgundy">{errors.birthDate}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">휴대폰 번호 <span className="text-burgundy">*</span></Label>
              <Input
                id="phone"
                placeholder="010-1234-5678"
                inputMode="numeric"
                maxLength={13}
                value={formatPhone(form.phone)}
                onChange={(e) => update("phone")(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className={errors.phone ? "border-burgundy focus-visible:ring-burgundy/20" : ""}
              />
              {errors.phone && <p className="text-[13px] text-burgundy">{errors.phone}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>거주지 (동 단위) <span className="text-burgundy">*</span></Label>
              <div className="flex gap-2">
                <Input
                  placeholder="주소 찾기 버튼을 눌러주세요"
                  value={form.location}
                  readOnly
                  className={cn("flex-1 bg-bone/30 cursor-pointer", errors.location && "border-burgundy")}
                  onClick={async () => {
                    try {
                      await loadDaumPostcode();
                      new window.daum!.Postcode({
                        oncomplete: (data) => {
                          const display = [data.sido, data.sigungu, data.bname].filter(Boolean).join(" ").trim();
                          update("location")(display || data.address);
                        },
                      }).open();
                    } catch {
                      alert("주소를 검색할 수 없습니다. 직접 입력해주세요.");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await loadDaumPostcode();
                      new window.daum!.Postcode({
                        oncomplete: (data) => {
                          const display = [data.sido, data.sigungu, data.bname].filter(Boolean).join(" ").trim();
                          update("location")(display || data.address);
                        },
                      }).open();
                    } catch {}
                  }}
                >
                  주소 찾기
                </Button>
              </div>
              {errors.location && <p className="text-[13px] text-burgundy">{errors.location}</p>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-3">
              <Label>본인 명의로 업무 및 정산이 가능하신가요? <span className="text-burgundy">*</span></Label>
              <div className="grid grid-cols-2 gap-3">
                {["문제 없음", "문제 있음 (지원불가)"].map((opt) => {
                  const selected = form.selfOwnership === opt;
                  return (
                    <button
                      key={opt}
                      className={cn(
                        "flex items-center justify-center rounded-pill border px-4 py-3 text-[14px] font-medium transition-colors",
                        selected
                          ? "border-deep-violet bg-surface-lavender text-deep-violet"
                          : "border-stone-border/30 bg-paper-white text-slate-gray hover:bg-bone/40"
                      )}
                      onClick={() => update("selfOwnership")(opt)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {form.selfOwnership === "문제 있음 (지원불가)" && (
                <div className="mt-2 flex items-start gap-2 rounded-[12px] bg-rose-soft p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-burgundy" />
                  <div className="text-[13px] leading-relaxed text-burgundy">
                    <p className="font-semibold mb-1">지원 불가 안내</p>
                    <p>본인 명의 차량, 계좌, 통신 등으로만 업무가 가능합니다. 타인 명의로는 정산 및 배정이 제한되어 지원이 어렵습니다.</p>
                  </div>
                </div>
              )}
              {errors.selfOwnership && <p className="text-[13px] text-burgundy">{errors.selfOwnership}</p>}
            </div>

            <div className="flex flex-col gap-3">
              <Label>자기 명의 차량 보유 여부 <span className="text-burgundy">*</span></Label>
              <div className="grid grid-cols-2 gap-3">
                {["있음", "없음"].map((opt) => {
                  const selected = form.ownVehicle === opt;
                  return (
                    <button
                      key={opt}
                      className={cn(
                        "flex items-center justify-center rounded-pill border px-4 py-3 text-[14px] font-medium transition-colors",
                        selected
                          ? "border-deep-violet bg-surface-lavender text-deep-violet"
                          : "border-stone-border/30 bg-paper-white text-slate-gray hover:bg-bone/40"
                      )}
                      onClick={() => update("ownVehicle")(opt)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {errors.ownVehicle && <p className="text-[13px] text-burgundy">{errors.ownVehicle}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>운전면허 종류 <span className="text-burgundy">*</span></Label>
              <Select value={form.licenseType} onValueChange={update("licenseType")}>
                <SelectTrigger className={errors.licenseType ? "border-burgundy" : ""}>
                  <SelectValue placeholder="면허 종류를 선택해주세요" />
                </SelectTrigger>
                <SelectContent>
                  {LICENSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.licenseType && <p className="text-[13px] text-burgundy">{errors.licenseType}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>차종 <span className="text-burgundy">*</span></Label>
              <Input
                placeholder="예: 투싼, 모닝, 1톤 탑차"
                value={form.vehicleType}
                onChange={(e) => update("vehicleType")(e.target.value)}
                className={errors.vehicleType ? "border-burgundy focus-visible:ring-burgundy/20" : ""}
              />
              {errors.vehicleType && <p className="text-[13px] text-burgundy">{errors.vehicleType}</p>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-4">
              <Label className="text-[15px] text-ink-black">희망 근무 지점 <span className="text-burgundy">*</span></Label>
              
              <div className="flex flex-col gap-2">
                <Label>1지망 <span className="text-burgundy">*</span></Label>
                <Select value={form.branch1} onValueChange={update("branch1")}>
                  <SelectTrigger className={errors.branch1 ? "border-burgundy" : ""}>
                    <SelectValue placeholder="1지망 지점 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter(b => b !== form.branch2).map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.branch1 && <p className="text-[13px] text-burgundy">{errors.branch1}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label>2지망 (선택)</Label>
                <Select value={form.branch2} onValueChange={update("branch2")}>
                  <SelectTrigger>
                    <SelectValue placeholder="선택 안함" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">선택 안함</SelectItem>
                    {branches.filter(b => b !== form.branch1).map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Label className="text-[15px] text-ink-black">희망 근무 시간대 <span className="text-burgundy">*</span></Label>
              <p className="text-[13px] text-mist-gray -mt-2">중복 선택 가능</p>
              <div className="flex flex-col gap-2">
                {TIMESLOTS.map((slot) => {
                  const isOn = form.workHours.includes(slot.value);
                  return (
                    <button
                      key={slot.value}
                      className={cn(
                        "flex w-full items-center gap-4 rounded-[12px] border p-4 text-left transition-colors",
                        isOn
                          ? "border-deep-violet bg-surface-lavender"
                          : "border-stone-border/30 bg-paper-white hover:bg-bone/40"
                      )}
                      onClick={() => toggleHour(slot.value)}
                    >
                      <div className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border",
                        isOn ? "border-deep-violet bg-deep-violet" : "border-stone-border/50 bg-paper-white"
                      )}>
                        {isOn && <Check className="h-3.5 w-3.5 text-paper-white" />}
                      </div>
                      <div className="flex flex-col">
                        <span className={cn("text-[15px] font-medium", isOn ? "text-deep-violet" : "text-ink-black")}>
                          {slot.label}
                        </span>
                        <span className="text-[13px] text-slate-gray">{slot.sub}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {errors.workHours && <p className="text-[13px] text-burgundy">{errors.workHours}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>업무 시작 가능일 <span className="text-burgundy">*</span></Label>
              <Input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={form.availableDate}
                onChange={(e) => update("availableDate")(e.target.value)}
                onClick={(e) => {
                  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                  try { el.showPicker?.(); } catch {}
                }}
                className={cn("cursor-pointer", errors.availableDate && "border-burgundy focus-visible:ring-burgundy/20")}
              />
              {errors.availableDate && <p className="text-[13px] text-burgundy">{errors.availableDate}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label>배달 업무 관련 경력 (선택)</Label>
              <Textarea
                placeholder="예: 배민커넥트 6개월, 자차 택배 배송 3개월 (없으시면 비워두셔도 됩니다)"
                value={form.experience}
                onChange={(e) => update("experience")(e.target.value)}
              />
            </div>

            <div className="mt-4 rounded-[12px] border border-bone bg-bone/30 p-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.marketingConsent}
                  onChange={(e) => update("marketingConsent")(e.target.checked as any)}
                  className="mt-1 h-4 w-4 shrink-0 accent-deep-violet"
                />
                <div className="flex flex-col">
                  <span className="text-[14px] font-medium text-ink-black">[선택] 마케팅 정보 수신 동의</span>
                  <span className="mt-0.5 text-[13px] text-slate-gray">추후 추가 모집 공고 발생시 우선 안내해 드립니다.</span>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {submitError && (
        <div className="mt-8 flex items-center gap-3 rounded-[12px] bg-rose-soft p-4 text-burgundy">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-[14px] font-medium">{submitError}</span>
        </div>
      )}

      <div className="mt-12 flex items-center gap-3">
        {step > 1 && (
          <Button
            variant="outline"
            size="hero"
            className="w-16 shrink-0 px-0"
            onClick={() => {
              if (typeof step === "number") {
                setStep((step - 1) as 1 | 2 | 3);
                window.scrollTo(0, 0);
              }
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        )}
        
        {step < 3 ? (
          <Button
            size="hero"
            className="flex-1"
            onClick={nextStep}
            disabled={form.selfOwnership === "문제 있음 (지원불가)"}
          >
            다음 <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        ) : (
          <Button
            size="hero"
            className="flex-1 bg-ink-black hover:bg-graphite"
            loading={submitting}
            onClick={handleSubmit}
          >
            제출하기
          </Button>
        )}
      </div>
    </div>
  );
}
