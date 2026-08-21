import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import Navbar from './components/Navbar'
import { ToastProvider } from './components/Toast'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import WatchlistPage from './pages/WatchlistPage'
import MachineDetailPage from './pages/MachineDetailPage'
import VibrationAnalysisPage from './pages/VibrationAnalysisPage'
import AIAssistantPage from './pages/AIAssistantPage'
import SettingsPage from './pages/SettingsPage'

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/10">
        <Compass className="h-6 w-6 text-accent" />
      </span>
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-accent">404</p>
      <h1 className="font-editorial mt-2 text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        The page you're looking for doesn't exist in this application.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-glow-accent transition-colors hover:bg-accent/90"
      >
        Back to Overview
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="min-h-screen bg-white">
          <Navbar />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/machines/:id" element={<MachineDetailPage />} />
            <Route path="/vibration-analysis" element={<VibrationAnalysisPage />} />
            <Route path="/assistant" element={<AIAssistantPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </ToastProvider>
    </BrowserRouter>
  )
}
