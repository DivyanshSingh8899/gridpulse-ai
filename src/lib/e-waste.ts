/**
 * AI E-Waste & Battery Inspector — mock inference pipeline.
 *
 * Emulates: S3 upload → Amazon Rekognition custom-label classification →
 * Bedrock/Claude damage narrative + residual valuation. Deterministic seeds
 * from the image's raw bytes so the same photo always yields the same result.
 */

export type AssetType =
  | "EV Battery Pack"
  | "Solar Panel"
  | "Server / IT Hardware"
  | "Consumer Electronics"
  | "Power Tool Battery"
  | "Industrial Inverter";

export type RecommendedAction = "Repurpose (2nd Life)" | "Repair" | "Safe Recycle";

export type InspectionResult = {
  assetType: AssetType;
  hazardScore: number; // 0-100, higher = more hazardous
  degradationPct: number; // 0-100
  condition: "Excellent" | "Good" | "Fair" | "Poor";
  action: RecommendedAction;
  actionConfidence: number; // 0-100
  residualValue: number; // USD
  carbonSavingsKg: number; // avoided by chosen pathway
  findings: string[];
  summary: string; // Bedrock-style narrative
  hazardLabels: string[];
  processingMs: number;
  modelId: string;
};

const TYPES: { type: AssetType; baseValue: number; hazardBias: number; icon: string }[] = [
  { type: "EV Battery Pack", baseValue: 1450, hazardBias: 18, icon: "🔋" },
  { type: "Solar Panel", baseValue: 210, hazardBias: 6, icon: "🔆" },
  { type: "Server / IT Hardware", baseValue: 380, hazardBias: 8, icon: "🖥️" },
  { type: "Consumer Electronics", baseValue: 95, hazardBias: 10, icon: "📱" },
  { type: "Power Tool Battery", baseValue: 60, hazardBias: 14, icon: "🧰" },
  { type: "Industrial Inverter", baseValue: 520, hazardBias: 9, icon: "🔌" },
];

/** Hash bytes into a stable 32-bit int. */
function hashBytes(bytes: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function analyzeImage(
  file: File | Blob,
  opts: { source: "upload" | "camera" },
): Promise<InspectionResult> {
  const started = performance.now();

  // Read bytes for a stable fingerprint (mock S3 + Rekognition seed).
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const seed = hashBytes(bytes);

  const rand = mulberry(seed);

  // Type classification (weighted random per seed).
  const pick = rand();
  const idx = Math.min(TYPES.length - 1, Math.floor(pick * TYPES.length));
  const meta = TYPES[idx];

  // Condition scoring.
  const degradationPct = Math.round(15 + rand() * 70);
  const shockDamage = rand() > 0.72; // occasional heavy damage
  const hazardScore = Math.min(
    98,
    Math.round(meta.hazardBias + degradationPct * 0.7 + (shockDamage ? 22 : 0) + rand() * 12),
  );

  const condition: InspectionResult["condition"] =
    degradationPct < 30 ? "Excellent" : degradationPct < 50 ? "Good" : degradationPct < 72 ? "Fair" : "Poor";

  // Action + valuation: heavy hazard → recycle; moderate → repair; low → repurpose.
  let action: RecommendedAction;
  if (hazardScore >= 70) action = "Safe Recycle";
  else if (degradationPct >= 48) action = "Repair";
  else action = "Repurpose (2nd Life)";
  const actionConfidence = Math.round(72 + rand() * 26);

  const valueFactor = (100 - degradationPct) / 100;
  const residualValue = Math.round(meta.baseValue * valueFactor * (0.85 + rand() * 0.4));
  const carbonSavingsKg =
    action === "Safe Recycle"
      ? Math.round(40 + rand() * 160) // material recovery only
      : Math.round(220 + rand() * 620); // keeping unit in service avoids mfg emissions

  const findings = [
    `✓ ${meta.type} identified (${(86 + rand() * 12).toFixed(0)}% label confidence)`,
    shockDamage
      ? `⚠ Impact deformation detected — thermal-runaway risk on cells`
      : `✓ Housing integrity nominal, no visible cell swelling`,
    degradationPct > 55 ? `⚠ High capacity fade — ${degradationPct}% below nameplate` : `✓ Capacity at ${100 - degradationPct}% of nameplate`,
    hazardScore >= 70
      ? `⚠ Class 9 handling required — route to quarantine bin`
      : `✓ Standard handling, no Class 9 flags`,
  ];

  const summary =
    action === "Safe Recycle"
      ? `${meta.type} shows ${condition.toLowerCase()} condition with elevated hazard indicators (score ${hazardScore}). Recommendation: certified safe-recycle via UN 3480-compliant packaging. Materials recovery (Al, Cu, Li carbonate) is valued at ~$${Math.round(residualValue * 0.35)} and avoids ${carbonSavingsKg} kg CO₂ versus virgin-equivalent extraction. This asset should not re-enter service.`
      : action === "Repair"
        ? `${meta.type} is degraded but recoverable (hazard score ${hazardScore}). Recommended: repair pathway — ${shockDamage ? "replace strained interconnects and re-test thermal sensors" : "BMS reset + cell-balance cycle"}. Post-repair residual value ≈ $${Math.round(residualValue)} (${(100 - degradationPct)}% capacity retention), avoiding ${carbonSavingsKg} kg CO₂ by displacing a new unit.`
        : `${meta.type} is in ${condition.toLowerCase()} condition with minimal wear. Recommendation: repurpose to a 2nd-life application ${meta.type === "Solar Panel" ? "(off-grid / carport array)" : "(stationary storage buffer)"}. Current residual value ≈ $${residualValue}, and keeping the unit in service avoids ~${carbonSavingsKg} kg CO₂ versus manufacturing a replacement.`;

  return {
    assetType: meta.type,
    hazardScore,
    degradationPct,
    condition,
    action,
    actionConfidence,
    residualValue,
    carbonSavingsKg,
    findings,
    summary,
    hazardLabels: hazardScore >= 70 ? ["Class 9", "Thermal risk"] : hazardScore >= 45 ? ["Watch list"] : [],
    processingMs: Math.round(performance.now() - started + 900 + seed % 1400),
    modelId: `bedrock-claude-3.5-sonnet / rekognition-custom-labels-${(seed % 97).toString().padStart(2, "0")}`,
  };
}

export const ACTION_STYLES: Record<RecommendedAction, { bg: string; text: string; label: string }> = {
  "Repurpose (2nd Life)": { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-700", label: "Repurpose · 2nd Life" },
  "Repair": { bg: "bg-sky-500/15 border-sky-500/30", text: "text-sky-700", label: "Repair" },
  "Safe Recycle": { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-700", label: "Safe Recycle" },
};
