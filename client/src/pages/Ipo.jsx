import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, RefreshCw, TrendingUp, Info, ArrowRight, Building2, ShieldAlert } from 'lucide-react'
import { VerdictBadge, GmpChip } from '../components/Verdict.jsx'
import Seo from '../components/Seo.jsx'
import { API_BASE } from '../lib/api.js'

const PHASES = [
  { key: 'all', label: 'Everything' },
  { key: 'open', label: 'Open now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'closed', label: 'Just closed' },
]

const PHASE_STYLE = {
  open: { color: '#33e29b', label: 'OPEN' },
  upcoming: { color: '#eaa81e', label: 'UPCOMING' },
  closed: { color: '#8b5cf6', label: 'CLOSED' },
}

export function formatDate(iso) {
  if (!iso) return 'TBA'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function SubscriptionBar({ times }) {
  if (times == null) return null
  // Anything past 10x is off the scale, so the bar caps and the number carries the rest.
  const width = Math.min(100, (times / 10) * 100)
  const color = times >= 3 ? '#33e29b' : times >= 1 ? '#eaa81e' : '#ff5d5d'
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-widest text-white/35 uppercase">total subscription</span>
        <span className="font-mono text-sm font-bold" style={{ color }}>
          {times.toFixed(2)}x
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  )
}

function IssueCard({ issue, index }) {
  const style = PHASE_STYLE[issue.phase]
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
    >
      <Link
        to={`/ipo/${issue.symbol}`}
        className="glass group relative flex h-full flex-col overflow-hidden rounded-2xl p-6 transition hover:-translate-y-1 hover:border-white/25"
      >
        <span className="absolute top-0 left-0 h-full w-[3px]" style={{ background: style.color, opacity: 0.75 }} />

        <div className="flex flex-wrap items-start justify-between gap-2">
          <span
            className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest"
            style={{ background: `${style.color}1f`, color: style.color }}
          >
            {style.label}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <GmpChip gmp={issue.gmp} />
            {issue.verdict && <VerdictBadge verdict={issue.verdict} />}
          </div>
        </div>

        <h3 className="mt-4 text-lg leading-snug font-bold transition group-hover:text-gold">{issue.company}</h3>
        <p className="font-mono text-xs text-white/35">{issue.symbol}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="font-mono text-[10px] tracking-widest text-white/35 uppercase">price band</dt>
            <dd className="mt-0.5 font-semibold">{issue.band.label}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] tracking-widest text-white/35 uppercase">
              {issue.gmp?.estimatedListing ? 'grey mkt implies' : 'issue size'}
            </dt>
            <dd className="mt-0.5 font-semibold">
              {issue.gmp?.estimatedListing
                ? `Rs ${issue.gmp.estimatedListing}`
                : issue.issueSizeCrore
                  ? `~Rs ${issue.issueSizeCrore} cr`
                  : 'TBA'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="font-mono text-[10px] tracking-widest text-white/35 uppercase">window</dt>
            <dd className="mt-0.5 flex items-center gap-2 font-semibold">
              <CalendarDays size={13} className="text-white/40" />
              {formatDate(issue.opens)} to {formatDate(issue.closes)}
              {issue.phase === 'open' && issue.daysLeft != null && (
                <span className="font-mono text-xs text-mint">
                  {issue.daysLeft <= 0 ? 'last day' : `${issue.daysLeft}d left`}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <SubscriptionBar times={issue.subscribedTimes} />

        <div className="mt-auto flex items-center justify-between pt-5 font-mono text-[10px] tracking-widest text-white/35 uppercase">
          <span>
            {issue.lot ? `lot ${issue.lot} · ` : ''}
            {issue.board} · {issue.coverageCount} stories
          </span>
          <ArrowRight size={14} className="transition group-hover:translate-x-1 group-hover:text-gold" />
        </div>
      </Link>
    </motion.div>
  )
}

export default function Ipo() {
  const [data, setData] = useState(null)
  const [phase, setPhase] = useState('all')
  const [board, setBoard] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/ipo`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load the issue list.')
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.issues.filter((issue) => {
      if (phase !== 'all' && issue.phase !== phase) return false
      if (board !== 'All' && issue.board !== board) return false
      return true
    })
  }, [data, phase, board])

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Seo title="IPO tracker with live NSE subscription" description="Every mainboard and SME IPO open or announced, with live NSE subscription, category bidding in 3D, grey market premium and a prospectus checklist." />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest text-gold uppercase">
            <Building2 size={13} /> Straight from NSE
          </span>
          <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">IPO tracker</h1>
          <p className="mt-2 max-w-2xl text-white/55">
            Every mainboard and SME issue currently open or announced, with live subscription numbers from the exchange
            and every published story we can match to it. No calls, no tips, no verdicts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <div className="glass hidden items-center gap-4 rounded-2xl px-5 py-3 sm:flex">
              <div className="text-center">
                <div className="font-mono text-lg font-bold text-mint">{data.counts.open}</div>
                <div className="font-mono text-[9px] tracking-widest text-white/35 uppercase">open</div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <div className="font-mono text-lg font-bold text-gold">{data.counts.upcoming}</div>
                <div className="font-mono text-[9px] tracking-widest text-white/35 uppercase">upcoming</div>
              </div>
            </div>
          )}
          <button onClick={load} className="glass grid h-12 w-12 place-items-center rounded-2xl transition hover:text-gold" aria-label="Refresh">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {PHASES.map((option) => (
          <button
            key={option.key}
            onClick={() => setPhase(option.key)}
            className={`rounded-full border px-4 py-2 font-mono text-[11px] tracking-widest uppercase transition ${
              phase === option.key ? 'border-transparent bg-gold text-ink' : 'border-white/10 text-white/50 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        ))}
        <span className="mx-1 w-px bg-white/10" />
        {['All', 'Mainboard', 'SME'].map((name) => (
          <button
            key={name}
            onClick={() => setBoard(name)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              board === name ? 'bg-white/15 text-white' : 'bg-white/5 text-white/45 hover:text-white'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="glass mt-6 flex items-start gap-3 rounded-2xl border-l-2 border-l-gold p-5">
        <ShieldAlert size={17} className="mt-0.5 shrink-0 text-gold" />
        <p className="text-sm leading-relaxed text-white/60">
          Subscription figures come from NSE. Grey market premium is sourced from{' '}
          {data?.gmpSource ? (
            <a href={data.gmpSource.url} target="_blank" rel="noreferrer noopener" className="font-semibold text-gold hover:underline">
              {data.gmpSource.name}
            </a>
          ) : (
            'a third-party grey market tracker'
          )}
          , an unofficial and unregulated market that SEBI has cautioned investors about. The verdict on each card is a
          mechanical score from those numbers, not advice. InvestoMillionaire is not SEBI registered. Open any issue to
          see exactly which rules produced its label, and read the RHP before you decide anything.{' '}
          <Link to="/learn/fundamental/2" className="font-semibold text-gold hover:underline">
            How an IPO actually works
          </Link>
        </p>
      </div>

      {error && (
        <div className="mt-8 rounded-2xl border border-flame/30 bg-flame/5 p-6 text-center">
          <p className="text-flame">{error}</p>
          <button onClick={load} className="mt-3 text-sm text-white/60 underline">
            Try again
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass h-64 animate-pulse rounded-2xl p-6">
              <div className="h-3 w-20 rounded bg-white/10" />
              <div className="mt-6 h-4 w-full rounded bg-white/10" />
              <div className="mt-2 h-4 w-2/3 rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((issue, i) => (
              <IssueCard key={issue.symbol} issue={issue} index={i} />
            ))}
          </div>
          {filtered.length === 0 && !error && (
            <p className="mt-16 text-center text-white/40">
              Nothing matches that filter. Between issues the exchange list often sits empty for a few days.
            </p>
          )}
        </>
      )}

      {data?.fetchedAt && (
        <p className="mt-8 text-center font-mono text-[10px] tracking-widest text-white/25 uppercase">
          exchange data pulled {new Date(data.fetchedAt).toLocaleTimeString('en-IN')} · cached 10 minutes
        </p>
      )}

      <div className="mt-14 flex items-center gap-3">
        <TrendingUp className="text-gold" size={20} />
        <h2 className="text-xl font-bold">New to this?</h2>
      </div>
      <p className="mt-2 max-w-2xl text-white/55">
        Level 2 of the fundamentals track walks through the primary market, book building, price bands and what
        oversubscription actually does to your allotment odds.
      </p>
      <Link
        to="/learn/fundamental/2"
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-gold/40 px-6 py-3 text-sm font-semibold text-gold transition hover:bg-gold/10"
      >
        Read the IPO lesson <ArrowRight size={15} />
      </Link>
    </div>
  )
}
