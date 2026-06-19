"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
  옹보딩 버튼 — 플랫(그림자 없음). primary만 완전 핀(1000px), 나머지는 pill(100px).
  레퍼런스 Primary Pill Button = ink-black fill / white text.
*/
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-deep-violet/40 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary: "bg-ink-black text-paper-white rounded-pin hover:bg-graphite",
        accent: "bg-burnt-amber text-paper-white rounded-pin hover:opacity-90",
        outline:
          "border border-ink-black text-ink-black rounded-pill bg-transparent hover:bg-bone/60",
        violet:
          "border border-deep-violet text-deep-violet rounded-pill bg-transparent hover:bg-lavender-soft",
        ghost: "text-ink-black rounded-pill bg-transparent hover:bg-bone/60",
        danger:
          "border border-burgundy text-burgundy rounded-pill bg-transparent hover:bg-rose-soft",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-5 text-[14px]",
        lg: "h-12 px-6 text-[15px]",
        hero: "h-14 px-8 text-[16px] font-semibold", /* 신규: Huddle 대형 CTA용 */
        icon: "h-9 w-9 p-0 rounded-pill",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** true면 스피너 표시 + 비활성 (중복 클릭 가드) */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span
            aria-hidden
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
