export const CHEEZNAD_ADDRESS =
  "0x0606a92d01845B04A1C4F5cf788247FB4A14fd58" as const;

export const cheeznadAbi = [
  {
    name: "getZoneTotal",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_zone", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
