"use client";

import { useState, useEffect, useRef } from "react";
import { Zone, ZoneActivity, ZoneId } from "@/types";
import { useGameStore } from "@/store/useGameStore";
import { ZONE_IDS } from "@/lib/zones";

interface ZoneRowProps {
  zone: Zone;
  activity: ZoneActivity;
  onOpenModal: (zoneId: string) => void;
  rank?: number;
}

export default function ZoneRow({
  zone,
  activity,
  onOpenModal,
  rank,
}: ZoneRowProps) {
  const zones = useGameStore((s) => s.zones);
  const [isHovered, setIsHovered] = useState(false);

  const isHot = activity.heatLevel === "hot" || activity.heatLevel === "onfire";

  const totalWeighted = ZONE_IDS.reduce(
    (sum, zid) => sum + zones[zid].weightedScore,
    0
  );
  const winChance =
    totalWeighted > 0
      ? Math.round((activity.weightedScore / totalWeighted) * 1000) / 10
      : 0;

  const heatClass = `heat-${activity.heatLevel}`;

  return (
    <div
      className={`zone-row ${heatClass}${isHot ? " is-hot" : ""}${rank === 1 ? " zone-row-leader" : ""}`}
      onClick={() => onOpenModal(zone.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="slice-wrap">
        {rank !== undefined && (
          <div className={`zone-rank zone-rank-${Math.min(rank, 4)}`}>
            {rank}
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="slice-img"
          src={isHovered || isHot ? zone.sliceImageHot : zone.sliceImage}
          alt={zone.displayName}
        />
      </div>

      <div className="zone-meta">
        <div className="zone-name">{zone.name}</div>
        <div className="zone-protocol">{zone.displayName}</div>
        <MultiplierBadge value={activity.multiplier} />
      </div>

      <div className="bar-col">
        <div className="bar-row">
          <div className="bar-track">
            <div
              className="bar-fill-simple"
              style={{
                width: `${Math.min(100, winChance)}%`,
                background: zone.color,
              }}
            />
          </div>
          <div
            className="bar-pct"
            style={{
              color:
                winChance > 60
                  ? "#ef4444"
                  : winChance > 30
                  ? "#b45309"
                  : "#16a34a",
            }}
          >
            {winChance > 0 ? `${Math.round(winChance)}%` : "0%"}
          </div>
        </div>

        <BlockSparkline zoneId={zone.id} color={zone.sparkColor} />

        <div className="tps-row">
          <span className="tps-num">{activity.betCount.toLocaleString()}</span>
          <span className="tps-unit">txns</span>
          {activity.weightedScore > 0 && (
            <span className="weighted-score">
              = {activity.weightedScore.toLocaleString()} pts
            </span>
          )}
        </div>
      </div>

      <div className="zone-actions">
        <button
          className="buy-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal(zone.id);
          }}
        >
          Buy In
        </button>
      </div>
    </div>
  );
}

function MultiplierBadge({ value }: { value: number }) {
  const isHigh = value >= 2.0;
  const isBoosted = value >= 1.5;
  const label = `${value.toFixed(1)}x`;

  return (
    <span
      className={`mult-badge${isHigh ? " mult-high" : isBoosted ? " mult-boosted" : ""}`}
      title={`Each transaction counts as ${value.toFixed(1)} points. ${isHigh ? "Underdog boost!" : isBoosted ? "Slight boost this round." : "Standard weight."}`}
    >
      {isHigh && "🔥 "}{label}
    </span>
  );
}

function BlockSparkline({
  zoneId,
  color,
}: {
  zoneId: string;
  color: string;
}) {
  const allBlocks = useGameStore((s) => s.allBlocks);
  const blockHistoryAll = useGameStore((s) => s.blockHistory);
  const zoneBlocks = blockHistoryAll[zoneId as ZoneId];

  const [flashCount, setFlashCount] = useState<number | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const prevLastBlock = useRef<number | null>(null);
  const prevCount = useRef<number>(0);

  // Detect new block activity for this zone and flash
  const lastZoneBlock = zoneBlocks.length > 0 ? zoneBlocks[zoneBlocks.length - 1] : null;
  useEffect(() => {
    if (!lastZoneBlock) return;
    const isNewBlock = lastZoneBlock.blockNumber !== prevLastBlock.current;
    const isNewTx = lastZoneBlock.count !== prevCount.current;

    if (isNewBlock || isNewTx) {
      prevLastBlock.current = lastZoneBlock.blockNumber;
      prevCount.current = lastZoneBlock.count;

      setFlashCount(lastZoneBlock.count);
      setFlashKey((k) => k + 1);

      const timer = setTimeout(() => setFlashCount(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [lastZoneBlock]);

  const recentBlocks = allBlocks.slice(-26);

  if (recentBlocks.length === 0) {
    return (
      <div className="sparkline sparkline-empty">
        <span className="sparkline-placeholder">awaiting blocks...</span>
      </div>
    );
  }

  // Build a map of blockNumber -> count for this zone
  const blockMap = new Map<number, number>();
  for (const bp of zoneBlocks) {
    blockMap.set(bp.blockNumber, bp.count);
  }

  // Compute global max across ALL zones so heights are comparable
  let globalMax = 1;
  for (const zid of ZONE_IDS) {
    for (const bp of blockHistoryAll[zid]) {
      if (bp.count > globalMax) globalMax = bp.count;
    }
  }

  const lastBlockNum = recentBlocks[recentBlocks.length - 1];

  return (
    <div className="sparkline">
      {recentBlocks.map((bn, i) => {
        const count = blockMap.get(bn) ?? 0;
        const height = count === 0 ? 2 : Math.max(3, (count / globalMax) * 22);
        const isLast = bn === lastBlockNum && count > 0;
        return (
          <div
            key={bn}
            className={`spark-bar${count === 0 ? " spark-bar-empty" : ""}`}
            style={{
              height: `${height}px`,
              background: count === 0 ? "#e0ddd5" : color,
              opacity: count === 0 ? 0.4 : 0.45 + (i / recentBlocks.length) * 0.55,
              position: "relative",
            }}
            title={`Block #${bn}: ${count} tx${count !== 1 ? "s" : ""}`}
          >
            {isLast && flashCount !== null && (
              <span key={flashKey} className="block-flash" style={{ color }}>
                +{flashCount}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
