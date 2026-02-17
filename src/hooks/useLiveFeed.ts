"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/useGameStore";
import type { ZoneId, Transaction } from "@/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080";

interface ClassifiedTxMessage {
  type: "transaction";
  data: {
    id: string;
    zoneId: ZoneId;
    txHash: string;
    from: string;
    to: string;
    value: string;
    blockNumber: number;
    timestamp: number;
    contractName: string;
  };
}

interface RoundStartMessage {
  type: "round_start";
  data: {
    roundNumber: number;
    multipliers: Record<ZoneId, number>;
    endsAt: number;
  };
}

interface RoundEndMessage {
  type: "round_end";
  data: {
    roundNumber: number;
    winner: ZoneId;
    scores: Record<ZoneId, { txCount: number; multiplier: number; weightedScore: number }>;
  };
}

type WsMessage = ClassifiedTxMessage | RoundStartMessage | RoundEndMessage | { type: string };

export function useLiveFeed() {
  const addTransaction = useGameStore((s) => s.addTransaction);
  const decayRecentCounts = useGameStore((s) => s.decayRecentCounts);
  const tickChart = useGameStore((s) => s.tickChart);
  const handleRoundStart = useGameStore((s) => s.handleRoundStart);
  const handleRoundEnd = useGameStore((s) => s.handleRoundEnd);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let alive = true;

    function connect() {
      if (!alive) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[livefeed] connected to backend");
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);

          if (msg.type === "transaction") {
            const d = (msg as ClassifiedTxMessage).data;
            const amount = parseFloat(d.value) || 0;

            const tx: Transaction = {
              id: d.id,
              zoneId: d.zoneId,
              address: d.from,
              amount: Math.round(amount * 1000) / 1000,
              timestamp: Date.now(),
              type: "bet",
            };

            addTransaction(tx);
          } else if (msg.type === "round_start") {
            const d = (msg as RoundStartMessage).data;
            handleRoundStart(d);
          } else if (msg.type === "round_end") {
            const d = (msg as RoundEndMessage).data;
            handleRoundEnd(d);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!alive) return;
        console.log("[livefeed] disconnected, reconnecting in 2s...");
        reconnectTimeout.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    const chartInterval = setInterval(() => {
      tickChart();
    }, 1000);

    const decayInterval = setInterval(() => {
      decayRecentCounts();
    }, 3000);

    return () => {
      alive = false;
      clearTimeout(reconnectTimeout.current);
      clearInterval(chartInterval);
      clearInterval(decayInterval);
      wsRef.current?.close();
    };
  }, [addTransaction, decayRecentCounts, tickChart, handleRoundStart, handleRoundEnd]);
}
