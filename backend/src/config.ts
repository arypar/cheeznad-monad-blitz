import "dotenv/config";

export const config = {
  monadRpcWs: process.env.MONAD_RPC_WS || "wss://rpc.monad.xyz",
  wsPort: parseInt(process.env.WS_PORT || process.env.PORT || "8080", 10),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || "",
  roundDurationMs: parseInt(process.env.ROUND_DURATION_MS || "60000", 10),
} as const;
