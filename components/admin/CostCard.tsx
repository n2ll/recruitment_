"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Sparkline } from "@/components/ui/sparkline";
import { EditorialCard, EditorialCardContent } from "@/components/ui/editorial-card";
import { CountUp } from "@/components/ui/count-up";
import { fadeUp } from "@/lib/admin/motion";

export interface UsageDailyCost {
  day: string;
  ai_cost_krw: number;
  sms_cost_krw: number;
  total_cost_krw: number;
  ai_call_count: number;
  sms_count: number;
  lms_count: number;
  mms_count: number;
  alimtalk_count: number;
}

function won(n: number): string {
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

/** "Your Wallet"식 비용 카드 — 최근 30일 합계 + 일별 추세 스파크라인 + AI/SMS 분해. */
export function CostCard({ usage }: { usage: UsageDailyCost[] }) {
  // view는 day DESC. 차트는 시간순(과거→현재)으로.
  const series = [...usage].reverse();
  const totalSum = series.reduce((s, d) => s + (d.total_cost_krw || 0), 0);
  const aiSum = series.reduce((s, d) => s + (d.ai_cost_krw || 0), 0);
  const smsSum = series.reduce((s, d) => s + (d.sms_cost_krw || 0), 0);
  const todayTotal = series.length > 0 ? series[series.length - 1].total_cost_krw : 0;
  const spark = series.map((d) => d.total_cost_krw || 0);

  return (
    <motion.div variants={fadeUp}>
      <EditorialCard tone="lavender" eyebrow="운영 비용 (최근 30일)">
        <div className="flex items-end justify-between gap-2">
          <div className="ob-display text-[44px] leading-none tracking-tighter text-ink-black">
            <CountUp value={Math.round(totalSum)} format={(n) => won(n)} />
          </div>
          <span className="mb-1 rounded-pill bg-ink-black/5 px-2.5 py-1 text-[12px] font-medium text-deep-violet">
            오늘 {won(todayTotal)}
          </span>
        </div>

        {spark.length > 1 && (
          <div className="mt-5">
            <Sparkline data={spark} width={300} height={48} stroke="var(--color-deep-violet)" />
          </div>
        )}

        <div className="mt-5 flex gap-6 border-t border-ink-black/10 pt-4">
          <div className="flex flex-col">
            <span className="text-[12px] text-ink-black/50">AI (Claude)</span>
            <span className="text-[18px] font-semibold text-ink-black">{won(aiSum)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] text-ink-black/50">문자 (SMS·알림톡)</span>
            <span className="text-[18px] font-semibold text-ink-black">{won(smsSum)}</span>
          </div>
        </div>

        <EditorialCardContent className="mt-3 text-[12px] text-ink-black/50">
          환율 ₩1,400 가정 · AI 단가는 Anthropic 공식가 기준
        </EditorialCardContent>
      </EditorialCard>
    </motion.div>
  );
}
