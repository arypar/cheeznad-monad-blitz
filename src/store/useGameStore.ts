import { create } from "zustand";
import { ZoneId, ZoneActivity, Transaction, UserBet, HeatLevel } from "@/types";
import { ZONE_IDS } from "@/lib/zones";

/* Heat is driven by how fast a pizza climbs the leaderboard.
   rankDelta = prevRank - currentRank  (positive = climbing up) */
function calcHeatLevel(rankDelta: number): HeatLevel {
  if (rankDelta >= 3) return "onfire";
  if (rankDelta >= 2) return "hot";
  if (rankDelta >= 1) return "warm";
  return "cold";
}

function calcOdds(zoneVolume: number, totalPool: number): number {
  if (zoneVolume === 0 || totalPool === 0) return 6.0;
  const share = zoneVolume / totalPool;
  const odds = Math.max(1.1, (1 / share) * 0.9);
  return Math.round(odds * 100) / 100;
}

/** Compute rank (1 = first) for every zone based on weightedScore */
function computeRanks(zones: Record<ZoneId, ZoneActivity>): Record<ZoneId, number> {
  const sorted = [...ZONE_IDS].sort((a, b) => {
    const diff = zones[b].weightedScore - zones[a].weightedScore;
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
  const ranks = {} as Record<ZoneId, number>;
  sorted.forEach((id, idx) => { ranks[id] = idx + 1; });
  return ranks;
}

/** Guarantee at least one pizza is always heated (the current leader). */
function ensureOneHeated(zones: Record<ZoneId, ZoneActivity>, currentRanks: Record<ZoneId, number>): void {
  if (ZONE_IDS.some((zid) => zones[zid].heatLevel !== "cold")) return;
  // Nobody is heated — bump the rank-1 pizza to warm
  const leader = ZONE_IDS.find((zid) => currentRanks[zid] === 1)!;
  zones[leader] = { ...zones[leader], heatLevel: "warm" };
}

/** All zones start at the middle rank so early movers get warm/hot */
function defaultPrevRanks(): Record<ZoneId, number> {
  const r = {} as Record<ZoneId, number>;
  const mid = Math.ceil(ZONE_IDS.length / 2);
  ZONE_IDS.forEach((id) => { r[id] = mid; });
  return r;
}

interface RoundResult {
  roundId: number;
  winnerZone: ZoneId;
  totalPool: number;
  timestamp: number;
}

interface ZoneScoreData {
  txCount: number;
  multiplier: number;
  weightedScore: number;
}

export interface ActivityPoint {
  time: number;
  count: number;
}

export interface BlockPoint {
  blockNumber: number;
  count: number;
}

const MAX_CHART_POINTS = 60;
const MAX_BLOCKS = 30;

interface GameStore {
  zones: Record<ZoneId, ZoneActivity>;
  prevRanks: Record<ZoneId, number>;
  multipliers: Record<ZoneId, number>;
  activityHistory: Record<ZoneId, ActivityPoint[]>;
  blockHistory: Record<ZoneId, BlockPoint[]>;
  allBlocks: number[];
  transactions: Transaction[];
  maxTransactions: number;
  userBets: UserBet[];
  roundId: number;
  roundEndTime: number;
  bettingEndTime: number;
  isBettingOpen: boolean;
  totalPool: number;
  isActive: boolean;
  selectedZone: ZoneId | null;
  flashZone: ZoneId | null;
  screenFlash: boolean;
  lastBigBet: Transaction | null;
  roundResults: RoundResult[];
  isResolving: boolean;
  lastWinner: ZoneId | null;

  addTransaction: (tx: Transaction) => void;
  placeBet: (zoneId: ZoneId, amount: number) => void;
  setSelectedZone: (zoneId: ZoneId | null) => void;
  clearFlash: () => void;
  clearScreenFlash: () => void;
  decayRecentCounts: () => void;
  tickChart: () => void;
  handleRoundStart: (data: {
    roundNumber: number;
    multipliers: Record<ZoneId, number>;
    endsAt: number;
    bettingEndsAt: number;
  }) => void;
  handleRoundEnd: (data: {
    roundNumber: number;
    winner: ZoneId;
    scores: Record<ZoneId, ZoneScoreData>;
  }) => void;
  handleBettingClosed: (data: {
    roundNumber: number;
  }) => void;
  handlePastWinners: (winners: {
    roundNumber: number;
    winnerZone: ZoneId;
    endedAt: string;
  }[]) => void;
  syncContractTime: (data: {
    roundEndTime: number;
    bettingEndTime: number;
    isBettingOpen: boolean;
    roundId: number;
  }) => void;
}

function defaultMultipliers(): Record<ZoneId, number> {
  const m = {} as Record<ZoneId, number>;
  ZONE_IDS.forEach((id) => { m[id] = 1.0; });
  return m;
}

function createFreshZones(multipliers?: Record<ZoneId, number>): Record<ZoneId, ZoneActivity> {
  const m = multipliers || defaultMultipliers();
  const zones = {} as Record<ZoneId, ZoneActivity>;
  ZONE_IDS.forEach((id) => {
    zones[id] = {
      zoneId: id,
      totalVolume: 0,
      betCount: 0,
      odds: 6.0,
      heatLevel: "cold",
      lastTxTimestamp: 0,
      recentTxCount: 0,
      multiplier: m[id] ?? 1.0,
      weightedScore: 0,
    };
  });
  return zones;
}

function createFreshHistory(): Record<ZoneId, ActivityPoint[]> {
  const h = {} as Record<ZoneId, ActivityPoint[]>;
  const now = Date.now();
  ZONE_IDS.forEach((id) => {
    h[id] = [{ time: now, count: 0 }];
  });
  return h;
}

function createFreshBlockHistory(): Record<ZoneId, BlockPoint[]> {
  const h = {} as Record<ZoneId, BlockPoint[]>;
  ZONE_IDS.forEach((id) => {
    h[id] = [];
  });
  return h;
}

export const useGameStore = create<GameStore>((set, get) => ({
  zones: createFreshZones(),
  prevRanks: defaultPrevRanks(),
  multipliers: defaultMultipliers(),
  activityHistory: createFreshHistory(),
  blockHistory: createFreshBlockHistory(),
  allBlocks: [],
  transactions: [],
  maxTransactions: 50,
  userBets: [],
  roundId: 0,
  roundEndTime: 0,
  bettingEndTime: 0,
  isBettingOpen: true,
  totalPool: 0,
  isActive: true,
  selectedZone: null,
  flashZone: null,
  screenFlash: false,
  lastBigBet: null,
  roundResults: [],
  isResolving: false,
  lastWinner: null,

  addTransaction: (tx: Transaction) => {
    const state = get();
    if (state.isResolving) return;
    const zone = state.zones[tx.zoneId];
    const newTotalPool = state.totalPool + tx.amount;
    const newBetCount = zone.betCount + 1;
    const multiplier = state.multipliers[tx.zoneId] ?? 1.0;

    const updatedZone: ZoneActivity = {
      ...zone,
      totalVolume: zone.totalVolume + tx.amount,
      betCount: newBetCount,
      recentTxCount: zone.recentTxCount + 1,
      lastTxTimestamp: tx.timestamp,
      heatLevel: zone.heatLevel,
      multiplier,
      weightedScore: Math.round(newBetCount * multiplier * 100) / 100,
    };

    const updatedZones = { ...state.zones, [tx.zoneId]: updatedZone };
    ZONE_IDS.forEach((zid) => {
      updatedZones[zid] = {
        ...updatedZones[zid],
        odds: calcOdds(updatedZones[zid].totalVolume, newTotalPool),
      };
    });

    // Heat = how fast this pizza is climbing the leaderboard
    const currentRanks = computeRanks(updatedZones);
    ZONE_IDS.forEach((zid) => {
      const delta = state.prevRanks[zid] - currentRanks[zid];
      updatedZones[zid] = {
        ...updatedZones[zid],
        heatLevel: calcHeatLevel(delta),
      };
    });
    ensureOneHeated(updatedZones, currentRanks);

    const isBigBet = tx.amount >= 2;
    const newTransactions = [tx, ...state.transactions].slice(0, state.maxTransactions);

    // Update block history for this zone + global block list
    const newBlockHistory = { ...state.blockHistory };
    let newAllBlocks = state.allBlocks;
    if (tx.blockNumber) {
      const bn = tx.blockNumber;

      // Add to global block list if new
      if (newAllBlocks.length === 0 || newAllBlocks[newAllBlocks.length - 1] !== bn) {
        newAllBlocks = [...newAllBlocks, bn].slice(-MAX_BLOCKS);
      }

      // Add to zone-specific block counts
      const zoneBlocks = [...newBlockHistory[tx.zoneId]];
      const lastBlock = zoneBlocks[zoneBlocks.length - 1];
      if (lastBlock && lastBlock.blockNumber === bn) {
        zoneBlocks[zoneBlocks.length - 1] = {
          ...lastBlock,
          count: lastBlock.count + 1,
        };
      } else {
        zoneBlocks.push({ blockNumber: bn, count: 1 });
      }
      newBlockHistory[tx.zoneId] = zoneBlocks.slice(-MAX_BLOCKS);
    }

    set({
      zones: updatedZones,
      transactions: newTransactions,
      totalPool: newTotalPool,
      flashZone: tx.zoneId,
      screenFlash: isBigBet,
      lastBigBet: isBigBet ? tx : state.lastBigBet,
      blockHistory: newBlockHistory,
      allBlocks: newAllBlocks,
    });
  },

  tickChart: () => {
    const state = get();
    const now = Date.now();
    const newHistory = { ...state.activityHistory };

    const totalWeighted = ZONE_IDS.reduce(
      (sum, zid) => sum + state.zones[zid].weightedScore,
      0
    );

    ZONE_IDS.forEach((zid) => {
      const chance =
        totalWeighted > 0
          ? Math.round((state.zones[zid].weightedScore / totalWeighted) * 1000) / 10
          : 0;
      newHistory[zid] = [
        ...newHistory[zid],
        { time: now, count: chance },
      ].slice(-MAX_CHART_POINTS);
    });

    set({ activityHistory: newHistory });
  },

  placeBet: (zoneId: ZoneId, amount: number) => {
    const state = get();
    if (state.isResolving || !state.isBettingOpen) return;
    const zone = state.zones[zoneId];

    const bet: UserBet = {
      id: `bet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      zoneId,
      amount,
      odds: zone.odds,
      timestamp: Date.now(),
      status: "pending",
    };

    const tx: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      zoneId,
      address: "0xYOU",
      amount,
      timestamp: Date.now(),
      type: "bet",
    };

    set({ userBets: [bet, ...state.userBets] });
    state.addTransaction(tx);
  },

  setSelectedZone: (zoneId: ZoneId | null) => set({ selectedZone: zoneId }),
  clearFlash: () => set({ flashZone: null }),
  clearScreenFlash: () => set({ screenFlash: false }),

  decayRecentCounts: () => {
    const state = get();
    const currentRanks = computeRanks(state.zones);
    const newPrevRanks = { ...state.prevRanks };
    const updatedZones = { ...state.zones };
    let changed = false;

    ZONE_IDS.forEach((zid) => {
      // Decay recentTxCount (kept for data tracking)
      if (updatedZones[zid].recentTxCount > 0) {
        updatedZones[zid] = {
          ...updatedZones[zid],
          recentTxCount: Math.max(0, updatedZones[zid].recentTxCount - 1),
        };
        changed = true;
      }

      // Decay prevRanks one step toward current rank (cools the heat)
      const prev = newPrevRanks[zid];
      const curr = currentRanks[zid];
      if (prev > curr) {
        newPrevRanks[zid] = prev - 1;
        changed = true;
      } else if (prev < curr) {
        newPrevRanks[zid] = prev + 1;
        changed = true;
      }

      // Recompute heat from updated delta
      const delta = newPrevRanks[zid] - currentRanks[zid];
      const newHeat = calcHeatLevel(delta);
      if (updatedZones[zid].heatLevel !== newHeat) {
        updatedZones[zid] = { ...updatedZones[zid], heatLevel: newHeat };
        changed = true;
      }
    });

    ensureOneHeated(updatedZones, currentRanks);
    if (changed) set({ zones: updatedZones, prevRanks: newPrevRanks });
  },

  handleRoundStart: (data) => {
    const { roundNumber, multipliers, endsAt, bettingEndsAt } = data;
    set({
      zones: createFreshZones(multipliers),
      prevRanks: defaultPrevRanks(),
      multipliers,
      activityHistory: createFreshHistory(),
      blockHistory: createFreshBlockHistory(),
      allBlocks: [],
      totalPool: 0,
      roundId: roundNumber,
      roundEndTime: endsAt,
      bettingEndTime: bettingEndsAt,
      isBettingOpen: Date.now() < bettingEndsAt,
      isResolving: false,
      lastWinner: null,
      flashZone: null,
      screenFlash: false,
    });
  },

  handleRoundEnd: (data) => {
    const state = get();
    const { winner, scores } = data;

    const result: RoundResult = {
      roundId: state.roundId,
      winnerZone: winner,
      totalPool: state.totalPool,
      timestamp: Date.now(),
    };

    const updatedBets = state.userBets.map((bet) => {
      if (bet.status === "pending") {
        return { ...bet, status: (bet.zoneId === winner ? "won" : "lost") as "won" | "lost" };
      }
      return bet;
    });

    const updatedZones = { ...state.zones };
    ZONE_IDS.forEach((zid) => {
      if (scores[zid]) {
        updatedZones[zid] = {
          ...updatedZones[zid],
          weightedScore: scores[zid].weightedScore,
        };
      }
    });

    set({
      zones: updatedZones,
      isResolving: true,
      isBettingOpen: false,
      lastWinner: winner,
      roundResults: [result, ...state.roundResults].slice(0, 10),
      userBets: updatedBets,
      screenFlash: true,
    });
  },

  handleBettingClosed: () => {
    set({ isBettingOpen: false });
  },

  handlePastWinners: (winners) => {
    const results: RoundResult[] = winners.map((w) => ({
      roundId: w.roundNumber,
      winnerZone: w.winnerZone,
      totalPool: 0,
      timestamp: new Date(w.endedAt).getTime(),
    }));
    set({ roundResults: results });
  },

  syncContractTime: (data) => {
    const state = get();
    // Only update timing fields — don't reset zones/history/scores
    const updates: Partial<GameStore> = {
      roundEndTime: data.roundEndTime,
      bettingEndTime: data.bettingEndTime,
      isBettingOpen: data.isBettingOpen,
    };
    // If contract reports a new round that we haven't seen via WebSocket yet,
    // update roundId so the timer displays correctly
    if (data.roundId > 0 && data.roundId !== state.roundId) {
      updates.roundId = data.roundId;
    }
    set(updates);
  },
}));
