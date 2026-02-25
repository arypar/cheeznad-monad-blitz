import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";
import type { ZoneId } from "./types.js";

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

export const cheeznadAbi = [
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
  {
    name: "getZoneTotal",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_zone", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "roundStartTime",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "roundNumber",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isBettingOpen",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "canDistribute",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "ROUND_DURATION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "BETTING_DURATION",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function getClients() {
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
    `[distributor] calling distribute(${zoneEnum}) for winner: ${winner}`
  );

  const { publicClient, walletClient } = getClients();
  const contractAddress = config.contractAddress;

  const txHash = await walletClient.writeContract({
    address: contractAddress,
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
}
