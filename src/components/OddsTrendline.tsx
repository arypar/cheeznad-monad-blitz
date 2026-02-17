"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { ActivityPoint } from "@/store/useGameStore";

interface TrendlineProps {
  data: ActivityPoint[];
  color: string;
  colorRgb: string;
  height?: number;
  isSelected?: boolean;
}

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function ActivityTrendline({
  data,
  color,
  colorRgb,
  height = 72,
  isSelected = false,
}: TrendlineProps) {
  const [isSpiking, setIsSpiking] = useState(false);
  const prevCountRef = useRef(0);

  const currentChance = data.length > 0 ? safeNum(data[data.length - 1].count) : 0;

  useEffect(() => {
    const delta = Math.abs(currentChance - prevCountRef.current);
    prevCountRef.current = currentChance;
    if (delta >= 5) {
      setIsSpiking(true);
      const t = setTimeout(() => setIsSpiking(false), 500);
      return () => clearTimeout(t);
    }
  }, [currentChance]);

  const { linePath, areaPath, viewBox } = useMemo(() => {
    if (data.length < 2) {
      return { linePath: "", areaPath: "", viewBox: `0 0 600 ${height}` };
    }

    const width = 600;
    const padY = 6;
    const padX = 2;
    const innerH = height - padY * 2;
    const innerW = width - padX * 2;

    const counts = data.map((d) => safeNum(d.count));

    const maxCount = Math.max(...counts, 20);
    const minCount = 0;
    const range = Math.max(maxCount - minCount, 1);

    const points = counts.map((c, i) => {
      const x = (i / (counts.length - 1)) * innerW + padX;
      const y = padY + innerH - ((c - minCount) / range) * innerH;
      return { x: safeNum(x, padX), y: safeNum(y, padY) };
    });

    let lineD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      lineD += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const lastPt = points[points.length - 1];
    const areaD = `${lineD} L ${lastPt.x} ${height} L ${points[0].x} ${height} Z`;

    return {
      linePath: lineD,
      areaPath: areaD,
      viewBox: `0 0 ${width} ${height}`,
    };
  }, [data, height]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {currentChance > 0 && (
        <div
          className="absolute top-1.5 right-2.5 font-numbers text-[11px] font-bold z-10 pointer-events-none"
          style={{
            color,
            opacity: 0.9,
          }}
        >
          {currentChance.toFixed(1)}%
        </div>
      )}

      <svg
        viewBox={viewBox}
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {areaPath && (
          <path
            d={areaPath}
            fill={`rgba(${colorRgb}, ${isSelected ? 0.08 : 0.04})`}
          />
        )}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={isSelected ? "2.5" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              opacity: isSpiking ? 1 : 0.8,
            }}
          />
        )}
      </svg>

      {data.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-xs font-numbers">
          waiting for data...
        </div>
      )}
    </div>
  );
}
