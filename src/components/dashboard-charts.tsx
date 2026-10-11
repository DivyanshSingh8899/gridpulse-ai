import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";

const AXIS_STYLE = { fontSize: 11, fill: "oklch(0.52 0.03 235)" };

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid oklch(1 0 0 / 60%)",
  background: "oklch(1 0 0 / 85%)",
  backdropFilter: "blur(8px)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(59,130,246,0.12)",
};

export type ChartPoint = {
  t: string;
  demand: number;
  grid: number;
  solar: number;
  wind: number;
  socpct: number;
};

/** Grid vs renewables stacked area with demand line + threshold reference. */
export function MicrogridChart({
  data,
  threshold,
}: {
  data: ChartPoint[];
  threshold: number;
}) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="gGrid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--energy)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--energy)" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="gSolar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--renewable)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--renewable)" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="gWind" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--storage)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--storage)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.7 0.04 230 / 20%)" vertical={false} />
          <XAxis dataKey="t" tick={AXIS_STYLE} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={48} unit=" kW" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => `${v} kW`} />
          <Area type="monotone" dataKey="grid" name="Grid" stroke="var(--energy)" strokeWidth={2} fill="url(#gGrid)" stackId="supply" />
          <Area type="monotone" dataKey="solar" name="Solar" stroke="var(--renewable)" strokeWidth={2} fill="url(#gSolar)" stackId="supply" />
          <Area type="monotone" dataKey="wind" name="Wind" stroke="var(--storage)" strokeWidth={2} fill="url(#gWind)" stackId="supply" />
          <Line type="monotone" dataKey="demand" name="Demand" stroke="oklch(0.35 0.05 240)" strokeWidth={2} dot={false} strokeDasharray="5 3" />
          <ReferenceLine y={threshold} stroke="oklch(0.58 0.22 27)" strokeDasharray="4 4" label={{ value: `${threshold} kW threshold`, position: "insideTopRight", fontSize: 10, fill: "oklch(0.58 0.22 27)" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Battery state-of-charge line. */
export function SocChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-[190px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.7 0.04 230 / 20%)" vertical={false} />
          <XAxis dataKey="t" tick={AXIS_STYLE} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
          <YAxis domain={[10, 100]} tick={AXIS_STYLE} tickLine={false} axisLine={false} width={40} unit="%" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => `${v}% SOC`} />
          <Line type="monotone" dataKey="socpct" name="Battery SOC" stroke="var(--storage)" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cumulative savings ($ bar) and CO₂ (implied line) over the session. */
export function SavingsChart({
  history,
  savingsSeries,
}: {
  history: { t: number }[];
  savingsSeries: { t: string; dollars: number; co2: number }[];
}) {
  void history;
  return (
    <div className="h-[190px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={savingsSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.7 0.04 230 / 20%)" vertical={false} />
          <XAxis dataKey="t" tick={AXIS_STYLE} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={40} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string, name) => (name === "dollars" ? `$${v}` : `${v} kg CO₂`)} />
          <Bar dataKey="dollars" name="dollars" fill="oklch(0.62 0.15 150)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
