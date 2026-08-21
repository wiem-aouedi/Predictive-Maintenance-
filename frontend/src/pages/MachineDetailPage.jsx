import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Send,
  Loader2,
  Sparkles,
  ShieldCheck,
  Thermometer,
  Waves,
  Zap,
  Gauge,
  RotateCw,
  WifiOff,
  Printer,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const HISTORY_POINTS = 48

const STATUS_BADGE_DARK = {
  healthy: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
  warning: 'bg-amber-400/15 text-amber-300 border-amber-400/20',
  critical: 'bg-orange-400/15 text-orange-300 border-orange-400/20',
  failed: 'bg-red-400/15 text-red-300 border-red-400/20',
}

const METRICS = [
  { key: 'temperature', label: 'Temperature', unit: '°C', worsensWhen: 'up', icon: Thermometer },
  { key: 'vibration', label: 'Vibration', unit: 'mm/s', worsensWhen: 'up', icon: Waves },
  { key: 'current', label: 'Current', unit: 'A', worsensWhen: 'up', icon: Zap },
  { key: 'pressure', label: 'Pressure', unit: 'bar', worsensWhen: 'down', icon: Gauge },
  { key: 'rotational_speed', label: 'Rotational Speed', unit: 'RPM', worsensWhen: 'down', icon: RotateCw },
]

function machineLabel(id, machineName) {
  return machineName || `Machine-${String(id).padStart(3, '0')}`
}

function findThresholdCrossing(history, key) {
  const firstNonHealthy = history.find((row) => row.status && row.status !== 'healthy')
  return firstNonHealthy ? firstNonHealthy[key] : null
}

function formatTick(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatFullTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString()
}

function computeTrend(history, metric) {
  if (history.length < 2) return { value: null, isBad: null, direction: null }
  const last = history[history.length - 1][metric.key]
  const refIndex = Math.max(0, history.length - 7)
  const ref = history[refIndex][metric.key]
  if (last == null || ref == null) return { value: last, isBad: null, direction: null }
  const delta = last - ref
  if (Math.abs(delta) < 1e-9) return { value: last, isBad: null, direction: 'flat' }
  const direction = delta > 0 ? 'up' : 'down'
  return { value: last, isBad: direction === metric.worsensWhen, direction }
}

