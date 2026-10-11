import { Router, type Request, type Response } from "express";
import { inspectionLog } from "./inspect.js";
import { getSimState, type TelemetryPoint } from "./telemetry.js";

/** Rolling telemetry snapshot, fed by the SSE engine for audit export. */
const telemetrySnapshot: TelemetryPoint[] = [];
export function pushTelemetrySnapshot(p: TelemetryPoint): void {
  telemetrySnapshot.push(p);
  if (telemetrySnapshot.length > 720) telemetrySnapshot.shift();
}
export { inspectionLog };

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function auditRouter(): Router {
  const router = Router();

  router.get("/audit/export", (req: Request, res: Response) => {
    const format = String(req.query.format ?? "csv").toLowerCase();
    const sim = getSimState();

    const rows: string[] = [];
    rows.push(`GridPulse AI — Audit Report,${new Date().toISOString()}`);
    rows.push(`Engine mode,${process.env.AWS_ACCESS_KEY_ID ? "aws-live" : "deterministic-fallback"}`);
    rows.push("");
    rows.push("Section,Metric,Value");
    rows.push(`Energy,Session carbon offset (t),${(sim.carbonOffsetKg / 1000).toFixed(3)}`);
    rows.push(`Energy,Session savings (USD),${sim.savingsUsd.toFixed(2)}`);
    rows.push(`Energy,Peak threshold used (kW),620`);
    rows.push(`E-Waste,Total inspections,${inspectionLog.length}`);
    rows.push(`E-Waste,Repaired,${inspectionLog.filter(r => r.action === "Repair").length}`);
    rows.push(`E-Waste,Repurposed,${inspectionLog.filter(r => r.action === "Repurpose (2nd Life)").length}`);
    rows.push(`E-Waste,Safe-recycled,${inspectionLog.filter(r => r.action === "Safe Recycle").length}`);
    rows.push(`E-Waste,Total residual value (USD),${inspectionLog.reduce((a, r) => a + r.residualValue, 0)}`);
    rows.push(`E-Waste,Total carbon savings (kg),${inspectionLog.reduce((a, r) => a + r.carbonSavingsKg, 0)}`);
    rows.push("");

    if (format === "full") {
      rows.push("== Inspections ==");
      rows.push("id,timestamp,asset_type,condition,degradation_pct,hazard_score,action,residual_value_usd,carbon_savings_kg,engine,processing_ms,image_bytes");
      for (const r of inspectionLog) {
        rows.push(
          [
            r.id,
            r.ts,
            csvEscape(r.assetType),
            r.condition,
            r.degradationPct,
            r.hazardScore,
            csvEscape(r.action),
            r.residualValue,
            r.carbonSavingsKg,
            r.engine,
            r.processingMs,
            r.imageBytes,
          ].map(csvEscape).join(","),
        );
      }
      rows.push("");
      rows.push("== Telemetry (last 12h equivalent) ==");
      rows.push("time_minutes,clock,demand_kw,grid_kw,solar_kw,wind_kw,battery_kw,soc_pct,carbon_offset_kg,savings_usd");
      for (const p of telemetrySnapshot.length ? telemetrySnapshot : [...Array(60)].map((_, i) => ({ t: i * 3, demand: 0, grid: 0, solar: 0, wind: 0, battery: 0, soc: 74, carbonOffsetKg: 0, savingsUsd: 0 }))) {
        rows.push(
          [
            p.t,
            `${String(Math.floor(p.t / 60) % 24).padStart(2, "0")}:${String(Math.floor(p.t % 60)).padStart(2, "0")}`,
            p.demand,
            p.grid,
            p.solar,
            p.wind,
            p.battery,
            p.soc,
            p.carbonOffsetKg,
            p.savingsUsd,
          ].join(","),
        );
      }
    }

    const filename = `gridpulse-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv;charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(rows.join("\n"));
  });

  return router;
}
