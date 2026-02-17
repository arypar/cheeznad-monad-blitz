import { formatEther } from "viem";
import { lookupAddress } from "./registry.js";
import type { BlockWithTransactions } from "./monitor.js";
import type { ClassifiedTransaction, BlockStats, ZoneId } from "./types.js";

const ZONE_IDS: ZoneId[] = ["pepperoni", "mushroom", "pineapple", "olive", "anchovy"];

function freshZoneCounts(): Record<ZoneId, number> {
  return Object.fromEntries(ZONE_IDS.map((z) => [z, 0])) as Record<ZoneId, number>;
}

export function classifyBlock(block: BlockWithTransactions): {
  transactions: ClassifiedTransaction[];
  stats: BlockStats;
} {
  const classified: ClassifiedTransaction[] = [];
  const zoneCounts = freshZoneCounts();
  let nativeTransfers = 0;
  let contractCreations = 0;

  for (const tx of block.transactions) {
    if (!tx.to) {
      contractCreations++;
      continue;
    }

    const entry = lookupAddress(tx.to);
    if (entry) {
      zoneCounts[entry.zoneId]++;
      classified.push({
        id: `${tx.hash}-${entry.zoneId}`,
        zoneId: entry.zoneId,
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: formatEther(tx.value),
        blockNumber: block.number ?? 0n,
        timestamp: Number(block.timestamp),
        contractName: entry.contractName,
        protocolName: entry.protocolName,
      });
    } else if (tx.input === "0x" || tx.input === "0x0") {
      nativeTransfers++;
    }
  }

  const unclassifiedCalls =
    block.transactions.length - classified.length - nativeTransfers - contractCreations;

  const stats: BlockStats = {
    blockNumber: block.number ?? 0n,
    totalTxns: block.transactions.length,
    classifiedTxns: classified.length,
    nativeTransfers,
    contractCreations,
    unclassifiedCalls,
    byZone: zoneCounts,
  };

  return { transactions: classified, stats };
}
