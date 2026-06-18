"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Plus, Search, Car, Clock, CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import { sourceLabel } from "@/lib/applicant-source";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

export interface PipelineApplicant {
  id: number;
  name: string;
  phone: string;
  birth_date?: string | null;
  branch?: string | null;
  status: string;
  source?: string | null;
  own_vehicle?: string | null;
  work_hours?: string | null;
  available_date?: string | null;
  created_at: string;
  note?: string | null;
  unread_count?: number;
}

interface PipelineViewProps {
  applicants: PipelineApplicant[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  branchNames: string[];
  allStatuses: string[];
  branchFilter: string;
  statusFilter: string;
  search: string;
  onBranchFilter: (v: string) => void;
  onStatusFilter: (v: string) => void;
  onSearch: (v: string) => void;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onPatch: (id: number, patch: Record<string, unknown>) => Promise<boolean>;
  calcAge: (birth: string | null | undefined) => number | null;
  formatWorkHours: (wh: string | null | undefined) => string;
}

const PRIMARY_COLUMNS = ["스크리닝 전", "스크리닝 중", "스크리닝 완료", "확정인력", "대기자", "부적합"];
const EXTRA_COLUMNS = ["기타", "이탈"];
const TERMINAL_STATUSES = new Set(["부적합", "이탈"]);

const COLUMN_ACCENT: Record<string, string> = {
  "스크리닝 전": "bg-bone",
  "스크리닝 중": "bg-pale-sage",
  "스크리닝 완료": "bg-lavender-mist",
  확정인력: "bg-dusty-rose",
  대기자: "bg-honey-gold",
  부적합: "bg-burgundy",
  이탈: "bg-burgundy",
  기타: "bg-mist-gray",
};

export function PipelineView(props: PipelineViewProps) {
  const {
    applicants,
    loading,
    loadError,
    onRetry,
    branchNames,
    allStatuses,
    branchFilter,
    statusFilter,
    search,
    onBranchFilter,
    onStatusFilter,
    onSearch,
    onSelect,
    onAdd,
    onPatch,
    calcAge,
    formatWorkHours,
  } = props;

  const confirm = useConfirm();
  const toast = useToast();

  const byStatus = React.useMemo(() => {
    const map = new Map<string, PipelineApplicant[]>();
    for (const a of applicants) {
      const k = a.status || "기타";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return map;
  }, [applicants]);

  const columns = React.useMemo(() => {
    const extra = EXTRA_COLUMNS.filter((s) => (byStatus.get(s)?.length ?? 0) > 0);
    return [...PRIMARY_COLUMNS, ...extra];
  }, [byStatus]);

  const handleStatusChange = async (a: PipelineApplicant, next: string) => {
    if (next === a.status) return;
    if (TERMINAL_STATUSES.has(next)) {
      const ok = await confirm({
        title: `${a.name} 님을 '${next}' 처리할까요?`,
        description: "종료성 상태예요. 파이프라인에서 빠지고, 매니저 확정 상태로 분류돼요.",
        confirmText: `${next}로 변경`,
        destructive: true,
      });
      if (!ok) return;
    }
    const success = await onPatch(a.id, { status: next });
    if (!success) toast({ title: "상태 변경에 실패했어요", tone: "error" });
  };

  const handleBranchChange = async (a: PipelineApplicant, branch: string) => {
    const success = await onPatch(a.id, { branch: branch || null });
    if (!success) toast({ title: "지점 변경에 실패했어요", tone: "error" });
  };

  return (
    <div className="flex flex-col">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ob-eyebrow">인재풀</p>
          <h2 className="ob-headline mt-0.5 text-[26px] text-ink-black">
            지원자 파이프라인
            <span className="ml-2 text-[15px] font-normal text-mist-gray">
              {applicants.length}명
            </span>
          </h2>
        </div>
        <Button onClick={onAdd} size="sm">
          <Plus className="h-4 w-4" />
          지원자 추가
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={branchFilter}
          onChange={(e) => onBranchFilter(e.target.value)}
          className="h-9 rounded-[8px] border border-stone-border/30 bg-paper-white px-3 text-[13px] text-ink-black outline-none focus-visible:border-deep-violet"
        >
          {["전체", ...branchNames].map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value)}
          className="h-9 rounded-[8px] border border-stone-border/30 bg-paper-white px-3 text-[13px] text-ink-black outline-none focus-visible:border-deep-violet"
        >
          {["전체", ...allStatuses].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist-gray" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="이름 또는 전화번호 검색"
            className="h-9 w-64 rounded-[8px] border border-stone-border/30 bg-paper-white pl-9 pr-3 text-[13px] text-ink-black placeholder:text-mist-gray outline-none focus-visible:border-deep-violet"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState label="지원자 목록 불러오는 중…" />
      ) : loadError && applicants.length === 0 ? (
        <ErrorState
          title="지원자 목록을 불러오지 못했어요"
          hint="네트워크 또는 서버 문제일 수 있어요."
          onRetry={onRetry}
        />
      ) : applicants.length === 0 ? (
        <EmptyState
          title="조건에 맞는 지원자가 없어요"
          hint="필터를 바꾸거나 새 지원자를 추가해 보세요."
        />
      ) : (
        <div className="ob-scroll -mx-1 flex flex-1 gap-3 overflow-x-auto px-1 pb-2">
          {columns.map((status, colIdx) => {
            const items = byStatus.get(status) ?? [];
            return (
              <motion.section
                key={status}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(colIdx * 0.05, 0.3), ease: "easeOut" }}
                className="flex w-[280px] shrink-0 flex-col rounded-list border border-bone bg-bone/20"
              >
                <header className="flex items-center justify-between gap-2 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", COLUMN_ACCENT[status])} />
                    <span className="text-[13px] font-medium text-ink-black">{status}</span>
                  </div>
                  <span className="rounded-pill bg-paper-white px-2 py-0.5 text-[12px] font-medium text-slate-gray">
                    {items.length}
                  </span>
                </header>
                <div className="ob-scroll flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-y-auto px-2 pb-3">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[12px] text-mist-gray">비어 있어요</p>
                  ) : (
                    items.map((a, i) => (
                      <motion.div
                        key={a.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -2 }}
                        transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.2) }}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(a.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelect(a.id);
                          }
                        }}
                        className="group flex cursor-pointer flex-col gap-2 rounded-card border border-bone bg-paper-white p-3 text-left transition-colors hover:border-deep-violet/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deep-violet/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[14px] font-medium text-ink-black">
                                {a.name}
                              </span>
                              {a.note === "중복지원" ? (
                                <Badge tone="gold" className="px-1.5 py-0">중복</Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[12px] text-mist-gray">
                              {calcAge(a.birth_date) ?? "—"}세 · {sourceLabel(a.source)}
                            </p>
                          </div>
                          {a.unread_count && a.unread_count > 0 ? (
                            <span className="shrink-0 rounded-pill bg-burgundy px-1.5 text-[11px] font-semibold text-paper-white">
                              {a.unread_count}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-gray">
                          <span className="inline-flex items-center gap-1">
                            <Car className="h-3 w-3 text-mist-gray" />
                            {a.own_vehicle || "—"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 text-mist-gray" />
                            {formatWorkHours(a.work_hours) || "—"}
                          </span>
                          {a.available_date ? (
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="h-3 w-3 text-mist-gray" />
                              {a.available_date}
                            </span>
                          ) : null}
                        </div>

                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={a.branch ?? ""}
                            onChange={(e) => handleBranchChange(a, e.target.value)}
                            className="h-7 min-w-0 flex-1 rounded-[6px] border border-bone bg-paper-white px-1.5 text-[12px] text-ink-black outline-none focus-visible:border-deep-violet"
                          >
                            <option value="">지점 미정</option>
                            {branchNames.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                          <select
                            value={a.status}
                            onChange={(e) => handleStatusChange(a, e.target.value)}
                            className="h-7 rounded-[6px] border border-bone bg-paper-white px-1.5 text-[12px] font-medium text-ink-black outline-none focus-visible:border-deep-violet"
                          >
                            {allStatuses.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}
    </div>
  );
}
