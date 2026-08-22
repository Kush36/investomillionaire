import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, Flame, Zap } from 'lucide-react'
import Logo from './Logo.jsx'
import { useAuth, rankFor } from '../lib/store.js'

const LINKS = [
  { to: '/learn', label: 'Learn' },
  { to: '/quiz', label: 'Quiz' },
  { to: '/reco', label: 'Broker calls' },
  { to: '/ipo', label: 'IPOs' },
  { to: '/news', label: 'News' },
  { to: '/leaderboard', label: 'Leaderboard' },
]

export default function Nav() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const linkClass = ({ isActive }) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      isActive ? 'bg-gold/15 text-gold' : 'text-white/65 hover:bg-white/5 hover:text-white'
    }`

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <span className="flex items-center gap-1 font-mono text-xs text-gold">
                  <Zap size={13} /> {user.xp}
                </span>
                <span className="flex items-center gap-1 font-mono text-xs text-flame">
                  <Flame size={13} /> {user.streak}
                </span>
              </div>
              <Link
                to="/dashboard"
                className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink transition hover:bg-gold-soft"
              >
                {rankFor(user.xp).current.name}
              </Link>
              <button
                onClick={() => {
                  logout()
                  navigate('/')
                }}
                className="text-sm text-white/50 transition hover:text-white"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/auth?mode=login" className="text-sm text-white/70 transition hover:text-white">
                Log in
              </Link>
              <Link
                to="/auth?mode=signup"
                className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink transition hover:bg-gold-soft"
              >
                Start free
              </Link>
            </>
          )}
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/5 bg-ink px-4 pb-5 md:hidden">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="block border-b border-white/5 py-3 text-white/75"
            >
              {link.label}
            </NavLink>
          ))}
          {user ? (
            <div className="flex items-center gap-3 pt-4">
              <Link to="/dashboard" onClick={() => setOpen(false)} className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink">
                Dashboard
              </Link>
              <span className="font-mono text-xs text-gold">{user.xp} XP</span>
              <button onClick={logout} className="ml-auto text-sm text-white/50">
                Log out
              </button>
            </div>
          ) : (
            <div className="flex gap-3 pt-4">
              <Link to="/auth?mode=login" onClick={() => setOpen(false)} className="rounded-full border border-white/15 px-4 py-2 text-sm">
                Log in
              </Link>
              <Link to="/auth?mode=signup" onClick={() => setOpen(false)} className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink">
                Start free
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
