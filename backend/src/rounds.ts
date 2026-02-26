import { config } from "./config.js";
import { getSupabase } from "./supabase.js";
import { distributeWinnings, getClients, cheeznadAbi } from "./distributor.js";
import type { ZoneId, ZoneScore } from "./types.js";

const ALL_ZONES: ZoneId[] = ["pepperoni", "mushroom", "pineapple", "olive", "anchovy"];
const LOOKBACK_ROUNDS = 10;
const MIN_MULTIPLIER = 0.1;
const MAX_MULTIPLIER = 10.0;
const POLL_INTERVAL_MS = 7_000;

interface RoundState {
  roundNumber: number;
  roundId: string | null;
  multipliers: Record<ZoneId, number>;
  txCounts: Record<ZoneId, number>;
  volumes: Record<ZoneId, number>;
  startedAt: number;
  endsAt: number;
  bettingEndsAt: number;
  contractBettingOpen: boolean;
  contractCanDistribute: boolean;
  distributing: boolean;
}

type RoundStartCallback = (data: {
  roundNumber: number;
  multipliers: Record<ZoneId, number>;
  endsAt: number;
  bettingEndsAt: number;
}) => void;

type RoundEndCallback = (data: {
  roundNumber: number;
  winner: ZoneId;
  scores: Record<ZoneId, ZoneScore>;
}) => void;

type BettingClosedCallback = (data: {
  roundNumber: number;
}) => void;

let state: RoundState = {
  roundNumber: 0,
  roundId: null,
  multipliers: freshMultipliers(),
  txCounts: freshCounts(),
  volumes: freshCounts(),
  startedAt: 0,
  endsAt: 0,
  bettingEndsAt: 0,
  contractBettingOpen: true,
  contractCanDistribute: false,
  distributing: false,
};

let pollInterval: ReturnType<typeof setInterval> | null = null;
let contractRoundDurationMs = 0;
let contractBettingDurationMs = 0;

let onRoundStart: RoundStartCallback | null = null;
let onRoundEnd: RoundEndCallback | null = null;
let onBettingClosed: BettingClosedCallback | null = null;

function freshCounts(): Record<ZoneId, number> {
  return Object.fromEntries(ALL_ZONES.map((z) => [z, 0])) as Record<ZoneId, number>;
}

function freshMultipliers(): Record<ZoneId, number> {
  return Object.fromEntries(ALL_ZONES.map((z) => [z, 1.0])) as Record<ZoneId, number>;
}

export function setRoundCallbacks(
  onStart: RoundStartCallback,
  onEnd: RoundEndCallback,
  onBettingClose?: BettingClosedCallback
) {
  onRoundStart = onStart;
  onRoundEnd = onEnd;
  onBettingClosed = onBettingClose ?? null;
}

export function getCurrentRoundState() {
  return {
    roundNumber: state.roundNumber,
    multipliers: { ...state.multipliers },
    endsAt: state.endsAt,
    bettingEndsAt: state.bettingEndsAt,
  };
}

export function isBettingCurrentlyOpen(): boolean {
  return Date.now() < state.bettingEndsAt;
}

export function getRoundTimeRemaining(): number {
  return Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
}

export function getBettingTimeRemaining(): number {
  return Math.max(0, Math.ceil((state.bettingEndsAt - Date.now()) / 1000));
}

async function calculateMultipliers(): Promise<Record<ZoneId, number>> {
  const supabase = getSupabase();

  const { data: recentRounds } = await supabase
    .from("rounds")
    .select("id")
    .order("round_number", { ascending: false })
    .limit(LOOKBACK_ROUNDS);

  if (!recentRounds || recentRounds.length === 0) {
    return freshMultipliers();
  }

  const roundIds = recentRounds.map((r) => r.id);

  const { data: stats } = await supabase
    .from("round_zone_stats")
    .select("zone_id, tx_count")
    .in("round_id", roundIds);

  if (!stats || stats.length === 0) {
    return freshMultipliers();
  }

  const zoneTotals: Record<string, number> = {};
  const zoneCounts: Record<string, number> = {};

  for (const row of stats) {
    zoneTotals[row.zone_id] = (zoneTotals[row.zone_id] || 0) + row.tx_count;
    zoneCounts[row.zone_id] = (zoneCounts[row.zone_id] || 0) + 1;
  }

  const avgPerZone: Record<string, number> = {};
  let totalAvg = 0;

  for (const z of ALL_ZONES) {
    const count = zoneCounts[z] || 1;
    avgPerZone[z] = (zoneTotals[z] || 0) / count;
    totalAvg += avgPerZone[z];
  }

  const target = totalAvg / ALL_ZONES.length;

  if (target === 0) {
    return freshMultipliers();
  }

  const multipliers = {} as Record<ZoneId, number>;
  for (const z of ALL_ZONES) {
    const avg = avgPerZone[z] || 0;
    if (avg === 0) {
      multipliers[z] = MAX_MULTIPLIER;
    } else {
      multipliers[z] = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, target / avg));
    }
    multipliers[z] = Math.round(multipliers[z] * 100) / 100;
  }

  return multipliers;
}

