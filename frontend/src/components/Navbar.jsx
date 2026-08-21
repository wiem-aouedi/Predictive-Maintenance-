import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Activity, LayoutDashboard, Bot, Home, Menu, X, ListChecks, Waves } from 'lucide-react'

const NAV_LINKS = [
  { to: '/', label: 'Overview', icon: Home, end: true },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/watchlist', label: 'Watchlist', icon: ListChecks },
  { to: '/vibration-analysis', label: 'Vibration Lab', icon: Waves },
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
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${current.dot} opacity-75`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${current.dot}`} />
      </span>
      <span className={`font-mono-data text-xs font-medium ${current.text}`}>{current.label}</span>
    </div>
  )
}

function DesktopNavLink({ to, label, icon: Icon, end }) {
  return (
    <NavLink key={to} to={to} end={end} className="group relative">
      {({ isActive }) => (
        <span
          className={`relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? 'text-white' : 'text-white/55 group-hover:bg-white/5 group-hover:text-white'
          }`}
        >
          <Icon className={`h-4 w-4 ${isActive ? 'text-accent' : ''}`} strokeWidth={isActive ? 2.25 : 2} />
          {label}
          <span
            className={`absolute inset-x-2.5 -bottom-[9px] h-[2px] rounded-full bg-accent transition-opacity ${
              isActive ? 'opacity-100 shadow-[0_0_9px_rgba(47,95,255,0.85)]' : 'opacity-0'
            }`}
          />
        </span>
      )}
    </NavLink>
  )
}

function SettingsButton() {
  return (
    <NavLink
      to="/settings"
      aria-label="Settings"
      className={({ isActive }) =>
        `flex h-8 flex-shrink-0 items-center justify-center border px-3 text-xs font-medium transition-colors ${
          isActive
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      Settings
    </NavLink>
  )
}

function MobileNavLink({ to, label, icon: Icon, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'border-accent bg-white/5 text-white'
            : 'border-transparent text-white/60 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  )
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-accent-dark/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_6px_18px_-4px_rgba(47,95,255,0.7),0_2px_10px_-2px_rgba(34,211,238,0.4)]">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-white">Predictive Maintenance</p>
            <p className="text-xs text-white/50">Beyond the Forecast</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <DesktopNavLink key={link.to} {...link} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SettingsButton />

          <div className="hidden md:block">
            <StatusIndicator />
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-md p-2 text-white/60 hover:bg-white/5 hover:text-white md:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-accent-dark px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <MobileNavLink key={link.to} {...link} onClick={() => setMobileOpen(false)} />
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
