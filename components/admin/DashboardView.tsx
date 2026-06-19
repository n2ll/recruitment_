"use client";

import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { Users, Sparkles, BadgeCheck, Hourglass } from "lucide-react";
import { EditorialCard, EditorialCardTitle, EditorialCardContent } from "@/components/ui/editorial-card";
import { DisplayHeadline } from "@/components/ui/display-headline";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/cn";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export interface DashStats {
  total: number;
  today: number;
  screeningPre: number;
  screeningInProg: number;
  screeningDone: number;
  confirmed: number;
  waiting: number;
}

export interface BranchStat {
  name: string;
  total: number;
  pre: number;
  inProg: number;
  done: number;
  confirmed: number;
  waiting: number;
}

interface DashboardViewProps {
  stats: DashStats;
  branchStats: BranchStat[];
}

function StatTile({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "sage" | "lavender" | "rose" | "amber";
  icon?: React.ReactNode;
}) {
  return (
    <motion.div variants={item} className="flex">
      <EditorialCard tone={tone} eyebrow={label} className="flex-1">
        <div className="flex items-end justify-between">
          <div className="ob-display text-[56px] leading-none text-ink-black tracking-tighter">
            <CountUp value={value} />
          </div>
          {icon && (
            <div className="mb-2 text-ink-black/40">
              {icon}
            </div>
          )}
        </div>
        {sub && <EditorialCardContent className="mt-3 text-ink-black/60">{sub}</EditorialCardContent>}
      </EditorialCard>
    </motion.div>
  );
}

const FUNNEL = [
  { key: "screeningPre", label: "스크리닝 전", bar: "bg-bone", text: "text-slate-gray" },
  { key: "screeningInProg", label: "스크리닝 중", bar: "bg-pale-sage", text: "text-ink-black" },
  { key: "screeningDone", label: "스크리닝 완료", bar: "bg-lavender-mist", text: "text-ink-black" },
  { key: "confirmed", label: "확정인력", bar: "bg-dusty-rose", text: "text-ink-black" },
] as const;

export function DashboardView({ stats, branchStats }: DashboardViewProps) {
  const funnelMax = Math.max(1, ...FUNNEL.map((f) => stats[f.key]));
  const maxBranchTotal = Math.max(1, ...branchStats.map((b) => b.total));

  return (
    <motion.div
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 py-8"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <DisplayHeadline size="lg" eyebrow="대시보드" className="max-w-2xl">
          채용 현황을 한눈에 확인하세요.
        </DisplayHeadline>
      </motion.div>

      <motion.div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" variants={container}>
        <StatTile
          label="전체 지원자"
          value={stats.total}
          sub={`오늘 +${stats.today}명 유입`}
          tone="sage"
        />
        <StatTile
          label="대기자"
          value={stats.waiting}
          sub="배치 대기 중"
          tone="amber"
        />
        <StatTile
          label="스크리닝 완료"
          value={stats.screeningDone}
          sub="면접/확정 대기"
          tone="lavender"
        />
        <StatTile
          label="확정인력"
          value={stats.confirmed}
          sub="매니저 확정 완료"
          tone="rose"
        />
      </motion.div>

      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
        <motion.div variants={item} className="lg:col-span-5">
          <EditorialCard tone="white" eyebrow="채용 파이프라인">
            <EditorialCardTitle>스크리닝 흐름</EditorialCardTitle>
            <EditorialCardContent className="mb-8">
              유입부터 스크리닝, 최종 확정까지의 전환율을 보여줍니다.
            </EditorialCardContent>
            
            <div className="flex flex-col gap-4">
              {FUNNEL.map((f, i) => {
                const value = stats[f.key];
                const pct = (value / funnelMax) * 100;
                return (
                  <div key={f.key} className="flex items-center gap-4">
                    <span className="w-24 shrink-0 text-[14px] font-medium text-slate-gray">{f.label}</span>
                    <div className="h-8 flex-1 overflow-hidden rounded-[100px] border border-bone bg-paper-white">
                      <motion.div
                        className={cn("flex h-full items-center justify-end px-3", f.bar)}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(pct, 6)}%` }}
                        transition={{ duration: 0.6, delay: i * 0.08, ease: "easeOut" }}
                      >
                        <span className={cn("text-[13px] font-bold", f.text)}>{value}</span>
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>
          </EditorialCard>
        </motion.div>

        <motion.div variants={item} className="lg:col-span-7">
          <div className="flex flex-col gap-4">
            <div className="px-2">
              <span className="ob-eyebrow before:mr-2 before:content-['•']">지점별 현황</span>
            </div>
            {/* 밀집 뷰이므로 기존 Card 유지 혹은 border만 있는 영역 */}
            <div className="overflow-hidden rounded-list border border-bone bg-paper-white">
              <Table>
                <THead>
                  <TR className="border-b border-bone">
                    <TH className="py-4">지점</TH>
                    <TH className="py-4 text-right">전체</TH>
                    <TH className="py-4 text-right">대기</TH>
                    <TH className="py-4 text-right">진행</TH>
                    <TH className="py-4 text-right">완료</TH>
                    <TH className="py-4 text-right">확정</TH>
                  </TR>
                </THead>
                <TBody>
                  {branchStats.map((b) => (
                    <TR key={b.name} className="border-b border-bone/50 hover:bg-bone/30">
                      <TD className="py-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[15px] font-medium text-ink-black">{b.name}</span>
                          <div className="h-1.5 w-32 overflow-hidden rounded-pill bg-bone">
                            <motion.div
                              className="h-full rounded-pill bg-deep-violet"
                              initial={{ width: 0 }}
                              animate={{ width: `${(b.total / maxBranchTotal) * 100}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      </TD>
                      <TD className="py-4 text-right font-medium text-[15px]">{b.total}</TD>
                      <TD className="py-4 text-right text-[15px] text-slate-gray">{b.pre || "0"}</TD>
                      <TD className="py-4 text-right text-[15px]">
                        {b.inProg > 0 ? <span className="text-slate-gray">{b.inProg}</span> : <span className="text-mist-gray">0</span>}
                      </TD>
                      <TD className="py-4 text-right text-[15px] text-slate-gray">{b.done || "0"}</TD>
                      <TD className="py-4 text-right text-[15px]">
                        {b.confirmed > 0 ? <span className="font-bold text-burnt-amber">{b.confirmed}</span> : <span className="text-mist-gray">0</span>}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
