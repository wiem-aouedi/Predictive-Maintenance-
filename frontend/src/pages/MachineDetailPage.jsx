import { useCallback, useEffect, useRef, useState } from 'react'
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
  Gauge,
  AlertTriangle,
  ShieldCheck,
  Thermometer,
  Waves,
  Zap,
  RotateCw,
  Bot,
  User,
  Send,
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
  Sparkles,
  AlertCircle,
  WifiOff,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const HISTORY_POINTS = 48

const STATUS_STYLES = {
  healthy: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  warning: { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  critical: { badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  failed: { badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
}

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.healthy
}

function generateMockHistory(machineId, points = HISTORY_POINTS) {
  const now = Date.now()
  const seedOffset = (machineId % 5) * 0.05
  const rows = []

  for (let i = points - 1; i >= 0; i -= 1) {
    const progress = (points - 1 - i) / (points - 1)
    const degradation = Math.min(0.9, seedOffset + progress * 0.85)
    const noise = () => Math.random() - 0.5

    const temperature = 60 + 40 * degradation + noise() * 1.5
    const vibration = 0.05 + 2 * degradation ** 2 + noise() * 0.02
    const rotational_speed = 1800 - 300 * degradation + noise() * 15
    const pressure = 6 - 2 * degradation + noise() * 0.2
    const current = 10 + 4 * degradation + noise() * 0.4

    let status = 'healthy'
    if (degradation >= 0.95) status = 'failed'
    else if (degradation >= 0.8) status = 'critical'
    else if (degradation >= 0.5) status = 'warning'

    rows.push({
      machine_id: machineId,
      timestamp: new Date(now - i * 60 * 60 * 1000).toISOString(),
      temperature: Number(temperature.toFixed(2)),
      vibration: Number(vibration.toFixed(4)),
      rotational_speed: Number(rotational_speed.toFixed(1)),
      pressure: Number(pressure.toFixed(2)),
      current: Number(current.toFixed(2)),
      degradation: Number(degradation.toFixed(4)),
      status,
      failure: status === 'failed',
    })
  }

  return rows
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

function machineLabel(id, machineName) {
  return machineName || `Machine-${String(id).padStart(3, '0')}`
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

function SummaryCard({ icon: Icon, label, value, subtitle, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    slate: 'bg-slate-50 text-slate-500 border-slate-100',
  }

  return (
    <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-400">{label}</p>
          <p className="text-2xl font-bold text-blue-950">{value}</p>
        </div>
      </div>
      {subtitle && <p className="mt-3 text-xs text-blue-400">{subtitle}</p>}
    </div>
  )
}

function SensorChart({ title, icon: Icon, dataKey, unit, data, threshold }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-blue-500" />
        <p className="text-sm font-semibold text-blue-950">{title}</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
          <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#60a5fa' }} />
          <YAxis tick={{ fontSize: 11, fill: '#60a5fa' }} domain={['auto', 'auto']} />
          <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} ${unit}`, title]} />
          <Line type="monotone" dataKey={dataKey} stroke="#2563eb" strokeWidth={2} dot={false} />
          {threshold != null && (
            <ReferenceLine
              y={threshold}
              stroke="#ef4444"
              strokeDasharray="5 3"
              label={{ value: 'Warning threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MachineToolTraceItem({ step }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50/60">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-blue-700">
          <Wrench className="h-3.5 w-3.5" />
          {step.tool}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-blue-400" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-blue-100 px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-400">Input</p>
            <pre className="mt-1 overflow-x-auto rounded bg-blue-950 px-2 py-1.5 text-[11px] text-blue-100">
              {JSON.stringify(step.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-400">Output</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-blue-950 px-2 py-1.5 text-[11px] text-blue-100">
              {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function MachineChatBubble({ message }) {
  const isUser = message.role === 'user'
  const isError = message.role === 'error'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-blue-600' : isError ? 'bg-red-100' : 'bg-blue-100'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-red-600" />
        ) : (
          <Bot className="h-4 w-4 text-blue-600" />
        )}
      </div>
      <div className={`flex max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-blue-600 text-white'
              : isError
              ? 'rounded-tl-sm border border-red-200 bg-red-50 text-red-700'
              : 'rounded-tl-sm border border-blue-100 bg-white text-blue-950 shadow-sm'
          }`}
        >
          {isUser || isError ? (
            message.content
          ) : (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {!isUser && !isError && message.trace && message.trace.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.trace.map((step, index) => (
              <MachineToolTraceItem key={`${step.tool}-${index}`} step={step} />
            ))}
          </div>
        )}
      </div>
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
  const [usingMockData, setUsingMockData] = useState(!isSupabaseConfigured)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)

  const [conversationId, setConversationId] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const scrollAnchorRef = useRef(null)

  const label = machineLabel(machineId, machineName)

  const load = useCallback(async () => {
    if (!Number.isFinite(machineId)) {
      setErrorMessage('Invalid machine ID.')
      setLoading(false)
      return
    }

    setLoading(true)
    setErrorMessage(null)

    if (!isSupabaseConfigured) {
      setMachineName(null)
      setHistory(generateMockHistory(machineId))
      setUsingMockData(true)
    } else {
      try {
        const info = await fetchMachineInfo(machineId)
        setMachineName(info.machine_name)
        const hist = await fetchHistoryFromSupabase(machineId)
        if (!hist || hist.length === 0) throw new Error('No sensor history found')
        setHistory(hist)
        setUsingMockData(false)
      } catch (error) {
        setErrorMessage(error.message)
        setHistory(generateMockHistory(machineId))
        setUsingMockData(true)
      }
    }

    const predictionData = await fetchPrediction(machineId)
    setPrediction(predictionData)
    setLoading(false)
  }, [machineId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  const latest = history.length > 0 ? history[history.length - 1] : null
  const healthScore = latest ? Math.round((1 - latest.degradation) * 100) : null

  async function handleSend(rawText) {
    const text = rawText.trim()
    if (!text || chatLoading) return

    setChatMessages((prev) => [...prev, { id: createMessageId(), role: 'user', content: text }])
    setChatInput('')
    setChatLoading(true)

    try {
      const data = await postChat(conversationId, text)
      setConversationId(data.conversation_id)
      const lastTwo = data.display.slice(-2)
      setChatMessages((prev) => [...prev, ...lastTwo])
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
    `Explain the failure risk for ${label} (ID ${machineId})`,
    `What maintenance actions do you recommend for ${label} (ID ${machineId})?`,
    `Summarize recent sensor trends for ${label} (ID ${machineId})`,
  ]

  if (!Number.isFinite(machineId)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-400">Invalid machine</p>
        <p className="mt-2 text-blue-500">No valid machine ID was provided in the URL.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-blue-50/40 pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">{label}</h1>
            {latest && (
              <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(latest.status).badge}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle(latest.status).dot}`} />
                {latest.status.charAt(0).toUpperCase() + latest.status.slice(1)}
              </span>
            )}
          </div>
        </div>

        {usingMockData && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            Displaying mock data — Supabase is not connected or returned no rows.
            {errorMessage && <span className="text-amber-500">({errorMessage})</span>}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            icon={Gauge}
            label="Overall Health Score"
            value={healthScore != null ? `${healthScore}%` : '—'}
            subtitle={latest ? 'Derived from current degradation level' : 'No data yet'}
            tone={healthScore != null && healthScore < 40 ? 'amber' : 'emerald'}
          />
          <SummaryCard
            icon={AlertTriangle}
            label="Failure Probability (168h)"
            value={prediction?.failure_probability_percent != null ? `${prediction.failure_probability_percent.toFixed(2)}%` : 'Pending'}
            subtitle={prediction?.model_name ? `From ${prediction.model_name}` : 'Backend unreachable or tool call failed'}
            tone={prediction?.failure_probability_percent == null ? 'slate' : prediction.failure_probability_percent > 50 ? 'amber' : 'emerald'}
          />
          <SummaryCard
            icon={ShieldCheck}
            label="Predicted Outcome"
            value={prediction ? (prediction.predicted_failure_next_168h ? 'Failure likely' : 'No failure predicted') : '—'}
            subtitle={prediction ? `Decision threshold: ${prediction.threshold}` : 'No data yet'}
            tone={prediction ? (prediction.predicted_failure_next_168h ? 'amber' : 'emerald') : 'slate'}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SensorChart title="Temperature" icon={Thermometer} dataKey="temperature" unit="°C" data={history} threshold={findThresholdCrossing(history, 'temperature')} />
          <SensorChart title="Vibration" icon={Waves} dataKey="vibration" unit="mm/s" data={history} threshold={findThresholdCrossing(history, 'vibration')} />
          <SensorChart title="Pressure" icon={Gauge} dataKey="pressure" unit="bar" data={history} threshold={findThresholdCrossing(history, 'pressure')} />
          <SensorChart title="Current" icon={Zap} dataKey="current" unit="A" data={history} threshold={findThresholdCrossing(history, 'current')} />
          <SensorChart title="Rotational Speed" icon={RotateCw} dataKey="rotational_speed" unit="RPM" data={history} threshold={findThresholdCrossing(history, 'rotational_speed')} />
        </div>

        <div className="mt-6 flex flex-col rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-blue-100 px-5 py-4">
            <Bot className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-semibold text-blue-950">Ask the agent about {label}</p>
          </div>

          <div className="max-h-[420px] min-h-[200px] overflow-y-auto px-5 py-4">
            <div className="space-y-4">
              {chatMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Sparkles className="h-6 w-6 text-blue-300" />
                  <p className="mt-2 text-xs text-blue-400">
                    Ask about this machine's risk, trends, or recommended actions.
                  </p>
                </div>
              )}
              {chatMessages.map((message) => (
                <MachineChatBubble key={message.id} message={message} />
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              )}
              <div ref={scrollAnchorRef} />
            </div>
          </div>

          <div className="border-t border-blue-100 px-5 py-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={chatLoading}
                  className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2 rounded-xl border border-blue-200 bg-white p-2 shadow-sm focus-within:border-blue-400">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask about ${label}...`}
                rows={1}
                className="max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-blue-950 placeholder:text-blue-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSend(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}