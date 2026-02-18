import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import type { ZoneId } from "./types.js";

const CHEEZNAD_ADDRESS = "0x0606a92d01845B04A1C4F5cf788247FB4A14fd58" as const;

const POLL_INTERVAL_MS = 60_000;

const ZONE_TO_ENUM: Record<ZoneId, number> = {
  pepperoni: 0,
  mushroom: 1,
  pineapple: 2,
  olive: 3,
  anchovy: 4,
};

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

const cheeznadAbi = [
  {
    name: "getCurrentRoundPhase",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "canDistribute",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "distribute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_winningZone",
        internalType: "enum Cheeznad.Zone",
        type: "uint8",
      },
    ],
    outputs: [],
  },
] as const;

function getClients() {
  const key = config.oraclePrivateKey;
  if (!key) {
    throw new Error("[distributor] ORACLE_PRIVATE_KEY is not set");
  }

  const account = privateKeyToAccount(key as `0x${string}`);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  return { publicClient, walletClient, account };
}

export async function distributeWinnings(winner: ZoneId): Promise<void> {
  const zoneEnum = ZONE_TO_ENUM[winner];
  console.log(
    `[distributor] queued distribution for winner: ${winner} (enum=${zoneEnum})`
  );

  const { publicClient, walletClient, account } = getClients();

  async function tryDistribute(): Promise<boolean> {
    const phase = await publicClient.readContract({
      address: CHEEZNAD_ADDRESS,
      abi: cheeznadAbi,
      functionName: "getCurrentRoundPhase",
    });

    console.log(`[distributor] current contract phase: "${phase}"`);

    if (phase !== "COMPLETE") {
      return false;
    }

    console.log(
      `[distributor] phase is COMPLETE — calling distribute(${zoneEnum}) for ${winner}`
    );

    const txHash = await walletClient.writeContract({
      address: CHEEZNAD_ADDRESS,
      abi: cheeznadAbi,
      functionName: "distribute",
      args: [zoneEnum],
    });

    console.log(`[distributor] distribute tx sent: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    console.log(
      `[distributor] distribute confirmed in block ${receipt.blockNumber} (status: ${receipt.status})`
    );

    return true;
  }

  // Try immediately first
  try {
    const done = await tryDistribute();
    if (done) return;
  } catch (err) {
    console.error("[distributor] initial attempt failed:", err);
  }

  // Poll every 60 seconds until the contract is ready
  return new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      try {
        const done = await tryDistribute();
        if (done) {
          clearInterval(interval);
          resolve();
        }
      } catch (err) {
        console.error("[distributor] poll attempt failed:", err);
        clearInterval(interval);
        resolve();
      }
    }, POLL_INTERVAL_MS);
  });
}
