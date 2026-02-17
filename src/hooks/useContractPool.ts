"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { CHEEZNAD_ADDRESS, cheeznadAbi } from "@/lib/cheeznadAbi";
import { ZONE_IDS } from "@/lib/zones";
import type { ZoneId } from "@/types";

const ZONE_ENUM = [0, 1, 2, 3, 4] as const;

export function useContractPool() {
  const { data, isLoading, error } = useReadContracts({
    contracts: ZONE_ENUM.map((i) => ({
      address: CHEEZNAD_ADDRESS,
      abi: cheeznadAbi,
      functionName: "getZoneTotal" as const,
      args: [i] as const,
    })),
    query: { refetchInterval: 5000 },
  });

  return useMemo(() => {
    const zoneTotals = {} as Record<ZoneId, number>;
    let totalPool = 0;

    ZONE_IDS.forEach((zoneId, idx) => {
      const result = data?.[idx];
      const raw =
        result && result.status === "success"
          ? (result.result as bigint)
          : BigInt(0);
      const value = Number(formatEther(raw));
      zoneTotals[zoneId] = value;
      totalPool += value;
    });

    const zonePercentages = {} as Record<ZoneId, number>;
    ZONE_IDS.forEach((zoneId) => {
      zonePercentages[zoneId] =
        totalPool > 0
          ? Math.round((zoneTotals[zoneId] / totalPool) * 1000) / 10
          : 0;
    });

    return { totalPool, zoneTotals, zonePercentages, isLoading, error };
  }, [data, isLoading, error]);
}
