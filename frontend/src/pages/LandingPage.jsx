import { useState } from 'react'
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
  GitCompare,
} from 'lucide-react'

const PIPELINE_STAGES = [
  {
    id: 'telemetry',
    title: 'Sensor Telemetry',
    icon: Radio,
    summary: 'Simulated sensors stream live readings for a 120-machine fleet.',
    detail:
      'A power-law degradation model drives synthetic temperature, rotational speed, vibration, pressure and current readings for every machine, logged on a fixed cycle interval. Because the dataset is fully self-generated rather than drawn from a public benchmark, ground-truth degradation state is always known, which is essential for a fair, controlled comparison between approaches.',
  },
  {
    id: 'prediction',
    title: 'Failure Prediction',
    icon: TrendingUp,
    summary: 'A classical ML model estimates failure probability over the next 168 hours.',
    detail:
      'Sixty engineered features, including rolling statistics, degradation trends and machine age, feed gradient-boosted models trained on a frozen, leakage-checked dataset. The tuned classifier forms the classical machine learning baseline that the LLM agent is evaluated against on identical data splits.',
  },
  {
    id: 'mcp',
    title: 'MCP Server',
    icon: Server,
    summary: 'A custom FastMCP server exposes fleet data and predictions as callable tools.',
    detail:
      'Retrieval tools, an analysis tool, and a prediction tool are exposed over the Model Context Protocol, giving any compatible LLM host structured, leakage-safe access to the same backend data the classical pipeline was trained on.',
  },
  {
    id: 'agent',
    title: 'LLM Agent Reasoning',
    icon: Brain,
    summary: 'An LLM chains MCP tool calls to reason about fleet health in natural language.',
    detail:
      'Given a question, the agent decides which tools to call, in what order, and synthesizes the results into an answer, one tool call at a time. Comparing its accuracy and flexibility against the classical pipeline is the central question this research answers.',
  },
]

const STATS = [
  { label: 'Simulated Machines', value: '120' },
  { label: 'Engineered Features', value: '60' },
  { label: 'Classical ML Models', value: '9' },
  { label: 'MCP Tools Exposed', value: '13' },
]

export default function LandingPage() {
  const [activeStageId, setActiveStageId] = useState(PIPELINE_STAGES[0].id)
  const activeStage = PIPELINE_STAGES.find((stage) => stage.id === activeStageId)

  return (
    <div className="bg-white">
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-950 via-blue-900 to-blue-950">
        <div className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 roundCed-full border border-blue-700 bg-blue-900/60 px-4 py-1.5 text-xs font-medium text-blue-200">
            <Cpu className="h-3.5 w-3.5" />
            Industrial Predictive Maintenance Research
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Predictive Maintenance Platform 
            <br className="hidden sm:block" />
            
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-200">
            A side-by-side evaluation of classical machine learning pipelines against an LLM
            agent reasoning over a custom Model Context Protocol server, built on a fully
            synthetic industrial telemetry dataset.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/50 transition-colors hover:bg-blue-500"
            >
              <LayoutDashboard className="h-4 w-4" />
              View Live Dashboard
            </Link>
            <Link
              to="/assistant"
              className="inline-flex items-center gap-2 rounded-lg border border-blue-700 bg-blue-900/40 px-6 py-3 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-800/60"
            >
              <Bot className="h-4 w-4" />
              Launch AI Assistant
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6 lg:px-8">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-blue-900">{stat.value}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-blue-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-start gap-4 rounded-xl border border-blue-100 bg-blue-50/60 p-6">
          <GitCompare className="mt-1 h-6 w-6 flex-shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Research Question
            </p>
            <p className="mt-2 text-lg text-blue-950">
              Does the flexibility of an LLM-plus-MCP agent architecture justify its accuracy
              trade-off against classical machine learning pipelines for industrial predictive
              maintenance?
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-blue-950 sm:text-3xl">
            How the pipeline works
          </h2>
          <p className="mt-3 text-blue-600">
            Select a stage to see how data flows through the system.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE_STAGES.map((stage, index) => {
            const Icon = stage.icon
            const isActive = stage.id === activeStageId
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStageId(stage.id)}
                className={`group relative flex flex-col items-start rounded-xl border p-5 text-left transition-all ${
                  isActive
                    ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200'
                    : 'border-blue-100 bg-white text-blue-950 hover:border-blue-300 hover:shadow-md'
                }`}
              >
                <span
                  className={`mb-3 text-xs font-semibold ${
                    isActive ? 'text-blue-200' : 'text-blue-400'
                  }`}
                >
                  STAGE {index + 1}
                </span>
                <Icon className={`mb-3 h-7 w-7 ${isActive ? 'text-white' : 'text-blue-600'}`} />
                <p className="text-base font-semibold">{stage.title}</p>
                <p className={`mt-1 text-sm ${isActive ? 'text-blue-100' : 'text-blue-500'}`}>
                  {stage.summary}
                </p>
                {index < PIPELINE_STAGES.length - 1 && (
                  <ChevronRight className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-blue-200 lg:block" />
                )}
              </button>
            )
          })}
        </div>

        {activeStage && (
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/60 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              {activeStage.title}
            </p>
            <p className="mt-2 text-blue-900">{activeStage.detail}</p>
          </div>
        )}
      </section>
    </div>
  )
}