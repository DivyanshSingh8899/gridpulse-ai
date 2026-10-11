/**
 * Simulated AWS IoT Core telemetry stream + time-series forecasting.
 *
 * In production, `useGridTelemetry` would subscribe to a WebSocket backed by
 * API Gateway → Lambda → IoT Core. Here we synthesize a realistic stream:
 * a sinusoidal facility load with noise, a smooth solar curve, synched wind,
 * and a battery that auto-dispatches to peak-shave grid demand.
 */

export type TelemetryPoint = {
  /** Simulation time in minutes since midnight. */
  t: number;
  /** Facility demand drawn from grid + storage, kW. */
  demand: number;
  /** Grid import, kW. */
  grid: number;
  /** Solar PV output, kW. */
  solar: number;
  /** Wind output, kW. */
  wind: number;
  /** Battery dispatch: positive = charging, negative = discharging, kW. */
  battery: number;
  /** Battery state of charge, 0-100. */
  soc: number;
};

export type PeakAlert = {
  id: string;
  atMinutes: number;
  gridKw: number;
  thresholdKw: number;
  action: string;
  severity: "warning" | "critical";
};

const CAPACITY_KW = 900;
const BASE_LOAD_KW = 380;
const SOLAR_PEAK_KW = 480;
const WIND_BASE_KW = 120;
const BATTERY_MAX_KW = 350;
const BATTERY_CAPACITY_KWH = 1200;
/** SOC ticks ~ real-time: 1 sim-minute advances SOC integral. */
const START_SOC = 74;

export const PEAK_THRESHOLD_KW = 620;

