import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BatteryCharging,
  Bot,
  Camera,
  Download,
  FileText,
  Leaf,
  Loader2,
  LogOut,
  Pause,
  Play,
  RefreshCcw,
  ScanLine,
  Siren,
  Sun,
  Upload,
  Wrench,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MicrogridChart,
  SavingsChart,
  SocChart,
  type ChartPoint,
} from "@/components/dashboard-charts";
import { useAuth } from "@/hooks/use-auth";
import { useMicrogrid } from "@/hooks/use-microgrid";
import { useBackendTelemetry } from "@/hooks/use-backend-telemetry";
import { checkBackend, askCopilot, exportAuditCsv, inspectImage } from "@/lib/api-client";
import { ACTION_STYLES, type InspectionResult, analyzeImage } from "@/lib/e-waste";
import {
  type ChatMessage,
  type EsgStats,
  SUGGESTED_PROMPTS,
  answerQuestion,
  buildAuditCsv,
  downloadCsv,
} from "@/lib/esg-copilot";
import {
  PEAK_THRESHOLD,
  type TelemetryPoint,
  estimateSavings,
  formatClock,
  formatKW,
} from "@/lib/microgrid";
import logo from "@/assets/logo.svg";

type Scan = {
  id: string;
  name: string;
  result: InspectionResult;
  previewUrl: string;
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const local = useMicrogrid();
  const backend = useBackendTelemetry();
  const [backendInfo, setBackendInfo] = useState<Awaited<ReturnType<typeof checkBackend>> | null>(null);

  // Prefer the backend SSE stream when connected; otherwise the local simulator.
  const dataSource = backend.status === "live" ? backend : null;
  const history = dataSource ? dataSource.points : local.history;
  const latest = dataSource ? dataSource.latest : local.latest;
  const alerts = dataSource ? dataSource.alerts : local.alerts;
  const pause = dataSource ? null : local.setPaused;
  const paused = dataSource ? false : local.paused;
  const setPaused = (v: boolean) => { if (pause) pause(v); };
  useEffect(() => {
    void checkBackend().then(setBackendInfo);
  }, []);

  const [scans, setScans] = useState<Scan[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentResult, setCurrentResult] = useState<InspectionResult | null>(null);
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi — I'm the GridPulse **ESG Copilot**. Ask me about carbon savings, hazardous-handling compliance, or peak demand, then export an audit CSV when you're ready.",
      ts: Date.now(),
      topic: "bedrock · claude · simulated",
    },
  ]);
  const [draft, setDraft] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const stats: EsgStats = useMemo(() => {
    const { cumulativeSavings, totalKwh, co2OffsetKg } = estimateSavings(history);
    return {
      co2OffsetKg,
      cumulativeSavings,
      totalKwhOptimized: totalKwh,
      peakShavedPct: 23.4,
      assetsRecycled: scans.filter(s => s.result.action === "Safe Recycle").length,
      assetsRepurposed: scans.filter(s => s.result.action === "Repurpose (2nd Life)").length,
      assetsRepaired: scans.filter(s => s.result.action === "Repair").length,
      wasteDivertedKg: scans.reduce((acc, s) => acc + s.result.carbonSavingsKg, 0) * 0.9,
    };
  }, [history, scans]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setAnalyzing(true);
    setCurrentResult(null);
    setCurrentPreview(URL.createObjectURL(file));
    try {
      const res = await inspectImage(file, {
        source: "upload",
        fallback: f => analyzeImage(f, { source: "upload" }),
      });
      const engineLive = "engine" in res && res.engine === "rekognition+bedrock";
      const result: InspectionResult = {
        assetType: res.assetType as InspectionResult["assetType"],
        hazardScore: res.hazardScore,
        degradationPct: res.degradationPct,
        condition: res.condition as InspectionResult["condition"],
        action: res.action,
        actionConfidence: res.actionConfidence,
        residualValue: res.residualValue,
        carbonSavingsKg: res.carbonSavingsKg,
        findings: res.findings,
        summary: res.summary,
        hazardLabels: engineLive ? ["AWS Rekognition"] : [],
        processingMs: res.processingMs,
        modelId: engineLive
          ? "rekognition-custom-labels + bedrock claude-3.5-sonnet"
          : "deterministic-fallback (local)",
      };
      setCurrentResult(result);
      setScans(prev => [
        {
          id: crypto.randomUUID(),
          name: file.name,
          result,
          previewUrl: URL.createObjectURL(file),
        },
        ...prev,
      ]);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      ts: Date.now(),
    };
    setChat(c => [...c, userMsg]);
    setDraft("");
    window.setTimeout(async () => {
      const res = await askCopilot(text, { co2OffsetKg: stats.co2OffsetKg, savingsUsd: stats.cumulativeSavings, peakShavedPct: stats.peakShavedPct, assetsRepaired: stats.assetsRepaired, assetsRepurposed: stats.assetsRepurposed, assetsRecycled: stats.assetsRecycled, wasteDivertedKg: stats.wasteDivertedKg }, q => answerQuestion(q, stats, latest));
      setChat(c => [
        ...c,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: res.answer,
          ts: Date.now(),
          topic: res.engine === "bedrock-converse" ? "bedrock · claude · live" : res.engine === "structured-fallback" && !res.fallbackText ? "server · structured fallback" : "local · offline fallback",
        },
      ]);
    }, 200);
  }, [draft, stats, latest]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleExportCsv = () => {
    void exportAuditCsv(buildAuditCsv(stats, history));
  };

  const chartData: ChartPoint[] = useMemo(
    () =>
      history.slice(-40).map((p: TelemetryPoint) => ({
        t: formatClock(p.t),
        demand: p.demand,
        grid: p.grid,
        solar: p.solar,
        wind: p.wind,
        socpct: p.soc,
      })),
    [history],
  );

  const savingsSeries = useMemo(() => {
    const { cumulativeSavings } = estimateSavings(history);
    const points = 20;
    const out: { t: string; dollars: number; co2: number }[] = [];
    for (let i = 0; i < points; i++) {
      const idx = Math.round(((i + 1) / points) * (history.length - 1));
      const { cumulativeSavings: s, co2OffsetKg: c } = estimateSavings(
        history.slice(0, Math.max(idx, 2)),
      );
      out.push({
        t: formatClock(history[idx]?.t ?? 0),
        dollars: Math.round(s),
        co2: Math.round(c / 1000),
      });
    }
    void cumulativeSavings;
    return out;
  }, [history]);

  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="relative min-h-screen">
      <div className="aurora -left-40 -top-32 size-[420px] bg-gradient-to-br from-cyan-300/50 to-sky-400/30" />
      <div className="aurora right-[-10rem] top-40 size-[340px] bg-gradient-to-br from-emerald-300/40 to-teal-300/30" />

      {/* Top bar */}
      <header className="glass-strong sticky top-0 z-40 mx-4 mt-4 rounded-2xl px-5 py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="GridPulse AI" className="size-8" />
            <div>
              <p className="font-display text-base font-bold leading-tight">GridPulse AI</p>
              <p className="text-xs text-muted-foreground">Facility 01 · Control Console</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => setPaused(!paused)}>
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              <span className="hidden sm:inline">{paused ? "Resume" : "Live"}</span>
            </Button>
            <div className="glass-subtle hidden rounded-lg px-2.5 py-1 md:block">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span
                  className={`size-1.5 rounded-full ${paused ? "bg-amber-500" : "animate-pulse bg-emerald-500"}`}
                />
                {paused ? "Paused" : "Streaming"}
              </span>
            </div>
            <div className="glass-subtle hidden rounded-lg px-2.5 py-1 lg:block">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span
                  className={`size-1.5 rounded-full ${backend.status === "live" ? "bg-sky-500" : "bg-amber-500"}`}
                />
                {backend.status === "live"
                  ? `API · ${backendInfo?.mode === "aws-live" ? "AWS live" : "backend live"}`
                  : "local sim"}
              </span>
            </div>
            <Button variant="ghost" size="sm" className="gap-2" onClick={handleSignOut}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        {/* Greeting */}
        <div className="mb-5">
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Live microgrid telemetry, peak automation and e-waste lifecycle auditing.
          </p>
        </div>

        {/* KPI row */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<Zap className="size-5" />}
            label="Grid import"
            value={formatKW(latest?.grid ?? 0)}
            sub={`of ${formatKW(latest?.demand ?? 0)} demand`}
            accent="oklch(0.62 0.2 15)"
          />
          <KpiCard
            icon={<Sun className="size-5" />}
            label="Solar output"
            value={formatKW(latest?.solar ?? 0)}
            sub={`+${formatKW(latest?.wind ?? 0)} wind`}
            accent="oklch(0.66 0.14 165)"
          />
          <KpiCard
            icon={<BatteryCharging className="size-5" />}
            label="Battery SOC"
            value={`${latest?.soc.toFixed(0) ?? "—"}%`}
            sub={
              latest && latest.battery !== 0
                ? latest.battery > 0
                  ? "charging"
                  : "discharging to grid"
                : "standby"
            }
            accent="oklch(0.62 0.13 250)"
          />
          <KpiCard
            icon={<Leaf className="size-5" />}
            label="CO₂ offset (session)"
            value={`${(stats.co2OffsetKg / 1000).toFixed(2)} t`}
            sub={`$${stats.cumulativeSavings.toFixed(2)} saved`}
            accent="oklch(0.62 0.15 150)"
          />
        </section>

        {/* Charts row */}
        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="glass glass-ring xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="font-display text-lg">Microgrid power flow</CardTitle>
              <Legend />
            </CardHeader>
            <CardContent>
              <MicrogridChart data={chartData} threshold={PEAK_THRESHOLD} />
            </CardContent>
          </Card>

          <Card className="glass glass-ring">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="font-display text-lg">Peak demand alerts</CardTitle>
              <Siren className="size-4 text-red-500" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="glass-subtle rounded-xl px-3 py-2 text-xs text-muted-foreground">
                Automated load-switching rules armed above{" "}
                <span className="font-semibold text-foreground">{PEAK_THRESHOLD} kW</span>
              </div>
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                  <ShieldIcon />
                  No peak events in this window. Battery is covering demand.
                </div>
              ) : (
                alerts.slice(0, 5).map(a => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="glass-subtle rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${a.severity === "critical" ? "text-red-600" : "text-amber-600"}`}
                      >
                        {formatClock(a.atMinutes)} ·{" "}
                        {a.severity === "critical" ? "Critical spike" : "Peak warning"}
                      </span>
                      <Badge variant="outline" className="h-5 px-2 text-[10px]">
                        {a.gridKw} kW
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {a.action}
                    </p>
                  </motion.div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Second charts row */}
        <section className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="glass glass-ring">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="font-display text-lg">Battery SOC</CardTitle>
              <span className="text-xs text-muted-foreground">rolling window</span>
            </CardHeader>
            <CardContent>
              <SocChart data={chartData} />
            </CardContent>
          </Card>
          <Card className="glass glass-ring">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="font-display text-lg">Savings</CardTitle>
              <span className="text-xs text-muted-foreground">cumulative $</span>
            </CardHeader>
            <CardContent>
              <SavingsChart history={history} savingsSeries={savingsSeries} />
            </CardContent>
          </Card>
          <Card className="glass glass-ring">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Asset flows</CardTitle>
            </CardHeader>
            <CardContent className="flex h-[190px] flex-col justify-center gap-4">
              {[
                { icon: RefreshCcw, label: "Repurposed", n: stats.assetsRepurposed, color: "bg-emerald-500" },
                { icon: Wrench, label: "Repaired", n: stats.assetsRepaired, color: "bg-sky-500" },
                { icon: RecycleGlyph, label: "Safe-recycled", n: stats.assetsRecycled, color: "bg-amber-500" },
              ].map(r => (
                <div key={r.label} className="flex items-center gap-3">
                  <div className={`flex size-9 items-center justify-center rounded-xl opacity-80 ${r.color} text-white`}>
                    <r.icon className="size-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{r.label}</span>
                      <span className="font-display font-bold">{r.n}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${r.color}`}
                        style={{ width: `${Math.min(100, r.n * 25)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-center text-xs text-muted-foreground">
                From AI Inspector sessions in this console
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Inspector */}
        <section className="mt-6 grid gap-6 xl:grid-cols-5">
          <Card className="glass glass-ring xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <ScanLine className="size-5 text-emerald-600" />
                AI E-Waste Inspector
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload a photo of discarded electronics, a solar panel or an EV battery
                pack. Rekognition-style classification and Bedrock-style valuation run as
                mock inference in this prototype.
              </p>
            </CardHeader>
            <CardContent>
              <div
                className="glass-subtle relative flex min-h-[240px] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-primary/30 p-6 text-center transition-colors hover:border-primary/60"
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  void handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInput.current?.click()}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    void handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {analyzing ? (
                  <>
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Running Rekognition + Bedrock inference…</p>
                    <p className="text-xs text-muted-foreground">
                      S3 upload → label detection → valuation
                    </p>
                  </>
                ) : currentPreview ? (
                  <>
                    <img
                      src={currentPreview}
                      alt="Uploaded asset"
                      className="absolute inset-0 size-full object-cover opacity-90"
                    />
                    <div className="relative z-10 rounded-full bg-black/50 px-4 py-1.5 text-xs font-medium text-white">
                      Click to rescan
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Upload className="size-6" />
                    </div>
                    <p className="text-sm font-semibold">Drop an image or click to upload</p>
                    <p className="text-xs text-muted-foreground">JPG/PNG up to 10 MB</p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Camera className="size-3.5" /> camera-ready
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <FileText className="size-3.5" /> audit-logged
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["EV pack", "Solar panel", "Laptop", "Tool battery"].map(chip => (
                  <Badge key={chip} variant="outline" className="rounded-full text-xs">
                    {chip}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Inspector results */}
          <Card className="glass glass-ring xl:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">Analysis breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {currentResult ? (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold">{currentResult.assetType}</p>
                      <p className="text-xs text-muted-foreground">{currentResult.modelId}</p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${ACTION_STYLES[currentResult.action].bg} ${ACTION_STYLES[currentResult.action].text}`}
                    >
                      {ACTION_STYLES[currentResult.action].label} · {currentResult.actionConfidence}% conf.
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <ScoreBar label="Hazard score" value={currentResult.hazardScore} />
                    <ScoreBar label="Degradation" value={currentResult.degradationPct} />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <MiniStat label="Residual value" value={`$${currentResult.residualValue.toLocaleString()}`} />
                    <MiniStat label="CO₂ savings" value={`${currentResult.carbonSavingsKg} kg`} />
                    <MiniStat label="Condition" value={currentResult.condition} />
                  </div>

                  <div className="glass-subtle rounded-2xl p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Findings</p>
                    <ul className="mt-2 list-inside space-y-1.5 text-sm">
                      {currentResult.findings.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                      <Bot className="size-3.5" /> Bedrock valuation summary
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                      {currentResult.summary}
                    </p>
                  </div>
                </motion.div>
              ) : analyzing ? (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <ScanLine className="size-8 animate-pulse text-primary" />
                  Classifying asset type, scoring hazard, valuing 2nd-life…
                </div>
              ) : (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <ScanLine className="size-8 text-muted-foreground/50" />
                  Results will appear here after your first scan.
                  <span className="text-xs">
                    Every scan writes to the audit trail and rolls up into the copilot metrics.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Scan history / audit trail */}
        {scans.length > 0 && (
          <Card className="glass glass-ring mt-6">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <FileText className="size-5 text-muted-foreground" /> Audit trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {scans.slice(0, 8).map(s => (
                  <button
                    key={s.id}
                    className="glass-subtle flex items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-white/70"
                    onClick={() => {
                      setCurrentResult(s.result);
                      setCurrentPreview(s.previewUrl);
                    }}
                  >
                    <img src={s.previewUrl} alt={s.name} className="size-12 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.result.assetType}</p>
                      <p className="text-xs text-muted-foreground">
                        ${s.result.residualValue} · hazard {s.result.hazardScore}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Floating copilot launcher + drawer */}
      <Drawer open={copilotOpen} onOpenChange={setCopilotOpen}>
        <DrawerTrigger asChild>
          <button
            className="glass-strong fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-xl transition-transform hover:scale-105"
            onClick={() => setCopilotOpen(true)}
          >
            <Bot className="size-5 text-primary" />
            ESG Copilot
          </button>
        </DrawerTrigger>
        <DrawerContent className="glass-strong">
          <div className="mx-auto w-full max-w-2xl">
            <DrawerHeader className="text-left">
              <DrawerTitle className="flex items-center gap-2 font-display">
                <Bot className="size-5 text-primary" /> ESG Copilot
                <Badge variant="outline" className="ml-2 rounded-full text-[10px]">
                  Amazon Bedrock · simulated
                </Badge>
              </DrawerTitle>
              <DrawerDescription>
                Carbon accounting, hazardous-handling compliance and facility intelligence.
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 pb-2">
              <ScrollArea className="h-[42vh] rounded-xl">
                <div className="space-y-3 pr-3">
                  {chat.map(m => (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "glass-subtle text-foreground"
                        }`}
                      >
                        {m.topic && m.role === "assistant" && (
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {m.topic}
                          </p>
                        )}
                        <div className="whitespace-pre-wrap">
                          {m.text
                            .split(/(\*\*[^*]+\*\*)/g)
                            .map((part, i) =>
                              part.startsWith("**") && part.endsWith("**") ? (
                                <strong key={i}>{part.slice(2, -2)}</strong>
                              ) : (
                                <span key={i}>{part}</span>
                              ),
                            )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map(p => (
                  <button
                    key={p}
                    className="glass-subtle rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setDraft(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex gap-2 pb-4">
                <Input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="Ask the copilot…"
                  className="glass-subtle"
                />
                <Button onClick={() => send()} disabled={!draft.trim()} className="gap-1.5">
                  Ask
                </Button>
                <Button variant="outline" onClick={handleExportCsv} className="glass-subtle gap-1.5">
                  <Download className="size-4" /> CSV
                </Button>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-8 text-emerald-600/70">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function RecycleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.6" />
      <path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.785 1.785 0 0 0 0-1.783l-1.335-2.32" />
      <path d="m14 16-3 3 3 3" />
      <path d="M10 4 7.5 8.5" />
      <path d="M13.5 4H15a2 2 0 0 1 1.75 2.96L14 11" />
    </svg>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <Card className="glass glass-ring">
      <CardContent className="flex items-center gap-4 pb-3 pt-5">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
          style={{
            background: `linear-gradient(135deg, ${accent}, color-mix(in oklch, ${accent} 60%, white))`,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-subtle rounded-2xl p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <Progress value={value} className="mt-2 h-2" />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-subtle rounded-2xl px-3 py-2.5 text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function Legend() {
  const items = [
    { name: "Grid", color: "var(--energy)" },
    { name: "Solar", color: "var(--renewable)" },
    { name: "Wind", color: "var(--storage)" },
    { name: "Demand", color: "oklch(0.35 0.05 240)" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map(i => (
        <span key={i.name} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
