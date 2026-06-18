"use client";

import * as React from "react";
import { animate, useInView } from "framer-motion";

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
  format?: (n: number) => string;
}

export function CountUp({ value, duration = 0.9, decimals = 0, className, format }: CountUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });

  const render = React.useCallback(
    (n: number) => {
      if (format) return format(n);
      return n.toLocaleString("ko-KR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    },
    [format, decimals]
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate(v) {
        node.textContent = render(v);
      },
    });
    return () => controls.stop();
  }, [inView, value, duration, render]);

  return (
    <span ref={ref} className={className}>
      {render(0)}
    </span>
  );
}
