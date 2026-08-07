import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Radio,
  TrendingUp,
  Server,
  Brain,
  ArrowRight,
  LayoutDashboard,
  Bot,
  ChevronRight,
  Cpu,
  Workflow,
  ListChecks,
  Activity,
} from 'lucide-react'

const ROTATING_WORDS = ['predictions.', 'decisions.', 'recommendations.', 'reliability.']

const PIPELINE_STAGES = [
  {
    id: 'telemetry',
    title: 'Sensor Telemetry',
    icon: Radio,
    summary: 'Simulated sensors stream live readings for a 100-machine fleet.',
    detail:
      'A power-law degradation model drives synthetic temperature, rotational speed, vibration, pressure and current readings for every machine, logged on a fixed cycle interval. Because the dataset is fully self-generated rather than drawn from a public benchmark, ground-truth degradation state is always known.',
  },
  {
    id: 'prediction',
    title: 'Failure Prediction',
    icon: TrendingUp,
    summary: 'A trained XGBoost model estimates failure probability over the next 168 hours.',
    detail:
      'Sixty engineered features, including rolling statistics, degradation trends and machine age, feed a gradient-boosted classifier trained on a frozen, leakage-checked dataset. The model is exposed to the agent as a callable tool, one source of evidence among several it can draw on.',
  },
  {
    id: 'mcp',
    title: 'MCP Server',
    icon: Server,
    summary: 'A custom FastMCP server exposes fleet data and predictions as callable tools.',
    detail:
      'Retrieval tools, a trend-analysis tool, and the prediction tool are exposed over the Model Context Protocol, giving the agent structured, leakage-safe access to live fleet data and the trained model through a single consistent interface.',
  },
  {
    id: 'agent',
    title: 'LLM Agent Reasoning',
    icon: Brain,
    summary: 'An LLM orchestrates tool calls to answer questions and recommend maintenance actions.',
    detail:
      'Given a question, the agent decides which tools to call, in what order, and synthesizes the results, including the prediction model\'s output when relevant, into a grounded, explained answer with concrete recommendations.',
  },
]

const STATS = [
  { label: 'Simulated Machines', value: '120' },
  { label: 'Engineered Features', value: '60' },
  { label: 'MCP Tools Exposed', value: '14' },
  { label: 'Sensors Monitored', value: '5' },
  { label: 'Prediction Horizon', value: '168h' },
]

const CAPABILITIES = [
  {
    title: 'Fleet Dashboard',
    description: 'Live telemetry, health scores, and failure probability for every machine.',
    icon: LayoutDashboard,
    to: '/dashboard',
  },
  {
    title: 'Watchlist',
    description: 'Machines needing attention, ranked by severity, one click from the agent.',
    icon: ListChecks,
    to: '/watchlist',
  },
  {
    title: 'AI Assistant',
    description: 'Ask questions in plain language, backed by live data and a full tool trace.',
    icon: Bot,
    to: '/assistant',
  },
  {
    title: 'Machine Detail',
    description: 'Full sensor history, prediction, and an embedded agent for one machine.',
    icon: Activity,
    to: '/dashboard',
  },
]

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

function RotatingWord() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % ROTATING_WORDS.length)
    }, 2400)
    return () => clearInterval(interval)
  }, [])

  return (
    <span
      key={index}
      className="animate-fade-slide inline-block font-display italic text-accent"
    >
      {ROTATING_WORDS[index]}
    </span>
  )
}

export default function LandingPage() {
  const [activeStageId, setActiveStageId] = useState(PIPELINE_STAGES[0].id)
  const activeStage = PIPELINE_STAGES.find((stage) => stage.id === activeStageId)

  return (
    <div className="bg-white">
      <section className="relative overflow-hidden bg-accent-dark">
        <div className="mx-auto max-w-5xl px-4 py-28 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/70">
            <Cpu className="h-3.5 w-3.5" />
            Industrial Predictive Maintenance Platform
          </span>
          <h1 className="font-display mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Turn sensor data into
            <br className="hidden sm:block" />
            <RotatingWord />
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">
           An LLM agent that doesn't just predict, it reasons. 
           Wired into live sensor telemetry, maintenance procedures, and a trained failure-prediction model through a
            custom Model Context Protocol server, it decides for itself which tool the moment calls for.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 hover:bg-accent/90"
            >
              <LayoutDashboard className="h-4 w-4" />
              View Live Dashboard
            </Link>
            <Link
              to="/assistant"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Bot className="h-4 w-4" />
              Launch AI Assistant
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

      <Reveal className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-start gap-4 rounded-xl border border-slate-100 bg-canvas p-6">
          <Workflow className="mt-1 h-6 w-6 flex-shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              What this platform is
            </p>
            <p className="mt-2 text-lg text-ink">
              A single agent that reasons over your fleet's live data, calling the tools it needs,
              including a trained prediction model, to answer questions in plain language and
              recommend concrete maintenance actions, grounded in what the tools actually return.
            </p>
          </div>
        </div>
      </Reveal>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How the pipeline works
          </h2>
          <p className="mt-3 text-muted">
            Select a stage to see how data flows through the system.
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE_STAGES.map((stage, index) => {
            const Icon = stage.icon
            const isActive = stage.id === activeStageId
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`group relative flex flex-col items-start rounded-xl border p-5 text-left ${
                  isActive
                    ? 'border-accent bg-accent text-white shadow-lg shadow-accent/20'
                    : 'border-slate-100 bg-white text-ink hover:border-accent/30 hover:shadow-md'
                }`}
              >
                <span className={`font-mono-data mb-3 text-xs font-semibold ${isActive ? 'text-white/70' : 'text-muted'}`}>
                  STAGE {index + 1}
                </span>
                <Icon className={`mb-3 h-7 w-7 ${isActive ? 'text-white' : 'text-accent'}`} />
                <p className="font-display text-base font-semibold">{stage.title}</p>
                <p className={`mt-1 text-sm ${isActive ? 'text-white/80' : 'text-muted'}`}>
                  {stage.summary}
                </p>
                {index < PIPELINE_STAGES.length - 1 && (
                  <ChevronRight className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-slate-200 lg:block" />
                )}
              </button>
            )
          })}
        </div>

        {activeStage && (
          <div className="mt-6 rounded-xl border border-slate-100 bg-canvas p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              {activeStage.title}
            </p>
            <p className="mt-2 text-ink">{activeStage.detail}</p>
          </div>
        )}
      </section>

      <section className="border-t border-slate-100 bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
          <Reveal className="text-center">
            <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              What you can do right now
            </h2>
            <p className="mt-3 text-muted">Four working views into the same live platform.</p>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((capability) => {
              const Icon = capability.icon
              return (
                <Link
                  key={capability.title}
                  to={capability.to}
                  className="group flex flex-col rounded-xl border border-slate-100 bg-white p-5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-display mt-4 text-base font-semibold text-ink">
                    {capability.title}
                  </p>
                  <p className="mt-1.5 text-sm text-muted">{capability.description}</p>
                  <span className="mt-4 flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}