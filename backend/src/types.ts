export type ZoneId = "pepperoni" | "mushroom" | "pineapple" | "olive" | "anchovy";

export interface ClassifiedTransaction {
  id: string;
  zoneId: ZoneId;
  txHash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: bigint;
  timestamp: number;
  contractName: string;
  protocolName: string;
}

export interface ClassifiedTransactionMessage {
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
    protocolName: string;
  };
}

export interface RegistryEntry {
  zoneId: ZoneId;
  protocolName: string;
  contractName: string;
  category: string;
}

export interface BlockStats {
  blockNumber: bigint;
  totalTxns: number;
  classifiedTxns: number;
  nativeTransfers: number;
  contractCreations: number;
  unclassifiedCalls: number;
  byZone: Record<ZoneId, number>;
}

export interface ZoneScore {
  txCount: number;
  multiplier: number;
  weightedScore: number;
}

export interface RoundStartMessage {
  type: "round_start";
  data: {
    roundNumber: number;
    multipliers: Record<ZoneId, number>;
    endsAt: number;
  };
}

export interface RoundEndMessage {
  type: "round_end";
  data: {
    roundNumber: number;
    winner: ZoneId;
    scores: Record<ZoneId, ZoneScore>;
  };
}

export interface PastWinnersMessage {
  type: "past_winners";
  data: {
    winners: { roundNumber: number; winnerZone: ZoneId; endedAt: string }[];
  };
}
