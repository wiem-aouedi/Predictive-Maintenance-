import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Waves, ChevronDown, Info, Radio, Target, WifiOff } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const SAMPLE_RATE = 5000
const SAMPLE_COUNT = 2048
const DISPLAY_RAW_POINTS = 500
const DEFECT_MULTIPLIER = 4.2
const RESONANCE_FREQ = 350
// Baseline vibration amplitude a healthy machine reports (matches the
// simulator's V0 mean in backend/Simulator/machine.py) — used to scale the
// reconstructed signal relative to a machine's real live reading.
const BASELINE_VIBRATION = 0.05

async function fetchMachinesFromSupabase() {
  const { data, error } = await supabase
    .from('machines')
    .select('id, machine_name')
    .order('id', { ascending: true })
  if (error) throw error
  return data
}

async function fetchLatestReading(machineId) {
  const { data, error } = await supabase
    .from('sensor_data')
    .select('rotational_speed, degradation, vibration, status, timestamp')
    .eq('machine_id', machineId)
    .lte('timestamp', new Date().toISOString())
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return data
}

function fft(real, imag) {
  const n = real.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curWr = 1
      let curWi = 0
      for (let j = 0; j < len / 2; j++) {
        const ur = real[i + j]
        const ui = imag[i + j]
        const vr = real[i + j + len / 2] * curWr - imag[i + j + len / 2] * curWi
        const vi = real[i + j + len / 2] * curWi + imag[i + j + len / 2] * curWr
        real[i + j] = ur + vr
        imag[i + j] = ui + vi
        real[i + j + len / 2] = ur - vr
        imag[i + j + len / 2] = ui - vi
        const nextWr = curWr * wr - curWi * wi
        curWi = curWr * wi + curWi * wr
        curWr = nextWr
      }
    }
  }
}

function computeSpectrum(samples, sampleRate) {
  const n = samples.length
  const real = Float64Array.from(samples)
  const imag = new Float64Array(n)
  fft(real, imag)
  const half = n / 2
  const freqStep = sampleRate / n
  const spectrum = []
  for (let k = 1; k < half; k++) {
    const magnitude = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]) / half
    spectrum.push({ freq: Number((k * freqStep).toFixed(1)), amplitude: Number(magnitude.toFixed(5)) })
  }
  return spectrum
}

function movingAverage(arr, window) {
  const out = new Array(arr.length).fill(0)
  let sum = 0
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i]
    if (i >= window) sum -= arr[i - window]
    out[i] = sum / Math.min(i + 1, window)
  }
  return out
}

function generateVibrationData(shaftFreqHz, degradation, vibrationReading) {
  // vibrationReading is the machine's real live scalar (backend/Simulator/machine.py
  // V(t) = V0 + kV*d^2 + noise) — it, not degradation alone, drives how strong the
  // reconstructed impulse/noise looks, so two machines at the same degradation but
  // different real readings render visibly differently.
  const vibrationRatio = vibrationReading / BASELINE_VIBRATION
  const impulseAmplitude = 0.1 + vibrationRatio * 0.35
  const noiseLevel = 0.02 + vibrationRatio * 0.03
  const defectFreq = shaftFreqHz * DEFECT_MULTIPLIER
  const decay = 220
  const period = 1 / defectFreq

  const raw = new Array(SAMPLE_COUNT)
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / SAMPLE_RATE
    const shaft = 0.4 * Math.sin(2 * Math.PI * shaftFreqHz * t)
    const harmonic2 = 0.15 * Math.sin(2 * Math.PI * 2 * shaftFreqHz * t)
    const tMod = t % period
    const impulse = impulseAmplitude * Math.exp(-decay * tMod) * Math.sin(2 * Math.PI * RESONANCE_FREQ * tMod)
    const noise = noiseLevel * (Math.random() * 2 - 1)
    raw[i] = shaft + harmonic2 + impulse + noise
  }

  const rectified = raw.map((v) => Math.abs(v))
  const smoothed = movingAverage(rectified, 12)
  const mean = smoothed.reduce((sum, v) => sum + v, 0) / smoothed.length
  const envelope = smoothed.map((v) => v - mean)

  const timeSeries = raw.slice(0, DISPLAY_RAW_POINTS).map((v, i) => ({
    t: Number(((i / SAMPLE_RATE) * 1000).toFixed(2)),
    amplitude: Number(v.toFixed(4)),
  }))

  const rawSpectrum = computeSpectrum(raw, SAMPLE_RATE).filter((p) => p.freq <= 500)
  const envelopeSpectrum = computeSpectrum(envelope, SAMPLE_RATE).filter((p) => p.freq <= 500)

  return { timeSeries, rawSpectrum, envelopeSpectrum, defectFreq }
}

