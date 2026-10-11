import { useEffect, useRef, useState } from "react";
import {
  type PeakAlert,
  type TelemetryPoint,
  PEAK_THRESHOLD,
  START_SOC,
  seedHistory,
  tick,
} from "@/lib/microgrid";

type LivePoint = TelemetryPoint & { newAlert: PeakAlert | null };

/**
 * Runs the simulated AWS IoT telemetry loop: one tick per second, each tick
 * advancing ~3 simulated minutes. Keeps a rolling chart buffer and a capped
 * alert feed for the peak-demand system.
 */
export function useMicrogrid(startMinutes?: number) {
  const initialStart = useRef(startMinutes ?? 9 * 60).current;
  const [history, setHistory] = useState<TelemetryPoint[]>(() =>
    seedHistory(initialStart, 60, 3),
  );
  const [latest, setLatest] = useState<TelemetryPoint>(
    () => history[history.length - 1],
  );
  const [alerts, setAlerts] = useState<PeakAlert[]>([]);
  const [paused, setPaused] = useState(false);

  const prevRef = useRef<{ t: number; soc: number }>({
    t: initialStart,
    soc: START_SOC,
  });

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      const res: LivePoint = tick(prevRef.current, 1000, {
        startMinutes: initialStart,
        speed: 3,
      });
      prevRef.current = { t: res.t, soc: res.soc };
      setLatest({
        t: res.t,
        demand: res.demand,
        grid: res.grid,
        solar: res.solar,
        wind: res.wind,
        battery: res.battery,
        soc: res.soc,
      });
      setHistory(h => {
        const last = h[h.length - 1];
        if (last && res.t - last.t < 3) return h; // one point per sim-3min
        return [...h.slice(-119), { ...res }];
      });
      if (res.newAlert) {
        setAlerts(a => [res.newAlert as PeakAlert, ...a].slice(0, 24));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused, initialStart]);

  return { history, latest, alerts, paused, setPaused };
}
