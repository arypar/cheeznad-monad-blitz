import { config } from "./config.js";
import { getSupabase } from "./supabase.js";
import { distributeWinnings } from "./distributor.js";
import type { ZoneId, ZoneScore } from "./types.js";

const ALL_ZONES: ZoneId[] = ["pepperoni", "mushroom", "pineapple", "olive", "anchovy"];
const LOOKBACK_ROUNDS = 10;
const MIN_MULTIPLIER = 0.1;
const MAX_MULTIPLIER = 10.0;

interface RoundState {
  roundNumber: number;
  roundId: string | null;
  multipliers: Record<ZoneId, number>;
  txCounts: Record<ZoneId, number>;
  volumes: Record<ZoneId, number>;
  startedAt: number;
  endsAt: number;
  bettingEndsAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  bettingTimer: ReturnType<typeof setTimeout> | null;
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
  timer: null,
  bettingTimer: null,
};

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

async function getNextRoundNumber(): Promise<number> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("rounds")
    .select("round_number")
    .order("round_number", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return data[0].round_number + 1;
  }
  return 1;
}

export async function startRound(): Promise<void> {
  const multipliers = await calculateMultipliers();
  const roundNumber = await getNextRoundNumber();
  const now = Date.now();
  const endsAt = now + config.roundDurationMs;
  const bettingEndsAt = now + config.bettingDurationMs;

  const supabase = getSupabase();

  const { data: roundRow, error: roundError } = await supabase
    .from("rounds")
    .insert({
      round_number: roundNumber,
      started_at: new Date(now).toISOString(),
      total_classified_txns: 0,
    })
    .select("id")
    .single();

  if (roundError || !roundRow) {
    console.error("[rounds] failed to insert round:", roundError);
    return;
  }

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

  state = {
    roundNumber,
    roundId: roundRow.id,
    multipliers,
    txCounts: freshCounts(),
    volumes: freshCounts(),
    startedAt: now,
    endsAt,
    bettingEndsAt,
    timer: setTimeout(() => endRound(), config.roundDurationMs),
    bettingTimer: setTimeout(() => closeBetting(), config.bettingDurationMs),
  };

  console.log(
    `[rounds] round #${roundNumber} started | betting: ${config.bettingDurationMs / 1000}s | round: ${config.roundDurationMs / 1000}s | multipliers: ${ALL_ZONES.map((z) => `${z.slice(0, 3)}=${multipliers[z]}x`).join(" ")}`
  );

  onRoundStart?.({
    roundNumber,
    multipliers,
    endsAt,
    bettingEndsAt,
  });
}

export function accumulateTx(zoneId: ZoneId, volume: number): void {
  state.txCounts[zoneId]++;
  state.volumes[zoneId] += volume;
}

function closeBetting(): void {
  if (state.bettingTimer) {
    clearTimeout(state.bettingTimer);
    state.bettingTimer = null;
  }
  console.log(`[rounds] round #${state.roundNumber} betting closed`);
  onBettingClosed?.({ roundNumber: state.roundNumber });
}

async function endRound(): Promise<void> {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.bettingTimer) {
    clearTimeout(state.bettingTimer);
    state.bettingTimer = null;
  }

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

  distributeWinnings(winner).catch((err) =>
    console.error("[distributor] failed:", err)
  );

  setTimeout(() => startRound(), 4000);
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
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.bettingTimer) {
    clearTimeout(state.bettingTimer);
    state.bettingTimer = null;
  }
}
