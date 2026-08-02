import { useCallback, useEffect, useState } from 'react'
import {Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ShieldAlert, Wrench, RefreshCw, ArrowRight, Inbox, Loader2 } from 'lucide-react'

const STATUS_STYLES = {
  warning: { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', icon: AlertTriangle },
  critical: { badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: ShieldAlert },
  failed: { badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', icon: Wrench },
}

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.warning
}

function machineLabel(machine) {
  return machine.machine_name || `Machine-${String(machine.id ?? machine.machine_id ?? '?').padStart(3, '0')}`
}

async function fetchWatchlist() {
  const response = await fetch('/api/fleet/watchlist')
  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`)
  }
  return response.json()
}

function MachineRow({ machine, onAskAgent }) {
  const style = statusStyle(machine.status)
  const Icon = style.icon

  return (
    <div className="flex items-center justify-between gap-4 border-b border-blue-50 px-5 py-4 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${style.badge}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-950">{machineLabel(machine)}</p>
          <span className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${style.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {machine.status ? machine.status.charAt(0).toUpperCase() + machine.status.slice(1) : 'Unknown'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to={`/machines/${machine.id ?? machine.machine_id}`}
          className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
        >
          View details
        </Link>
        <button
          type="button"
          onClick={() => onAskAgent(machine)}
          className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
        >
          Ask agent
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function EmptyState({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
      <Inbox className="h-8 w-8 text-blue-200" />
      <p className="text-sm text-blue-400">{label}</p>
    </div>
  )
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState([])
  const [failed, setFailed] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const navigate = useNavigate()

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

  return (
    <div className="min-h-screen bg-blue-50/40 pb-16">
      <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Watchlist</h1>
            <p className="mt-1 text-sm text-blue-500">
              Machines needing attention, ranked by severity.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-blue-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
            Could not load the watchlist. ({errorMessage})
          </div>
        )}

        <div className="mt-6 rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-blue-100 px-5 py-4">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-blue-950">
              At risk {watchlist.length > 0 && `(${watchlist.length})`}
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : watchlist.length === 0 ? (
            <EmptyState label="No machines currently in warning or critical status." />
          ) : (
            watchlist.map((machine, index) => (
              <MachineRow key={machine.id ?? machine.machine_id ?? index} machine={machine} onAskAgent={handleAskAgent} />
            ))
          )}
        </div>

        <div className="mt-6 rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-blue-100 px-5 py-4">
            <Wrench className="h-4 w-4 text-red-500" />
            <p className="text-sm font-semibold text-blue-950">
              Failed - needs repair {failed.length > 0 && `(${failed.length})`}
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-10 text-blue-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : failed.length === 0 ? (
            <EmptyState label="No failed machines." />
          ) : (
            failed.map((machine, index) => (
              <MachineRow key={machine.id ?? machine.machine_id ?? index} machine={machine} onAskAgent={handleAskAgent} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}