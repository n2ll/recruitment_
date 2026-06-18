"use client";

import { useState } from "react";
import {
  type Applicant,
  type SlotKey,
  SLOTS,
  ACTIVE_STATUSES,
  STATUS_COLORS,
  matchesSlot,
} from "@/lib/admin/types";
import { EmptyState } from "@/components/ui/states";

interface HopeSlotsViewProps {
  data: Applicant[];
  branchNames: string[];
  onSelectApplicant: (id: number) => void;
}

export function HopeSlotsView({ data, branchNames, onSelectApplicant }: HopeSlotsViewProps) {
  const [slotCell, setSlotCell] = useState<{ branch: string; slot: SlotKey } | null>(null);

  return (
    <div className="content">
      <h2 className="page-title">희망 슬롯 분포</h2>
      <p className="page-desc">
        지원자가 <strong>희망한</strong> 시간대·지점 기준 풀 분포입니다. 셀을 클릭하면 해당 조건의
        지원자 목록이 표시됩니다. (활성 상태만 집계 — 부적합 제외)
      </p>

      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>지점 \ 슬롯</th>
              {SLOTS.map((s) => (
                <th key={s}>{s}</th>
              ))}
              <th>지점 합계</th>
            </tr>
          </thead>
          <tbody>
            {branchNames.map((b) => {
              const rowTotal = data.filter(
                (a) => ACTIVE_STATUSES.includes(a.status) && (a.branch1 === b || a.branch2 === b)
              ).length;
              return (
                <tr key={b}>
                  <td className="td-bold">{b}</td>
                  {SLOTS.map((s) => {
                    const n = data.filter(
                      (a) =>
                        ACTIVE_STATUSES.includes(a.status) &&
                        (a.branch1 === b || a.branch2 === b) &&
                        matchesSlot(a.work_hours, s)
                    ).length;
                    const active = slotCell?.branch === b && slotCell?.slot === s;
                    return (
                      <td
                        key={s}
                        className={`matrix-cell ${
                          n === 0 ? "cell-zero" : n >= 3 ? "cell-hot" : "cell-some"
                        } ${active ? "cell-active" : ""}`}
                        onClick={() => setSlotCell(active ? null : { branch: b, slot: s })}
                      >
                        {n}
                      </td>
                    );
                  })}
                  <td className="td-total">{rowTotal}</td>
                </tr>
              );
            })}
            <tr className="matrix-total-row">
              <td className="td-bold">슬롯 합계</td>
              {SLOTS.map((s) => (
                <td key={s} className="td-total">
                  {data.filter(
                    (a) => ACTIVE_STATUSES.includes(a.status) && matchesSlot(a.work_hours, s)
                  ).length}
                </td>
              ))}
              <td className="td-total">
                {data.filter((a) => ACTIVE_STATUSES.includes(a.status)).length}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {slotCell &&
        (() => {
          const list = data.filter(
            (a) =>
              ACTIVE_STATUSES.includes(a.status) &&
              (a.branch1 === slotCell.branch || a.branch2 === slotCell.branch) &&
              matchesSlot(a.work_hours, slotCell.slot)
          );
          return (
            <div className="slot-drill">
              <div className="slot-drill-header">
                <h3>
                  {slotCell.branch} · {slotCell.slot} · {list.length}명
                </h3>
                <button className="close-btn" onClick={() => setSlotCell(null)}>
                  X
                </button>
              </div>
              {list.length === 0 ? (
                <EmptyState title="해당 조건의 지원자가 없어요" hint="다른 지점·시간대 셀을 눌러보세요." />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>성함</th>
                        <th>연락처</th>
                        <th>희망지점</th>
                        <th>상태</th>
                        <th>시작가능일</th>
                        <th>희망시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((a) => (
                        <tr key={a.id} className="clickable" onClick={() => onSelectApplicant(a.id)}>
                          <td className="td-bold">{a.name}</td>
                          <td>{a.phone}</td>
                          <td>
                            {a.branch1}
                            {a.branch2 ? ` / ${a.branch2}` : ""}
                          </td>
                          <td>
                            <span
                              className="status-badge"
                              style={{ background: STATUS_COLORS[a.status] || "#6b7280" }}
                            >
                              {a.status}
                            </span>
                          </td>
                          <td>{a.available_date}</td>
                          <td className="td-slim">{a.work_hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}
