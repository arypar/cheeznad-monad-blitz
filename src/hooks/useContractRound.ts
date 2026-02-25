"use client";

import { useEffect } from "react";
import { useReadContracts } from "wagmi";
import { CHEEZNAD_ADDRESS, cheeznadAbi } from "@/lib/cheeznadAbi";
import { useGameStore } from "@/store/useGameStore";

export function useContractRound() {
  const syncContractTime = useGameStore((s) => s.syncContractTime);

  const { data } = useReadContracts({
    contracts: [
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "roundStartTime" as const,
      },
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "roundNumber" as const,
      },
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "isBettingOpen" as const,
      },
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "ROUND_DURATION" as const,
      },
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "BETTING_DURATION" as const,
      },
    ],
    query: { refetchInterval: 7_000 },
  });

  useEffect(() => {
    if (!data) return;

    const roundStartTimeSecs =
      data[0]?.status === "success" ? Number(data[0].result as bigint) : 0;
    const roundNumber =
      data[1]?.status === "success" ? Number(data[1].result as bigint) : 0;
    const bettingOpen =
      data[2]?.status === "success" ? (data[2].result as boolean) : false;
    const roundDurationSecs =
      data[3]?.status === "success" ? Number(data[3].result as bigint) : 0;
    const bettingDurationSecs =
      data[4]?.status === "success" ? Number(data[4].result as bigint) : 0;

    if (roundStartTimeSecs === 0 || roundNumber === 0) return;

    const startMs = roundStartTimeSecs * 1000;
    const roundEndTime = startMs + roundDurationSecs * 1000;
    const bettingEndTime = startMs + bettingDurationSecs * 1000;

    syncContractTime({
      roundEndTime,
      bettingEndTime,
      isBettingOpen: bettingOpen,
      roundId: roundNumber,
    });
  }, [data, syncContractTime]);
}
