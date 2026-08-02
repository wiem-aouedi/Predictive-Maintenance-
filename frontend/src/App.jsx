import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import WatchlistPage from './pages/WatchlistPage'
import MachineDetailPage from './pages/MachineDetailPage'
import AIAssistantPage from './pages/AIAssistantPage'

function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-400">404</p>
      <h1 className="mt-2 text-2xl font-bold text-blue-950">Page not found</h1>
      <p className="mt-2 text-sm text-blue-500">
        The page you're looking for doesn't exist in this application.
      </p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/machines/:id" element={<MachineDetailPage />} />
          <Route path="/assistant" element={<AIAssistantPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}