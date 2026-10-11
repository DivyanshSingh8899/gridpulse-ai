/**
 * ESG Copilot — conversational Q&A over live facility metrics with
 * downloadable audit exports. Backed by a rule-based intent matcher that
 * emulates an Amazon Bedrock / Claude prompt-response flow so the chat is
 * instant and reliable in a hackathon demo.
 */

import { formatClock } from "@/lib/microgrid";
import type { TelemetryPoint } from "@/lib/microgrid";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
  /** Attached context chip shown over the bubble (e.g. "CO₂ report"). */
  topic?: string;
};

export type EsgStats = {
  co2OffsetKg: number;
  cumulativeSavings: number;
  totalKwhOptimized: number;
  peakShavedPct: number;
  assetsRecycled: number;
  assetsRepurposed: number;
  assetsRepaired: number;
  wasteDivertedKg: number;
};

function fmtDate(d = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Rule-based Bedrock-emulating answer engine. */
export function answerQuestion(qRaw: string, stats: EsgStats, latest: TelemetryPoint | null): string {
  const q = qRaw.toLowerCase();

  if (/carbon|co2|emission/.test(q)) {
    return [
      `Here's your carbon picture for ${fmtDate()}:`,
      ``,
      `• **${(stats.co2OffsetKg / 1000).toFixed(2)} t CO₂** offset so far via renewable coverage and battery peak-shaving.`,
      `• ${(stats.totalKwhOptimized).toLocaleString()} kWh shifted off grid import — equivalent to ${Math.round(stats.co2OffsetKg / 41)} trees' annual absorption.`,
      `• Fleet-wide waste diversion removed another **${Math.round(stats.wasteDivertedKg)} kg** of embodied-emission material from landfill.`,
      ``,
      `Scope 2 emissions avoided this period put you at **A+ (92/100) ESG band**. Want me to export this as an audit CSV?`,
    ].join("\n");
  }

  if (/lithium|battery.*(hazard|discard|disposal)|hazard.*battery/.test(q)) {
    return [
      `Hazardous compliance steps for discarded lithium batteries:`,
      ``,
      `1. **De-energize** — measure terminal voltage; below 60 V is safe to handle. Tape terminals.`,
      `2. **Grade** — run the AI Inspector; hazard score ≥ 70 triggers quarantine bins (Class 9 dangerous goods).`,
      `3. **Package** — UN 3480-certified containers, max 30% fill, thermal barrier between cells.`,
      `4. **Document** — generate a manifest via the Copilot export (EPA 40 CFR 262 Subpart B).`,
      `5. **Transport** — only DOT-approved carriers to a licensed smelter or direct-recycler.`,
      ``,
      `You currently have **${stats.assetsRecycled} assets** in the recycle pipeline and 0 open non-conformances. 🟢`,
    ].join("\n");
  }

  if (/solar panel|panel/.test(q)) {
    return [
      `Solar panel end-of-life policy:`,
      ``,
      `• Panels at > 80% nameplate output → **repurpose** to secondary sites (carports, off-grid).`,
      `• 60–80% → **repair** (junction-box reconnect, glass segregate).`,
      `• < 60% → **safe recycle**: aluminum frame and copper routed to material recovery (≈ 96% mass recovery).`,
      ``,
      `Industry reference: IRENA estimates 78 Mt of PV waste globally by 2050 — every panel you keep in service avoids ~1.2 t of virgin manufacturing emissions.`,
    ].join("\n");
  }

  if (/saving|cost|\$|dollar|money|tariff/.test(q)) {
    return [
      `Savings this period: **$${stats.cumulativeSavings.toFixed(2)}** on grid import.`,
      ``,
      `The driver is peak-shaving: your battery discharged through ${(stats.peakShavedPct).toFixed(0)}% of identified peak windows, avoiding the $0.31/kWh evening tariff. At current trajectory you'll finish the month **~14% under** the un-optimized baseline.`,
      ``,
      `Recommended next step: pre-cool the HVAC ring 45 minutes before tomorrow's forecast peak (18:40–19:10).`,
    ].join("\n");
  }

  if (/compliance|audit|report|export|epa|regulat/.test(q)) {
    return [
      `Compliance snapshot — ${fmtDate()}:`,
      ``,
      `• Hazardous waste manifests: **2 filed, 0 open**.`,
      `• Scope 2 carbon accounting: renewable-mix methodology (EPA Scope 2 Guidance).`,
      `• ESG band: **A+ (92/100)**, up 3 points vs. last month.`,
      `• ${stats.assetsRepaired} repairs, ${stats.assetsRepurposed} repurposes, ${stats.assetsRecycled} safe-recycles logged.`,
      ``,
      `I can export a CSV audit summary — use the **Export audit CSV** action on this drawer.`,
    ].join("\n");
  }

  if (/peak|demand|forecast|spike/.test(q)) {
    const now = latest ? `Right now you're importing **${latest.grid} kW** (demand ${latest.demand} kW, battery ${latest.battery >= 0 ? "charging" : "discharging"}).` : "";
    return [
      `Peak-demand status:`,
      now,
      ``,
      `• Forecast evening peak: **18:40–19:10** window, projected 690 kW.`,
      `• Threshold is 620 kW — automated load-switching (LSR) rules will discharge the battery and shift HVAC/chiller loads.`,
      `• This month's rule executions shaved **${(stats.peakShavedPct).toFixed(0)}%** of peak energy.`,
    ].join("\n");
  }

  if (/hello|hi|help|what can you/.test(q)) {
    return [
      `Hi! I'm the **GridPulse ESG Copilot**, emulating a Bedrock/Claude backend for this prototype.`,
      ``,
      `Try asking me about:`,
      `• "How much carbon did we save this month?"`,
      `• "What are our hazardous compliance steps for discarded lithium batteries?"`,
      `• "What's our current peak demand?"`,
      `• Or use **Export audit CSV** below for an audit-ready summary.`,
    ].join("\n");
  }

  return [
    `I've logged your question against the facility dataset. Based on current telemetry:`,
    ``,
    latest ? `• Grid import **${latest.grid} kW**, demand **${latest.demand} kW**, battery SOC **${latest.soc}%**.` : `• Telemetry syncing…`,
    `• Carbon offset **${(stats.co2OffsetKg / 1000).toFixed(2)} t**, savings **$${stats.cumulativeSavings.toFixed(2)}**.`,
    ``,
    `For anything narrower (asset-level audit, manifest, panel policy), try one of the suggested prompts. In production this reply is generated by Amazon Bedrock with your DynamoDB facility records as retrieval context.`,
  ].join("\n");
}

/** Simple suggested prompts shown as chips in the chat UI. */
export const SUGGESTED_PROMPTS = [
  "How much carbon did we save this month?",
  "Hazardous compliance steps for discarded lithium batteries",
  "What's our current peak demand?",
  "Export a compliance overview",
];

/** Build CSV content for an audit export. */
export function buildAuditCsv(stats: EsgStats, history: TelemetryPoint[]): string {
  const rows: string[] = [];
  rows.push(`GridPulse AI — ESG Audit Summary,${new Date().toISOString().slice(0, 10)}`);
  rows.push("");
  rows.push("Metric,Value");
  rows.push(`CO2 offset (t),${(stats.co2OffsetKg / 1000).toFixed(3)}`);
  rows.push(`Energy optimized (kWh),${stats.totalKwhOptimized.toFixed(1)}`);
  rows.push(`Savings (USD),${stats.cumulativeSavings.toFixed(2)}`);
  rows.push(`Peak energy shaved (%),${stats.peakShavedPct.toFixed(1)}`);
  rows.push(`Assets repaired,${stats.assetsRepaired}`);
  rows.push(`Assets repurposed,${stats.assetsRepurposed}`);
  rows.push(`Assets safe-recycled,${stats.assetsRecycled}`);
  rows.push(`Waste diverted (kg),${stats.wasteDivertedKg.toFixed(1)}`);
  rows.push("");
  rows.push("time_minutes,demand_kw,grid_kw,solar_kw,wind_kw,battery_kw,soc_pct");
  for (const p of history) {
    rows.push([p.t, p.demand, p.grid, p.solar, p.wind, p.battery, p.soc].map((v) => (typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : v)).join(","));
  }
  return rows.join("\n");
}

/** Trigger a browser download of the CSV. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
