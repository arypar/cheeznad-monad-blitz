// @ts-nocheck
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  defineChain,
  type Hex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import * as fs from "fs";
import * as path from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const BACKEND_URL =
  "https://monad-blitz-denver-production.up.railway.app";
const CONTRACT_ADDRESS =
  "0xf1bEa445850626BD412E275ab4D98E60eDBF9755" as const;

const FUNDER_PRIVATE_KEY =
  "0xc3760082008a49570c2f4270dcf0fb0f648bf8606edc3116245109bbcd9ab58a" as Hex;

const NUM_ACCOUNTS = 10;
const FUND_AMOUNT = "2";       // MON sent to each account (only when broke)
const BET_AMOUNT = "0.01";     // MON bet per account per round
const MIN_BALANCE_TO_BET = parseEther("0.02"); // refund threshold — need enough for bet + gas
const POLL_INTERVAL_MS = 5000;

const ZONE_NAMES = [
  "Pepperoni",
  "Mushroom",
  "Pineapple",
  "Olives",
  "Anchovies",
] as const;

const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");

// ─── Chain ───────────────────────────────────────────────────────────────────

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://monad-blitz-denver-production.up.railway.app/api/rpc"],
    },
  },
  testnet: true,
});

// ─── ABI ─────────────────────────────────────────────────────────────────────

const cheeznadAbi = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "_zone", type: "uint8" }],
    outputs: [],
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface TestAccount {
  privateKey: Hex;
  address: string;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === MAX_RETRIES) {
        console.error(`     ✗ ${label} — failed after ${MAX_RETRIES} attempts`);
        throw err;
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `     ⚠ ${label} — attempt ${attempt} failed: ${err.shortMessage ?? err.message}. Retrying in ${delay}ms ...`
      );
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

function randomZone(): number {
  return Math.floor(Math.random() * ZONE_NAMES.length);
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

// ─── Accounts ────────────────────────────────────────────────────────────────

function getOrCreateAccounts(): TestAccount[] {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    console.log("📂  Loading existing accounts from accounts.json ...");
    const data: TestAccount[] = JSON.parse(
      fs.readFileSync(ACCOUNTS_FILE, "utf-8")
    );
    data.forEach((a, i) =>
      console.log(`     Account ${i + 1}: ${a.address}`)
    );
    return data;
  }

  console.log(`🔑  Generating ${NUM_ACCOUNTS} fresh accounts ...`);
  const accounts: TestAccount[] = [];

  for (let i = 0; i < NUM_ACCOUNTS; i++) {
    const pk = generatePrivateKey();
    const acct = privateKeyToAccount(pk);
    accounts.push({ privateKey: pk, address: acct.address });
    console.log(`     Account ${i + 1}: ${acct.address}`);
  }

  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  console.log(`\n✅  Saved ${NUM_ACCOUNTS} private keys → test/accounts.json`);
  return accounts;
}

// ─── Funding ─────────────────────────────────────────────────────────────────

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

async function fundAccountsIfNeeded(accounts: TestAccount[]): Promise<void> {
  const funder = privateKeyToAccount(FUNDER_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account: funder,
    chain: monadTestnet,
    transport: http(),
  });

  const needsFunding: number[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const addr = accounts[i].address as `0x${string}`;
    const balance = await withRetry(`getBalance(${i + 1})`, () =>
      publicClient.getBalance({ address: addr })
    );
    if (balance < MIN_BALANCE_TO_BET) {
      console.log(
        `     [${i + 1}] ${addr}  — ${formatEther(balance)} MON (needs funding)`
      );
      needsFunding.push(i);
    }
  }

  if (needsFunding.length === 0) {
    return;
  }

  const funderBalance = await withRetry("getBalance(funder)", () =>
    publicClient.getBalance({ address: funder.address })
  );
  console.log(`\n💰  Funder balance: ${formatEther(funderBalance)} MON`);

  const totalNeeded = parseEther(FUND_AMOUNT) * BigInt(needsFunding.length);
  if (funderBalance < totalNeeded) {
    console.warn(
      `     ⚠ Funder only has ${formatEther(funderBalance)} MON, need ${formatEther(totalNeeded)} for ${needsFunding.length} accounts. Funding what we can.`
    );
  }

  console.log(
    `\n🏦  Funding ${needsFunding.length} accounts with ${FUND_AMOUNT} MON each ...\n`
  );

  for (const i of needsFunding) {
    const addr = accounts[i].address as `0x${string}`;
    try {
      const hash = await withRetry(`fund(${i + 1})`, () =>
        walletClient.sendTransaction({
          chain: monadTestnet,
          to: addr,
          value: parseEther(FUND_AMOUNT),
        })
      );
      const receipt = await withRetry(`receipt(fund ${i + 1})`, () =>
        publicClient.waitForTransactionReceipt({ hash })
      );
      console.log(
        `     [${i + 1}] ${addr}  — funded ${FUND_AMOUNT} MON (tx: ${receipt.transactionHash.slice(0, 12)}...)`
      );
    } catch (err: any) {
      console.error(`     ✗ Failed to fund account ${i + 1}: ${err.message}`);
    }
  }

  console.log("✅  Funding complete.\n");
}

