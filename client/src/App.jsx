import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import { useAuth } from './lib/store.js'
import { getToken } from './lib/api.js'

// One chunk per route. The shell, the nav and the auth store are the only things a
// visitor needs before they have chosen where they are going; the IPO tracker does
// not belong in the download for someone reading a lesson.
const Home = lazy(() => import('./pages/Home.jsx'))
const Learn = lazy(() => import('./pages/Learn.jsx'))
const Lesson = lazy(() => import('./pages/Lesson.jsx'))
const Quiz = lazy(() => import('./pages/Quiz.jsx'))
const QuizPlay = lazy(() => import('./pages/QuizPlay.jsx'))
const News = lazy(() => import('./pages/News.jsx'))
const Ipo = lazy(() => import('./pages/Ipo.jsx'))
const IpoDetail = lazy(() => import('./pages/IpoDetail.jsx'))
const Analyze = lazy(() => import('./pages/Analyze.jsx'))
const Recommendations = lazy(() => import('./pages/Recommendations.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'))
const Auth = lazy(() => import('./pages/Auth.jsx'))
const Disclaimer = lazy(() => import('./pages/Disclaimer.jsx'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

// Tall enough that swapping a route in does not jump the page.
function RouteFallback() {
  return <div className="min-h-[70vh]" aria-hidden="true" />
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-[60vh] place-items-center text-ink-3">Loading…</div>
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
        <Suspense fallback={<RouteFallback />}>
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
            <Route path="/analyze" element={<Analyze />} />
            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/disclaimer" element={<Disclaimer />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
