import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ShieldCheck, Wrench, ArrowRight, RefreshCw, Loader2, Mail, Flame, WifiOff } from 'lucide-react'
import { useToast } from '../components/Toast'

const STATUS_LABEL = {
  warning: { text: 'Warning', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  critical: { text: 'Critical', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  failed: { text: 'Failed', badge: 'bg-red-100 text-red-700 border-red-200' },
}

function machineLabel(machine) {
  return machine.machine_name || `Machine-${String(machine.id ?? machine.machine_id ?? '?').padStart(3, '0')}`
}

function probabilityTone(prob) {
  if (prob == null) return { text: 'text-muted', bar: 'bg-slate-300' }
  if (prob >= 80) return { text: 'text-red-600', bar: 'bg-red-500' }
  if (prob >= 50) return { text: 'text-orange-600', bar: 'bg-orange-500' }
  if (prob >= 20) return { text: 'text-amber-600', bar: 'bg-amber-500' }
  return { text: 'text-emerald-600', bar: 'bg-emerald-500' }
}

async function fetchWatchlist() {
  const response = await fetch('/api/fleet/watchlist')
  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`)
  }
  return response.json()
}

function SpotlightRow({ machine, onAskAgent }) {
  const prob = machine.failure_probability_percent
  const status = STATUS_LABEL[machine.status] || STATUS_LABEL.warning
  const barWidth = prob != null ? Math.min(100, Math.max(2, prob)) : 0

  return (
    <div className="card-hover relative overflow-hidden rounded-xl border border-white/10 bg-accent-dark p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.35), transparent 70%)' }}
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-red-400" />
            <p className="font-mono-data text-xs uppercase tracking-[0.2em] text-accent/80">
              Most urgent — rank 01
            </p>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <p className="font-editorial text-2xl font-semibold text-white">{machineLabel(machine)}</p>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.badge}`}>
              {status.text}
            </span>
          </div>
          <div className="mt-4 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
            <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="font-mono-data text-4xl font-bold text-white">
              {prob != null ? `${prob.toFixed(2)}%` : '—'}
            </p>
            <p className="text-xs text-white/50">168h failure risk</p>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to={`/machines/${machine.id ?? machine.machine_id}`}
              className="rounded-lg bg-white px-4 py-2 text-center text-xs font-semibold text-accent-dark transition-colors hover:bg-white/90"
            >
              View details
            </Link>
            <button
              type="button"
              onClick={() => onAskAgent(machine)}
              className="flex items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10"
            >
              Ask agent
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function QueueRow({ machine, rank, onAskAgent }) {
  const prob = machine.failure_probability_percent
  const tone = probabilityTone(prob)
  const status = STATUS_LABEL[machine.status] || STATUS_LABEL.warning

  return (
    <div className="group flex flex-col gap-3 border-b border-slate-100 px-5 py-4 transition-colors last:border-0 hover:bg-accent/5 sm:flex-row sm:items-center sm:gap-4">
      <span className="font-mono-data flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-muted group-hover:bg-white">
        {String(rank).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-editorial truncate text-base font-semibold text-ink">{machineLabel(machine)}</p>
          <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.badge}`}>
            {status.text}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
            style={{ width: prob != null ? `${Math.min(100, Math.max(2, prob))}%` : '0%' }}
          />
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className={`font-mono-data text-xl font-bold ${tone.text}`}>
          {prob != null ? `${prob.toFixed(2)}%` : '—'}
        </p>
        <p className="text-[11px] text-muted">168h risk</p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <Link
          to={`/machines/${machine.id ?? machine.machine_id}`}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5"
        >
          Details
        </Link>
        <button
          type="button"
          onClick={() => onAskAgent(machine)}
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5"
        >
          Ask
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function RepairRow({ machine }) {
  return (
    <div className="group flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 transition-colors last:border-0 hover:bg-accent/5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-white">
          <Wrench className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm text-ink">{machineLabel(machine)}</p>
      </div>
      <Link
        to={`/machines/${machine.id ?? machine.machine_id}`}
        className="text-xs font-medium text-accent hover:underline"
      >
        View details
      </Link>
    </div>
  )
}

function AllClear() {
  return (
    <div className="card-hover flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
        <ShieldCheck className="h-6 w-6 text-emerald-600" />
      </div>
      <p className="font-editorial text-lg font-semibold text-ink">Nothing flagged right now.</p>
      <p className="max-w-sm text-sm text-muted">
        No machines are currently in warning or critical status. The queue will populate
        automatically as soon as one is.
      </p>
    </div>
  )
}

function SpotlightSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-accent-dark p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <div className="skeleton-dark h-3 w-36 rounded" />
          <div className="skeleton-dark mt-3 h-7 w-48 rounded" />
          <div className="skeleton-dark mt-4 h-1.5 w-full max-w-[220px] rounded-full" />
        </div>
        <div className="skeleton-dark h-12 w-28 rounded" />
      </div>
    </div>
  )
}

function QueueRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-0">
      <div className="skeleton h-7 w-7 flex-shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="skeleton h-4 w-32 rounded" />
        <div className="skeleton mt-2 h-1.5 w-full max-w-xs rounded-full" />
      </div>
      <div className="skeleton h-8 w-14 flex-shrink-0 rounded" />
    </div>
  )
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState([])
  const [failed, setFailed] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [checkingAlerts, setCheckingAlerts] = useState(false)
  const navigate = useNavigate()
  const showToast = useToast()

  async function handleCheckAlerts() {
    setCheckingAlerts(true)
    try {
      const response = await fetch('/api/alerts/check', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || `Status ${response.status}`)
      }
      if (data.sent.length === 0) {
        showToast('No new alerts to send — everything already notified.', 'info')
      } else {
        const names = data.sent.map((s) => s.machine_name).join(', ')
        showToast(`Alert sent for ${names}.`, 'success')
      }
      if (data.failed.length > 0) {
        showToast(`${data.failed.length} alert(s) failed to send.`, 'error')
      }
    } catch (error) {
      showToast(`Alert check failed. ${error.message}`, 'error')
    } finally {
      setCheckingAlerts(false)
    }
  }
  const load = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const data = await fetchWatchlist()
      setWatchlist(Array.isArray(data.watchlist) ? data.watchlist : [])
      setFailed(Array.isArray(data.failed) ? data.failed : [])
    } catch (error) {
      setErrorMessage(error.message)
      setWatchlist([])
      setFailed([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function handleAskAgent(machine) {
    const label = machineLabel(machine)
    navigate('/assistant', {
      state: {
        prefill: `Analyze ${label} (currently ${machine.status || 'at risk'}) and give maintenance recommendations based on its current sensor data.`,
      },
    })
  }

  const [spotlight, ...rest] = watchlist

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <p className="font-mono-data text-xs uppercase tracking-[0.2em] text-accent">
                Priority Queue
              </p>
              {!loading && watchlist.length > 0 && (
                <span className="font-mono-data rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {watchlist.length} flagged
                </span>
              )}
            </div>
            <h1 className="font-editorial mt-1 text-3xl font-semibold text-ink">Watchlist</h1>
            <p className="mt-1 text-sm text-muted">
              Ranked by the prediction model's own confidence, not status alone.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCheckAlerts}
              disabled={checkingAlerts}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-accent shadow-sm hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checkingAlerts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send alerts
            </button>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-accent shadow-sm hover:bg-accent/5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            Could not load the watchlist. {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="mt-8 space-y-4">
            <SpotlightSkeleton />
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <QueueRowSkeleton />
              <QueueRowSkeleton />
              <QueueRowSkeleton />
            </div>
          </div>
        ) : watchlist.length === 0 ? (
          <div className="mt-8">
            <AllClear />
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {spotlight && <SpotlightRow machine={spotlight} onAskAgent={handleAskAgent} />}
            {rest.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                {rest.map((machine, index) => (
                  <QueueRow
                    key={machine.id ?? machine.machine_id ?? index}
                    machine={machine}
                    rank={index + 2}
                    onAskAgent={handleAskAgent}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted" />
            <p className="font-mono-data text-xs uppercase tracking-wide text-muted">
              Repair backlog {failed.length > 0 && `(${failed.length})`}
            </p>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="space-y-0">
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0">
                  <div className="skeleton h-7 w-7 rounded-full" />
                  <div className="skeleton h-4 w-28 rounded" />
                </div>
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className="skeleton h-7 w-7 rounded-full" />
                  <div className="skeleton h-4 w-20 rounded" />
                </div>
              </div>
            ) : failed.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">No failed machines.</p>
            ) : (
              failed.map((machine, index) => (
                <RepairRow key={machine.id ?? machine.machine_id ?? index} machine={machine} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
