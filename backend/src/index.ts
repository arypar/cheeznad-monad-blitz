import { config } from "./config.js";
import { createMonadClient, watchNewBlocks } from "./monitor.js";
import { classifyBlock } from "./classifier.js";
import { startServer, broadcast, broadcastRoundStart, broadcastRoundEnd, getClientCount } from "./server.js";
import { initRegistry, getRegistrySize } from "./registry.js";
import { initSupabase } from "./supabase.js";
import { setRoundCallbacks, startRound, accumulateTx, stopRounds } from "./rounds.js";
import type { ZoneId } from "./types.js";

const ZONE_LABELS: Record<ZoneId, string> = {
  pepperoni: "DEX",
  mushroom: "LEND",
  pineapple: "MEME",
  olive: "INFRA",
  anchovy: "GAME",
};

const ALL_ZONES: ZoneId[] = ["pepperoni", "mushroom", "pineapple", "olive", "anchovy"];

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

const ZONE_COLORS: Record<ZoneId, string> = {
  pepperoni: "\x1b[31m",       // red
  mushroom: "\x1b[35m",        // magenta
  pineapple: "\x1b[33m",       // yellow
  olive: "\x1b[36m",           // cyan
  anchovy: "\x1b[38;5;208m",   // orange
};

function pad(s: string | number, len: number): string {
  return String(s).padStart(len);
}

function stripAnsi(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function renderZoneBar(byZone: Record<ZoneId, number>, classified: number, width: number): string {
  if (classified === 0) return DIM + "░".repeat(width) + RESET;
  let bar = "";
  let used = 0;
  for (const z of ALL_ZONES) {
    if (byZone[z] > 0) {
      const chars = Math.max(1, Math.round((byZone[z] / classified) * width));
      bar += ZONE_COLORS[z] + "█".repeat(chars);
      used += chars;
    }
  }
  if (used < width) bar += DIM + "░".repeat(width - used);
  return bar + RESET;
}

const SEP = `${DIM}  ${"─".repeat(90)}${RESET}`;

async function main() {
  console.log("");
  console.log(`${BOLD}${MAGENTA}  ╔══════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${MAGENTA}  ║   MONAD TRANSACTION CLASSIFIER      ║${RESET}`);
  console.log(`${BOLD}${MAGENTA}  ╚══════════════════════════════════════╝${RESET}`);
  console.log("");

  await initRegistry();

  initSupabase();
  console.log(`  ${DIM}Supabase${RESET}  connected`);

  setRoundCallbacks(
    (data) => broadcastRoundStart(data),
    (data) => broadcastRoundEnd(data),
  );

  console.log("");
  console.log(`  ${DIM}RPC${RESET}       ${config.monadRpcWs}`);
  console.log(`  ${DIM}WS Port${RESET}   ${config.wsPort}`);
  console.log(`  ${DIM}Registry${RESET}  ${getRegistrySize()} addresses across 5 zones`);
  console.log(`  ${DIM}Round${RESET}     ${config.roundDurationMs / 1000}s per round`);
  console.log(`  ${DIM}Zones${RESET}     ${ALL_ZONES.map(z => ZONE_COLORS[z] + ZONE_LABELS[z] + RESET).join(DIM + " · " + RESET)}`);
  console.log("");
  console.log(SEP);
  console.log(`${DIM}  BLOCK          TXS  XFER  OTHER  MATCH  ZONES${" ".repeat(25)}DISTRIBUTION${RESET}`);
  console.log(SEP);

  const wss = startServer();
  const client = createMonadClient();

  await startRound();

  let blocksProcessed = 0;
  let totalClassified = 0;
  let totalTxns = 0;
  let totalTransfers = 0;
  let totalOther = 0;

  const unwatch = watchNewBlocks(client, (block) => {
    const { transactions, stats } = classifyBlock(block);
    blocksProcessed++;
    totalClassified += stats.classifiedTxns;
    totalTxns += stats.totalTxns;
    totalTransfers += stats.nativeTransfers;
    totalOther += stats.unclassifiedCalls + stats.contractCreations;

    for (const tx of transactions) {
      accumulateTx(tx.zoneId, parseFloat(tx.value) || 0);
    }

    const clients = getClientCount();

    const activeZones = ALL_ZONES
      .filter((z) => stats.byZone[z] > 0)
      .map((z) => `${ZONE_COLORS[z]}${ZONE_LABELS[z]}${DIM}:${RESET}${stats.byZone[z]}`)
      .join("  ");

    const bar = renderZoneBar(stats.byZone, stats.classifiedTxns, 16);

    const blockStr = `${DIM}#${RESET}${pad(stats.blockNumber.toString(), 9)}`;
    const txStr = pad(stats.totalTxns, 5);

    const xferStr = stats.nativeTransfers > 0
      ? `${YELLOW}${pad(stats.nativeTransfers, 4)}${RESET}`
      : `${DIM}${pad(0, 4)}${RESET}`;

    const otherCount = stats.unclassifiedCalls + stats.contractCreations;
    const otherStr = `${DIM}${pad(otherCount, 5)}${RESET}`;

    const matchStr = stats.classifiedTxns > 0
      ? `${GREEN}${pad(stats.classifiedTxns, 5)}${RESET}`
      : `${DIM}${pad(0, 5)}${RESET}`;

    const zonesCol = activeZones || `${DIM}—${RESET}`;
    const zonesPadded = zonesCol + " ".repeat(Math.max(1, 30 - (stripAnsi(zonesCol) || 1)));

    const clientStr = clients > 0 ? `  ${CYAN}◉ ${clients}${RESET}` : "";

    console.log(
      `  ${blockStr}  ${txStr}  ${xferStr}  ${otherStr}  ${matchStr}  ${zonesPadded}${bar}${clientStr}`
    );

    if (transactions.length > 0) {
      broadcast(transactions);
    }
  });

  function shutdown() {
    console.log("");
    console.log(SEP);
    stopRounds();
    const avgRate = totalTxns > 0 ? ((totalClassified / totalTxns) * 100).toFixed(1) : "0";
    console.log(
      `  ${BOLD}Session:${RESET} ${blocksProcessed} blocks | ` +
      `${totalTxns} total | ` +
      `${YELLOW}${totalTransfers}${RESET} transfers | ` +
      `${DIM}${totalOther}${RESET} other | ` +
      `${GREEN}${totalClassified}${RESET} classified (${avgRate}%)`
    );
    console.log("");
    unwatch();
    wss.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
