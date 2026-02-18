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
  "0x570afd8CE31C90728B0e8926C6922dBc8DefFF70" as const;

const FUNDER_PRIVATE_KEY =
  "0xc3760082008a49570c2f4270dcf0fb0f648bf8606edc3116245109bbcd9ab58a" as Hex;

const NUM_ACCOUNTS = 10;
const SEED_AMOUNT = "0.5"; // MON sent to each test account
const BET_AMOUNT = "0.1"; // MON bet per account

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
      http: ["https://testnet-rpc.monad.xyz"],
    },
  },
  testnet: true,
});

// ─── ABI (only the deposit function we need) ────────────────────────────────

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Step 1: Generate or load accounts ───────────────────────────────────────

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

// ─── Step 2: Fund accounts from seed wallet ──────────────────────────────────

async function fundAccounts(accounts: TestAccount[]) {
  const funder = privateKeyToAccount(FUNDER_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account: funder,
    chain: monadTestnet,
    transport: http(),
  });

  const funderBalance = await publicClient.getBalance({
    address: funder.address,
  });
  console.log(`\n💰  Funder : ${funder.address}`);
  console.log(`    Balance: ${formatEther(funderBalance)} MON`);

  const totalNeeded = parseEther(SEED_AMOUNT) * BigInt(NUM_ACCOUNTS);
  if (funderBalance < totalNeeded) {
    throw new Error(
      `Insufficient balance. Need ${formatEther(totalNeeded)} MON, have ${formatEther(funderBalance)} MON`
    );
  }

  console.log(
    `\n🏦  Funding ${NUM_ACCOUNTS} accounts with ${SEED_AMOUNT} MON each ...\n`
  );

  for (let i = 0; i < accounts.length; i++) {
    const addr = accounts[i].address as `0x${string}`;

    const balance = await publicClient.getBalance({ address: addr });
    if (balance >= parseEther(SEED_AMOUNT)) {
      console.log(
        `     [${i + 1}/${NUM_ACCOUNTS}] ${addr}  — already has ${formatEther(balance)} MON, skipping`
      );
      continue;
    }

    const hash = await walletClient.sendTransaction({
      chain: monadTestnet,
      to: addr,
      value: parseEther(SEED_AMOUNT),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(
      `     [${i + 1}/${NUM_ACCOUNTS}] ${addr}  — funded (tx: ${receipt.transactionHash})`
    );
  }

  console.log("\n✅  All accounts funded!");
}

// ─── Step 3: Poll backend until betting is open ──────────────────────────────

interface RoundResponse {
  roundNumber: number;
  isBettingOpen: boolean;
  roundTimeRemaining: number;
  bettingTimeRemaining: number;
  endsAt: number;
  bettingEndsAt: number;
}

async function fetchRoundStatus(): Promise<RoundResponse> {
  const url = `${BACKEND_URL}/api/round`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Backend ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<RoundResponse>;
}

async function waitForBetting(): Promise<RoundResponse> {
  console.log("\n⏳  Checking backend for betting status ...");

  let round = await fetchRoundStatus();
  console.log(
    `     Round #${round.roundNumber}  |  Betting open: ${round.isBettingOpen}  |  Betting remaining: ${round.bettingTimeRemaining}s  |  Round remaining: ${round.roundTimeRemaining}s`
  );

  if (round.isBettingOpen) {
    console.log("✅  Betting is OPEN — proceeding to place bets.");
    return round;
  }

  console.log("⏸️   Betting is closed. Polling every 5 s until it opens ...\n");
  while (!round.isBettingOpen) {
    await sleep(5000);
    round = await fetchRoundStatus();
    console.log(
      `     Round #${round.roundNumber}  |  Betting open: ${round.isBettingOpen}  |  Round remaining: ${round.roundTimeRemaining}s`
    );
  }

  console.log("\n✅  Betting is now OPEN!");
  return round;
}

// ─── Step 4: Place bets ──────────────────────────────────────────────────────

async function placeBets(accounts: TestAccount[]) {
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  console.log(
    `\n🎰  Placing ${BET_AMOUNT} MON bets from ${accounts.length} accounts ...\n`
  );

  for (let i = 0; i < accounts.length; i++) {
    const { privateKey, address } = accounts[i];
    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(),
    });

    const zoneIndex = i % ZONE_NAMES.length;

    const hash = await walletClient.writeContract({
      chain: monadTestnet,
      address: CONTRACT_ADDRESS,
      abi: cheeznadAbi,
      functionName: "deposit",
      args: [zoneIndex],
      value: parseEther(BET_AMOUNT),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(
      `     [${i + 1}/${accounts.length}] ${address}  → ${ZONE_NAMES[zoneIndex].padEnd(10)}  tx: ${receipt.transactionHash}`
    );
  }

  console.log("\n✅  All bets placed!");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Cheeznad  ·  Multi-Account Betting Test   ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // 1. Generate (or reload) 10 test wallets
  const accounts = getOrCreateAccounts();

  // 2. Fund them from the seed wallet
  await fundAccounts(accounts);

  // 3. Wait until the backend says betting is open
  await waitForBetting();

  // 4. Fire bets
  await placeBets(accounts);

  console.log("\n🏁  Test complete.\n");
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err);
  process.exit(1);
});
