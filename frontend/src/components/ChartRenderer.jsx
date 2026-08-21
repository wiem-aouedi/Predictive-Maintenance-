import { useEffect, useRef } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { LineChart as LineChartIcon, BarChart3, Download } from 'lucide-react'
import { exportSvgAsPng, slugifyFilename } from '../lib/exportSvgAsPng'

const ACCENT = '#2f8f79'

const STATUS_COLORS = {
  healthy: '#10b981',
  warning: '#f59e0b',
  critical: '#f97316',
  failed: '#ef4444',
}

function formatTimeTick(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatTimeFull(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function ChartTooltip({ active, payload, label, isLine }) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted">{isLine ? formatTimeFull(label) : label}</p>
      <p className="font-mono-data font-semibold text-ink">{point.value?.toLocaleString?.() ?? point.value}</p>
    </div>
  )
}

export default function ChartRenderer({ chart, registerNode }) {
  const containerRef = useRef(null)
  const points = chart?.series?.[0]?.points

  useEffect(() => {
    registerNode?.(containerRef.current)
  }, [registerNode])

  if (!chart || !Array.isArray(points) || points.length === 0) return null

  const isLine = chart.chart_type === 'line'
  const isStatus = chart.x_kind === 'status'
  const Icon = isLine ? LineChartIcon : BarChart3

  function handleDownloadPng() {
    const svg = containerRef.current?.querySelector('svg')
    if (!svg) return
    exportSvgAsPng(svg, slugifyFilename(chart.title, 'png'))
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Icon className="h-3.5 w-3.5 text-accent" />
          {chart.title}
        </div>
        <button
          type="button"
          onClick={handleDownloadPng}
          title="Download chart as PNG"
          className="no-print flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-accent"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          {isLine ? (
            <LineChart data={points} margin={{ top: 5, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="x"
                tickFormatter={formatTimeTick}
                tick={{ fontSize: 10, fill: '#5d746f' }}
                minTickGap={40}
                stroke="#e2e8f0"
              />
              <YAxis tick={{ fontSize: 10, fill: '#5d746f' }} stroke="#e2e8f0" width={44} />
              <Tooltip content={<ChartTooltip isLine />} />
              <Line type="monotone" dataKey="y" stroke={ACCENT} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          ) : (
            <BarChart data={points} margin={{ top: 5, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 10, fill: '#5d746f' }}
                stroke="#e2e8f0"
                angle={points.length > 6 ? -35 : 0}
                textAnchor={points.length > 6 ? 'end' : 'middle'}
                height={points.length > 6 ? 44 : 24}
                interval={0}
              />
              <YAxis tick={{ fontSize: 10, fill: '#5d746f' }} stroke="#e2e8f0" width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(47, 143, 121, 0.08)' }} />
              <Bar dataKey="y" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {points.map((point, index) => (
                  <Cell
                    key={point.x ?? index}
                    fill={isStatus ? STATUS_COLORS[point.x?.toLowerCase()] || ACCENT : ACCENT}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
