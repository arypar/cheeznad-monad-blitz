import type { RegistryEntry, ZoneId } from "./types.js";

const PROTOCOLS_CSV_URL =
  "https://raw.githubusercontent.com/monad-crypto/protocols/refs/heads/main/protocols-mainnet.csv";

const CATEGORY_TO_ZONE: Record<string, ZoneId> = {
  // Pepperoni -- DEX & Trading
  "DeFi::DEX": "pepperoni",
  "DeFi::DEX Aggregator": "pepperoni",
  "DeFi::Trading Interfaces": "pepperoni",
  "DeFi::Perpetuals / Derivatives": "pepperoni",
  "DeFi::Stableswap": "pepperoni",
  "DeFi::Options": "pepperoni",
  "DeFi::Prime Brokerage": "pepperoni",
  "DeFi::Synthetics": "pepperoni",
  "DeFi::Intents": "pepperoni",

  // Mushroom -- Lending & Staking
  "DeFi::Lending": "mushroom",
  "DeFi::Liquid Staking": "mushroom",
  "DeFi::Staking": "mushroom",
  "DeFi::Yield": "mushroom",
  "DeFi::Yield Aggregator": "mushroom",
  "DeFi::Leveraged Farming": "mushroom",
  "DeFi::CDP": "mushroom",
  "DeFi::Asset Issuers": "mushroom",
  "DeFi::Uncollateralized Lending": "mushroom",
  "DeFi::Asset Allocators": "mushroom",
  "DeFi::Insurance": "mushroom",
  "DeFi::Reserve Currency": "mushroom",
  "DeFi::RWA": "mushroom",
  "DeFi::Stablecoin": "mushroom",
  "DeFi::Indexes": "mushroom",
  "DeFi::Other": "mushroom",

  // Pineapple -- Meme & Launch
  "DeFi::Launchpads": "pineapple",
  "DeFi::Memecoin": "pineapple",

  // Olive -- Infrastructure
  "Infra::Oracle": "olive",
  "Infra::Interoperability": "olive",
  "Infra::RPC": "olive",
  "Infra::Indexing": "olive",
  "Infra::Developer Tooling": "olive",
  "Infra::AA": "olive",
  "Infra::Automation": "olive",
  "Infra::Analytics": "olive",
  "Infra::Identity": "olive",
  "Infra::Privacy / Encryption": "olive",
  "Infra::Wallet": "olive",
  "Infra::ZK": "olive",
  "Infra::Gaming": "olive",
  "Infra::Other": "olive",
  "DeFi::Cross Chain": "olive",
  "DeFi::MEV": "olive",

  // Anchovy -- Gaming, Social, AI, NFT, Consumer
  "Gaming::Games": "anchovy",
  "Gaming::Metaverse": "anchovy",
  "Gaming::Mobile-First": "anchovy",
  "Gaming::Infrastructure": "anchovy",
  "Gaming::Other": "anchovy",
  "Consumer::Betting": "anchovy",
  "Consumer::Prediction Market": "anchovy",
  "Consumer::Social": "anchovy",
  "Consumer::E-commerce / Ticketing": "anchovy",
  "Consumer::Other": "anchovy",
  "AI::Agent Launchpad": "anchovy",
  "AI::Abstraction Infrastructure": "anchovy",
  "AI::Consumer AI": "anchovy",
  "AI::Data": "anchovy",
  "AI::Compute": "anchovy",
  "AI::Inference": "anchovy",
  "AI::Gaming": "anchovy",
  "AI::Infrastructure": "anchovy",
  "AI::Investing": "anchovy",
  "AI::Models": "anchovy",
  "AI::Trading Agent": "anchovy",
  "AI::Other": "anchovy",
  "NFT::Collections": "anchovy",
  "NFT::Infrastructure": "anchovy",
  "NFT::Interoperability": "anchovy",
  "NFT::Marketplace": "anchovy",
  "NFT::NFTFi": "anchovy",
  "NFT::Other": "anchovy",
  "DePIN::Spatial Intelligence": "anchovy",
  "DePIN::CDN": "anchovy",
  "DePIN::Compute": "anchovy",
  "DePIN::Data Collection": "anchovy",
  "DePIN::Data Labelling": "anchovy",
  "DePIN::Mapping": "anchovy",
  "DePIN::Monitoring Networks": "anchovy",
  "DePIN::Storage": "anchovy",
  "DePIN::Wireless Network": "anchovy",
  "DePIN::Other": "anchovy",
  "DeSci::Other": "anchovy",
  "Governance::Delegation": "anchovy",
  "Governance::Risk Management": "anchovy",
  "Governance::Other": "anchovy",
  "Payments::Credit Cards": "anchovy",
  "Payments::Onramp and Offramps": "anchovy",
  "Payments::Neobanks": "anchovy",
  "Payments::Orchestration": "anchovy",
  "Payments::Remittance": "anchovy",
  "Payments::Other": "anchovy",
  "CeFi::CEX": "anchovy",
  "CeFi::Institutional Trading": "anchovy",
  "CeFi::Other": "anchovy",
};

