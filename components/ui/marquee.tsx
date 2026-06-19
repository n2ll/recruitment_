"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

interface MarqueeProps {
  children: React.ReactNode;
  className?: string;
  /** 한 바퀴 도는 시간(초). 길수록 느림. */
  speed?: number;
}

/** 좌로 흐르는 무한 마퀴. 콘텐츠를 2번 렌더해 끊김 없이 순환. */
export function Marquee({ children, className, speed = 40 }: MarqueeProps) {
  return (
    <div className={cn("group relative flex w-full overflow-hidden", className)}>
      <div
        className="flex shrink-0 items-center gap-8 pr-8 ob-marquee-track group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${speed}s` }}
      >
        {children}
      </div>
      <div
        aria-hidden
        className="flex shrink-0 items-center gap-8 pr-8 ob-marquee-track group-hover:[animation-play-state:paused]"
        style={{ animationDuration: `${speed}s` }}
      >
        {children}
      </div>
    </div>
  );
}
