import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, Flame, Zap } from 'lucide-react'
import Logo from './Logo.jsx'
import { useAuth, rankFor } from '../lib/store.js'

const LINKS = [
  { to: '/learn', label: 'Learn' },
  { to: '/analyze', label: 'Analyzer' },
  { to: '/quiz', label: 'Quiz' },
  { to: '/reco', label: 'Broker calls' },
  { to: '/ipo', label: 'IPOs' },
  { to: '/news', label: 'News' },
  { to: '/leaderboard', label: 'Leaderboard' },
]

// The chrome sets the register before a single page has loaded, so it says as
// little as it can. Links carry no weight class and no fill: the current page is
// ink against ink-3 with a hairline rule under it, which is how a masthead marks
// position without turning six links into six painted pills. The only mulberry
// in the header is the one action a visitor is here to take.
const linkClass = ({ isActive }) =>
  `rounded-full px-[var(--space-2)] py-[var(--space-1)] text-sm transition ${
    isActive
      ? 'text-ink underline decoration-hairline-strong decoration-1 underline-offset-8'
      : 'text-ink-3 hover:text-ink'
  }`

// text-canvas rather than text-white: the accent is mulberry on the light theme
// and a pale rose on the dark one, and white on pale rose is 1.9:1.
const actionClass =
  'rounded-full bg-accent px-[var(--space-3)] py-[var(--space-1)] text-sm text-canvas transition hover:opacity-90'

export default function Nav() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <div className="hidden items-center gap-[var(--space-1)] md:flex">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden items-center gap-[var(--space-4)] md:flex">
          {user ? (
            <>
              {/* Two live figures, set as readouts on bare canvas. The bordered
                  capsule they used to sit in was a third box in a row that
                  already has a wordmark and a button. */}
              <span className="readout flex items-center gap-[var(--space-3)] text-[length:var(--text-micro)] text-ink-3">
                <span className="flex items-center gap-1">
                  <Zap size={12} aria-hidden="true" /> {user.xp}
                </span>
                <span className="flex items-center gap-1">
                  <Flame size={12} aria-hidden="true" /> {user.streak}
                </span>
              </span>
              <Link to="/dashboard" className={actionClass}>
                {rankFor(user.xp).current.name}
              </Link>
              <button
                onClick={() => {
                  logout()
                  navigate('/')
                }}
                className="text-sm text-ink-3 transition hover:text-ink"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/auth?mode=login" className="text-sm text-ink-3 transition hover:text-ink">
                Log in
              </Link>
              <Link to="/auth?mode=signup" className={actionClass}>
                Start free
              </Link>
            </>
          )}
        </div>

        <button className="text-ink-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-hairline bg-canvas px-4 pt-[var(--space-2)] pb-[var(--space-4)] md:hidden">
          {/* One rule at the top of the sheet, not a rule under every item. Six
              hairlines stacked eleven pixels apart is a receipt, not a menu. */}
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="block py-[var(--space-2)] text-ink-2"
            >
              {link.label}
            </NavLink>
          ))}
          {user ? (
            <div className="mt-[var(--space-3)] flex items-center gap-[var(--space-3)] border-t border-hairline pt-[var(--space-4)]">
              <Link to="/dashboard" onClick={() => setOpen(false)} className={actionClass}>
                Dashboard
              </Link>
              <span className="readout text-[length:var(--text-micro)] text-ink-3">{user.xp} XP</span>
              <button onClick={logout} className="ml-auto text-sm text-ink-3">
                Log out
              </button>
            </div>
          ) : (
            <div className="mt-[var(--space-3)] flex items-center gap-[var(--space-4)] border-t border-hairline pt-[var(--space-4)]">
              <Link to="/auth?mode=signup" onClick={() => setOpen(false)} className={actionClass}>
                Start free
              </Link>
              <Link to="/auth?mode=login" onClick={() => setOpen(false)} className="text-sm text-ink-3">
                Log in
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
