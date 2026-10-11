import cors from "cors";
import express from "express";

const app = express();

app.use(
  cors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map(o => o.trim()),
    methods: ["GET", "POST"],
  }),
);
app.use(express.json({ limit: "1mb" }));

// ─── Health / capability probe ──────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const hasAws = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  res.json({
    status: "ok",
    service: "gridpulse-backend",
    mode: hasAws ? "aws-live" : "deterministic-fallback",
    awsRegion: process.env.AWS_REGION ?? null,
    time: new Date().toISOString(),
  });
});

// ─── Feature routes ─────────────────────────────────────────────────────────
const { telemetryRouter, getSimState } = await import("./src/routes/telemetry.js");
const { inspectRouter } = await import("./src/routes/inspect.js");
const { copilotRouter } = await import("./src/routes/copilot.js");
const { auditRouter, pushTelemetrySnapshot } = await import("./src/routes/audit.js");

app.use("/api", telemetryRouter());
app.use("/api", inspectRouter());
app.use("/api", copilotRouter());
app.use("/api", auditRouter());

// Feed the rolling telemetry snapshot used by the audit exporter.
const { tick, initialTickState } = await import("./src/lib/telemetry.js");
const sim = getSimState();
void sim;
const tickTimer = setInterval(() => {
  const s = getSimState();
  if (s.lastPoint) pushTelemetrySnapshot(s.lastPoint);
}, 1000);
void tickTimer.unref?.();

const PORT = Number(process.env.PORT ?? 8000);
app.listen(PORT, () => {
  const hasAws = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  console.log(`⚡ GridPulse backend on http://localhost:${PORT}`);
  console.log(`   Mode: ${hasAws ? "AWS live (Rekognition + Bedrock)" : "deterministic fallback (set AWS_* env vars for live calls)"}`);
});
