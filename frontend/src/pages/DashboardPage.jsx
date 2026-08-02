import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  Gauge,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Database,
  WifiOff,
  Thermometer,
  Waves,
  ChevronDown,
  Zap,
  RotateCw,
  ExternalLink
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

function generateMockMachines() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    machine_name: `Machine-${String(i + 1).padStart(3, '0')}`,
    status: i === 3 ? 'warning' : i === 7 ? 'critical' : 'healthy',
  }))
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

async function fetchFailureProbability(machineId) {
  try {
    const response = await fetch(`/api/predict/${machineId}`)
    if (!response.ok) return null

    const data = await response.json()
    return typeof data.failure_probability_percent === 'number'
      ? data.failure_probability_percent
      : null
  } catch {
    return null
  }
}
async function fetchMachinesFromSupabase() {
  const { data, error } = await supabase
    .from('machines')
    .select('id, machine_name')
    .order('id', { ascending: true })

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

// Failure probability comes from the classical ML model / MCP prediction
// tool, not from raw sensor_data — there is no live endpoint wired up yet,
// so this deliberately returns null rather than a fabricated number.


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

export default function DashboardPage() {
  const [machines, setMachines] = useState([])
  const [selectedMachineId, setSelectedMachineId] = useState(null)
  const [history, setHistory] = useState([])
  const [failureProbability, setFailureProbability] = useState(null)
  const [usingMockData, setUsingMockData] = useState(!isSupabaseConfigured)
  const [loadingMachines, setLoadingMachines] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const loadMachines = useCallback(async () => {
    setLoadingMachines(true)
    setErrorMessage(null)

    if (!isSupabaseConfigured) {
      const mock = generateMockMachines()
      setMachines(mock)
      setSelectedMachineId((prev) => prev ?? mock[0].id)
      setUsingMockData(true)
      setLoadingMachines(false)
      return
    }

    try {
      const data = await fetchMachinesFromSupabase()
      if (!data || data.length === 0) {
        throw new Error('Supabase returned no machines')
      }
      setMachines(data)
      setSelectedMachineId((prev) => prev ?? data[0].id)
      setUsingMockData(false)
    } catch (error) {
      setErrorMessage(error.message)
      const mock = generateMockMachines()
      setMachines(mock)
      setSelectedMachineId((prev) => prev ?? mock[0].id)
      setUsingMockData(true)
    } finally {
      setLoadingMachines(false)
    }
  }, [])

  const loadHistory = useCallback(async (machineId, mockMode) => {
    if (machineId == null) return
    setLoadingHistory(true)

    if (mockMode) {
      setHistory(generateMockHistory(machineId))
      setFailureProbability(await fetchFailureProbability(machineId))
      setLoadingHistory(false)
      return
    }

    try {
      const data = await fetchHistoryFromSupabase(machineId)
      if (!data || data.length === 0) {
        throw new Error('Supabase returned no sensor history for this machine')
      }
      setHistory(data)
      setFailureProbability(await fetchFailureProbability(machineId))
    } catch (error) {
      setErrorMessage(error.message)
      setHistory(generateMockHistory(machineId))
      setFailureProbability(await fetchFailureProbability(machineId))
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadMachines()
  }, [loadMachines])

  useEffect(() => {
    if (selectedMachineId != null) {
      loadHistory(selectedMachineId, usingMockData)
    }
  }, [selectedMachineId, usingMockData, loadHistory])

  const latest = history.length > 0 ? history[history.length - 1] : null
  const healthScore = latest ? Math.round((1 - latest.degradation) * 100) : null
  const temperatureThreshold = useMemo(() => findThresholdCrossing(history, 'temperature'), [history])
  const vibrationThreshold = useMemo(() => findThresholdCrossing(history, 'vibration'), [history])
  const pressureThreshold = useMemo(() => findThresholdCrossing(history, 'pressure'), [history])
  const currentThreshold = useMemo(() => findThresholdCrossing(history, 'current'), [history])
  const rotationalSpeedThreshold = useMemo(() => findThresholdCrossing(history, 'rotational_speed'), [history])
  const recentRecords = useMemo(() => history.slice(-8).reverse(), [history])

  function handleRefresh() {
    loadMachines()
    if (selectedMachineId != null) {
      loadHistory(selectedMachineId, usingMockData)
    }
  }

  return (
    <div className="min-h-screen bg-blue-50/40 pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Fleet Dashboard</h1>
            <p className="mt-1 text-sm text-blue-500">
              Live telemetry and health status for the simulated machine fleet.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={selectedMachineId ?? ''}
                onChange={(event) => setSelectedMachineId(Number(event.target.value))}
                disabled={loadingMachines || machines.length === 0}
                className="appearance-none rounded-lg border border-blue-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-blue-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.machine_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
            </div>

            {selectedMachineId != null && (
              <Link
                to={`/machines/${selectedMachineId}`}
                className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-50"
              >
                <ExternalLink className="h-4 w-4" />
                View details
              </Link>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-50"
            >
              <RefreshCw className={`h-4 w-4 ${loadingHistory || loadingMachines ? 'animate-spin' : ''}`} />
              Refresh
            </button>
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
            value={failureProbability != null ? `${failureProbability.toFixed(2)}%` : 'Pending'}
            subtitle={
              failureProbability != null
                ? 'From predict_failure_next_168h (MCP)'
                : 'Backend unreachable or tool call failed'
            }
            tone={
              failureProbability == null ? 'slate' : failureProbability > 50 ? 'amber' : 'emerald'
            }
          />
          <SummaryCard
            icon={ShieldCheck}
            label="Operational Status"
            value={latest ? latest.status.charAt(0).toUpperCase() + latest.status.slice(1) : '—'}
            subtitle={latest ? formatFullTimestamp(latest.timestamp) : 'No data yet'}
            tone={latest && latest.status === 'healthy' ? 'emerald' : latest ? 'amber' : 'slate'}
          />
        </div>

<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-semibold text-blue-950">Temperature (°C)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#60a5fa' }} />
                <YAxis tick={{ fontSize: 11, fill: '#60a5fa' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} °C`, 'Temperature']} />
                <Line type="monotone" dataKey="temperature" stroke="#2563eb" strokeWidth={2} dot={false} />
                {temperatureThreshold != null && (
                  <ReferenceLine
                    y={temperatureThreshold}
                    stroke="#ef4444"
                    strokeDasharray="5 3"
                    label={{ value: 'Warning threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Waves className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-semibold text-blue-950">Vibration (mm/s)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#60a5fa' }} />
                <YAxis tick={{ fontSize: 11, fill: '#60a5fa' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} mm/s`, 'Vibration']} />
                <Line type="monotone" dataKey="vibration" stroke="#2563eb" strokeWidth={2} dot={false} />
                {vibrationThreshold != null && (
                  <ReferenceLine
                    y={vibrationThreshold}
                    stroke="#ef4444"
                    strokeDasharray="5 3"
                    label={{ value: 'Warning threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-semibold text-blue-950">Pressure (bar)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#60a5fa' }} />
                <YAxis tick={{ fontSize: 11, fill: '#60a5fa' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} bar`, 'Pressure']} />
                <Line type="monotone" dataKey="pressure" stroke="#2563eb" strokeWidth={2} dot={false} />
                {pressureThreshold != null && (
                  <ReferenceLine
                    y={pressureThreshold}
                    stroke="#ef4444"
                    strokeDasharray="5 3"
                    label={{ value: 'Warning threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-semibold text-blue-950">Current (A)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#60a5fa' }} />
                <YAxis tick={{ fontSize: 11, fill: '#60a5fa' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} A`, 'Current']} />
                <Line type="monotone" dataKey="current" stroke="#2563eb" strokeWidth={2} dot={false} />
                {currentThreshold != null && (
                  <ReferenceLine
                    y={currentThreshold}
                    stroke="#ef4444"
                    strokeDasharray="5 3"
                    label={{ value: 'Warning threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <RotateCw className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-semibold text-blue-950">Rotational Speed (RPM)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#60a5fa' }} />
                <YAxis tick={{ fontSize: 11, fill: '#60a5fa' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} RPM`, 'Rotational Speed']} />
                <Line type="monotone" dataKey="rotational_speed" stroke="#2563eb" strokeWidth={2} dot={false} />
                {rotationalSpeedThreshold != null && (
                  <ReferenceLine
                    y={rotationalSpeedThreshold}
                    stroke="#ef4444"
                    strokeDasharray="5 3"
                    label={{ value: 'Warning threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 11 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-blue-100 px-5 py-4">
            <Database className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-semibold text-blue-950">Recent Sensor Records</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-blue-100 text-xs uppercase tracking-wide text-blue-400">
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                  <th className="px-5 py-3 font-medium">Temperature</th>
                  <th className="px-5 py-3 font-medium">Vibration</th>
                  <th className="px-5 py-3 font-medium">Pressure</th>
                  <th className="px-5 py-3 font-medium">Current</th>
                  <th className="px-5 py-3 font-medium">Rotational Speed</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-blue-400">
                      No records available yet.
                    </td>
                  </tr>
                )}
                {recentRecords.map((record) => {
                  const style = statusStyle(record.status)
                  return (
                    <tr key={record.timestamp} className="border-b border-blue-50 last:border-0">
                      <td className="px-5 py-3 text-blue-700">{formatFullTimestamp(record.timestamp)}</td>
                      <td className="px-5 py-3 text-blue-900">{record.temperature} °C</td>
                      <td className="px-5 py-3 text-blue-900">{record.vibration} mm/s</td>
                      <td className="px-5 py-3 text-blue-900">{record.pressure} bar</td>
                      <td className="px-5 py-3 text-blue-900">{record.current} A</td>
                      <td className="px-5 py-3 text-blue-900">{record.rotational_speed} RPM</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${style.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}