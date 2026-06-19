"use client";

import { useState } from "react";
import {
  type Applicant,
  type Branch,
  type SlotKey,
  SLOTS,
  getSlotCapacity,
  matchesSlot,
  effectiveSlot,
  calcAge,
} from "@/lib/admin/types";
import { EmptyState } from "@/components/ui/states";
import { ChevronUp, ChevronDown, Pencil } from "lucide-react";

interface ConfirmedSlotsViewProps {
  data: Applicant[];
  branches: Branch[];
  onPatch: (id: number, updates: Partial<Applicant>) => Promise<boolean>;
  onOpenDetail: (id: number) => void;
}

const SLOT_CHIP_CLASS: Record<string, string> = {
  평일오전: "chip-wd-am",
  평일오후: "chip-wd-pm",
  주말오전: "chip-we-am",
  주말오후: "chip-we-pm",
};

export function ConfirmedSlotsView({ data, branches, onPatch, onOpenDetail }: ConfirmedSlotsViewProps) {
  const [branchDetail, setBranchDetail] = useState<string | null>(null);
  const [ppcSlotFilter, setPpcSlotFilter] = useState<Set<SlotKey>>(new Set());

  return (
    <div className="content">
      {!branchDetail && (
        <>
          <p className="ob-eyebrow">슬롯 운영</p>
          <h2 className="ob-headline mt-0.5 text-[26px] text-ink-black">확정 슬롯 현황</h2>
          <p className="page-desc">
            지점별 슬롯 충족 현황입니다. 슬롯별 정원은 [지점 관리] 탭에서 편집할 수 있습니다.
            <strong>지점 행을 클릭하면 해당 지점 상세 페이지(풀스크린)</strong>가 열립니다.
          </p>

          <div className="matrix-legend">
            <span className="lg-dot lg-full" /> 정원 충족
            <span className="lg-dot lg-half" /> 정원 미달 (1명 이상)
            <span className="lg-dot lg-zero" /> 빈 슬롯
          </div>

          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th>지점 \ 슬롯</th>
                  {SLOTS.map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => {
                  const b = branch.name;
                  return (
                    <tr
                      key={b}
                      className="branch-row clickable"
                      onClick={() => setBranchDetail(b)}
                      title="클릭하면 이 지점 상세 페이지로 이동합니다"
                    >
                      <td className="td-bold branch-name-cell">{b}</td>
                      {SLOTS.map((s) => {
                        const capacity = getSlotCapacity(branch, s);
                        // 확정인력/대기자의 슬롯 = effectiveSlot (confirmed_slot 있으면 그것, 없으면 work_hours).
                        // 매니저가 confirmed_branch를 안 채웠을 때는 branch1로 fallback.
                        const confirmed = data.filter(
                          (a) =>
                            a.status === "확정인력" &&
                            matchesSlot(effectiveSlot(a), s) &&
                            (a.confirmed_branch ?? a.branch1) === b
                        ).length;
                        const waiting = data.filter(
                          (a) =>
                            a.status === "대기자" &&
                            matchesSlot(effectiveSlot(a), s) &&
                            (a.confirmed_branch ?? a.branch1) === b
                        ).length;
                        // 시각적 신호: 정원 0(미운영)은 중립 회색, 0/N=빨강, 1~N미만=노랑, N이상=초록.
                        const cellClass =
                          capacity === 0
                            ? "cell-disabled"
                            : confirmed >= capacity
                            ? "cell-full"
                            : confirmed === 0
                            ? "cell-empty"
                            : "cell-partial";
                        return (
                          <td key={s} className={`matrix-cell ${cellClass}`}>
                            <div className="conf-main">
                              {confirmed}
                              <span className="conf-cap">/{capacity}</span>
                            </div>
                            {waiting > 0 && <div className="conf-sub">대기 {waiting}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* PPC 상세 풀스크린 — 매트릭스 자리에 통째로 표시 */}
      {branchDetail &&
        (() => {
          const branchObj = branches.find((br) => br.name === branchDetail);
          const morningCap = branchObj ? getSlotCapacity(branchObj, "평일오전") : 0;
          const afternoonCap = branchObj ? getSlotCapacity(branchObj, "평일오후") : 0;
          // confirmed_branch가 없으면 branch1(지원 시 1지망)로 fallback. 매니저가
          // 지원자 목록에서 status만 확정/대기로 바꾸고 지점을 안 채워도 PPC에서 보이게.
          const inBranch = data.filter((a) => (a.confirmed_branch ?? a.branch1) === branchDetail);
          // 슬롯 필터 — effectiveSlot 기준 (confirmed_slot이 있으면 그것, 없으면 work_hours).
          const applyFilter = (list: Applicant[]) => {
            if (ppcSlotFilter.size === 0) return list;
            return list.filter((a) =>
              SLOTS.some((s) => ppcSlotFilter.has(s) && matchesSlot(effectiveSlot(a), s))
            );
          };
          // 매니저가 ↑↓로 조정한 sort_order 기준 정렬. sort_order가 null인 row는 id로 폴백.
          const bySort = (a: Applicant, b: Applicant) =>
            (a.sort_order ?? a.id) - (b.sort_order ?? b.id);
          const confirmed = applyFilter(inBranch.filter((a) => a.status === "확정인력")).sort(bySort);
          const waiting = applyFilter(inBranch.filter((a) => a.status === "대기자")).sort(bySort);
          const totalConfirmed = inBranch.filter((a) => a.status === "확정인력").length;
          const totalWaiting = inBranch.filter((a) => a.status === "대기자").length;
          const filterOn = ppcSlotFilter.size > 0;

          // 인접 row와 sort_order 교환 — 같은 그룹(확정인력 또는 대기자) 안에서만 사용.
          const swapOrder = async (list: Applicant[], idx: number, dir: -1 | 1) => {
            const j = idx + dir;
            if (j < 0 || j >= list.length) return;
            const a = list[idx];
            const b = list[j];
            const av = a.sort_order ?? a.id;
            const bv = b.sort_order ?? b.id;
            // 동일 값(둘 다 id로 폴백된 경우)이면 살짝 다르게 만든다 — av를 bv보다 작게/크게
            const [newA, newB] =
              av === bv ? (dir === -1 ? [bv - 1, bv] : [bv, bv + 1]) : [bv, av];
            await Promise.all([
              onPatch(a.id, { sort_order: newA }),
              onPatch(b.id, { sort_order: newB }),
            ]);
          };

          // work_hours(verbose 또는 축약)에서 활성 슬롯 키를 뽑아 chip으로 표시
          const SlotChips = ({ workHours }: { workHours: string | null }) => {
            const active = SLOTS.filter((s) => matchesSlot(workHours, s));
            if (!active.length) return <span className="td-muted">—</span>;
            return (
              <div className="slot-chips">
                {active.map((s) => (
                  <span key={s} className={`slot-chip ${SLOT_CHIP_CLASS[s] || ""}`}>
                    {s}
                  </span>
                ))}
              </div>
            );
          };

          const PpcRow = (a: Applicant, idx: number, list: Applicant[]) => (
            <tr key={a.id}>
              <td className="td-bold">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span className="ppc-order-buttons">
                    <button
                      className="ppc-order-btn"
                      title="위로"
                      disabled={idx === 0}
                      onClick={() => swapOrder(list, idx, -1)}
                    >
                      <ChevronUp size={10} strokeWidth={2.5} />
                    </button>
                    <button
                      className="ppc-order-btn"
                      title="아래로"
                      disabled={idx === list.length - 1}
                      onClick={() => swapOrder(list, idx, 1)}
                    >
                      <ChevronDown size={10} strokeWidth={2.5} />
                    </button>
                  </span>
                  {a.name}
                  <button
                    className="ppc-edit-btn"
                    title="지원자 상세 편집"
                    style={{ display: "inline-flex", alignItems: "center" }}
                    onClick={() => onOpenDetail(a.id)}
                  >
                    <Pencil size={11} strokeWidth={2} />
                  </button>
                </span>
              </td>
              <td>{calcAge(a.birth_date) ?? "—"}</td>
              <td>{a.phone}</td>
              <td>{a.bname || a.sigungu || "—"}</td>
              <td>
                <SlotChips workHours={effectiveSlot(a)} />
              </td>
              <td>
                <input
                  type="text"
                  className="inline-memo"
                  defaultValue={a.baemin_id ?? ""}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (a.baemin_id ?? "")) onPatch(a.id, { baemin_id: next || null });
                  }}
                />
              </td>
              <td style={{ textAlign: "center" }}>
                <input
                  type="checkbox"
                  className="ppc-check"
                  checked={!!a.kakao_channel_friend}
                  onChange={(e) => onPatch(a.id, { kakao_channel_friend: e.target.checked })}
                />
              </td>
              <td style={{ textAlign: "center" }}>
                <input
                  type="checkbox"
                  className="ppc-check"
                  checked={!!a.guide_sent}
                  onChange={(e) => onPatch(a.id, { guide_sent: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="inline-memo"
                  defaultValue={a.onboarding_call_status ?? ""}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (a.onboarding_call_status ?? "")) {
                      onPatch(a.id, { onboarding_call_status: next || null });
                    }
                  }}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="inline-memo"
                  defaultValue={a.memo ?? ""}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (a.memo ?? "")) onPatch(a.id, { memo: next || null });
                  }}
                />
              </td>
            </tr>
          );

          const PpcHeader = (
            <tr>
              <th>성함</th>
              <th style={{ width: 50 }}>나이</th>
              <th>휴대폰</th>
              <th>거주지</th>
              <th style={{ minWidth: 160 }}>타임</th>
              <th style={{ width: 140 }}>아이디</th>
              <th style={{ width: 70 }}>채널추가</th>
              <th style={{ width: 70 }}>가이드</th>
              <th style={{ width: 140 }}>온보딩 통화</th>
              <th style={{ minWidth: 160 }}>비고</th>
            </tr>
          );

          return (
            <div className="ppc-fullscreen">
              <div className="ppc-toolbar">
                <button
                  className="ppc-back-btn"
                  onClick={() => {
                    setBranchDetail(null);
                    setPpcSlotFilter(new Set());
                  }}
                >
                  ← 매트릭스로
                </button>
                <h2 className="ppc-title">
                  {branchDetail}
                  <span className="ppc-cap">
                    정원 평일 오전 {morningCap} / 오후 {afternoonCap}
                  </span>
                </h2>
                <div className="ppc-summary">
                  확정 {totalConfirmed} · 대기 {totalWaiting}
                </div>
              </div>

              <div className="ppc-filter-bar">
                <span className="ppc-filter-label">시간대 필터:</span>
                {SLOTS.map((s) => {
                  // 필터 비어 있을 때는 모두 풀컬러(=전체). 필터 켜지면 선택된 것만 풀컬러.
                  const visual = !filterOn || ppcSlotFilter.has(s) ? "slot-chip-on" : "slot-chip-off";
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`slot-chip slot-chip-btn ${SLOT_CHIP_CLASS[s] || ""} ${visual}`}
                      onClick={() => {
                        setPpcSlotFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(s)) next.delete(s);
                          else next.add(s);
                          return next;
                        });
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
                {filterOn && (
                  <button
                    type="button"
                    className="ppc-filter-clear"
                    onClick={() => setPpcSlotFilter(new Set())}
                  >
                    필터 해제
                  </button>
                )}
              </div>

              <div className="slot-section-title">
                확정인력 ({confirmed.length}
                {filterOn && totalConfirmed !== confirmed.length && (
                  <span className="ppc-filtered-of"> / 전체 {totalConfirmed}</span>
                )}
                )
              </div>
              {confirmed.length === 0 ? (
                <EmptyState
                  title={filterOn ? "해당 시간대 확정인력이 없어요" : "아직 확정인력이 없어요"}
                  hint={
                    filterOn
                      ? "시간대 필터를 바꿔보세요."
                      : "지원자 목록에서 상태를 '확정인력'으로 바꾸고 확정 지점을 지정하면 여기 표시돼요."
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="table ppc-table">
                    <thead>{PpcHeader}</thead>
                    <tbody>{confirmed.map((a, i) => PpcRow(a, i, confirmed))}</tbody>
                  </table>
                </div>
              )}

              <div className="slot-section-title slot-section-waiting">
                대기자 ({waiting.length}
                {filterOn && totalWaiting !== waiting.length && (
                  <span className="ppc-filtered-of"> / 전체 {totalWaiting}</span>
                )}
                )
              </div>
              {waiting.length === 0 ? (
                <EmptyState
                  title={filterOn ? "해당 시간대 대기자가 없어요" : "대기자가 없어요"}
                  hint={filterOn ? "시간대 필터를 바꿔보세요." : undefined}
                />
              ) : (
                <div className="table-wrap">
                  <table className="table ppc-table">
                    <thead>{PpcHeader}</thead>
                    <tbody>{waiting.map((a, i) => PpcRow(a, i, waiting))}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}