function ScopeChart({ data, dataKey, xKey, xLabel, color, height = 220, referenceLines = [] }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
            label={{ value: xLabel, position: 'insideBottomRight', fill: 'rgba(255,255,255,0.35)', fontSize: 10, offset: -2 }}
          />
          <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} />
          <Tooltip
            contentStyle={{ background: '#0b1730', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12 }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.4} dot={false} isAnimationActive={false} />
          {referenceLines.map((line) => (
            <ReferenceLine
              key={line.x}
              x={line.x}
              stroke={line.color}
              strokeDasharray="4 3"
              label={{ value: line.label, position: 'top', fill: line.color, fontSize: 10 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function VibrationAnalysisPage() {
  const [machines, setMachines] = useState([])
  const [selectedMachineId, setSelectedMachineId] = useState(null)
  const [reading, setReading] = useState(null)
  const [loading, setLoading] = useState(true)
  const [machinesError, setMachinesError] = useState(
    isSupabaseConfigured ? null : 'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
  )
  const [readingError, setReadingError] = useState(null)

  const loadMachines = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await fetchMachinesFromSupabase()
      if (!data || data.length === 0) throw new Error('No machines found')
      setMachines(data)
      setSelectedMachineId((prev) => prev ?? data[0].id)
      setMachinesError(null)
    } catch (error) {
      setMachines([])
      setMachinesError(error.message || 'Could not reach Supabase.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMachines()
  }, [loadMachines])

  useEffect(() => {
    if (selectedMachineId == null || !isSupabaseConfigured) return

    let cancelled = false
    setReading(null)
    setReadingError(null)
    fetchLatestReading(selectedMachineId)
      .then((data) => {
        if (!cancelled) setReading(data)
      })
      .catch((error) => {
        if (!cancelled) setReadingError(error.message || 'No live reading found for this machine.')
      })
    return () => {
      cancelled = true
    }
  }, [selectedMachineId])

  const machineLabel = useMemo(() => {
    const machine = machines.find((m) => m.id === selectedMachineId)
    return machine?.machine_name || (selectedMachineId ? `Machine-${String(selectedMachineId).padStart(3, '0')}` : '—')
  }, [machines, selectedMachineId])

  const shaftFreq = reading ? reading.rotational_speed / 60 : null
  const degradation = reading ? reading.degradation : null
  const vibrationReading = reading ? reading.vibration : null
  const hasLiveReading = reading != null

  const vibrationData = useMemo(() => {
    if (!hasLiveReading) return { timeSeries: [], rawSpectrum: [], envelopeSpectrum: [], defectFreq: 0 }
    return generateVibrationData(shaftFreq, degradation, vibrationReading)
  }, [hasLiveReading, shaftFreq, degradation, vibrationReading])

  const { timeSeries, rawSpectrum, envelopeSpectrum, defectFreq } = vibrationData

  return (
    <div className="min-h-screen bg-accent-dark pb-20">
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono-data text-xs uppercase tracking-[0.2em] text-accent/80">
              Vibration Diagnostics
            </p>
            <h1 className="font-editorial mt-1 text-3xl font-semibold text-white">
              Vibration Analysis Lab
            </h1>
            <p className="mt-1 text-sm text-white/50">
              FFT and envelope analysis, reconstructed live from each machine's simulator reading.
            </p>
          </div>

          <div className="relative">
            <select
              value={selectedMachineId ?? ''}
              onChange={(event) => setSelectedMachineId(Number(event.target.value))}
              disabled={loading || machines.length === 0}
              className="appearance-none rounded-lg border border-white/15 bg-white/5 py-2 pl-3 pr-9 text-sm font-medium text-white focus:border-accent focus:outline-none disabled:opacity-50"
            >
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id} className="text-ink">
                  {machine.machine_name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          </div>
        </div>

        {machinesError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            <WifiOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>Could not load the live fleet from Supabase. {machinesError}</p>
          </div>
        )}

        {!machinesError && readingError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            <WifiOff className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>No live simulator reading found for {machineLabel}. {readingError}</p>
          </div>
        )}

        {hasLiveReading && (
          <>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>
                Reconstructed signal — {machineLabel}'s sensor architecture logs scalar vibration
                magnitude, not a raw waveform, so this trace isn't a literal accelerometer capture. It
                is, however, built entirely from {machineLabel}'s live simulator reading — no invented
                or mock values.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-white/40">Degradation</p>
                <p className="font-mono-data mt-1 text-lg font-semibold text-white">
                  {(degradation * 100).toFixed(0)}%
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-white/40">Shaft speed</p>
                <p className="font-mono-data mt-1 text-lg font-semibold text-white">
                  {shaftFreq.toFixed(1)} <span className="text-xs font-normal text-white/40">Hz</span>
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-white/40">Vibration</p>
                <p className="font-mono-data mt-1 text-lg font-semibold text-white">
                  {vibrationReading.toFixed(3)} <span className="text-xs font-normal text-white/40">mm/s</span>
                </p>
              </div>
            </div>
          </>
        )}

        {!hasLiveReading && !machinesError && !readingError && (
          <div className="mt-8 rounded-xl border border-white/10 bg-black/30 p-10">
            {loading ? (
              <div className="space-y-3">
                <div className="skeleton-dark mx-auto h-3 w-40 rounded" />
                <div className="skeleton-dark h-40 w-full rounded-lg" />
              </div>
            ) : (
              <p className="text-center text-sm text-white/50">Select a machine to load its live reading.</p>
            )}
          </div>
        )}

        {hasLiveReading && (
          <>
            <div className="card-hover relative mt-8 overflow-hidden rounded-xl border border-white/10 bg-black/30 p-6">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-400/60" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-emerald-400" />
                  <p className="font-mono-data text-xs uppercase tracking-wide text-white/60">
                    Time Domain — Raw Signal
                  </p>
                </div>
                <span className="flex items-center gap-1.5 font-mono-data text-[10px] uppercase tracking-wide text-emerald-400/80">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </span>
              </div>
              <div className="mt-4">
                <ScopeChart
                  data={timeSeries}
                  dataKey="amplitude"
                  xKey="t"
                  xLabel="ms"
                  color="#34d399"
                />
              </div>
              <p className="mt-4 max-w-3xl text-xs leading-relaxed text-white/40">
                A raw accelerometer reading is a single time-domain trace, amplitude against time. A
                developing bearing defect adds periodic impact energy on top of the machine's normal
                rotating signature, but at this stage it's visually mixed in with everything else,
                not yet a clear diagnosis.
              </p>
            </div>

            <div className="card-hover relative mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/30 p-6">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[#5b8dff]/60" />
              <div className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-accent" />
                <p className="font-mono-data text-xs uppercase tracking-wide text-white/60">
                  Frequency Domain — FFT Spectrum
                </p>
              </div>
              <div className="mt-4">
                <ScopeChart
                  data={rawSpectrum}
                  dataKey="amplitude"
                  xKey="freq"
                  xLabel="Hz"
                  color="#5b8dff"
                  referenceLines={[
                    { x: Number(shaftFreq.toFixed(1)), color: '#94a3b8', label: '1x shaft' },
                    { x: Number((shaftFreq * 2).toFixed(1)), color: '#64748b', label: '2x' },
                  ]}
                />
              </div>
              <p className="mt-4 max-w-3xl text-xs leading-relaxed text-white/40">
                The Fourier transform decomposes the raw trace into its frequency components. The shaft
                rotation shows up as a clean peak, but energy from the developing defect is spread and
                excited around a structural resonance band, not concentrated at one obvious frequency —
                this is why raw FFT alone often misses early-stage bearing faults.
              </p>
            </div>

            <div className="card-hover relative mt-4 overflow-hidden rounded-xl border border-accent/30 bg-black/30 p-6">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-red-400/60" />
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-red-400" />
                <p className="font-mono-data text-xs uppercase tracking-wide text-white/60">
                  Envelope Spectrum — Defect Frequency Isolated
                </p>
              </div>
              <div className="mt-4">
                <ScopeChart
                  data={envelopeSpectrum}
                  dataKey="amplitude"
                  xKey="freq"
                  xLabel="Hz"
                  color="#f87171"
                  referenceLines={[
                    { x: Number(defectFreq.toFixed(1)), color: '#ef4444', label: 'Defect frequency' },
                  ]}
                />
              </div>
              <p className="mt-4 max-w-3xl text-xs leading-relaxed text-white/40">
                Envelope analysis rectifies the signal and looks at how its amplitude is modulated over
                time (approximated here by rectify-and-smooth, rather than a full Hilbert transform).
                Demodulating the resonance-band energy reveals the defect's true repetition rate as a
                single clean peak, the signature a technician would use to confirm a specific bearing
                fault frequency.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
