export type ZoneId = "pepperoni" | "mushroom" | "pineapple" | "olive" | "anchovy";

export interface Zone {
  id: ZoneId;
  name: string;
  topping: string;
  toppingEmoji: string;
  color: string;
  colorRgb: string;
  description: string;
}

export type HeatLevel = "cold" | "warm" | "hot" | "onfire";

export interface ZoneActivity {
  zoneId: ZoneId;
  totalVolume: number;
  betCount: number;
  odds: number;
  heatLevel: HeatLevel;
  lastTxTimestamp: number;
  recentTxCount: number;
  multiplier: number;
  weightedScore: number;
}

export interface Transaction {
  id: string;
  zoneId: ZoneId;
  address: string;
  amount: number;
  timestamp: number;
  type: "bet" | "resolve";
}

export interface UserBet {
  id: string;
  zoneId: ZoneId;
  amount: number;
  odds: number;
  timestamp: number;
  status: "pending" | "won" | "lost";
}

export interface GameState {
  roundId: number;
  roundEndTime: number;
  totalPool: number;
  isActive: boolean;
}
