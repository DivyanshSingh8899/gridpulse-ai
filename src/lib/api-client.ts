/**
 * GridPulse frontend API layer.
 *
 * Talks to the Express backend (see /backend). Every call degrades to the
 * local deterministic simulation when the server is unreachable, so the app
 * stays fully functional offline — telemetry from src/lib/microgrid.ts,
 * inspection from src/lib/e-waste.ts, copilot from src/lib/esg-copilot.ts.
 */

import type { PeakAlert, TelemetryPoint } from "@/lib/microgrid";

export type InspectionPayload = {
  assetType: string;
  condition: string;
  hazardScore: number;
  degradationPct: number;
  action: "Repurpose (2nd Life)" | "Repair" | "Safe Recycle";
  actionConfidence: number;
  residualValue: number;
  carbonSavingsKg: number;
  findings: string[];
  summary: string;
  labels: { name: string; confidence: number }[];
  engine: "rekognition+bedrock" | "deterministic-fallback";
  processingMs: number;
};

export type CopilotResponse = {
  engine: "bedrock-converse" | "structured-fallback";
  modelId: string;
  answer: string;
  latencyMs: number;
};

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Probe backend availability + active engines. */
export async function checkBackend(): Promise<{
  online: boolean;
  mode: "aws-live" | "deterministic-fallback" | "offline";
  inspectEngine?: string;
  copilotEngine?: string;
}> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/health`, {}, 2500);
    if (!res.ok) throw new Error(`health ${res.status}`);
    const [body, inspect, copilot] = await Promise.all([
      res.json() as Promise<{ status: string; mode: string }>,
      fetchWithTimeout(`${BASE_URL}/api/inspect`).then(r => r.json()).catch(() => null),
      fetchWithTimeout(`${BASE_URL}/api/copilot`).then(r => r.json()).catch(() => null),
    ]);
    return {
      online: true,
      mode: (body.mode as "aws-live" | "deterministic-fallback") ?? "deterministic-fallback",
      inspectEngine: inspect?.engine,
      copilotEngine: copilot?.engine,
    };
  } catch {
    return { online: false, mode: "offline" };
  }
}

/* ---------------- Inspection ---------------- */

/** Inspect an image via the backend; falls back to the local analyzer. */
export async function inspectImage(
  file: File,
  opts: { source: "upload" | "camera"; fallback: (file: File) => Promise<import("@/lib/e-waste").InspectionResult> },
): Promise<InspectionPayload | import("@/lib/e-waste").InspectionResult> {
  const body = new FormData();
  body.append("image", file);
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/inspect`, { method: "POST", body }, 15000);
    if (!res.ok) throw new Error(`inspect ${res.status}`);
    return (await res.json()) as InspectionPayload;
  } catch (err) {
    console.warn("[api] /api/inspect unavailable — using local analyzer:", err instanceof Error ? err.message : err);
    return opts.fallback(file);
  }
}

/** Ask the ESG copilot; falls back to the local rule engine. */
export async function askCopilot(
  question: string,
  context: {
    co2OffsetKg?: number;
    savingsUsd?: number;
    peakShavedPct?: number;
    assetsRepaired?: number;
    assetsRepurposed?: number;
    assetsRecycled?: number;
    wasteDivertedKg?: number;
  },
  fallback: (q: string) => string,
): Promise<CopilotResponse & { fallbackText?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/api/copilot`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, context }) },
      12000,
    );
    if (!res.ok) throw new Error(`copilot ${res.status}`);
    return (await res.json()) as CopilotResponse;
  } catch (err) {
    console.warn("[api] /api/copilot unavailable — using local engine:", err instanceof Error ? err.message : err);
    return { engine: "structured-fallback", modelId: "local-esg-copilot", answer: fallback(question), latencyMs: 0, fallbackText: fallback(question) };
  }
}

/** Download the CSV audit export produced by the backend. */
export async function exportAuditCsv(fallbackCsv: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/audit/export?format=full`, {}, 10000);
    if (!res.ok) throw new Error(`export ${res.status}`);
    const csv = await res.text();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gridpulse-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  } catch (err) {
    console.warn("[api] /api/audit/export unavailable — using local CSV:", err instanceof Error ? err.message : err);
    const blob = new Blob([fallbackCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gridpulse-esg-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
