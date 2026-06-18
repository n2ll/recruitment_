import { cn } from "@/lib/cn";

interface WordmarkProps {
  className?: string;
  /** 우측에 보조 라벨(예: 관리자) 표기 */
  suffix?: string;
  size?: "sm" | "md" | "lg";
}

const SIZES: Record<NonNullable<WordmarkProps["size"]>, string> = {
  sm: "text-[17px]",
  md: "text-[20px]",
  lg: "text-[26px]",
};

/**
 * 옹보딩 워드마크 — Wanted Sans 디스플레이, 라이트 웨이트(에디토리얼 시그니처).
 * 점(dot)은 Huddle 마이크로 라벨 시스템 차용.
 */
export function Wordmark({ className, suffix, size = "md" }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span
        className={cn(
          "ob-headline tracking-tight text-ink-black",
          SIZES[size]
        )}
      >
        옹보딩
        <span className="text-deep-violet">.</span>
      </span>
      {suffix ? (
        <span className="ob-eyebrow translate-y-[-1px]">{suffix}</span>
      ) : null}
    </span>
  );
}
