import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import Learn from './pages/Learn.jsx'
import Lesson from './pages/Lesson.jsx'
import Quiz from './pages/Quiz.jsx'
import QuizPlay from './pages/QuizPlay.jsx'
import News from './pages/News.jsx'
import Ipo from './pages/Ipo.jsx'
import IpoDetail from './pages/IpoDetail.jsx'
import Recommendations from './pages/Recommendations.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Auth from './pages/Auth.jsx'
import Disclaimer from './pages/Disclaimer.jsx'
import { useAuth } from './lib/store.js'
import { getToken } from './lib/api.js'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-[60vh] place-items-center text-white/40">Loading…</div>
  if (!user) return <Navigate to={`/auth?mode=login&next=${encodeURIComponent(location.pathname)}`} replace />
  return children
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)

  useEffect(() => {
    if (getToken()) bootstrap()
    else useAuth.setState({ loading: false })
  }, [bootstrap])

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:track" element={<Learn />} />
          <Route path="/learn/:track/:level" element={<Lesson />} />
          <Route path="/quiz" element={<Protected><Quiz /></Protected>} />
          <Route path="/quiz/:track/:level" element={<Protected><QuizPlay /></Protected>} />
          <Route path="/news" element={<News />} />
          <Route path="/reco" element={<Recommendations />} />
          <Route path="/ipo" element={<Ipo />} />
          <Route path="/ipo/:symbol" element={<IpoDetail />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