async function readContractState() {
  const { publicClient } = getClients();
  const contractAddress = config.contractAddress;

  const [roundStartTime, roundNumber, bettingOpen, canDistribute, roundDuration, bettingDuration] =
    await Promise.all([
      publicClient.readContract({
        address: contractAddress,
        abi: cheeznadAbi,
        functionName: "roundStartTime",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: cheeznadAbi,
        functionName: "roundNumber",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: cheeznadAbi,
        functionName: "isBettingOpen",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: cheeznadAbi,
        functionName: "canDistribute",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: cheeznadAbi,
        functionName: "ROUND_DURATION",
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: cheeznadAbi,
        functionName: "BETTING_DURATION",
      }),
    ]);

  return {
    roundStartTime: Number(roundStartTime as bigint),
    roundNumber: Number(roundNumber as bigint),
    bettingOpen: bettingOpen as boolean,
    canDistribute: canDistribute as boolean,
    roundDurationSecs: Number(roundDuration as bigint),
    bettingDurationSecs: Number(bettingDuration as bigint),
  };
}

async function handleNewRound(
  contractRoundNumber: number,
  roundStartTimeSecs: number,
  contractState?: { bettingOpen: boolean; canDistribute: boolean },
): Promise<void> {
  const multipliers = await calculateMultipliers();

  const startedAtMs = roundStartTimeSecs * 1000;
  const endsAt = startedAtMs + contractRoundDurationMs;
  const bettingEndsAt = startedAtMs + contractBettingDurationMs;

  let roundId: string | null = null;

  const supabase = getSupabase();

  // Try insert; if it already exists, look it up instead
  const { data: roundRow, error: roundError } = await supabase
    .from("rounds")
    .insert({
      round_number: contractRoundNumber,
      started_at: new Date(startedAtMs).toISOString(),
      total_classified_txns: 0,
    })
    .select("id")
    .single();

  if (roundError || !roundRow) {
    console.warn("[rounds] insert failed (likely duplicate), looking up existing:", roundError?.message);
    const { data: existing } = await supabase
      .from("rounds")
      .select("id")
      .eq("round_number", contractRoundNumber)
      .single();
    roundId = existing?.id ?? null;
  } else {
    roundId = roundRow.id;

    const zoneRows = ALL_ZONES.map((z) => ({
      round_id: roundRow.id,
      zone_id: z,
      tx_count: 0,
      volume: 0,
      multiplier: multipliers[z],
      weighted_score: 0,
    }));

    const { error: statsError } = await supabase
      .from("round_zone_stats")
      .insert(zoneRows);

    if (statsError) {
      console.error("[rounds] failed to insert zone stats:", statsError);
    }
  }

  const bettingOpen = contractState?.bettingOpen ?? (Date.now() < bettingEndsAt);
  const canDistribute = contractState?.canDistribute ?? false;

  state = {
    roundNumber: contractRoundNumber,
    roundId,
    multipliers,
    txCounts: freshCounts(),
    volumes: freshCounts(),
    startedAt: startedAtMs,
    endsAt,
    bettingEndsAt,
    contractBettingOpen: bettingOpen,
    contractCanDistribute: canDistribute,
    distributing: false,
  };

  console.log(
    `[rounds] round #${contractRoundNumber} started (contract) | betting: ${Math.round(contractBettingDurationMs / 1000)}s | round: ${Math.round(contractRoundDurationMs / 1000)}s | bettingOpen: ${bettingOpen} | canDistribute: ${canDistribute} | multipliers: ${ALL_ZONES.map((z) => `${z.slice(0, 3)}=${multipliers[z]}x`).join(" ")}`
  );

  onRoundStart?.({
    roundNumber: contractRoundNumber,
    multipliers,
    endsAt,
    bettingEndsAt,
  });
}

