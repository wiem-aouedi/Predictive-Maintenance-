import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'

const ROTATING_PHRASES = [
  'before it happens.',
  'before it costs you.',
  'with real evidence.',
  'in plain language.',
]

const STATS = [
  { label: 'Simulated Machines', value: '120' },
  { label: 'Engineered Features', value: '60' },
  { label: 'MCP Tools Exposed', value: '15' },
  { label: 'Sensors Monitored', value: '5' },
  { label: 'Prediction Horizon', value: '168h' },
]

const ZONES = [
  {
    label: 'Healthy',
    tagClass: 'bg-emerald-500/15 text-emerald-300',
    description: 'Degradation below 50%. Normal telemetry, no flags raised.',
  },
  {
    label: 'Warning',
    tagClass: 'bg-amber-500/15 text-amber-300',
    description: "Engineered trend features cross rolling-stat thresholds; the machine appears on the Watchlist.",
  },
  {
    label: 'Critical',
    tagClass: 'bg-orange-500/15 text-orange-300',
    description: 'Failure probability rises sharply; the agent recommends an inspection window.',
  },
  {
    label: 'Failed',
    tagClass: 'bg-red-500/15 text-red-300',
    description: 'Functional failure reached. Readings continue briefly for post-failure labeling.',
  },
]

const MCP_TOOLS = [
  {
    category: 'Fleet Overview',
    title: 'Fleet Health Summary',
    description: 'Aggregates live status across every machine into a single leakage-safe snapshot the agent can reason from.',
    tags: ['Live data', 'As-of timestamp', 'Read-only'],
  },
  {
    category: 'Machine Detail',
    title: 'Machine & Sensor Lookup',
    description: "Pulls full sensor history for one machine, bounded by an as-of timestamp guard so the agent never sees data from the future.",
    tags: ['Leakage-safe', 'Per-machine', 'Time-bounded'],
  },
  {
    category: 'Fleet Filtering',
    title: 'Status-Based Listing',
    description: 'Lists every machine currently in a given health state, the same query the Watchlist page runs directly.',
    tags: ['Warning', 'Critical', 'Failed'],
  },
  {
    category: 'Trend Analysis',
    title: 'Sensor Trend Analysis',
    description: "Computes rolling statistics and slope over a machine's recent readings, the signal used to flag early degradation.",
    tags: ['Rolling stats', 'Slope', 'Early signal'],
  },
  {
    category: 'Predictive Model',
    title: '168-Hour Failure Prediction',
    description: 'Calls the trained XGBoost classifier directly, one tool among several, not a separate competing system.',
    tags: ['XGBoost', 'Threshold-tuned', '168h horizon'],
  },
  {
    category: 'Knowledge Base',
    title: 'Maintenance Documentation Search',
    description: "Retrieves grounded passages from technical manuals so recommendations cite real guidance, not guesses.",
    tags: ['RAG', 'Grounded', 'Retrieval'],
  },
]

function buildDegradationCurve(points = 60, Tf = 6000, alpha = 2.2) {
  const curve = []
  for (let i = 0; i <= points; i += 1) {
    const t = (i / points) * Tf * 1.02
    const raw = Math.pow(t / Tf, alpha)
    const degradation = Math.min(1, raw)
    curve.push({ t: Math.round(t), degradation: Number(degradation.toFixed(4)) })
  }
  return curve
}

const DEGRADATION_CURVE = buildDegradationCurve()

function Reveal({ children, className = '' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  )
}

function RotatingLine() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % ROTATING_PHRASES.length)
    }, 2600)
    return () => clearInterval(interval)
  }, [])

  return (
    <span key={index} className="animate-fade-slide font-editorial italic text-gradient-accent">
      {ROTATING_PHRASES[index]}
    </span>
  )
}

