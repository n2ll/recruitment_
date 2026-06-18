import * as React from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-mist-gray border-t-transparent",
        className
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[8px] bg-bone/70", className)} />;
}

export function LoadingState({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[14px] text-mist-gray">
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
  className,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-16 text-center", className)}>
      <span className="text-mist-gray">{icon ?? <Inbox className="h-6 w-6" />}</span>
      <p className="text-[14px] font-medium text-slate-gray">{title}</p>
      {hint ? <p className="text-[13px] text-mist-gray">{hint}</p> : null}
      {action}
    </div>
  );
}

/** 로드 실패 — 빈 상태와 명확히 구분(운영 오판 방지). */
export function ErrorState({
  title = "불러오지 못했어요",
  hint = "잠시 후 다시 시도해 주세요.",
  onRetry,
  className,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-16 text-center", className)}>
      <AlertCircle className="h-6 w-6 text-burgundy" />
      <p className="text-[14px] font-medium text-ink-black">{title}</p>
      <p className="text-[13px] text-mist-gray">{hint}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          다시 시도
        </Button>
      ) : null}
    </div>
  );
}
