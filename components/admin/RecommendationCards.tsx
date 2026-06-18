"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { MapPin, Car, Clock3, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { CountUp } from "@/components/ui/count-up";

interface RecoScore {
  total: number;
  distance: number;
  vehicle: number;
  recency: number;
  distanceKm: number;
}

export interface ScoredReco {
  id: number;
  name: string;
  phone: string;
  source: string;
  own_vehicle?: string | null;
  sigungu?: string | null;
  birth_date?: string | null;
  score: RecoScore;
}

interface RecommendationCardsProps {
  candidates: ScoredReco[];
  selectedKeys: Set<string>;
  keyOf: (c: ScoredReco) => string;
  onToggle: (key: string) => void;
  ageOf: (birth: string | null | undefined) => number | null;
}

// 점수 구간별 톤 (거리 70 / 차량 20 / 최신성 10 만점 합산 100)
function ringTone(total: number): { stroke: string; label: string } {
  if (total >= 75) return { stroke: "var(--color-deep-violet)", label: "강력 추천" };
  if (total >= 50) return { stroke: "var(--color-burnt-amber)", label: "추천" };
  if (total >= 30) return { stroke: "var(--color-mist-gray)", label: "검토" };
  return { stroke: "var(--color-dusty-rose)", label: "낮음" };
}

function ScoreRing({ total }: { total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, total)) / 100;
  const tone = ringTone(total);
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--color-bone)" strokeWidth="6" />
        <motion.circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={total} duration={0.7} className="text-[18px] font-semibold leading-none text-ink-black" />
        <span className="text-[9px] leading-none text-mist-gray">/100</span>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[11px] text-slate-gray">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-bone">
        <motion.div
          className="h-full rounded-pill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-medium text-ink-black">
        {value}
        <span className="text-mist-gray">/{max}</span>
      </span>
    </div>
  );
}

export function RecommendationCards({
  candidates,
  selectedKeys,
  keyOf,
  onToggle,
  ageOf,
}: RecommendationCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {candidates.map((c, idx) => {
        const k = keyOf(c);
        const selected = selectedKeys.has(k);
        const age = ageOf(c.birth_date);
        const tone = ringTone(c.score.total);
        const isTop = idx === 0;
        return (
          <motion.div
            key={k}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
            onClick={() => onToggle(k)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(k);
              }
            }}
            className={cn(
              "relative cursor-pointer rounded-card border bg-paper-white p-4 transition-colors",
              selected
                ? "border-deep-violet bg-lavender-soft/40"
                : "border-bone hover:border-deep-violet/40"
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-pill px-1.5 text-[12px] font-semibold",
                    isTop ? "bg-burnt-amber text-paper-white" : "bg-bone text-slate-gray"
                  )}
                >
                  #{idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-ink-black">{c.name}</span>
                    <span
                      className={cn(
                        "rounded-pill border px-1.5 text-[10px]",
                        c.source === "legacy"
                          ? "border-bone text-mist-gray"
                          : "border-pale-sage bg-sage-soft text-slate-gray"
                      )}
                    >
                      {c.source === "legacy" ? "레거시" : "신규"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-mist-gray">
                    {age !== null ? `${age}세 · ` : ""}
                    {c.phone}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors",
                  selected ? "border-deep-violet bg-deep-violet text-paper-white" : "border-stone-border/40 bg-paper-white"
                )}
              >
                {selected ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <ScoreRing total={c.score.total} />
              <div className="flex flex-1 flex-col gap-1.5">
                <span
                  className="mb-0.5 inline-flex w-fit rounded-pill px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: `color-mix(in srgb, ${tone.stroke} 12%, transparent)`,
                    color: tone.stroke,
                  }}
                >
                  {tone.label}
                </span>
                <Bar label="거리" value={c.score.distance} max={70} color="var(--color-burnt-amber)" />
                <Bar label="차량" value={c.score.vehicle} max={20} color="var(--color-deep-violet)" />
                <Bar label="최신" value={c.score.recency} max={10} color="var(--color-slate-gray)" />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-bone pt-2.5 text-[11px] text-slate-gray">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 text-mist-gray" />
                {c.score.distanceKm.toFixed(1)}km
              </span>
              <span className="inline-flex items-center gap-1">
                <Car className="h-3 w-3 text-mist-gray" />
                {c.own_vehicle || "—"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3 text-mist-gray" />
                {c.sigungu || "—"}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
