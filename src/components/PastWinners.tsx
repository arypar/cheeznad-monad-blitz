"use client";

import { useGameStore } from "@/store/useGameStore";
import { ZONES } from "@/lib/zones";
import { getTimeAgo } from "@/lib/utils";

export default function PastWinners() {
  const roundResults = useGameStore((s) => s.roundResults);

  if (roundResults.length === 0) {
    return (
      <div className="past-winners">
        <div className="section-title">🏆 Past Winners</div>
        <div style={{ textAlign: "center", padding: "20px 0", color: "#ccc", fontSize: "13px" }}>
          No rounds completed yet. First round resolving soon...
        </div>
      </div>
    );
  }

  return (
    <div className="past-winners">
      <div className="section-title">🏆 Past Winners</div>
      <div className="winners-list">
        {roundResults.slice(0, 5).map((result, i) => {
          const zone = ZONES[result.winnerZone];
          const isLatest = i === 0;
          return (
            <div
              key={result.roundId}
              className={`winner-row${isLatest ? " winner-latest" : ""}`}
            >
              <span className="winner-rank">{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="winner-slice-img" src={zone.sliceImage} alt={zone.displayName} />
              <div className="winner-info">
                <span className="winner-name" style={{ color: zone.color }}>{zone.name}</span>
                <span className="winner-sub">{zone.displayName}</span>
              </div>
              <div className="winner-round">Round #{result.roundId}</div>
              <div className="winner-time">{getTimeAgo(result.timestamp)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
