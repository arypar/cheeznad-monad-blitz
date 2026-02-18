"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { CHEEZNAD_ADDRESS, cheeznadAbi } from "@/lib/cheeznadAbi";

export function useContractRound() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "getRoundTimeRemaining" as const,
      },
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "getBettingTimeRemaining" as const,
      },
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "getCurrentRoundPhase" as const,
      },
      {
        address: CHEEZNAD_ADDRESS,
        abi: cheeznadAbi,
        functionName: "isBettingOpen" as const,
      },
    ],
    query: { refetchInterval: 15_000 },
  });

  return useMemo(() => {
    const roundTimeLeft =
      data?.[0]?.status === "success"
        ? Number(data[0].result as bigint)
        : 0;

    const bettingTimeLeft =
      data?.[1]?.status === "success"
        ? Number(data[1].result as bigint)
        : 0;

    const phase =
      data?.[2]?.status === "success"
        ? (data[2].result as string)
        : "BETTING";

    const isBettingOpen =
      data?.[3]?.status === "success"
        ? (data[3].result as boolean)
        : false;

    return { roundTimeLeft, bettingTimeLeft, phase, isBettingOpen, isLoading };
  }, [data, isLoading]);
}
