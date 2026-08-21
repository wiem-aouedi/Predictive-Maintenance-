import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  ExternalLink,
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const HISTORY_POINTS = 48
const FALLBACK_REFRESH_MS = 60_000

const STATUS_STYLES = {
  healthy: { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  warning: { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  critical: { badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  failed: { badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
}

const TONE_STYLES = {
  blue: { bar: 'bg-accent', badge: 'bg-accent/10 text-accent', value: 'text-ink' },
  emerald: { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-600', value: 'text-ink' },
  amber: { bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-600', value: 'text-ink' },
  slate: { bar: 'bg-slate-300', badge: 'bg-slate-100 text-slate-400', value: 'text-muted' },
}

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.healthy
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
    .lte('timestamp', new Date().toISOString())
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data.slice().reverse()
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

function SummaryCard({ icon: Icon, label, value, subtitle, tone = 'blue', loading = false }) {
  const toneStyle = TONE_STYLES[tone]
  return (
    <div className="card-hover relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1 ${toneStyle.bar}`} />
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${toneStyle.badge}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <>
          <div className="skeleton mt-3 h-8 w-24 rounded-md" />
          <div className="skeleton mt-3 h-3 w-32 rounded-md" />
        </>
      ) : (
        <>
          <p className={`font-mono-data mt-3 text-3xl font-bold ${toneStyle.value}`}>{value}</p>
          {subtitle && <p className="mt-2 text-xs text-muted">{subtitle}</p>}
        </>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [machines, setMachines] = useState([])
  const [selectedMachineId, setSelectedMachineId] = useState(null)
  const [history, setHistory] = useState([])
  const [failureProbability, setFailureProbability] = useState(null)
  const [loadingMachines, setLoadingMachines] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [machinesError, setMachinesError] = useState(
    isSupabaseConfigured ? null : 'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
  )
  const [historyError, setHistoryError] = useState(null)
  const [liveState, setLiveState] = useState(isSupabaseConfigured ? 'connecting' : 'offline')
  const predictionRefreshRef = useRef(null)

  const loadMachines = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingMachines(false)
      return
    }

    setLoadingMachines(true)
    try {
      const data = await fetchMachinesFromSupabase()
      if (!data || data.length === 0) {
        throw new Error('Supabase returned no machines')
      }
      setMachines(data)
      setSelectedMachineId((prev) => prev ?? data[0].id)
      setMachinesError(null)
    } catch (error) {
      setMachines([])
      setMachinesError(error.message || 'Could not reach Supabase.')
    } finally {
      setLoadingMachines(false)
    }
  }, [])

  const loadHistory = useCallback(async (machineId, { silent = false } = {}) => {
    if (machineId == null || !isSupabaseConfigured) return
    if (!silent) setLoadingHistory(true)
    setHistoryError(null)

    try {
      const data = await fetchHistoryFromSupabase(machineId)
      if (!data || data.length === 0) {
        throw new Error('Supabase returned no sensor history for this machine')
      }
      setHistory(data)
      setFailureProbability(await fetchFailureProbability(machineId))
    } catch (error) {
      if (!silent) {
        setHistory([])
        setFailureProbability(null)
      }
      setHistoryError(error.message || 'No live sensor history found for this machine.')
    } finally {
      if (!silent) setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadMachines()
  }, [loadMachines])

  useEffect(() => {
    if (selectedMachineId != null) {
      loadHistory(selectedMachineId)
    }
  }, [selectedMachineId, loadHistory])

  useEffect(() => {
    if (selectedMachineId == null || !isSupabaseConfigured) return undefined

    setLiveState('connecting')
    const channel = supabase
      .channel(`dashboard-machine-${selectedMachineId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sensor_data',
          filter: `machine_id=eq.${selectedMachineId}`,
        },
        ({ new: reading }) => {
          if (!reading?.timestamp) return
          setHistory((current) => {
            const next = current.filter((row) => row.timestamp !== reading.timestamp)
            next.push(reading)
            next.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            return next.slice(-HISTORY_POINTS)
          })
          setHistoryError(null)

          window.clearTimeout(predictionRefreshRef.current)
          predictionRefreshRef.current = window.setTimeout(async () => {
            setFailureProbability(await fetchFailureProbability(selectedMachineId))
          }, 500)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLiveState('live')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLiveState('reconnecting')
        if (status === 'CLOSED') setLiveState('offline')
      })

    const fallbackRefresh = window.setInterval(
      () => loadHistory(selectedMachineId, { silent: true }),
      FALLBACK_REFRESH_MS
    )

    const handleOffline = () => setLiveState('offline')
    const handleOnline = () => setLiveState((state) => (state === 'live' ? state : 'connecting'))
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.clearInterval(fallbackRefresh)
      window.clearTimeout(predictionRefreshRef.current)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      supabase.removeChannel(channel)
    }
  }, [selectedMachineId, loadHistory])

  const latest = history.length > 0 ? history[history.length - 1] : null
  const healthScore = latest ? Math.round((1 - latest.degradation) * 100) : null
  const showSkeleton = loadingHistory && history.length === 0 && !historyError
  const temperatureThreshold = useMemo(() => findThresholdCrossing(history, 'temperature'), [history])
  const vibrationThreshold = useMemo(() => findThresholdCrossing(history, 'vibration'), [history])
  const pressureThreshold = useMemo(() => findThresholdCrossing(history, 'pressure'), [history])
  const currentThreshold = useMemo(() => findThresholdCrossing(history, 'current'), [history])
  const rotationalSpeedThreshold = useMemo(() => findThresholdCrossing(history, 'rotational_speed'), [history])
  const recentRecords = useMemo(() => history.slice(-8).reverse(), [history])

  function handleRefresh() {
    loadMachines()
    if (selectedMachineId != null) {
      loadHistory(selectedMachineId)
    }
  }

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono-data text-xs uppercase tracking-[0.2em] text-accent">
              Live Fleet Monitoring
            </p>
            <h1 className="font-editorial mt-1 text-3xl font-semibold text-ink">Fleet Dashboard</h1>
            <p className="mt-1 text-sm text-muted">
              Telemetry and health status for the simulated machine fleet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${
                liveState === 'live'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : liveState === 'offline'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
              role="status"
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  liveState === 'live'
                    ? 'bg-emerald-500'
                    : liveState === 'offline'
                      ? 'bg-red-500'
                      : 'animate-pulse bg-amber-500'
                }`}
              />
              {liveState === 'live'
                ? 'Live data'
                : liveState === 'reconnecting'
                  ? 'Reconnecting'
                  : liveState === 'connecting'
                    ? 'Connecting'
                    : 'Offline'}
            </div>
            <div className="relative">
              {latest && (
                <span
                  className={`pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${statusStyle(latest.status).dot}`}
                />
              )}
              <select
                value={selectedMachineId ?? ''}
                onChange={(event) => setSelectedMachineId(Number(event.target.value))}
                disabled={loadingMachines || machines.length === 0}
                className={`appearance-none rounded-lg border border-slate-200 bg-white py-2 ${
                  latest ? 'pl-7' : 'pl-3'
                } pr-9 text-sm font-medium text-ink shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 disabled:opacity-50`}
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.machine_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>

            {selectedMachineId != null && (
              <Link
                to={`/machines/${selectedMachineId}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-accent shadow-sm hover:bg-accent/5"
              >
                <ExternalLink className="h-4 w-4" />
                View details
              </Link>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-accent shadow-sm hover:bg-accent/5"
            >
              <RefreshCw className={`h-4 w-4 ${loadingHistory || loadingMachines ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {machinesError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            Could not load the live fleet from Supabase. {machinesError}
          </div>
        )}

        {!machinesError && historyError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            No live sensor history for this machine. {historyError}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            icon={Gauge}
            label="Overall Health Score"
            value={healthScore != null ? `${healthScore}%` : '—'}
            subtitle={latest ? 'Derived from current degradation level' : 'No data yet'}
            tone={healthScore != null && healthScore < 40 ? 'amber' : 'emerald'}
            loading={showSkeleton}
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
            tone={failureProbability == null ? 'slate' : failureProbability > 50 ? 'amber' : 'emerald'}
            loading={showSkeleton}
          />
          <SummaryCard
            icon={ShieldCheck}
            label="Operational Status"
            value={latest ? latest.status.charAt(0).toUpperCase() + latest.status.slice(1) : '—'}
            subtitle={latest ? formatFullTimestamp(latest.timestamp) : 'No data yet'}
            tone={latest && latest.status === 'healthy' ? 'emerald' : latest ? 'amber' : 'slate'}
            loading={showSkeleton}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="card-hover rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-ink">Temperature (°C)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#5b6b8c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6b8c' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} °C`, 'Temperature']} />
                <Line type="monotone" dataKey="temperature" stroke="#2f5fff" strokeWidth={2} dot={false} />
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

          <div className="card-hover rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Waves className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-ink">Vibration (mm/s)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#5b6b8c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6b8c' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} mm/s`, 'Vibration']} />
                <Line type="monotone" dataKey="vibration" stroke="#2f5fff" strokeWidth={2} dot={false} />
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

          <div className="card-hover rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-ink">Pressure (bar)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#5b6b8c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6b8c' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} bar`, 'Pressure']} />
                <Line type="monotone" dataKey="pressure" stroke="#2f5fff" strokeWidth={2} dot={false} />
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

          <div className="card-hover rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-ink">Current (A)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#5b6b8c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6b8c' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} A`, 'Current']} />
                <Line type="monotone" dataKey="current" stroke="#2f5fff" strokeWidth={2} dot={false} />
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

          <div className="card-hover rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <RotateCw className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-ink">Rotational Speed (RPM)</p>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="timestamp" tickFormatter={formatTick} tick={{ fontSize: 11, fill: '#5b6b8c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6b8c' }} domain={['auto', 'auto']} />
                <Tooltip labelFormatter={formatFullTimestamp} formatter={(value) => [`${value} RPM`, 'Rotational Speed']} />
                <Line type="monotone" dataKey="rotational_speed" stroke="#2f5fff" strokeWidth={2} dot={false} />
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

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-ink">Recent Sensor Records</p>
            </div>
            <p className="font-mono-data text-[11px] uppercase tracking-wide text-muted">
              Last {recentRecords.length} of {history.length} readings
            </p>
          </div>
          <div className="thin-scrollbar max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-muted">
                  <th className="font-mono-data px-5 py-3 font-medium">Timestamp</th>
                  <th className="font-mono-data px-5 py-3 font-medium">Temperature</th>
                  <th className="font-mono-data px-5 py-3 font-medium">Vibration</th>
                  <th className="font-mono-data px-5 py-3 font-medium">Pressure</th>
                  <th className="font-mono-data px-5 py-3 font-medium">Current</th>
                  <th className="font-mono-data px-5 py-3 font-medium">Rotational Speed</th>
                  <th className="font-mono-data px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-muted">
                      No records available yet.
                    </td>
                  </tr>
                )}
                {recentRecords.map((record, index) => {
                  const style = statusStyle(record.status)
                  return (
                    <tr
                      key={record.timestamp}
                      className={`border-b border-slate-100 transition-colors last:border-0 hover:bg-accent/5 ${
                        index % 2 === 1 ? 'bg-slate-50/60' : ''
                      }`}
                    >
                      <td className="font-mono-data px-5 py-3 text-ink">{formatFullTimestamp(record.timestamp)}</td>
                      <td className="font-mono-data px-5 py-3 text-ink">{record.temperature} °C</td>
                      <td className="font-mono-data px-5 py-3 text-ink">{record.vibration} mm/s</td>
                      <td className="font-mono-data px-5 py-3 text-ink">{record.pressure} bar</td>
                      <td className="font-mono-data px-5 py-3 text-ink">{record.current} A</td>
                      <td className="font-mono-data px-5 py-3 text-ink">{record.rotational_speed} RPM</td>
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
