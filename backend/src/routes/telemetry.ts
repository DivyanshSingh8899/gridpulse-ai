import { Router, type Request, type Response } from "express";
import {
  type PeakAlert,
  type TelemetryPoint,
  formatClock,
  initialTickState,
  tick,
} from "../lib/telemetry.js";
export type { TelemetryPoint, PeakAlert };

/**
 * GET /api/telemetry — Server-Sent Events stream.
 *
 * Emits one `data:` event per second with the live telemetry point. When grid
 * demand crosses the threshold, a separate `event: peak-alert` frame is pushed
 * with the automated load-switching action. A `backlog:` frame replays the
 * recent chart history so a freshly-connected client has a populated chart.
 */
// A shared simulation clock across all connected clients: every subscriber
// sees the same facility state, like a real SCADA feed.
const sim = initialTickState(new Date().getHours() * 60 + new Date().getMinutes());
const backlog: TelemetryPoint[] = [];
const alerts: PeakAlert[] = [];

const timer = setInterval(() => {
  const { state, point, alert } = tick(sim);
  sim.t = state.t;
  sim.soc = state.soc;
  sim.carbonOffsetKg = state.carbonOffsetKg;
  sim.savingsUsd = state.savingsUsd;
  backlog.push(point);
  if (backlog.length > 180) backlog.shift();
  if (alert) {
    alerts.unshift(alert);
    if (alerts.length > 24) alerts.pop();
  }
}, 1000);

// Do not hold the process open on this timer alone.
void timer.unref?.();

export function telemetryRouter(): Router {
  const router = Router();

  router.get("/telemetry", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`retry: 2000\n\n`);

    let lastSentIndex = Math.max(0, backlog.length - 60);

    const push = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Initial handshake + backlog so the chart isn't empty on connect.
    push("connected", {
      message: "GridPulse telemetry stream connected",
      thresholdKw: 620,
      now: formatClock(sim.t),
    });
    if (backlog.length > 1) {
      push("backlog", backlog.slice(0, lastSentIndex));
    }

    const interval = setInterval(() => {
      // Drain anything accumulated since last flush.
      while (lastSentIndex < backlog.length) {
        const p = backlog[lastSentIndex++];
        push("telemetry", p);
        const a = alerts.find(x => !("sent" in x) && x.atMinutes <= p.t);
        if (a) {
          (a as unknown as { sent?: boolean }).sent = true;
          push("peak-alert", a);
        }
      }
      // Periodic keepalive comment.
      res.write(`: keepalive ${Date.now()}\n\n`);
    }, 1000);

    req.on("close", () => {
      clearInterval(interval);
      void res.end();
    });
  });

  return router;
}

/** Expose recent alert history for the /api/audit/export merge. */
export function getRecentAlerts(): PeakAlert[] {
  return alerts.slice();
}

/** Expose the shared simulation state for the copilot context. */
export function getSimState(): { t: number; soc: number; carbonOffsetKg: number; savingsUsd: number; lastPoint: TelemetryPoint | null } {
  return {
    t: sim.t,
    soc: sim.soc,
    carbonOffsetKg: sim.carbonOffsetKg,
    savingsUsd: sim.savingsUsd,
    lastPoint: backlog.length > 0 ? backlog[backlog.length - 1] : null,
  };
}