export default function LandingPage() {
  return (
    <div className="bg-white">
      <section className="hero-grid relative overflow-hidden bg-accent-dark">
        <div className="mx-auto max-w-5xl px-4 py-28 sm:px-6 sm:py-32 lg:px-8">
          <p className="font-mono-data text-xs uppercase tracking-[0.2em] text-accent/80">
            Industrial Predictive Maintenance Platform
          </p>
          <h1 className="font-editorial mt-6 text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
            Every machine tells you
            <br />
            <RotatingLine />
          </h1>
          <p className="mt-8 max-w-xl text-base text-white/60 sm:text-lg">
           An LLM agent that doesn't just predict, it reasons. Wired into live sensor telemetry, maintenance procedures,
            and a trained failure-prediction model through a custom Model Context Protocol server, it decides for itself which tool the moment calls for.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              to="/assistant"
              className="shadow-glow-accent inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-sm font-semibold text-accent-dark transition-transform hover:-translate-y-0.5 hover:bg-white/90"
            >
              Launch AI Assistant
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white"
            >
              View Live Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-canvas">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-5 sm:px-6 lg:px-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-mono-data text-3xl font-bold text-ink">{stat.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/5 bg-accent-dark">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal>
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
              <div>
                <p className="font-mono-data text-xs uppercase tracking-[0.2em] text-accent/80">
                  The Degradation Model : How The Platform Sees Risk
                </p>
                <h2 className="font-editorial mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                  Every machine degrades
                  <br />
                  <span className="italic text-white/50">quietly, until it doesn't.</span>
                </h2>
                <p className="mt-6 text-white/60">
                  Each simulated machine follows a power-law degradation curve, D(t) = (t / Tf)^alpha,
                  rising from zero toward failure at its own pace. The platform's four status zones
                  mark where the tools and the agent start paying closer attention.
                </p>

                <div className="mt-8 space-y-3">
                  {ZONES.map((zone) => (
                    <div
                      key={zone.label}
                      className="flex items-start gap-4 rounded-lg border border-white/10 bg-white/5 p-4"
                    >
                      <span
                        className={`mt-0.5 flex-shrink-0 rounded px-2 py-0.5 font-mono-data text-[11px] font-semibold uppercase tracking-wide ${zone.tagClass}`}
                      >
                        {zone.label}
                      </span>
                      <p className="text-sm text-white/60">{zone.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <p className="font-mono-data text-xs uppercase tracking-wide text-white/40">
                  Degradation vs. Time 
                </p>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={DEGRADATION_CURVE} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="t" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} tickFormatter={() => ''} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} />
                      <Line type="monotone" dataKey="degradation" stroke="#5b8dff" strokeWidth={2} dot={false} />
                      <ReferenceLine y={0.5} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'Warning', position: 'insideTopRight', fill: '#f59e0b', fontSize: 10 }} />
                      <ReferenceLine y={0.8} stroke="#f97316" strokeDasharray="4 3" label={{ value: 'Critical', position: 'insideTopRight', fill: '#f97316', fontSize: 10 }} />
                      <ReferenceLine y={0.95} stroke="#ef4444" strokeDasharray="4 3" label={{ value: 'Failed', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="font-editorial text-3xl font-semibold leading-tight text-ink sm:text-4xl">
              The right tool
              <br className="hidden sm:block" />
              <span className="italic text-muted">for every question.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-muted">
              Each MCP tool exposes one narrow, leakage-safe capability. The agent chooses which to
              call, and in what order, based on what the question actually needs.
            </p>
          </Reveal>

          <Reveal className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
            {MCP_TOOLS.map((tool) => (
              <div key={tool.title} className="bg-white p-6">
                <p className="font-mono-data text-[11px] font-semibold uppercase tracking-wide text-accent">
                  {tool.category}
                </p>
                <p className="font-editorial mt-2 text-lg font-semibold text-ink">{tool.title}</p>
                <p className="mt-2 text-sm text-muted">{tool.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {tool.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="bg-accent-dark">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="font-editorial text-2xl font-semibold text-white sm:text-3xl">
              Explore the <span className="italic text-white/50">live platform.</span>
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/dashboard"
                className="rounded-md border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
              >
                Dashboard
              </Link>
              <Link
                to="/watchlist"
                className="rounded-md border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
              >
                Watchlist
              </Link>
              <Link
                to="/assistant"
                className="shadow-glow-accent rounded-md bg-white px-5 py-2.5 text-sm font-medium text-accent-dark transition-transform hover:-translate-y-0.5 hover:bg-white/90"
              >
                AI Assistant
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
