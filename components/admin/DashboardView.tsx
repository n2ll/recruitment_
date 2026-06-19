"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { EditorialCard, EditorialCardTitle, EditorialCardContent } from "@/components/ui/editorial-card";
import { DisplayHeadline } from "@/components/ui/display-headline";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Sparkline } from "@/components/ui/sparkline";
import { Marquee } from "@/components/ui/marquee";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CountUp } from "@/components/ui/count-up";
import { fadeUp as item, staggerContainer as container } from "@/lib/admin/motion";
import { cn } from "@/lib/cn";
import { CostCard, type UsageDailyCost } from "@/components/admin/CostCard";

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

export interface RecentActivity {
  id: number;
  name: string;
  branch: string | null;
  status: string;
}

interface DashboardViewProps {
  stats: DashStats;
  branchStats: BranchStat[];
  /** 최근 14일 일별 지원 수 (시간순) */
  dailyApplied?: number[];
  /** 라이브 티커용 최근 활동 */
  recentActivity?: RecentActivity[];
  /** 최근 30일 일별 운영 비용 (day DESC) */
  usage?: UsageDailyCost[];
}

function DeltaPill({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-pill bg-ink-black/5 px-2 py-0.5 text-[12px] font-semibold text-deep-violet">
      <ArrowUpRight className="h-3 w-3" />
      {value}
    </span>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
  delta,
  sparkline,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "sage" | "lavender" | "rose" | "amber";
  delta?: number;
  sparkline?: number[];
}) {
  return (
    <motion.div variants={item} className="flex">
      <EditorialCard tone={tone} eyebrow={label} className="flex-1">
        <div className="flex items-end justify-between gap-2">
          <div className="ob-display text-[56px] leading-none tracking-tighter text-ink-black">
            <CountUp value={value} />
          </div>
          {delta !== undefined && <div className="mb-2"><DeltaPill value={delta} /></div>}
        </div>
        {sparkline && sparkline.length > 1 && (
          <div className="mt-4">
            <Sparkline data={sparkline} width={220} height={40} stroke="var(--color-ink-black)" />
          </div>
        )}
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

function activityVerb(status: string): string {
  if (status === "확정인력") return "확정됐어요";
  if (status === "대기자") return "대기자로 등록됐어요";
  if (status === "스크리닝 완료") return "스크리닝을 마쳤어요";
  return "지원했어요";
}

export function DashboardView({ stats, branchStats, dailyApplied, recentActivity, usage }: DashboardViewProps) {
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

      {recentActivity && recentActivity.length > 0 && (
        <motion.div variants={item}>
          <div className="flex items-center gap-4 rounded-pill border border-bone bg-bone/30 py-2.5 pl-4">
            <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-gray">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-deep-violet opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-deep-violet" />
              </span>
              LIVE
            </span>
            <div className="min-w-0 flex-1">
              <Marquee speed={36}>
                {recentActivity.map((a) => (
                  <span key={a.id} className="text-[13px] text-slate-gray">
                    <span className="font-medium text-ink-black">{a.name}</span>
                    {a.branch ? <span className="text-mist-gray"> · {a.branch}</span> : null} {activityVerb(a.status)}
                  </span>
                ))}
              </Marquee>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" variants={container}>
        <StatTile
          label="전체 지원자"
          value={stats.total}
          sub={`최근 14일 유입 추세`}
          tone="sage"
          delta={stats.today}
          sparkline={dailyApplied}
        />
        <StatTile label="대기자" value={stats.waiting} sub="배치 대기 중" tone="amber" />
        <StatTile label="스크리닝 완료" value={stats.screeningDone} sub="면접/확정 대기" tone="lavender" />
        <StatTile label="확정인력" value={stats.confirmed} sub="매니저 확정 완료" tone="rose" />
      </motion.div>

      {usage && usage.length > 0 && <CostCard usage={usage} />}

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
              <Eyebrow>지점별 현황</Eyebrow>
            </div>
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
                      <TD className="py-4 text-right text-[15px] font-medium">{b.total}</TD>
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
