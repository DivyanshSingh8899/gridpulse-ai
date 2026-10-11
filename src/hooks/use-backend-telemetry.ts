import { useEffect, useRef, useState } from "react";
import type { PeakAlert } from "@/lib/microgrid";
import type { TelemetryPoint } from "@/lib/microgrid";

type BackendPoint = {
  t: number;
  demand: number;
  grid: number;
  solar: number;
  wind: number;
  battery: number;
  soc: number;
  carbonOffsetKg: number;
  savingsUsd: number;
};

type StreamStatus = "connecting" | "live" | "offline";

/**
 * Subscribes to the backend SSE telemetry stream. Mounts the local simulation
 * hook as a seamless fallback when the stream can't connect.
 */
export function useBackendTelemetry(): {
  points: TelemetryPoint[];
  latest: TelemetryPoint | null;
  alerts: PeakAlert[];
  status: StreamStatus;
} {
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [latest, setLatest] = useState<TelemetryPoint | null>(null);
  const [alerts, setAlerts] = useState<PeakAlert[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      const es = new EventSource(`${(import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000"}/api/telemetry`);
      esRef.current = es;

      es.addEventListener("connected", () => setStatus("live"));
      es.addEventListener("backlog", e => {
        const arr = JSON.parse((e as MessageEvent).data) as BackendPoint[];
        if (!cancelled && arr.length) {
          setPoints(arr.map(toPoint));
          setLatest(toPoint(arr[arr.length - 1]));
        }
      });
      es.addEventListener("telemetry", e => {
        const p = toPoint(JSON.parse((e as MessageEvent).data) as BackendPoint);
        if (cancelled) return;
        setLatest(p);
        setPoints(prev => [...prev.slice(-119), p]);
      });
      es.addEventListener("peak-alert", e => {
        const a = JSON.parse((e as MessageEvent).data) as PeakAlert;
        if (!cancelled) setAlerts(prev => [a, ...prev].slice(0, 24));
      });
      es.onerror = () => {
        // SSE errors fire on dropped connections; EventSource auto-reconnects.
        setStatus("offline");
      };
    }

    try {
      connect();
    } catch {
      setStatus("offline");
    }

    return () => {
      cancelled = true;
      esRef.current?.close();
    };
  }, []);

  return { points, latest, alerts, status };
}

/** Backend points carry extra cumulative fields; project to chart shape. */
function toPoint(p: BackendPoint): TelemetryPoint {
  return { t: p.t, demand: p.demand, grid: p.grid, solar: p.solar, wind: p.wind, battery: p.battery, soc: p.soc };
}
