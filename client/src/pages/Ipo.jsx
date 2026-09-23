import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { RefreshCw, ArrowRight } from 'lucide-react'
import { VerdictBadge, GmpChip } from '../components/Verdict.jsx'
import { Chip } from '../components/Chip.jsx'
import { Notice } from '../components/Notice.jsx'
import Seo from '../components/Seo.jsx'
import { API_BASE } from '../lib/api.js'

const PHASES = [
  { key: 'all', label: 'Everything' },
  { key: 'open', label: 'Open now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'closed', label: 'Just closed' },
]

// Phase is the only field on a card that changes what you can do today, so it is
// the only one that spends the accent. The rail that used to run down the side of
// every open card is gone: it painted the same fact a second time, in the same
// colour, two millimetres away from the chip that already said OPEN.
const PHASE = {
  open: { tone: 'neutral', label: 'OPEN' },
  upcoming: { tone: 'neutral', label: 'UPCOMING' },
  closed: { tone: 'neutral', label: 'CLOSED' },
}

export function formatDate(iso) {
  if (!iso) return 'TBA'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function SubscriptionBar({ times }) {
  if (times == null) return null
  // Anything past 10x is off the scale, so the bar caps and the number carries the rest.
  const width = Math.min(100, (times / 10) * 100)
  return (
    <div className="mt-[var(--space-4)]">
      <div className="flex items-baseline justify-between gap-[var(--space-2)]">
        <span className="eyebrow">total subscription</span>
        <span className="readout text-sm text-ink">{times.toFixed(2)}x</span>
      </div>
      {/* Ink, not accent. A bar that appears once per card is not an accent, it is
          a second body colour with a progress meter attached. */}
      <div className="mt-[var(--space-1)] h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-[var(--dur-data)] ease-[var(--ease-data)]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function IssueCard({ issue, index }) {
  const phase = PHASE[issue.phase]
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
    >
      <Link
        to={`/ipo/${issue.symbol}`}
        className="panel group flex h-full flex-col p-[var(--space-4)] transition hover:-translate-y-0.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-[var(--space-2)]">
          {phase && <Chip tone={phase.tone}>{phase.label}</Chip>}
          <div className="flex flex-wrap items-center gap-[var(--space-1)]">
            <GmpChip gmp={issue.gmp} />
            <VerdictBadge verdict={issue.verdict} />
          </div>
        </div>

        <h3 className="mt-[var(--space-4)] leading-snug">{issue.company}</h3>
        <p className="readout mt-[var(--space-1)] text-xs text-ink-3">{issue.symbol}</p>

        <dl className="mt-[var(--space-4)] grid grid-cols-2 gap-x-[var(--space-3)] gap-y-[var(--space-3)]">
          <div>
            <dt className="eyebrow">price band</dt>
            <dd className="readout mt-[var(--space-1)] text-sm">{issue.band.label}</dd>
          </div>
          <div>
            <dt className="eyebrow">{issue.gmp?.estimatedListing ? 'grey mkt implies' : 'issue size'}</dt>
            <dd className="readout mt-[var(--space-1)] text-sm">
              {issue.gmp?.estimatedListing
                ? `Rs ${issue.gmp.estimatedListing}`
                : issue.issueSizeCrore
                  ? `~Rs ${issue.issueSizeCrore} cr`
                  : 'TBA'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="eyebrow">window</dt>
            <dd className="readout mt-[var(--space-1)] flex flex-wrap items-baseline gap-x-[var(--space-2)] text-sm">
              <span>
                {formatDate(issue.opens)} to {formatDate(issue.closes)}
              </span>
              {issue.phase === 'open' && issue.daysLeft != null && (
                <span className="text-ink-3">{issue.daysLeft <= 0 ? 'last day' : `${issue.daysLeft}d left`}</span>
              )}
            </dd>
          </div>
        </dl>

        <SubscriptionBar times={issue.subscribedTimes} />

        <div className="eyebrow mt-auto flex items-center justify-between gap-[var(--space-2)] pt-[var(--space-4)]">
          <span>
            {issue.lot ? `lot ${issue.lot} · ` : ''}
            {issue.board} · {issue.coverageCount} stories
          </span>
          <ArrowRight size={14} className="shrink-0 transition group-hover:translate-x-1" />
        </div>
      </Link>
    </motion.div>
  )
}

// One filter language for both rows: a mono label that goes to ink and picks up a
// hairline underneath when it is the live one. Colour goes through inline style
// because the eyebrow utility sets its own, and utility-versus-utility source
// order is not worth betting the filter row on.
function Filter({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="eyebrow py-[var(--space-1)] transition hover:text-ink"
      style={active ? { color: 'var(--color-ink)', boxShadow: 'inset 0 -1px 0 var(--color-ink)' } : undefined}
    >
      {children}
    </button>
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
    <div className="mx-auto max-w-[var(--page-max)] px-[var(--page-inset)] pt-[var(--space-6)] pb-[var(--space-7)]">
      <Seo title="IPO tracker with live NSE subscription" description="Every mainboard and SME IPO open or announced, with live NSE subscription, category bidding in 3D, grey market premium and a prospectus checklist." />

      <header className="flex flex-wrap items-end justify-between gap-[var(--space-4)]">
        <div>
          <span className="eyebrow">Straight from NSE</span>
          {/* The one serif line on this page. */}
          <h1 className="display mt-[var(--space-2)]">IPO tracker</h1>
        </div>

        <div className="flex items-end gap-[var(--space-4)]">
          {data && (
            <>
              <div>
                <div className="readout text-xl leading-none text-ink">{data.counts.open}</div>
                <div className="eyebrow mt-[var(--space-1)]">open</div>
              </div>
              <div>
                <div className="readout text-xl leading-none text-ink-3">{data.counts.upcoming}</div>
                <div className="eyebrow mt-[var(--space-1)]">upcoming</div>
              </div>
            </>
          )}
          <button
            onClick={load}
            className="panel grid h-11 w-11 place-items-center text-ink-3 transition hover:text-ink"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <p className="prose mt-[var(--space-4)]">
        Every mainboard and SME issue currently open or announced, with live subscription numbers from the exchange
        and every published story we can match to it. No calls, no tips, no verdicts.
      </p>

      <div className="mt-[var(--space-6)] flex flex-wrap items-center gap-x-[var(--space-4)] gap-y-[var(--space-2)]">
        {PHASES.map((option) => (
          <Filter key={option.key} active={phase === option.key} onClick={() => setPhase(option.key)}>
            {option.label}
          </Filter>
        ))}
        <span className="h-3 w-px shrink-0 bg-hairline" aria-hidden="true" />
        {['All', 'Mainboard', 'SME'].map((name) => (
          <Filter key={name} active={board === name} onClick={() => setBoard(name)}>
            {name}
          </Filter>
        ))}
      </div>

      <Notice className="mt-[var(--space-5)]">
        Subscription figures come from NSE. Grey market premium is sourced from{' '}
        {data?.gmpSource ? (
          <a
            href={data.gmpSource.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink underline decoration-1 underline-offset-4"
          >
            {data.gmpSource.name}
          </a>
        ) : (
          'a third-party grey market tracker'
        )}
        , an unofficial and unregulated market that SEBI has cautioned investors about. The verdict on each card is a
        mechanical score from those numbers, not advice. InvestoMillionaire is not SEBI registered. Open any issue to
        see exactly which rules produced its label, and read the RHP before you decide anything.{' '}
        <Link to="/learn/fundamental/2" className="text-ink underline decoration-1 underline-offset-4">
          How an IPO actually works
        </Link>
      </Notice>

      {error && (
        <Notice className="mt-[var(--space-4)]">
          {error}{' '}
          <button onClick={load} className="text-ink underline decoration-1 underline-offset-4">
            Try again
          </button>
        </Notice>
      )}

      {loading && !data ? (
        <div className="mt-[var(--space-5)] grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel h-64 p-[var(--space-4)]">
              <div className="h-3 w-20 rounded bg-surface-2" />
              <div className="mt-[var(--space-4)] h-4 w-full rounded bg-surface-2" />
              <div className="mt-[var(--space-2)] h-4 w-2/3 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-[var(--space-5)] grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((issue, i) => (
              <IssueCard key={issue.symbol} issue={issue} index={i} />
            ))}
          </div>
          {filtered.length === 0 && !error && (
            <p className="mx-auto mt-[var(--space-6)] max-w-[var(--measure)] text-center text-ink-3">
              Nothing matches that filter. Between issues the exchange list often sits empty for a few days.
            </p>
          )}
        </>
      )}

      {data?.fetchedAt && (
        <p className="eyebrow mt-[var(--space-5)] text-center">
          exchange data pulled {new Date(data.fetchedAt).toLocaleTimeString('en-IN')} · cached 10 minutes
        </p>
      )}

      <section className="mt-[var(--space-7)] border-t border-hairline pt-[var(--space-6)]">
        <h2>New to this?</h2>
        <p className="prose mt-[var(--space-2)]">
          Level 2 of the fundamentals track walks through the primary market, book building, price bands and what
          oversubscription actually does to your allotment odds.
        </p>
        {/* The one action this page is arguing for, and the only accent below the fold. */}
        <Link
          to="/learn/fundamental/2"
          className="mt-[var(--space-4)] inline-flex items-center gap-2 rounded-full border border-hairline-strong px-[var(--space-4)] py-[var(--space-2)] text-sm text-accent transition hover:border-accent"
        >
          Read the IPO lesson <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  )
}
