import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const TONES = {
  success: { icon: CheckCircle2, bar: 'bg-emerald-500', iconColor: 'text-emerald-500' },
  error: { icon: XCircle, bar: 'bg-red-500', iconColor: 'text-red-500' },
  info: { icon: Info, bar: 'bg-accent', iconColor: 'text-accent' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message, tone = 'info', duration = 4000) => {
      const id = nextId.current++
      setToasts((prev) => [...prev, { id, message, tone }])
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => {
          const tone = TONES[toast.tone] || TONES.info
          const Icon = tone.icon
          return (
            <div
              key={toast.id}
              className="animate-fade-slide pointer-events-auto relative flex w-80 max-w-[90vw] items-start gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
              <Icon className={`h-5 w-5 flex-shrink-0 ${tone.iconColor}`} />
              <p className="flex-1 text-sm text-ink">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 text-slate-300 hover:text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
