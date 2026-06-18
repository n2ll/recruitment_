import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
  상태 태그 — 100px pill, 헤어라인 보더, 파스텔 배경(채도 낮게).
  옹보딩 상태 분류(색=의미) 매핑은 statusBadgeTone() 참고.
*/
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[12px] font-medium leading-tight whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-bone bg-paper-white text-slate-gray",
        sage: "border-pale-sage bg-sage-soft text-slate-gray",
        lavender: "border-lavender-mist bg-lavender-soft text-deep-violet",
        rose: "border-blush-border bg-rose-soft text-burgundy",
        gold: "border-burnt-amber bg-amber-soft text-burnt-amber",
        burgundy: "border-burgundy bg-rose-soft text-burgundy",
        ink: "border-ink-black bg-ink-black text-paper-white",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      ) : null}
      {children}
    </span>
  );
}

export type StatusTone = NonNullable<BadgeProps["tone"]>;

/** 옹보딩 6종 상태 → 색 분류(색=의미) */
export function statusBadgeTone(status: string | null | undefined): StatusTone {
  switch (status) {
    case "확정인력":
      return "rose";
    case "대기자":
      return "gold";
    case "부적합":
    case "이탈":
      return "burgundy";
    case "스크리닝 완료":
      return "lavender";
    case "스크리닝 중":
      return "sage";
    case "스크리닝 전":
    default:
      return "neutral";
  }
}

export { badgeVariants };
