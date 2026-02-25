import "dotenv/config";

export const config = {
  monadRpcWs: process.env.MONAD_RPC_WS || "wss://rpc.monad.xyz",
  monadRpcHttp: process.env.MONAD_RPC_HTTP || "https://testnet-rpc.monad.xyz",
  wsPort: parseInt(process.env.WS_PORT || process.env.PORT || "8080", 10),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || "",
  oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY || "",
  contractAddress: (process.env.CONTRACT_ADDRESS || "0xf1bEa445850626BD412E275ab4D98E60eDBF9755") as `0x${string}`,
} as const;
