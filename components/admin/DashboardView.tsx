"use client";

import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { Users, Sparkles, BadgeCheck, Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/cn";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
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

function Kpi({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  accent: string;
}) {
  return (
    <motion.div variants={item}>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <span className="ob-eyebrow">{label}</span>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-pill"
            style={{ background: `${accent}1a`, color: accent }}
          >
            {icon}
          </span>
        </div>
        <div className="mt-2 ob-headline text-[34px] leading-none text-ink-black">
          <CountUp value={value} />
        </div>
        {sub ? <p className="mt-1 text-[12px] text-mist-gray">{sub}</p> : null}
      </Card>
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
      className="flex flex-col gap-6"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <p className="ob-eyebrow">대시보드</p>
        <h2 className="ob-headline mt-0.5 text-[26px] text-ink-black">채용 현황 한눈에</h2>
      </motion.div>

      <motion.div className="grid grid-cols-2 gap-3 lg:grid-cols-4" variants={container}>
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="전체 지원자"
          value={stats.total}
          sub={`오늘 +${stats.today}명 지원`}
          accent="#453b60"
        />
        <Kpi
          icon={<Sparkles className="h-4 w-4" />}
          label="오늘 지원"
          value={stats.today}
          sub="실시간 유입"
          accent="#65451d"
        />
        <Kpi
          icon={<BadgeCheck className="h-4 w-4" />}
          label="확정인력"
          value={stats.confirmed}
          sub="매니저 확정"
          accent="#5c2529"
        />
        <Kpi
          icon={<Hourglass className="h-4 w-4" />}
          label="대기자"
          value={stats.waiting}
          sub="배치 대기"
          accent="#808080"
        />
      </motion.div>

      <motion.div variants={item}>
      <Card className="p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-[15px] font-medium text-ink-black">채용 파이프라인</h3>
          <span className="text-[12px] text-mist-gray">스크리닝 → 확정 전환 흐름</span>
        </div>
        <div className="flex flex-col gap-3">
          {FUNNEL.map((f, i) => {
            const value = stats[f.key];
            const pct = (value / funnelMax) * 100;
            return (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[13px] text-slate-gray">{f.label}</span>
                <div className="h-7 flex-1 overflow-hidden rounded-[8px] border border-bone bg-paper-white">
                  <motion.div
                    className={cn("flex h-full items-center justify-end px-2", f.bar)}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(pct, 6)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease: "easeOut" }}
                  >
                    <span className={cn("text-[12px] font-semibold", f.text)}>{value}</span>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      </motion.div>

      <motion.div variants={item}>
      <Card className="p-5">
        <h3 className="mb-3 text-[15px] font-medium text-ink-black">지점별 현황</h3>
        <Table>
          <THead>
            <TR>
              <TH>지점</TH>
              <TH className="text-right">전체</TH>
              <TH className="text-right">스크리닝 전</TH>
              <TH className="text-right">스크리닝 중</TH>
              <TH className="text-right">스크리닝 완료</TH>
              <TH className="text-right">확정인력</TH>
              <TH className="text-right">대기자</TH>
            </TR>
          </THead>
          <TBody>
            {branchStats.map((b) => (
              <TR key={b.name} className="hover:bg-bone/30">
                <TD>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-ink-black">{b.name}</span>
                    <div className="h-1 w-28 overflow-hidden rounded-pill bg-bone">
                      <motion.div
                        className="h-full rounded-pill bg-deep-violet"
                        initial={{ width: 0 }}
                        animate={{ width: `${(b.total / maxBranchTotal) * 100}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                </TD>
                <TD className="text-right font-medium">{b.total}</TD>
                <TD className="text-right text-slate-gray">{b.pre || "0"}</TD>
                <TD className="text-right">
                  {b.inProg > 0 ? <span className="text-slate-gray">{b.inProg}</span> : <span className="text-mist-gray">0</span>}
                </TD>
                <TD className="text-right text-slate-gray">{b.done || "0"}</TD>
                <TD className="text-right">
                  {b.confirmed > 0 ? <span className="font-medium text-burnt-amber">{b.confirmed}</span> : <span className="text-mist-gray">0</span>}
                </TD>
                <TD className="text-right">
                  {b.waiting > 0 ? <span className="text-slate-gray">{b.waiting}</span> : <span className="text-mist-gray">0</span>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      </motion.div>
    </motion.div>
  );
}