async function fetchMachineInfo(id) {
  const { data, error } = await supabase
    .from('machines')
    .select('id, machine_name')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

async function fetchHistoryFromSupabase(machineId, limit = HISTORY_POINTS) {
  const { data, error } = await supabase
    .from('sensor_data')
    .select(
      'machine_id, timestamp, temperature, vibration, rotational_speed, pressure, current, degradation, status, failure'
    )
    .eq('machine_id', machineId)
    .lte('timestamp', new Date().toISOString())
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data.slice().reverse()
}

async function fetchPrediction(machineId) {
  try {
    const response = await fetch(`/api/predict/${machineId}`)
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

async function postChat(conversationId, message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  })
  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`)
  }
  return response.json()
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function HealthRing({ score }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const safeScore = score ?? 0
  const offset = circumference - (safeScore / 100) * circumference
  const color = score == null ? '#64748b' : safeScore >= 60 ? '#34d399' : safeScore >= 35 ? '#fbbf24' : '#f87171'

  return (
    <svg viewBox="0 0 140 140" className="mx-auto h-32 w-32" style={{ filter: `drop-shadow(0 0 10px ${color}33)` }}>
      <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="9" />
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 600ms ease, stroke 600ms ease' }}
      />
      <text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="700" fill="white" className="font-mono-data">
        {score != null ? score : '—'}
      </text>
      <text x="70" y="86" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.5)" letterSpacing="1.5">
        HEALTH
      </text>
    </svg>
  )
}

function TrendArrow({ isBad, direction }) {
  if (direction === 'flat' || direction == null) return <Minus className="h-3 w-3 text-white/30" />
  const Icon = direction === 'up' ? ArrowUpRight : ArrowDownRight
  return <Icon className={`h-3 w-3 ${isBad ? 'text-red-400' : 'text-emerald-400'}`} />
}

function TranscriptEntry({ message }) {
  const isUser = message.role === 'user'
  const isError = message.role === 'error'
  const roleLabel = isUser ? 'YOU' : isError ? 'SYSTEM' : 'AGENT'
  const bubbleClass = isUser
    ? 'border-accent/15 bg-accent/5'
    : isError
    ? 'border-red-200 bg-red-50'
    : 'border-slate-200 bg-slate-50'

  return (
    <div className={`rounded-lg border px-3.5 py-2.5 ${bubbleClass}`}>
      <p
        className={`font-mono-data text-[10px] font-semibold uppercase tracking-[0.15em] ${
          isUser ? 'text-accent' : isError ? 'text-red-500' : 'text-muted'
        }`}
      >
        {roleLabel}
      </p>
      <div className={`mt-1 text-sm ${isError ? 'text-red-600' : 'text-ink'}`}>
        {isUser || isError ? (
          message.content
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
      {!isUser && !isError && message.trace && message.trace.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.trace.map((step, i) => (
            <span
              key={`${step.tool}-${i}`}
              className="font-mono-data rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-muted"
            >
              {step.tool}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MachineDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const machineId = Number(id)

  const [machineName, setMachineName] = useState(null)
  const [history, setHistory] = useState([])
  const [prediction, setPrediction] = useState(null)
  const [errorMessage, setErrorMessage] = useState(
    isSupabaseConfigured ? null : 'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
  )

  const [conversationId, setConversationId] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const scrollAnchorRef = useRef(null)
  const [generatedAt] = useState(() => new Date())

  const label = machineLabel(machineId, machineName)

  const load = useCallback(async () => {
    if (!Number.isFinite(machineId)) {
      setErrorMessage('Invalid machine ID.')
      return
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
      return
    }

    setErrorMessage(null)
    try {
      const info = await fetchMachineInfo(machineId)
      setMachineName(info.machine_name)
      const hist = await fetchHistoryFromSupabase(machineId)
      if (!hist || hist.length === 0) throw new Error('No sensor history found')
      setHistory(hist)
    } catch (error) {
      setMachineName(null)
      setHistory([])
      setErrorMessage(error.message || 'Could not reach Supabase.')
    }

    const predictionData = await fetchPrediction(machineId)
    setPrediction(predictionData)
  }, [machineId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const latest = history.length > 0 ? history[history.length - 1] : null
  const healthScore = latest ? Math.round((1 - latest.degradation) * 100) : null

  const heroMetric = useMemo(() => {
    if (history.length < 2) return METRICS[1]
    let best = METRICS[1]
    let bestSeverity = -Infinity
    for (const metric of METRICS) {
      const first = history[0][metric.key]
      const last = history[history.length - 1][metric.key]
      if (first == null || last == null || first === 0) continue
      const pctChange = (last - first) / Math.abs(first)
      const severity = metric.worsensWhen === 'up' ? pctChange : -pctChange
      if (severity > bestSeverity) {
        bestSeverity = severity
        best = metric
      }
    }
    return best
  }, [history])

  const heroThreshold = useMemo(
    () => findThresholdCrossing(history, heroMetric.key),
    [history, heroMetric]
  )
  const sparklineMetrics = METRICS.filter((m) => m.key !== heroMetric.key)

  async function handleSend(rawText) {
    const text = rawText.trim()
    if (!text || chatLoading) return

    setChatMessages((prev) => [...prev, { id: createMessageId(), role: 'user', content: text }])
    setChatInput('')
    setChatLoading(true)

    try {
      const data = await postChat(conversationId, text)
      setConversationId(data.conversation_id)
      setChatMessages((prev) => [...prev, ...data.display.slice(-2)])
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        { id: createMessageId(), role: 'error', content: `Could not reach the assistant backend. ${error.message}` },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(chatInput)
    }
  }

  const quickPrompts = [
    `Explain the failure risk for ${label}`,
    `What maintenance actions do you recommend for ${label}?`,
    `Summarize recent sensor trends for ${label}`,
  ]

  if (!Number.isFinite(machineId)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-400">Invalid machine</p>
        <p className="mt-2 text-muted">No valid machine ID was provided in the URL.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="no-print mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-sm font-medium text-accent transition-colors hover:bg-accent/5 hover:text-accent-dark"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-accent shadow-sm transition-colors hover:bg-accent/5"
          >
            <Printer className="h-4 w-4" />
            Export report
          </button>
        </div>

        <div className="print-only mb-6">
          <h1 className="font-editorial text-2xl font-semibold text-ink">{label} — Maintenance Report</h1>
          <p className="mt-1 text-sm text-muted">Generated {generatedAt.toLocaleString()}</p>
        </div>

        {errorMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            No live simulator data for this machine. {errorMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="print-sidebar rounded-xl border border-white/10 bg-accent-dark p-6">
              <HealthRing score={healthScore} />
              <p className="font-editorial mt-4 text-center text-xl font-semibold text-white">{label}</p>
              {latest && (
                <div className="mt-2 flex justify-center">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono-data text-[11px] font-semibold uppercase tracking-wide ${
                      STATUS_BADGE_DARK[latest.status] || STATUS_BADGE_DARK.healthy
                    }`}
                  >
                    {latest.status}
                  </span>
                </div>
              )}

              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="font-mono-data text-[11px] uppercase tracking-[0.15em] text-accent/80">
                  Diagnosis
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <ShieldCheck className={`h-4 w-4 ${prediction?.predicted_failure_next_168h ? 'text-amber-400' : 'text-emerald-400'}`} />
                  <p className="text-sm text-white">
                    {prediction ? (prediction.predicted_failure_next_168h ? 'Failure likely' : 'No failure predicted') : 'Awaiting prediction'}
                  </p>
                </div>
                <p className="font-mono-data mt-3 text-3xl font-bold text-white">
                  {prediction?.failure_probability_percent != null ? `${prediction.failure_probability_percent.toFixed(2)}%` : '—'}
                </p>
                <p className="text-xs text-white/40">168h failure probability</p>
                {prediction?.model_name && (
                  <p className="font-mono-data mt-2 text-[11px] text-white/30">
                    {prediction.model_name}
                  </p>
                )}
              </div>

              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="font-mono-data text-[11px] uppercase tracking-[0.15em] text-accent/80">
                  Vitals
                </p>
                <div className="mt-2">
                  {METRICS.map((metric) => {
                    const trend = computeTrend(history, metric)
                    return (
                      <div key={metric.key} className="flex items-center justify-between border-b border-white/10 py-2.5 last:border-0">
                        <span className="text-xs text-white/50">{metric.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-data text-sm font-semibold text-white">
                            {trend.value != null ? `${trend.value}${metric.unit}` : '—'}
                          </span>
                          <TrendArrow isBad={trend.isBad} direction={trend.direction} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="card-hover rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <heroMetric.icon className="h-4 w-4 text-accent" />
                <p className="text-sm font-semibold text-ink">
                  Leading indicator — {heroMetric.label}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted">
                The sensor that has moved furthest from its own baseline for this machine.
              </p>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#5b6b8c' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5b6b8c' }} domain={['auto', 'auto']} />
                    <Tooltip
                      labelFormatter={formatFullTimestamp}
                      formatter={(value) => [`${value} ${heroMetric.unit}`, heroMetric.label]}
                    />
                    <Line type="monotone" dataKey={heroMetric.key} stroke="#2f5fff" strokeWidth={2} dot={false} />
                    {heroThreshold != null && (
                      <ReferenceLine
                        y={heroThreshold}
                        stroke="#ef4444"
                        strokeDasharray="5 3"
                        label={{ value: 'Warning threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {sparklineMetrics.map((metric) => {
                const trend = computeTrend(history, metric)
                return (
                  <div key={metric.key} className="card-hover rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <metric.icon className="h-3.5 w-3.5 text-muted" />
                        <p className="text-xs text-muted">{metric.label}</p>
                      </div>
                      <TrendArrow isBad={trend.isBad} direction={trend.direction} />
                    </div>
                    <p className="font-mono-data mt-1 text-lg font-bold text-ink">
                      {trend.value != null ? `${trend.value}${metric.unit}` : '—'}
                    </p>
                    <div className="mt-1 h-10">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <Line
                            type="monotone"
                            dataKey={metric.key}
                            stroke="#94a3b8"
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="no-print mt-4 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="font-editorial text-lg font-semibold text-ink">Consultation</p>
                <p className="text-xs text-muted">Ask the agent about {label} specifically.</p>
              </div>

              <div className="thin-scrollbar max-h-[380px] min-h-[160px] overflow-y-auto px-5 py-4">
                <div className="space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                        <Sparkles className="h-5 w-5 text-accent" />
                      </span>
                      <p className="mt-2 text-xs text-muted">No questions asked yet.</p>
                    </div>
                  )}
                  {chatMessages.map((message) => (
                    <TranscriptEntry key={message.id} message={message} />
                  ))}
                  {chatLoading && (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                      Thinking...
                    </div>
                  )}
                  <div ref={scrollAnchorRef} />
                </div>
              </div>

              <div className="border-t border-slate-200 px-5 py-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSend(prompt)}
                      disabled={chatLoading}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20">
                  <textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask about ${label}...`}
                    rows={1}
                    className="max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleSend(chatInput)}
                    disabled={chatLoading || !chatInput.trim()}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-slate-200"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
