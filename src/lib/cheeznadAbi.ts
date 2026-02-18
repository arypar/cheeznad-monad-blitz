import type { ZoneId } from "@/types";

export const CHEEZNAD_ADDRESS =
  "0x0606a92d01845B04A1C4F5cf788247FB4A14fd58" as const;

export const ZONE_TO_ENUM: Record<ZoneId, number> = {
  pepperoni: 0,
  mushroom: 1,
  pineapple: 2,
  olive: 3,
  anchovy: 4,
};

export const cheeznadAbi = [
  {
    name: "getZoneTotal",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_zone", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "_zone", type: "uint8" }],
    outputs: [],
  },
] as const;
