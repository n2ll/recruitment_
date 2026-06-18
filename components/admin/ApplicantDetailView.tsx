"use client";

/**
 * 인재풀 → 지원자 상세(풀스크린) 뷰.
 *
 * page.tsx에서 분리. 섹션별 명시적 편집(임시 버퍼 → [저장])을 컴포넌트가 자체 소유한다.
 * 다른 지원자로 전환 시 부모가 key={applicant.id}로 remount → 편집 버퍼 자동 초기화.
 */

import { useState } from "react";
import { sourceLabel } from "@/lib/applicant-source";
import {
  type Applicant,
  ALL_STATUSES,
  STATUS_COLORS,
  SLOTS,
  calcAge,
  matchesSlot,
} from "@/lib/admin/types";

interface ApplicantDetailViewProps {
  applicant: Applicant;
  branches: string[];
  onClose: () => void;
  onPatch: (id: number, patch: Partial<Applicant>) => Promise<boolean>;
}

const SECTION_FIELDS: Record<string, (keyof Applicant)[]> = {
  personal: ["name", "birth_date", "phone", "status", "source"],
  address: ["location"],
  vehicle: ["own_vehicle", "license_type", "vehicle_type", "self_ownership"],
  hope: ["branch1", "branch2", "work_hours", "available_date"],
  onboarding: ["baemin_id", "kakao_channel_friend", "guide_sent", "onboarding_call_status"],
  confirmed: ["confirmed_branch", "confirmed_slot", "current_branch", "start_date", "churn_reason"],
  memo: ["memo"],
};