// Supplemental addresses not in the monad-crypto/protocols CSV.
// These are added on top of the CSV to improve classification coverage.
type SupplementalEntry = RegistryEntry & { address: string };
const SUPPLEMENTAL_ADDRESSES: SupplementalEntry[] = [
];

function resolveZone(category: string): ZoneId | undefined {
  return CATEGORY_TO_ZONE[category];
}

const registry = new Map<string, RegistryEntry>();

export async function initRegistry(): Promise<void> {
  console.log("[registry] fetching protocols from monad-crypto/protocols...");

  const res = await fetch(PROTOCOLS_CSV_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch protocols CSV: ${res.status} ${res.statusText}`);
  }

  const csv = await res.text();
  const lines = csv.split("\n").slice(1); // skip header

  let loaded = 0;
  let skipped = 0;
  const zoneCounts: Record<ZoneId, number> = {
    pepperoni: 0,
    mushroom: 0,
    pineapple: 0,
    olive: 0,
    anchovy: 0,
  };
  const zoneProtocols: Record<ZoneId, Set<string>> = {
    pepperoni: new Set(),
    mushroom: new Set(),
    pineapple: new Set(),
    olive: new Set(),
    anchovy: new Set(),
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    // CSV columns: name,ctype,csubtype,contract,address,all_categories
    const parts = line.split(",");
    if (parts.length < 5) continue;

    const protocolName = parts[0].trim();
    const ctype = parts[1].trim();
    const csubtype = parts[2].trim();
    const contractName = parts[3].trim();
    const address = parts[4].trim().toLowerCase();
    const category = `${ctype}::${csubtype}`;

    if (!address.startsWith("0x")) continue;

    // Skip spammy protocols
    if (protocolName === "Redstone") { skipped++; continue; }

    const zoneId = resolveZone(category);
    if (!zoneId) {
      skipped++;
      continue;
    }

    registry.set(address, {
      zoneId,
      protocolName,
      contractName,
      category,
    });

    zoneCounts[zoneId]++;
    zoneProtocols[zoneId].add(protocolName);
    loaded++;
  }

  // Load supplemental addresses (not in CSV)
  let supplementalCount = 0;
  for (const entry of SUPPLEMENTAL_ADDRESSES) {
    const addr = entry.address.toLowerCase();
    if (!registry.has(addr)) {
      const { address: _, ...registryEntry } = entry;
      registry.set(addr, registryEntry);
      zoneCounts[entry.zoneId]++;
      zoneProtocols[entry.zoneId].add(entry.protocolName);
      supplementalCount++;
      loaded++;
    }
  }

  console.log(`[registry] loaded ${loaded} addresses (${supplementalCount} supplemental), skipped ${skipped} unmapped`);
  console.log(
    `[registry] breakdown: ` +
      Object.entries(zoneCounts)
        .map(([z, c]) => `${z}:${c}`)
        .join("  ")
  );

  const ZONE_NAMES: Record<ZoneId, string> = {
    pepperoni: "DEX & Trading",
    mushroom: "Lending & Staking",
    pineapple: "Meme & Launch",
    olive: "Infrastructure",
    anchovy: "Gaming & Social",
  };

  for (const zoneId of Object.keys(zoneProtocols) as ZoneId[]) {
    const protos = Array.from(zoneProtocols[zoneId]).sort();
    console.log(
      `[registry]   ${ZONE_NAMES[zoneId]} (${zoneCounts[zoneId]} addrs, ${protos.length} protocols): ${protos.join(", ")}`
    );
  }
}

export function lookupAddress(address: string): RegistryEntry | undefined {
  return registry.get(address.toLowerCase());
}

export function getRegistrySize(): number {
  return registry.size;
}