async function endRound(): Promise<void> {
  const scores: Record<ZoneId, ZoneScore> = {} as Record<ZoneId, ZoneScore>;
  let maxScore = -1;
  let winner: ZoneId = "pepperoni";
  let totalClassified = 0;

  for (const z of ALL_ZONES) {
    const txCount = state.txCounts[z];
    const multiplier = state.multipliers[z];
    const weightedScore = Math.round(txCount * multiplier * 100) / 100;
    totalClassified += txCount;

    scores[z] = { txCount, multiplier, weightedScore };

    if (weightedScore > maxScore || (weightedScore === maxScore && Math.random() > 0.5)) {
      maxScore = weightedScore;
      winner = z;
    }
  }

  const supabase = getSupabase();

  if (state.roundId) {
    await supabase
      .from("rounds")
      .update({
        ended_at: new Date().toISOString(),
        winner_zone: winner,
        total_classified_txns: totalClassified,
      })
      .eq("id", state.roundId);

    for (const z of ALL_ZONES) {
      await supabase
        .from("round_zone_stats")
        .update({
          tx_count: scores[z].txCount,
          volume: state.volumes[z],
          weighted_score: scores[z].weightedScore,
        })
        .eq("round_id", state.roundId)
        .eq("zone_id", z);
    }
  }

  console.log(
    `[rounds] round #${state.roundNumber} ended | winner: ${winner} | scores: ${ALL_ZONES.map((z) => `${z.slice(0, 3)}=${scores[z].weightedScore}`).join(" ")}`
  );

  onRoundEnd?.({
    roundNumber: state.roundNumber,
    winner,
    scores,
  });

  state.distributing = true;

  try {
    await distributeWinnings(winner);
    console.log("[rounds] distribute succeeded — waiting for contract to advance round");
  } catch (err) {
    console.error("[distributor] failed:", err);
    // Reset so the next poll cycle can retry
    state.distributing = false;
    state.contractCanDistribute = false;
  }
}

async function pollContract(): Promise<void> {
  try {
    const contract = await readContractState();

    contractRoundDurationMs = contract.roundDurationSecs * 1000;
    contractBettingDurationMs = contract.bettingDurationSecs * 1000;

    const startedAtMs = contract.roundStartTime * 1000;
    const endsAt = startedAtMs + contractRoundDurationMs;
    const bettingEndsAt = startedAtMs + contractBettingDurationMs;

    // Keep timestamps in sync with contract
    state.endsAt = endsAt;
    state.bettingEndsAt = bettingEndsAt;
    state.startedAt = startedAtMs;

    // Detect new round (contract roundNumber increased)
    if (contract.roundNumber > state.roundNumber) {
      if (state.distributing) {
        state.distributing = false;
      }
      await handleNewRound(contract.roundNumber, contract.roundStartTime, {
        bettingOpen: contract.bettingOpen,
        canDistribute: contract.canDistribute,
      });
      return;
    }

    // Detect betting closed transition
    if (state.contractBettingOpen && !contract.bettingOpen) {
      state.contractBettingOpen = false;
      console.log(`[rounds] round #${state.roundNumber} betting closed (contract)`);
      onBettingClosed?.({ roundNumber: state.roundNumber });
    }

    // Detect round complete — time to distribute
    if (!state.contractCanDistribute && contract.canDistribute && !state.distributing) {
      state.contractCanDistribute = true;
      await endRound();
    }
  } catch (err) {
    console.error("[rounds] contract poll error:", err);
  }
}

export async function startRound(): Promise<void> {
  // Initial read to get contract constants and current state
  const contract = await readContractState();

  contractRoundDurationMs = contract.roundDurationSecs * 1000;
  contractBettingDurationMs = contract.bettingDurationSecs * 1000;

  console.log(
    `[rounds] contract durations — betting: ${contract.bettingDurationSecs}s | round: ${contract.roundDurationSecs}s`
  );
  console.log(
    `[rounds] contract state — round: ${contract.roundNumber} | bettingOpen: ${contract.bettingOpen} | canDistribute: ${contract.canDistribute} | roundStartTime: ${contract.roundStartTime}`
  );

  if (contract.roundNumber > 0) {
    await handleNewRound(contract.roundNumber, contract.roundStartTime, {
      bettingOpen: contract.bettingOpen,
      canDistribute: contract.canDistribute,
    });

    // If round is already complete at boot, distribute immediately
    if (contract.canDistribute) {
      console.log("[rounds] round already complete at boot — triggering distribution");
      await endRound();
    }
  }

  // Start the polling loop
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => pollContract(), POLL_INTERVAL_MS);
  console.log(`[rounds] contract polling started (every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function accumulateTx(zoneId: ZoneId, volume: number): void {
  state.txCounts[zoneId]++;
  state.volumes[zoneId] += volume;
}

export async function getPastWinners(limit = 10): Promise<
  { roundNumber: number; winnerZone: ZoneId; endedAt: string }[]
> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("rounds")
    .select("round_number, winner_zone, ended_at")
    .not("winner_zone", "is", null)
    .order("round_number", { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((r) => ({
    roundNumber: r.round_number,
    winnerZone: r.winner_zone as ZoneId,
    endedAt: r.ended_at,
  }));
}

export function stopRounds(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
