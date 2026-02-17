import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { getCurrentRoundState } from "./rounds.js";
import type {
  ClassifiedTransaction,
  ClassifiedTransactionMessage,
  RoundStartMessage,
  RoundEndMessage,
  ZoneId,
  ZoneScore,
} from "./types.js";

let wss: WebSocketServer | null = null;

export function startServer(): WebSocketServer {
  wss = new WebSocketServer({ port: config.wsPort });

  wss.on("listening", () => {
    console.log(`[server] WebSocket server listening on ws://localhost:${config.wsPort}`);
  });

  wss.on("connection", (ws, req) => {
    const clientAddr = req.socket.remoteAddress ?? "unknown";
    console.log(`[server] client connected: ${clientAddr}`);

    ws.send(JSON.stringify({ type: "connected", message: "Monad transaction feed active" }));

    const roundState = getCurrentRoundState();
    if (roundState.roundNumber > 0) {
      const msg: RoundStartMessage = {
        type: "round_start",
        data: {
          roundNumber: roundState.roundNumber,
          multipliers: roundState.multipliers,
          endsAt: roundState.endsAt,
        },
      };
      ws.send(JSON.stringify(msg));
    }

    ws.on("close", () => {
      console.log(`[server] client disconnected: ${clientAddr}`);
    });

    ws.on("error", (err) => {
      console.error(`[server] client error (${clientAddr}):`, err.message);
    });
  });

  wss.on("error", (err) => {
    console.error("[server] WebSocket server error:", err);
  });

  return wss;
}

export function broadcast(transactions: ClassifiedTransaction[]): void {
  if (!wss) return;

  const readyClients: WebSocket[] = [];
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      readyClients.push(client);
    }
  });

  if (readyClients.length === 0) return;

  for (const tx of transactions) {
    const message: ClassifiedTransactionMessage = {
      type: "transaction",
      data: {
        id: tx.id,
        zoneId: tx.zoneId,
        txHash: tx.txHash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        blockNumber: Number(tx.blockNumber),
        timestamp: tx.timestamp,
        contractName: tx.contractName,
      },
    };

    const payload = JSON.stringify(message);

    for (const client of readyClients) {
      client.send(payload);
    }
  }
}

export function broadcastRoundStart(data: {
  roundNumber: number;
  multipliers: Record<ZoneId, number>;
  endsAt: number;
}): void {
  if (!wss) return;

  const msg: RoundStartMessage = { type: "round_start", data };
  const payload = JSON.stringify(msg);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function broadcastRoundEnd(data: {
  roundNumber: number;
  winner: ZoneId;
  scores: Record<ZoneId, ZoneScore>;
}): void {
  if (!wss) return;

  const msg: RoundEndMessage = { type: "round_end", data };
  const payload = JSON.stringify(msg);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function getClientCount(): number {
  if (!wss) return 0;
  let count = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) count++;
  });
  return count;
}
