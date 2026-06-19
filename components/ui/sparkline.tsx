"use client";

import * as React from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}

/** 미니 라인 스파크라인 — 그리드/축 없이 추세만. data는 시간순 값 배열. */
export function Sparkline({
  data,
  width = 120,
  height = 36,
  stroke = "var(--color-deep-violet)",
  fill = "transparent",
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      {fill !== "transparent" && <path d={areaPath} fill={fill} stroke="none" />}
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}
