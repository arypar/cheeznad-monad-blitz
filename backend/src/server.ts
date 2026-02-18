import { createServer, IncomingMessage, ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { getCurrentRoundState, getPastWinners, isBettingCurrentlyOpen, getRoundTimeRemaining, getBettingTimeRemaining } from "./rounds.js";
import type {
  ClassifiedTransaction,
  ClassifiedTransactionMessage,
  RoundStartMessage,
  RoundEndMessage,
  BettingClosedMessage,
  PastWinnersMessage,
  ZoneId,
  ZoneScore,
} from "./types.js";

let wss: WebSocketServer | null = null;

function handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/round") {
    const roundState = getCurrentRoundState();
    const body = JSON.stringify({
      roundNumber: roundState.roundNumber,
      isBettingOpen: isBettingCurrentlyOpen(),
      roundTimeRemaining: getRoundTimeRemaining(),
      bettingTimeRemaining: getBettingTimeRemaining(),
      endsAt: roundState.endsAt,
      bettingEndsAt: roundState.bettingEndsAt,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  if (req.method === "POST" && req.url === "/api/rpc") {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks).toString();
        const rpcRes = await fetch(config.monadRpcHttp, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const rpcBody = await rpcRes.text();
        res.writeHead(rpcRes.status, { "Content-Type": "application/json" });
        res.end(rpcBody);
      } catch (err) {
        console.error("[rpc-proxy] error:", err);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "RPC proxy error" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

export function startServer(): WebSocketServer {
  const httpServer = createServer(handleHttpRequest);
  wss = new WebSocketServer({ server: httpServer });

  httpServer.listen(config.wsPort, () => {
    console.log(`[server] HTTP + WebSocket server listening on port ${config.wsPort}`);
  });

  wss.on("connection", async (ws, req) => {
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
          bettingEndsAt: roundState.bettingEndsAt,
        },
      };
      ws.send(JSON.stringify(msg));
    }

    try {
      const winners = await getPastWinners(10);
      if (winners.length > 0) {
        const msg: PastWinnersMessage = {
          type: "past_winners",
          data: { winners },
        };
        ws.send(JSON.stringify(msg));
      }
    } catch (err) {
      console.error("[server] failed to fetch past winners:", err);
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
        protocolName: tx.protocolName,
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
  bettingEndsAt: number;
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

export function broadcastBettingClosed(data: {
  roundNumber: number;
}): void {
  if (!wss) return;

  const msg: BettingClosedMessage = { type: "betting_closed", data };
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
