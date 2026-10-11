/**
 * Simulated IoT telemetry engine (server-side).
 * Mirrors the frontend simulator in src/lib/microgrid.ts so numbers match.
 */

export type TelemetryPoint = {
  /** Simulation clock, minutes since midnight. */
  t: number;
  /** Facility demand, kW. */
  demand: number;
  /** Grid import after renewables + battery, kW. */
  grid: number;
  /** Solar PV, kW. */
  solar: number;
  /** Wind, kW. */
  wind: number;
  /** Battery dispatch: + charging, − discharging, kW. */
  battery: number;
  /** Battery state of charge, 0-100. */
  soc: number;
  /** Session-cumulative carbon offset, kg. */
  carbonOffsetKg: number;
  /** Session-cumulative dollar savings. */
  savingsUsd: number;
};

export type PeakAlert = {
  id: string;
  atMinutes: number;
  gridKw: number;
  thresholdKw: number;
  action: string;
  severity: "warning" | "critical";
};

export const PEAK_THRESHOLD_KW = 620;
const BASE_LOAD_KW = 380;
const SOLAR_PEAK_KW = 480;
const WIND_BASE_KW = 120;
const BATTERY_MAX_KW = 350;
const BATTERY_CAPACITY_KWH = 1200;
/** Avg grid carbon intensity, kg CO2 per kWh avoided from import. */
const GRID_INTENSITY_KG_PER_KWH = 0.427;

export function formatClock(t: number): string {
  const h = Math.floor(t / 60) % 24;
  const m = Math.floor(t % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function tariffAt(t: number): number {
  const h = (t / 60) % 24;
  if (h >= 17 && h < 21) return 0.31;
  if (h >= 7 && h < 17) return 0.168;
  return 0.08;
}

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function sampleAt(t: number): { demand: number; solar: number; wind: number } {
  const hour = t / 60;
  const loadShape =
    1 +
    0.16 * Math.max(0, Math.sin(((hour - 9) / 14) * Math.PI)) +
    0.22 * Math.exp(-((hour - 13) ** 2) / 3.2) +
    0.3 * Math.exp(-((hour - 18.5) ** 2) / 2.4);
  const jitter = 0.96 + 0.08 * noise(t * 0.7);
  const demand = BASE_LOAD_KW * loadShape * jitter;

  const solarBell = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const cloud = 0.75 + 0.25 * Math.sin(t * 0.11) * noise(t * 0.23);
  const solar = SOLAR_PEAK_KW * solarBell * Math.min(1, cloud);

  const wind = WIND_BASE_KW * (0.55 + 0.45 * Math.abs(Math.sin(t * 0.045)));
  return { demand, solar, wind };
}

function dispatch(socPct: number, gridWithoutBattery: number): {
  battery: number;
  socDeltaPct: number;
} {
  let battery = 0;
  let socDeltaPct = 0;

  if (gridWithoutBattery > PEAK_THRESHOLD_KW) {
    battery = -Math.min(BATTERY_MAX_KW, gridWithoutBattery - PEAK_THRESHOLD_KW);
  } else if (gridWithoutBattery < PEAK_THRESHOLD_KW - 90 && socPct < 85) {
    battery = Math.min(BATTERY_MAX_KW * 0.6, (PEAK_THRESHOLD_KW - gridWithoutBattery) * 0.5);
  }

  const kwhPerMin = -battery / 60;
  socDeltaPct = (kwhPerMin / BATTERY_CAPACITY_KWH) * 100;

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

export type TickState = {
  t: number;
  soc: number;
  carbonOffsetKg: number;
  savingsUsd: number;
};

/** Advance the simulation one real second (≈ 3 sim-minutes). */
export function tick(prev: TickState): { state: TickState; point: TelemetryPoint; alert: PeakAlert | null } {
  const t = prev.t + 3;

  const { demand, solar, wind } = sampleAt(t);
  const renewable = solar + wind;

  const { battery, socDeltaPct } = dispatch(prev.soc, demand);
  const finalBattery = renewable >= demand + battery ? 0 : battery;
  const soc = Math.min(96, Math.max(12, prev.soc + socDeltaPct * (finalBattery === 0 ? 0 : 1)));

  const grid = Math.max(0, demand + finalBattery - renewable);

  const dtHours = 3 / 60;
  let newCarbon = prev.carbonOffsetKg;
  let newSavings = prev.savingsUsd;
  if (grid < demand) {
    const avoidedKwh = (demand - grid) * dtHours;
    newCarbon += avoidedKwh * GRID_INTENSITY_KG_PER_KWH;
    newSavings += avoidedKwh * tariffAt(t) * 0.55;
  }

  let alert: PeakAlert | null = null;
  if (grid > PEAK_THRESHOLD_KW && grid - PEAK_THRESHOLD_KW > 15 && soc > 12) {
    alert = {
      id: `alert-${Date.now()}-${Math.round(grid)}`,
      atMinutes: t,
      gridKw: Math.round(grid),
      thresholdKw: PEAK_THRESHOLD_KW,
      action: `Load-switch rule LSR-${Math.round(t)}: shifted ${(grid - PEAK_THRESHOLD_KW).toFixed(0)} kW flexible load to battery storage.`,
      severity: grid > PEAK_THRESHOLD_KW + 80 ? "critical" : "warning",
    };
  }

  const point: TelemetryPoint = {
    t,
    demand: Math.round(demand),
    grid: Math.round(grid),
    solar: Math.round(solar),
    wind: Math.round(wind),
    battery: Math.round(finalBattery),
    soc: Math.round(soc * 10) / 10,
    carbonOffsetKg: Math.round(newCarbon * 100) / 100,
    savingsUsd: Math.round(newSavings * 100) / 100,
  };

  return {
    state: { t, soc, carbonOffsetKg: newCarbon, savingsUsd: newSavings },
    point,
    alert,
  };
}

export function initialTickState(startMinutes: number): TickState {
  // Run a backlog so SOC/savings start in a realistic mid-session state.
  let state: TickState = { t: startMinutes, soc: 74, carbonOffsetKg: 0, savingsUsd: 0 };
  for (let i = 0; i < 120; i++) {
    state = tick(state).state;
  }
  return state;
}