export function ApplicantDetailView({
  applicant: a,
  branches,
  onClose,
  onPatch,
}: ApplicantDetailViewProps) {
  const [editDraft, setEditDraft] = useState<Partial<Applicant>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);

  const draftVal = <K extends keyof Applicant>(key: K): Applicant[K] =>
    (key in editDraft ? editDraft[key] : a[key]) as Applicant[K];
  const setDraft = <K extends keyof Applicant>(key: K, value: Applicant[K]) =>
    setEditDraft((prev) => ({ ...prev, [key]: value }));
  const hasChanges = Object.keys(editDraft).length > 0;

  const isEditing = (section: string) => editingSection === section;

  const saveSection = async (section: string) => {
    const fields = SECTION_FIELDS[section] ?? [];
    const patch: Partial<Applicant> = {};
    for (const k of fields) {
      if (k in editDraft) (patch as Record<string, unknown>)[k] = editDraft[k];
    }
    if (Object.keys(patch).length > 0) {
      setSavingEdit(true);
      const ok = await onPatch(a.id, patch);
      setSavingEdit(false);
      if (!ok) return;
      setEditDraft((prev) => {
        const next = { ...prev };
        for (const k of fields) delete next[k];
        return next;
      });
    }
    setEditingSection(null);
  };

  const cancelSection = (section: string) => {
    setEditDraft((prev) => {
      const next = { ...prev };
      for (const k of SECTION_FIELDS[section] ?? []) delete next[k];
      return next;
    });
    setEditingSection(null);
  };

  const SectionHeader = ({ section, title }: { section: string; title: string }) => (
    <div className="section-header-row">
      <h4 className="detail-section-title section-title-inline">{title}</h4>
      {isEditing(section) ? (
        <div className="section-edit-actions">
          <button className="cancel-btn cancel-btn-sm" onClick={() => cancelSection(section)} disabled={savingEdit}>
            취소
          </button>
          <button className="save-btn save-btn-sm" onClick={() => saveSection(section)} disabled={savingEdit}>
            {savingEdit ? "저장 중…" : "저장"}
          </button>
        </div>
      ) : (
        <button
          className="section-edit-btn"
          onClick={() => {
            if (editingSection && editingSection !== section) cancelSection(editingSection);
            setEditingSection(section);
          }}
        >
          ✏️ 편집
        </button>
      )}
    </div>
  );

  return (
    <div className="detail-panel detail-fullscreen">
      <div className="detail-header">
        <button className="ppc-back-btn" onClick={onClose}>
          ← 목록으로
        </button>
        <h3 className="detail-title">
          {a.name} 상세 정보
          {hasChanges && <span className="dirty-tag">변경됨</span>}
        </h3>
      </div>

      {/* 👤 인적사항 */}
      <SectionHeader section="personal" title="👤 인적사항" />
      <div className="detail-grid">
        <div>
          <span className="dl">성함</span>
          {isEditing("personal") ? (
            <input className="edit-select" value={(draftVal("name") as string) || ""} onChange={(e) => setDraft("name", e.target.value)} />
          ) : (a.name)}
        </div>
        <div>
          <span className="dl">나이 (생년월일)</span>
          {isEditing("personal") ? (
            <input
              className="edit-select" maxLength={6} placeholder="YYMMDD"
              value={(draftVal("birth_date") as string) || ""}
              onChange={(e) => setDraft("birth_date", e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            />
          ) : (
            <>
              {calcAge(a.birth_date) ?? "—"}
              {a.birth_date ? ` (${a.birth_date.slice(0, 2)}/${a.birth_date.slice(2, 4)}/${a.birth_date.slice(4, 6)})` : ""}
            </>
          )}
        </div>
        <div>
          <span className="dl">전화</span>
          {isEditing("personal") ? (
            <input className="edit-select" value={(draftVal("phone") as string) || ""} onChange={(e) => setDraft("phone", e.target.value)} />
          ) : (a.phone)}
        </div>
        <div>
          <span className="dl">진행 상태</span>
          {isEditing("personal") ? (
            <select className="edit-select" value={(draftVal("status") as string) || ""} onChange={(e) => setDraft("status", e.target.value)}>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span className="status-badge" style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}>{a.status}</span>
          )}
        </div>
        <div>
          <span className="dl">지원경로</span>
          {isEditing("personal") ? (
            <select className="edit-select" value={(draftVal("source") as string) || ""} onChange={(e) => setDraft("source", e.target.value)}>
              <option value="danggeun">당근</option>
              <option value="baemin">배민</option>
              <option value="manual">수기</option>
              <option value="direct">기타</option>
            </select>
          ) : sourceLabel(a.source)}
        </div>
        <div><span className="dl">지원일</span>{new Date(a.created_at).toLocaleDateString("ko-KR")}</div>
        <div><span className="dl">AI 단계</span>{a.agent_stage ?? "—"}</div>
        <div><span className="dl">안 읽음</span>{a.unread_count || 0}</div>
      </div>

      {/* 🏠 거주지 */}
      <SectionHeader section="address" title="🏠 거주지" />
      <div className="detail-grid">
        <div className="detail-wide">
          <span className="dl">주소</span>
          {isEditing("address") ? (
            <input className="edit-select" value={(draftVal("location") as string) || ""} onChange={(e) => setDraft("location", e.target.value)} />
          ) : (a.location || "—")}
        </div>
        <div><span className="dl">동(자동)</span>{a.bname || "—"}</div>
        <div><span className="dl">시군구(자동)</span>{a.sigungu || "—"}</div>
      </div>

      {/* 🚗 차량·면허 */}
      <SectionHeader section="vehicle" title="🚗 차량·면허" />
      <div className="detail-grid">
        <div>
          <span className="dl">자차</span>
          {isEditing("vehicle") ? (
            <select className="edit-select" value={(draftVal("own_vehicle") as string) || ""} onChange={(e) => setDraft("own_vehicle", e.target.value)}>
              <option value="">—</option>
              <option value="있음">있음</option>
              <option value="없음">없음</option>
            </select>
          ) : (a.own_vehicle || "—")}
        </div>
        <div>
          <span className="dl">면허</span>
          {isEditing("vehicle") ? (
            <select className="edit-select" value={(draftVal("license_type") as string) || ""} onChange={(e) => setDraft("license_type", e.target.value)}>
              <option value="">—</option>
              <option value="1종 보통">1종 보통</option>
              <option value="2종 보통">2종 보통</option>
              <option value="1종 대형">1종 대형</option>
              <option value="없음">없음</option>
            </select>
          ) : (a.license_type || "—")}
        </div>
        <div>
          <span className="dl">차종</span>
          {isEditing("vehicle") ? (
            <input className="edit-select" value={(draftVal("vehicle_type") as string) || ""} onChange={(e) => setDraft("vehicle_type", e.target.value)} />
          ) : (a.vehicle_type || "—")}
        </div>
        <div>
          <span className="dl">본인명의</span>
          {isEditing("vehicle") ? (
            <select className="edit-select" value={(draftVal("self_ownership") as string) || ""} onChange={(e) => setDraft("self_ownership", e.target.value)}>
              <option value="">—</option>
              <option value="문제 없음">문제 없음</option>
              <option value="문제 있음">문제 있음</option>
            </select>
          ) : (a.self_ownership || "—")}
        </div>
      </div>

      {/* 📍 희망 지점·시간 */}
      <SectionHeader section="hope" title="📍 희망 지점·시간" />
      <div className="detail-grid">
        <div>
          <span className="dl">1지망</span>
          {isEditing("hope") ? (
            <select className="edit-select" value={(draftVal("branch1") as string) || ""} onChange={(e) => setDraft("branch1", e.target.value)}>
              <option value="">—</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (a.branch1 || "—")}
        </div>
        <div>
          <span className="dl">2지망</span>
          {isEditing("hope") ? (
            <select className="edit-select" value={(draftVal("branch2") as string) || ""} onChange={(e) => setDraft("branch2", e.target.value || null)}>
              <option value="">—</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (a.branch2 || "—")}
        </div>
        <div className="detail-wide">
          <span className="dl">희망시간 (복수)</span>
          {isEditing("hope") ? (
            <div className="slot-toggle-row">
              {SLOTS.map((s) => {
                const raw = (draftVal("work_hours") as string) || "";
                const set = new Set(raw.split(",").map((t) => t.trim()).filter(Boolean));
                const on = set.has(s);
                return (
                  <button
                    key={s} type="button"
                    className={`slot-toggle ${on ? "slot-toggle-on" : ""}`}
                    onClick={() => {
                      const next = new Set(set);
                      if (on) next.delete(s); else next.add(s);
                      const joined = SLOTS.filter((x) => next.has(x)).join(", ");
                      setDraft("work_hours", joined);
                    }}
                  >{s}</button>
                );
              })}
            </div>
          ) : (a.work_hours || "—")}
        </div>
        <div>
          <span className="dl">시작가능일</span>
          {isEditing("hope") ? (
            <input type="date" className="edit-select edit-date" value={(draftVal("available_date") as string) || ""} onChange={(e) => setDraft("available_date", e.target.value || null)} />
          ) : (a.available_date || "—")}
        </div>
      </div>

      {/* 📱 온보딩 진행 */}
      <SectionHeader section="onboarding" title="📱 온보딩 진행 (매니저 체크용)" />
      <div className="detail-grid">
        <div>
          <span className="dl">배민 아이디</span>
          {isEditing("onboarding") ? (
            <input className="edit-select" value={(draftVal("baemin_id") as string) || ""} onChange={(e) => setDraft("baemin_id", e.target.value || null)} />
          ) : (a.baemin_id || <span className="td-muted">미수집</span>)}
        </div>
        <div>
          <span className="dl">카톡 채널</span>
          {isEditing("onboarding") ? (
            <label className="check-label">
              <input type="checkbox" className="ppc-check" checked={!!draftVal("kakao_channel_friend")} onChange={(e) => setDraft("kakao_channel_friend", e.target.checked)} />
              친구추가됨
            </label>
          ) : (a.kakao_channel_friend ? "✓ 친구추가됨" : "—")}
        </div>
        <div>
          <span className="dl">가이드 전달</span>
          {isEditing("onboarding") ? (
            <label className="check-label">
              <input type="checkbox" className="ppc-check" checked={!!draftVal("guide_sent")} onChange={(e) => setDraft("guide_sent", e.target.checked)} />
              전달완료
            </label>
          ) : (a.guide_sent ? "✓ 전달완료" : "—")}
        </div>
        <div>
          <span className="dl">온보딩 통화</span>
          {isEditing("onboarding") ? (
            <input className="edit-select" value={(draftVal("onboarding_call_status") as string) || ""} onChange={(e) => setDraft("onboarding_call_status", e.target.value || null)} />
          ) : (a.onboarding_call_status || "—")}
        </div>
      </div>

      {/* ✓ 확정·근무 */}
      <SectionHeader section="confirmed" title="✓ 확정·근무" />
      <div className="detail-grid">
        <div>
          <span className="dl">확정지점</span>
          {isEditing("confirmed") ? (
            <select className="edit-select" value={(draftVal("confirmed_branch") as string) || ""} onChange={(e) => setDraft("confirmed_branch", e.target.value || null)}>
              <option value="">—</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (a.confirmed_branch || "—")}
        </div>
        <div className="detail-wide">
          <span className="dl">희망슬롯 (지원자 작성, 읽기 전용)</span>
          <div className="slot-chips">
            {SLOTS.filter((s) => matchesSlot(a.work_hours, s)).map((s) => (
              <span key={s} className={`slot-chip ${(
                s === "평일오전" ? "chip-wd-am" :
                s === "평일오후" ? "chip-wd-pm" :
                s === "주말오전" ? "chip-we-am" : "chip-we-pm"
              )}`}>{s}</span>
            ))}
            {!SLOTS.some((s) => matchesSlot(a.work_hours, s)) && <span className="td-muted">—</span>}
          </div>
        </div>
        <div className="detail-wide">
          <span className="dl">확정슬롯 (매니저 확정 — 미입력 시 희망슬롯 그대로)</span>
          {isEditing("confirmed") ? (() => {
            // 편집 시작 시 confirmed_slot이 비어있으면 work_hours에서 도출한 canonical 값을 prefill.
            const draftRaw = (draftVal("confirmed_slot") as string | null);
            const initial = (draftRaw != null && draftRaw !== "")
              ? draftRaw
              : SLOTS.filter((s) => matchesSlot(a.work_hours, s)).join(",");
            const set = new Set(initial.split(",").map((t) => t.trim()).filter(Boolean));
            return (
              <div className="slot-toggle-row">
                {SLOTS.map((s) => {
                  const on = set.has(s);
                  return (
                    <button
                      key={s} type="button"
                      className={`slot-toggle ${on ? "slot-toggle-on" : ""}`}
                      onClick={() => {
                        const next = new Set(set);
                        if (on) next.delete(s); else next.add(s);
                        const joined = SLOTS.filter((x) => next.has(x)).join(",");
                        setDraft("confirmed_slot", joined || null);
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
            if (!effective.length) return <span className="td-muted">—</span>;
            return (
              <>
                <div className="slot-chips">
                  {effective.map((s) => (
                    <span key={s} className={`slot-chip ${(
                      s === "평일오전" ? "chip-wd-am" :
                      s === "평일오후" ? "chip-wd-pm" :
                      s === "주말오전" ? "chip-we-am" : "chip-we-pm"
                    )}`}>{s}</span>
                  ))}
                </div>
                {usingFallback && (
                  <div className="ppc-filter-label" style={{ marginTop: 4 }}>
                    ※ 희망슬롯 그대로 사용 중 (편집 시 분리됨)
                  </div>
                )}
              </>
            );
          })()}
        </div>
        <div>
          <span className="dl">희망근무일자</span>
          {a.available_date || "—"}
        </div>
        <div>
          <span className="dl">현재 근무지점</span>
          {isEditing("confirmed") ? (
            <select className="edit-select" value={(draftVal("current_branch") as string) || ""} onChange={(e) => setDraft("current_branch", e.target.value || null)}>
              <option value="">—</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (a.current_branch || "—")}
        </div>
        <div>
          <span className="dl">시작일</span>
          {isEditing("confirmed") ? (
            <input type="date" className="edit-select edit-date" value={(draftVal("start_date") as string) || ""} onChange={(e) => setDraft("start_date", e.target.value || null)} />
          ) : (a.start_date || "—")}
        </div>
        <div><span className="dl">이탈일(자동)</span>{a.churned_at ? new Date(a.churned_at).toLocaleDateString("ko-KR") : "—"}</div>
        <div className="detail-wide">
          <span className="dl">이탈/대기 사유</span>
          {isEditing("confirmed") ? (
            <input className="edit-select" value={(draftVal("churn_reason") as string) || ""} onChange={(e) => setDraft("churn_reason", e.target.value || null)} />
          ) : (a.churn_reason || "—")}
        </div>
      </div>

      {/* 매니저 메모 — 어디서나 편집 가능. 시스템 태그(note)는 별도 컬럼. */}
      <SectionHeader section="memo" title="메모" />
      <div className="detail-grid">
        <div className="detail-wide">
          {isEditing("memo") ? (
            <textarea
              className="edit-select"
              style={{ minHeight: 80, resize: "vertical", padding: 8, lineHeight: 1.5 }}
              value={(draftVal("memo") as string) || ""}
              onChange={(e) => setDraft("memo", e.target.value || null)}
              placeholder="자유 메모 — 연락 시 참고할 사항, 특이사항 등"
            />
          ) : (
            a.memo
              ? <p className="detail-text" style={{ whiteSpace: "pre-wrap" }}>{a.memo}</p>
              : <span className="td-muted">메모 없음</span>
          )}
        </div>
      </div>

      {/* 자기소개·경력은 [+ 지원자 추가] 모달로 신규 생성 시에만 입력 (읽기 전용) */}
      {a.introduction && (
        <div className="detail-section">
          <h4 className="detail-section-title">자기소개</h4>
          <p className="detail-text">{a.introduction}</p>
        </div>
      )}
      {a.experience && (
        <div className="detail-section">
          <h4 className="detail-section-title">경력</h4>
          <p className="detail-text">{a.experience}</p>
        </div>
      )}
    </div>
  );
}
