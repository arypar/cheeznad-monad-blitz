export const CHEEZNAD_ADDRESS =
  "0xb7EfC1264a4f6a13E0651B262474B42B67E69a16" as const;

export const cheeznadAbi = [
  {
    name: "getZoneTotal",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_zone", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
