import * as React from "react";
import { cn } from "@/lib/cn";

export type EditorialCardTone = "sage" | "lavender" | "rose" | "amber" | "white";

interface EditorialCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: EditorialCardTone;
  eyebrow?: React.ReactNode;
}

const TONE_CLASSES: Record<EditorialCardTone, string> = {
  sage: "bg-surface-sage border-pale-sage",
  lavender: "bg-surface-lavender border-lavender-mist",
  rose: "bg-surface-rose border-blush-border",
  amber: "bg-surface-amber border-honey-gold",
  white: "bg-paper-white border-bone",
};

export function EditorialCard({ className, tone = "white", eyebrow, children, ...props }: EditorialCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-block border p-6 shadow-floating sm:p-8",
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    >
      {eyebrow && (
        <div className="mb-4">
          {typeof eyebrow === "string" ? (
            <span className="ob-eyebrow font-semibold text-ink-black/70 before:mr-2 before:content-['•']">
              {eyebrow}
            </span>
          ) : (
            eyebrow
          )}
        </div>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function EditorialCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("mb-2 text-[22px] font-medium leading-snug tracking-tight text-ink-black", className)}
      {...props}
    />
  );
}

export function EditorialCardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-[15px] leading-relaxed text-slate-gray", className)} {...props} />;
}