export function formatClock(t: number): string {
  const h = Math.floor(t / 60) % 24;
  const m = Math.floor(t % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatKW(v: number): string {
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(v))} kW`;
}

/** Deterministic pseudo-noise in [0, 1). */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Generation curve for an arbitrary sim time. Solar follows a bell curve
 * 06:00–18:00; wind is gusty but smoothed; load has morning/lunch/evening peaks.
 */
export function sampleAt(t: number, seedOffset = 0): {
  demand: number;
  solar: number;
  wind: number;
} {
  const hour = t / 60;

  // Facility load: base + morning ramp + lunch bump + evening peak + noise.
  const loadShape =
    1 +
    0.16 * Math.max(0, Math.sin(((hour - 9) / 14) * Math.PI)) + // broad day rise
    0.22 * Math.exp(-((hour - 13) ** 2) / 3.2) + // lunch peak
    0.3 * Math.exp(-((hour - 18.5) ** 2) / 2.4); // evening peak
  const jitter = 0.96 + 0.08 * noise(t * 0.7 + seedOffset);
  const demand = BASE_LOAD_KW * loadShape * jitter;

  // Solar: bell between 6h and 18h, dimmed under "cloud" noise.
  const solarBell = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const cloud = 0.75 + 0.25 * Math.sin(t * 0.11 + seedOffset) * noise(t * 0.23);
  const solar = SOLAR_PEAK_KW * solarBell * Math.min(1, cloud);

  // Wind: gusty.
  const wind = WIND_BASE_KW * (0.55 + 0.45 * Math.abs(Math.sin(t * 0.045 + seedOffset * 2)));

  return { demand, solar, wind };
}

export type SimParams = {
  /** Simulation start time in minutes. */
  startMinutes: number;
  /** sim minutes advanced per real second. */
  speed: number;
};

/** Pure battery dispatch model for one tick. Mutates nothing; returns deltas. */
function dispatch(
  socPct: number,
  gridWithoutBattery: number,
): { battery: number; socDeltaPct: number } {
  let battery = 0;
  let socDeltaPct = 0;

  // Peak shaving: discharge when grid draw would exceed threshold.
  if (gridWithoutBattery > PEAK_THRESHOLD_KW) {
    battery = -Math.min(
      BATTERY_MAX_KW,
      gridWithoutBattery - PEAK_THRESHOLD_KW,
    );
  } else if (gridWithoutBattery < PEAK_THRESHOLD_KW - 90 && socPct < 85) {
    // Charge overnight/midday surplus.
    battery = Math.min(
      BATTERY_MAX_KW * 0.6,
      (PEAK_THRESHOLD_KW - gridWithoutBattery) * 0.5,
    );
  }

  // Integrate into SOC. 1 kW for 1 minute = 1/60 kWh; capacity = 1200 kWh.
  const kwhPerMin = (-battery) / 60; // discharging yields positive kWh
  socDeltaPct = (kwhPerMin / BATTERY_CAPACITY_KWH) * 100;

  // Clamp: cannot discharge below 12% reserve or charge above 96%.
  if (socPct + socDeltaPct < 12 && socDeltaPct < 0) {
    socDeltaPct = 0;
    battery = 0;
  }
  if (socPct + socDeltaPct > 96 && socDeltaPct > 0) {
    socDeltaPct = 0;
    battery = 0;
  }
  return { battery, socDeltaPct };
}

export type TelemetryTick = Omit<TelemetryPoint, "t"> & {
  t: number;
  newAlert: PeakAlert | null;
};

export function tick(prev: {
  t: number;
  soc: number;
}, dtSeconds: number, params: SimParams): TelemetryTick {
  const t = prev.t + (dtSeconds / 1000) * params.speed;
  const { demand, solar, wind } = sampleAt(t);
  const renewable = solar + wind;

  // Battery shaves grid draw only (discharge reduces grid, charge adds load).
  const { battery, socDeltaPct } = dispatch(prev.soc, demand);

  // Grid = demand + battery charging (or minus battery discharge min renewable)
  let grid = Math.max(0, demand + battery - renewable * 0.999);

  // Recompute battery decision against the *post-renewable* grid if renewables cover demand.
  const finalBattery = renewable >= demand + battery ? 0 : battery;
  const soc = Math.min(96, Math.max(12, prev.soc + socDeltaPct * (finalBattery === 0 ? 0 : 1)));

  let newAlert: PeakAlert | null = null;
  if (grid > PEAK_THRESHOLD_KW && prev.soc > 12) {
    // Only alert crossing when battery couldn't fully shave.
    if (grid - PEAK_THRESHOLD_KW > 15) {
      newAlert = {
        id: `alert-${Date.now()}-${Math.round(grid)}`,
        atMinutes: t,
        gridKw: Math.round(grid),
        thresholdKw: PEAK_THRESHOLD_KW,
        action: `Load-switch rule LSR-${Math.round(t)}: shifted ${(grid - PEAK_THRESHOLD_KW).toFixed(0)} kW flexible load to battery storage.`,
        severity: grid > PEAK_THRESHOLD_KW + 80 ? "critical" : "warning",
      };
    }
  }

  return {
    t,
    demand: Math.round(demand),
    grid: Math.round(grid),
    solar: Math.round(solar),
    wind: Math.round(wind),
    battery: Math.round(finalBattery),
    soc: Math.round(soc * 10) / 10,
    newAlert,
  };
}

/** Build a backlog of history so charts aren't empty on first paint. */
export function seedHistory(simMinutes: number, count: number, intervalMinutes: number): TelemetryPoint[] {
  const out: TelemetryPoint[] = [];
  let soc = START_SOC;
  for (let i = count; i > 0; i--) {
    const t = simMinutes - i * intervalMinutes;
    const s = sampleAt(Math.max(t, 0));
    const renewable = s.solar + s.wind;
    const { battery, socDeltaPct } = dispatch(soc, Math.max(0, s.demand - renewable));
    const grid = Math.max(0, s.demand + battery - renewable);
    soc = Math.min(96, Math.max(12, soc + socDeltaPct));
    out.push({
      t,
      demand: Math.round(s.demand),
      grid: Math.round(grid),
      solar: Math.round(s.solar),
      wind: Math.round(s.wind),
      battery: Math.round(battery),
      soc: Math.round(soc * 10) / 10,
    });
  }
  return out;
}

export { START_SOC, PEAK_THRESHOLD_KW as PEAK_THRESHOLD };

/** Electricity tariff: $0.08/kWh off-peak, $0.168/kWh mid, $0.31/kWh peak. */
export function tariffAt(t: number): number {
  const h = (t / 60) % 24;
  if (h >= 17 && h < 21) return 0.31;
  if (h >= 7 && h < 17) return 0.168;
  return 0.08;
}

/** Cumulative simulated savings vs. an unshaved baseline (pre-opt $ share). */
export function estimateSavings(history: TelemetryPoint[]): { cumulativeSavings: number; totalKwh: number; co2OffsetKg: number } {
  let cumulativeSavings = 0;
  let totalKwh = 0;
  let co2OffsetKg = 0;
  for (let i = 1; i < history.length; i++) {
    const dt = (history[i].t - history[i - 1].t) / 60; // hours
    const baseline = history[i].demand;
    const actual = history[i].grid;
    if (actual < baseline) {
      // Grid use avoided this interval (battery/renewables covered part).
      const avoidedKwh = (baseline - actual) * dt;
      // Charging cost displaced: renewables are free, battery pulls at off-peak rates when charged.
      cumulativeSavings += avoidedKwh * tariffAt(history[i].t) * 0.55; // ~55% of marginal cost avoided
      co2OffsetKg += avoidedKwh * 0.427; // avg grid intensity kgCO2/kWh
      totalKwh += (baseline - actual) * dt;
    }
  }
  return { cumulativeSavings, totalKwh, co2OffsetKg };
}
