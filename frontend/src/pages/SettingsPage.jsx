import { useEffect, useState } from 'react'
import { Check, X, Loader2, WifiOff, SlidersHorizontal } from 'lucide-react'

const SECTION_TITLES = {
  llm: 'LLM',
  agent_limits: 'Agent Limits',
  prediction: 'Prediction Model',
  alerts: 'Alerts',
  database: 'Database',
}

const FIELD_LABELS = {
  llm: {
    provider: 'Provider',
    model: 'Model',
    api_key_configured: 'API key',
  },
  agent_limits: {
    max_tool_iterations: 'Max tool iterations',
    max_context_turns: 'Max context turns',
    max_tool_result_chars: 'Max tool result chars',
  },
  prediction: {
    model_name: 'Model name',
    model_version: 'Model version',
    target: 'Prediction target',
    threshold: 'Decision threshold',
    n_features: 'Feature count',
    loaded: 'Model loaded',
  },
  alerts: {
    email_configured: 'Email alerts',
    smtp_host_configured: 'SMTP host',
    smtp_user_configured: 'SMTP user',
    smtp_password_configured: 'SMTP password',
    smtp_port: 'SMTP port',
    recipient_email: 'Recipient',
    poll_interval_seconds: 'Poll interval (s)',
  },
  database: {
    provider: 'Provider',
    url: 'Project URL',
    service_role_key_configured: 'Service role key',
  },
}

async function fetchConfig() {
  const response = await fetch('/api/config')
  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`)
  }
  return response.json()
}

function BoolValue({ value }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono-data text-sm font-medium ${
        value ? 'text-emerald-700' : 'text-red-600'
      }`}
    >
      {value ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {value ? 'Configured' : 'Not configured'}
    </span>
  )
}

function SpecRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-slate-200 py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      {typeof value === 'boolean' ? (
        <BoolValue value={value} />
      ) : (
        <span className="font-mono-data text-sm text-ink">{value ?? '—'}</span>
      )}
    </div>
  )
}

function SpecSection({ sectionKey, data }) {
  const labels = FIELD_LABELS[sectionKey] || {}
  return (
    <div className="border border-slate-300 bg-white">
      <div className="border-b border-slate-300 bg-slate-50 px-4 py-2.5">
        <p className="font-mono-data text-xs font-semibold uppercase tracking-[0.2em] text-ink">
          {SECTION_TITLES[sectionKey] || sectionKey}
        </p>
      </div>
      <div className="px-4">
        {Object.entries(data).map(([field, value]) => (
          <SpecRow key={field} label={labels[field] || field} value={value} />
        ))}
      </div>
    </div>
  )
}

function SpecSectionSkeleton() {
  return (
    <div className="border border-slate-300 bg-white">
      <div className="border-b border-slate-300 bg-slate-50 px-4 py-2.5">
        <div className="skeleton h-3 w-24 rounded" />
      </div>
      <div className="space-y-0 px-4 py-1">
        <div className="flex items-center justify-between border-b border-slate-200 py-2.5">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
        <div className="flex items-center justify-between py-2.5">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-3 w-16 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const data = await fetchConfig()
        if (!cancelled) {
          setConfig(data)
          setErrorMessage(null)
        }
      } catch (error) {
        if (!cancelled) {
          setConfig(null)
          setErrorMessage(error.message || 'Could not reach the backend.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-canvas pb-16">
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-accent" />
          <p className="font-mono-data text-xs uppercase tracking-[0.2em] text-accent">
            System Configuration
          </p>
        </div>
        <h1 className="font-editorial mt-1 text-3xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Read-only runtime configuration, reported directly by the backend from the constants and
          environment it's actually running on.
        </p>

        {errorMessage && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            Could not load configuration. {errorMessage}
          </div>
        )}

        <div className="mt-8 space-y-6 font-sans">
          {loading
            ? Object.keys(SECTION_TITLES).map((key) => <SpecSectionSkeleton key={key} />)
            : config &&
              Object.keys(SECTION_TITLES).map((key) =>
                config[key] ? <SpecSection key={key} sectionKey={key} data={config[key]} /> : null
              )}
        </div>
      </div>
    </div>
  )
}
