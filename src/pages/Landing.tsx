import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BatteryCharging,
  Bot,
  CheckCircle2,
  Cpu,
  Leaf,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const FEATURES = [
  {
    icon: BarChart3,
    title: "Real-Time Microgrid Analytics",
    body: "Live grids of grid draw, solar & wind generation, and battery state-of-charge — streamed and forecast with time-series models for peak-shaving decisions.",
    accent: "oklch(0.55 0.13 225)",
  },
  {
    icon: ScanSearch,
    title: "AI E-Waste Inspector",
    body: "Scan discarded electronics, solar panels and EV battery packs. Vision models grade degradation and hazard, then compute secondary-life value.",
    accent: "oklch(0.66 0.14 165)",
  },
  {
    icon: Bot,
    title: "Bedrock ESG Copilot",
    body: "Ask about carbon savings, hazardous-handling steps or compliance status. Export audit-ready CSV summaries in a click.",
    accent: "oklch(0.62 0.13 250)",
  },
];

const PIPELINE = [
  {
    icon: Zap,
    step: "01",
    title: "Sense",
    body: "IoT Core ingests facility telemetry every few seconds: load, PV output, wind, battery SOC.",
  },
  {
    icon: Cpu,
    step: "02",
    title: "Predict",
    body: "Forecasting models project demand and renewable yield, flagging peak windows before they hit.",
  },
  {
    icon: BatteryCharging,
    step: "03",
    title: "Shift",
    body: "Load-switching rules automatically shift flexible loads into battery coverage during spikes.",
  },
  {
    icon: Leaf,
    step: "04",
    title: "Close the loop",
    body: "Retired assets flow into the inspector — repaired, repurposed or safely recycled with tracked CO₂ savings.",
  },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative background blobs */}
      <div className="aurora -left-32 -top-24 size-[420px] bg-gradient-to-br from-cyan-300/60 to-sky-400/40" />
      <div className="aurora right-[-8rem] top-24 size-[380px] bg-gradient-to-br from-emerald-300/50 to-teal-300/40" />
      <div className="aurora bottom-[-10rem] left-1/3 size-[460px] bg-gradient-to-tr from-blue-300/50 to-indigo-200/50" />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="glass flex size-10 items-center justify-center rounded-xl">
            <img src="/logo.svg" alt="GridPulse AI" className="size-6" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            GridPulse<span className="text-gradient-primary"> AI</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <a
            href="#features"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#pipeline"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <a
            href="#impact"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Impact
          </a>
        </nav>
        <Button asChild className="glass-strong gap-2 rounded-xl font-medium">
          <Link to="/dashboard">
            Launch console <ArrowRight className="size-4" />
          </Link>
        </Button>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 pt-20 pb-16 text-center md:pt-28">
        <motion.div initial="hidden" animate="visible" custom={0} variants={fadeUp}>
          <Badge
            variant="outline"
            className="glass-subtle gap-2 rounded-full border-transparent px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground"
          >
            <Sparkles className="size-3.5 text-primary" />
            Hackathon Track 03 — Waste &amp; Energy
          </Badge>
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          custom={1}
          variants={fadeUp}
          className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl"
        >
          One platform for
          <br />
          <span className="text-gradient-primary">energy &amp; e-waste</span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          custom={2}
          variants={fadeUp}
          className="mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground"
        >
          GridPulse AI optimizes renewable microgrids with real-time forecasting
          and peak-shaving — then keeps retired electronics and battery packs
          out of landfill with computer-vision lifecycle audits.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          custom={3}
          variants={fadeUp}
          className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="glass-strong h-12 gap-2 rounded-xl px-7 text-base font-semibold">
            <Link to="/dashboard">
              Open live dashboard <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="glass-subtle h-12 rounded-xl px-6 text-base font-medium text-foreground/80"
          >
            <a href="#features">Explore features</a>
          </Button>
        </motion.div>

        {/* Mini glass telemetry preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="glass glass-ring relative mt-14 w-full max-w-3xl rounded-3xl p-6 text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Facility 01 · live telemetry
            </div>
            <span className="text-xs text-muted-foreground">AWS IoT Core · simulated</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4">
            {[
              { label: "Grid draw", value: "412 kW", color: "text-[var(--energy)]" },
              { label: "Renewables", value: "567 kW", color: "text-[var(--renewable)]" },
              { label: "Battery SOC", value: "78 %", color: "text-[var(--storage)]" },
            ].map((s) => (
              <div key={s.label} className="glass-subtle rounded-2xl px-4 py-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`mt-1 font-display text-2xl font-bold ${s.color}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="text-sm font-semibold tracking-widest text-primary uppercase">Platform</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
            Three AI layers, one control room
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              custom={i}
              variants={fadeUp}
              className="glass glass-ring group relative rounded-3xl p-7 transition-transform duration-300 hover:-translate-y-1"
            >
              <div
                className="flex size-12 items-center justify-center rounded-2xl text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${f.accent}, oklch(from ${f.accent} l s h / 0.7))` } as React.CSSProperties}
              >
                <f.icon className="size-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pipeline / How it works */}
      <section id="pipeline" className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <div className="mb-12 text-center">
          <p className="text-sm font-semibold tracking-widest text-primary uppercase">How it works</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
            From electrons to end-of-life
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {PIPELINE.map((p, i) => (
            <motion.div
              key={p.step}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              custom={i}
              variants={fadeUp}
              className="glass-subtle relative rounded-3xl p-6"
            >
              <span className="font-display text-4xl font-bold text-primary/20">{p.step}</span>
              <div className="mt-3 flex items-center gap-2">
                <p.icon className="size-4 text-primary" />
                <h3 className="font-semibold">{p.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Impact stats */}
      <section id="impact" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="glass glass-ring overflow-hidden rounded-[2rem] px-8 py-12 text-center md:px-14"
        >
          <div className="grid gap-10 md:grid-cols-4">
            {[
              { icon: TrendingDown, value: "23%", label: "Peak demand shaved" },
              { icon: Leaf, value: "18.4t", label: "CO₂ offset monthly" },
              { icon: ShieldCheck, value: "1,240+", label: "Assets audited" },
              { icon: CheckCircle2, value: "$41k", label: "Secondary value recovered" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-2">
                <s.icon className="size-5 text-primary" />
                <span className="font-display text-4xl font-bold">{s.value}</span>
                <span className="text-sm text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center gap-4">
            <h3 className="font-display text-2xl font-bold md:text-3xl">
              Ready to run your facility on it?
            </h3>
            <Button asChild size="lg" className="glass-strong h-12 gap-2 rounded-xl px-7 font-semibold">
              <Link to="/dashboard">
                Launch console <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      <footer className="relative z-10 border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        GridPulse AI · Hackathon prototype · AWS Bedrock &amp; Rekognition mock simulation
      </footer>
    </div>
  );
}
