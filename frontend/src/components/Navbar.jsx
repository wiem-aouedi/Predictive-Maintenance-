import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, LayoutDashboard, Bot, Home, Menu, X, ListChecks } from 'lucide-react'

const NAV_LINKS = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/watchlist', label: 'Watchlist', icon: ListChecks },
  { to: '/assistant', label: 'AI Assistant', icon: Bot },
]

function StatusIndicator() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function checkHealth() {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)
        const response = await fetch('/api/health', { signal: controller.signal })
        clearTimeout(timeout)
        if (!cancelled) {
          setStatus(response.ok ? 'online' : 'offline')
        }
      } catch {
        if (!cancelled) {
          setStatus('offline')
        }
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 15000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const styles = {
    online: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'System Online' },
    offline: { dot: 'bg-red-400', text: 'text-red-300', label: 'Backend Offline' },
    checking: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Checking...' },
  }

  const current = styles[status]

  return (
    <div className="flex items-center gap-2 rounded-full border border-blue-800 bg-blue-950/60 px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${current.dot} opacity-75`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${current.dot}`} />
      </span>
      <span className={`text-xs font-medium ${current.text}`}>{current.label}</span>
    </div>
  )
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-blue-900 bg-blue-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Predictive Maintenance</p>
            <p className="text-xs text-blue-300">Cognitive Digital Twin Platform</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-200 hover:bg-blue-900 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:block">
          <StatusIndicator />
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-md p-2 text-blue-200 hover:bg-blue-900 hover:text-white md:hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-blue-900 bg-blue-950 px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-700 text-white'
                      : 'text-blue-200 hover:bg-blue-900 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3">
            <StatusIndicator />
          </div>
        </div>
      )}
    </header>
  )
}