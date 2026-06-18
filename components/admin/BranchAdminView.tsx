"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  type Applicant,
  type Branch,
  SLOTS,
  DEFAULT_SLOT_CAPACITY,
  getSlotCapacity,
} from "@/lib/admin/types";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { LoadingState } from "@/components/ui/states";

interface BranchAdminViewProps {
  branches: Branch[];
  branchesLoading: boolean;
  data: Applicant[];
  onBranchesChanged: () => Promise<void>;
}

export function BranchAdminView({
  branches,
  branchesLoading,
  data,
  onBranchesChanged,
}: BranchAdminViewProps) {
  const confirm = useConfirm();
  const toast = useToast();

  const [newBranchName, setNewBranchName] = useState("");
  const [branchSaving, setBranchSaving] = useState(false);
  const [localBranches, setLocalBranches] = useState<Branch[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  // 지점관리 행에서 AI 참고 정보(ai_facts) 입력 영역 펼침 (한 번에 하나만)
  const [expandedAiFactsId, setExpandedAiFactsId] = useState<number | null>(null);
  const userEditedRef = useRef(false);

  // 사용자가 편집 중이면 서버 동기화로 덮어쓰지 않음
  useEffect(() => {
    if (!userEditedRef.current) {
      const sorted = [...branches].sort((a, b) => a.sort_order - b.sort_order);
      setLocalBranches(sorted);
    }
  }, [branches]);

  // 변경 여부 계산 (UI 표시용)
  const branchesDirty = (() => {
    if (localBranches.length !== branches.length) return false; // 길이 다르면 아직 sync 안 된 것
    const serverOrdered = [...branches].sort((a, b) => a.sort_order - b.sort_order);
    for (let i = 0; i < localBranches.length; i++) {
      const lb = localBranches[i];
      const sb = serverOrdered[i];
      if (!sb) return true;
      if (lb.id !== sb.id) return true;
      if (lb.name !== sb.name || lb.active !== sb.active) return true;
      if ((lb.ai_facts ?? "") !== (sb.ai_facts ?? "")) return true;
      for (const k of SLOTS) {
        if (getSlotCapacity(lb, k) !== getSlotCapacity(sb, k)) return true;
      }
    }
    return false;
  })();

  const markEdited = () => {
    userEditedRef.current = true;
  };

  const updateLocalBranch = (id: number, updates: Partial<Branch>) => {
    markEdited();
    setLocalBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const handleDragStart = (id: number) => setDragId(id);
  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  };
  const handleDrop = (targetId: number) => {
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    markEdited();
    setLocalBranches((prev) => {
      const fromIdx = prev.findIndex((b) => b.id === dragId);
      const toIdx = prev.findIndex((b) => b.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDragId(null);
    setDragOverId(null);
  };

  const resetBranchChanges = () => {
    userEditedRef.current = false;
    const sorted = [...branches].sort((a, b) => a.sort_order - b.sort_order);
    setLocalBranches(sorted);
  };

  const saveBranchChanges = async () => {
    const byId = new Map(branches.map((b) => [b.id, b]));
    const ops: Array<Promise<{ ok: boolean; id: number; error?: string }>> = [];

    for (let idx = 0; idx < localBranches.length; idx++) {
      const lb = localBranches[idx];
      const sb = byId.get(lb.id);
      if (!sb) continue;
      const newSortOrder = (idx + 1) * 10;
      const updates: Partial<Branch> = {};
      if (lb.name !== sb.name) updates.name = lb.name;
      if (lb.active !== sb.active) updates.active = lb.active;
      if ((lb.ai_facts ?? "") !== (sb.ai_facts ?? "")) updates.ai_facts = lb.ai_facts ?? null;
      if (newSortOrder !== sb.sort_order) updates.sort_order = newSortOrder;
      const capDiff = SLOTS.some((k) => getSlotCapacity(lb, k) !== getSlotCapacity(sb, k));
      if (capDiff) {
        const cap: Record<string, number> = {};
        for (const k of SLOTS) cap[k] = getSlotCapacity(lb, k);
        updates.slot_capacity = cap;
      }
      if (Object.keys(updates).length === 0) continue;

      // 이름 변경 시 사용 중이면 사전 확인
      if (updates.name) {
        const usage = data.filter(
          (a) =>
            a.branch === sb.name ||
            a.branch1 === sb.name ||
            a.branch2 === sb.name ||
            a.confirmed_branch === sb.name ||
            a.current_branch === sb.name
        ).length;
        if (usage > 0) {
          const ok = await confirm({
            title: `'${sb.name}' → '${updates.name}' 로 이름을 바꿀까요?`,
            description: `이 지점은 지원자 ${usage}명이 참조 중이며, 기존 데이터의 지점 이름은 자동으로 바뀌지 않아요.`,
            confirmText: "이름 변경",
          });
          if (!ok) {
            // 이 한 건만 롤백
            updateLocalBranch(lb.id, { name: sb.name });
            continue;
          }
        }
      }

      ops.push(
        fetch(`/api/admin/branches/${lb.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updates),
        }).then(async (res) => {
          const json = await res.json();
          return { ok: res.ok, id: lb.id, error: json.error };
        })
      );
    }

    if (ops.length === 0) return;
    setBranchSaving(true);
    try {
      const results = await Promise.all(ops);
      const fails = results.filter((r) => !r.ok);
      if (fails.length > 0) {
        toast({
          title: `${fails.length}건 저장에 실패했어요`,
          description: fails[0].error || "잠시 후 다시 시도해주세요",
          tone: "error",
        });
      } else {
        toast({ title: "지점 변경사항을 저장했어요", tone: "success" });
      }
      userEditedRef.current = false;
      await onBranchesChanged();
    } catch (e) {
      console.error(e);
      toast({ title: "저장 중 오류가 발생했어요", tone: "error" });
    } finally {
      setBranchSaving(false);
    }
  };

  const addBranch = async () => {
    const name = newBranchName.trim();
    if (!name) {
      toast({ title: "지점 이름을 입력해주세요", tone: "info" });
      return;
    }
    setBranchSaving(true);
    try {
      const res = await fetch("/api/admin/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json.error || "지점 추가에 실패했어요", tone: "error" });
        return;
      }
      setNewBranchName("");
      userEditedRef.current = false;
      await onBranchesChanged();
    } catch (e) {
      console.error(e);
      toast({ title: "지점 추가 중 오류가 발생했어요", tone: "error" });
    } finally {
      setBranchSaving(false);
    }
  };

  const deleteBranch = async (id: number, name: string) => {
    const ok = await confirm({
      title: `'${name}' 지점을 삭제할까요?`,
      description: "해당 지점에 지원자가 있으면 비활성화 처리돼요.",
      confirmText: "삭제",
      destructive: true,
    });
    if (!ok) return;
    setBranchSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: json.error || "삭제에 실패했어요", tone: "error" });
        return;
      }
      if (json.soft) {
        toast({
          title: json.message || "지원자가 있어 비활성화 처리했어요",
          tone: "info",
        });
      }
      userEditedRef.current = false;
      await onBranchesChanged();
    } catch (e) {
      console.error(e);
      toast({ title: "삭제 중 오류가 발생했어요", tone: "error" });
    } finally {
      setBranchSaving(false);
    }
  };

  return (
    <div className="content">
      <h2 className="page-title">
        지점 관리 <span className="count">{localBranches.filter((b) => b.active).length}개 활성</span>
      </h2>
      <p className="page-desc">
        /apply 페이지의 지점 드롭다운과 /admin의 모든 지점 필터·통계가 이 목록을 사용합니다. 행을
        드래그해서 순서를 바꾸고, 변경사항은 [저장] 버튼을 눌러야 반영됩니다.
      </p>

      <div className="branch-add-row">
        <input
          className="filter-input"
          placeholder="새 지점 이름 (예: 송파잠실)"
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addBranch();
          }}
        />
        <button className="rec-btn-secondary" onClick={addBranch} disabled={branchSaving}>
          + 지점 추가
        </button>
      </div>

      <div className="branch-save-bar">
        {branchesDirty ? (
          <span className="branch-dirty-msg">저장되지 않은 변경사항이 있습니다.</span>
        ) : (
          <span className="branch-clean-msg">변경사항 없음</span>
        )}
        <div className="branch-save-actions">
          <button
            className="rec-btn-secondary"
            onClick={resetBranchChanges}
            disabled={!branchesDirty || branchSaving}
          >
            취소
          </button>
          <button
            className="rec-btn-primary"
            onClick={saveBranchChanges}
            disabled={!branchesDirty || branchSaving}
            style={{ marginTop: 0 }}
          >
            {branchSaving ? "저장 중..." : "변경사항 저장"}
          </button>
        </div>
      </div>

      {branchesLoading ? (
        <LoadingState label="지점 목록 불러오는 중…" />
      ) : (
        <div className="table-wrap">
          <table className="table branch-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>지점명</th>
                <th style={{ width: 90 }}>활성</th>
                <th style={{ width: 130 }}>상태</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {localBranches.map((b) => {
                const usageCount = data.filter(
                  (a) =>
                    a.branch === b.name ||
                    a.branch1 === b.name ||
                    a.branch2 === b.name ||
                    a.confirmed_branch === b.name ||
                    a.current_branch === b.name
                ).length;
                const isDragging = dragId === b.id;
                const isDragOver = dragOverId === b.id && dragId !== b.id;
                return (
                  <Fragment key={b.id}>
                    <tr
                      draggable
                      onDragStart={() => handleDragStart(b.id)}
                      onDragOver={(e) => handleDragOver(e, b.id)}
                      onDragLeave={() => setDragOverId(null)}
                      onDrop={() => handleDrop(b.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      className={`branch-row ${isDragging ? "drag-ghost" : ""} ${
                        isDragOver ? "drag-over" : ""
                      }`}
                      style={{ opacity: isDragging ? 0.4 : b.active ? 1 : 0.55 }}
                    >
                      <td className="branch-drag-handle" title="드래그해서 순서 변경">
                        ⋮⋮
                      </td>
                      <td>
                        <input
                          type="text"
                          className="branch-name-input"
                          value={b.name}
                          disabled={branchSaving}
                          onChange={(e) => updateLocalBranch(b.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={b.active}
                            disabled={branchSaving}
                            onChange={(e) => updateLocalBranch(b.id, { active: e.target.checked })}
                          />
                          <span className="toggle-slider" />
                        </label>
                      </td>
                      <td className="td-meta">
                        {usageCount > 0 ? `지원자 ${usageCount}명` : "사용 0"}
                      </td>
                      <td className="branch-row-actions">
                        <button
                          className={`branch-ai-btn ${
                            (b.ai_facts ?? "").trim() ? "branch-ai-btn-filled" : ""
                          }`}
                          disabled={branchSaving}
                          title={
                            (b.ai_facts ?? "").trim()
                              ? "AI 참고 정보 있음 — 편집"
                              : "AI 참고 정보 추가"
                          }
                          onClick={() =>
                            setExpandedAiFactsId(expandedAiFactsId === b.id ? null : b.id)
                          }
                        >
                          🤖 AI
                        </button>
                        <button
                          className="rec-btn-secondary"
                          disabled={branchSaving}
                          onClick={() => deleteBranch(b.id, b.name)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                    {expandedAiFactsId === b.id && (
                      <tr className="branch-ai-row">
                        <td colSpan={5}>
                          <div className="branch-ai-wrap">
                            <div className="branch-ai-label">
                              🤖 <b>{b.name}</b> 지점 AI 참고 정보 (응대 시 이 지점 지원자에게만
                              주입됨)
                            </div>
                            <textarea
                              className="branch-ai-textarea"
                              rows={6}
                              placeholder={`예) 시급: 18,000~20,000원\n근무시간: 평일 08~16시\n위치: 서울 강북구 ...\n픽업: 강북미아 비마트 1층`}
                              value={b.ai_facts ?? ""}
                              disabled={branchSaving}
                              onChange={(e) => updateLocalBranch(b.id, { ai_facts: e.target.value })}
                            />
                            <div className="branch-ai-hint">
                              공통 정보(전 지점)는 [🧠 클로드 조련하기 → 운영 정보]에서 관리. 위 입력은
                              공통과 다른 내용이 있으면 <b>이 지점이 우선</b>됩니다.
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 슬롯 정원 매트릭스 */}
      {!branchesLoading && localBranches.length > 0 && (
        <div className="slot-capacity-card">
          <h3 className="slot-capacity-title">슬롯 정원 매트릭스</h3>
          <p className="page-desc" style={{ marginTop: 0 }}>
            지점별 슬롯 정원을 직접 편집합니다. 확정 슬롯 매트릭스와 추천·확정 로직이 이 값을 기준으로
            동작합니다.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>지점</th>
                  {SLOTS.map((s) => (
                    <th key={s} style={{ textAlign: "center", width: 100 }}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {localBranches
                  .filter((b) => b.active)
                  .map((b) => (
                    <tr key={b.id}>
                      <td>
                        <b>{b.name}</b>
                      </td>
                      {SLOTS.map((s) => (
                        <td key={s} style={{ textAlign: "center" }}>
                          <input
                            type="number"
                            className="slot-cap-input"
                            min={0}
                            max={99}
                            value={getSlotCapacity(b, s)}
                            disabled={branchSaving}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              // leading-zero('05') 케이스에서도 5가 들어가도록 parseInt 사용 후 clamp.
                              const raw = e.target.value;
                              const parsed = raw === "" ? 0 : parseInt(raw, 10);
                              const n = Math.max(
                                0,
                                Math.min(99, Number.isFinite(parsed) ? parsed : 0)
                              );
                              const prevCap = {
                                ...DEFAULT_SLOT_CAPACITY,
                                ...(b.slot_capacity ?? {}),
                              };
                              updateLocalBranch(b.id, {
                                slot_capacity: { ...prevCap, [s]: n },
                              });
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