// ─── Round polling ───────────────────────────────────────────────────────────

interface RoundResponse {
  roundNumber: number;
  isBettingOpen: boolean;
  roundTimeRemaining: number;
  bettingTimeRemaining: number;
  endsAt: number;
  bettingEndsAt: number;
}

async function fetchRoundStatus(): Promise<RoundResponse> {
  return withRetry("fetchRoundStatus", async () => {
    const res = await fetch(`${BACKEND_URL}/api/round`);
    if (!res.ok) {
      throw new Error(`Backend ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<RoundResponse>;
  });
}

async function waitForBettingOpen(): Promise<RoundResponse> {
  let round = await fetchRoundStatus();

  if (round.isBettingOpen) {
    console.log(
      `[${timestamp()}] ✅  Round #${round.roundNumber} — betting OPEN (${round.bettingTimeRemaining}s left)`
    );
    return round;
  }

  process.stdout.write(
    `[${timestamp()}] ⏳  Round #${round.roundNumber} — waiting for betting to open (${round.roundTimeRemaining}s left) `
  );

  while (!round.isBettingOpen) {
    await sleep(POLL_INTERVAL_MS);
    round = await fetchRoundStatus();
    process.stdout.write(".");
  }

  console.log(
    `\n[${timestamp()}] ✅  Round #${round.roundNumber} — betting OPEN!`
  );
  return round;
}

// ─── Place bets ──────────────────────────────────────────────────────────────

async function placeBets(accounts: TestAccount[]): Promise<void> {
  console.log(
    `\n🎰  Placing ${BET_AMOUNT} MON bets from ${accounts.length} accounts ...\n`
  );

  let successCount = 0;

  for (let i = 0; i < accounts.length; i++) {
    const { privateKey, address } = accounts[i];

    const balance = await withRetry(`getBalance(${i + 1})`, () =>
      publicClient.getBalance({ address: address as `0x${string}` })
    );
    if (balance < MIN_BALANCE_TO_BET) {
      console.log(
        `     [${i + 1}] ${address}  — skipped, only ${formatEther(balance)} MON`
      );
      continue;
    }

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(),
    });

    const zone = randomZone();

    try {
      const hash = await withRetry(`bet(${i + 1})`, () =>
        walletClient.writeContract({
          chain: monadTestnet,
          address: CONTRACT_ADDRESS,
          abi: cheeznadAbi,
          functionName: "deposit",
          args: [zone],
          value: parseEther(BET_AMOUNT),
        })
      );

      const receipt = await withRetry(`receipt(bet ${i + 1})`, () =>
        publicClient.waitForTransactionReceipt({ hash })
      );
      console.log(
        `     [${i + 1}] ${address}  → ${ZONE_NAMES[zone].padEnd(10)}  tx: ${receipt.transactionHash.slice(0, 12)}...`
      );
      successCount++;
    } catch (err: any) {
      console.error(
        `     [${i + 1}] ${address}  — bet failed: ${err.shortMessage ?? err.message}`
      );
    }
  }

  console.log(`\n✅  ${successCount}/${accounts.length} bets placed.`);
}

// ─── Main loop ───────────────────────────────────────────────────────────────

let roundCounter = 0;

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Cheeznad  ·  Continuous Betting Bot            ║");
  console.log("║   Bet: 0.01 MON  ·  Random zones  ·  10 accts   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const accounts = getOrCreateAccounts();

  // Initial funding — give everyone 2 MON
  console.log("\n🏦  Checking balances & funding accounts that need it ...");
  await fundAccountsIfNeeded(accounts);

  console.log("\n🔄  Entering main loop — Ctrl+C to stop\n");
  console.log("─".repeat(60));

  let lastRoundNumber = -1;

  while (true) {
    try {
      const round = await waitForBettingOpen();

      if (round.roundNumber === lastRoundNumber) {
        // Already bet on this round, wait for it to end
        console.log(
          `[${timestamp()}]    Already bet on round #${round.roundNumber}, waiting ...`
        );
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      lastRoundNumber = round.roundNumber;
      roundCounter++;

      console.log(`\n${"─".repeat(60)}`);
      console.log(
        `[${timestamp()}] 🎲  ROUND #${round.roundNumber}  (session bet #${roundCounter})`
      );
      console.log("─".repeat(60));

      // Check if any accounts need refunding before betting
      await fundAccountsIfNeeded(accounts);

      await placeBets(accounts);

      console.log("─".repeat(60));

      // Wait a bit before polling for next round
      await sleep(POLL_INTERVAL_MS);
    } catch (err: any) {
      console.error(
        `\n[${timestamp()}] ❌  Error in main loop: ${err.message}`
      );
      console.log("     Retrying in 10s ...\n");
      await sleep(10_000);
    }
  }
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err);
  process.exit(1);
});
