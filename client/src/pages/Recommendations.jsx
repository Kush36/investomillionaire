import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ExternalLink, RefreshCw, Target, Building2, Clock } from 'lucide-react'
import Seo from '../components/Seo.jsx'
import Chip from '../components/Chip.jsx'
import Notice from '../components/Notice.jsx'
import { API_BASE } from '../lib/api.js'

// The stance carried a label and no styling at all, so WATCHING and AVOIDING
// arrived at the same volume. A stance is a rating, not realised profit and
// loss, so the gain and loss inks are not available to it. The ladder is ink
// strength and ring strength: avoiding is the one you have to see, so it sits
// at full ink behind a strong hairline; watching is the quietest thing on the
// card and recedes to ink-3.
const STANCE_STYLE = {
  watching: { label: 'WATCHING', ink: 'var(--color-ink-3)', ring: 'var(--color-hairline)' },
  studying: { label: 'STUDYING', ink: 'var(--color-ink-2)', ring: 'var(--color-hairline)' },
  avoiding: { label: 'AVOIDING', ink: 'var(--color-ink)', ring: 'var(--color-hairline-strong)' },
}

// Chip spreads its rest props after its own style attribute, so a style prop
// replaces that object rather than merging into it. The micro size has to be
// restated or the chip grows; colour and ring are the two things this varies.
function chipInk({ ink, ring }) {
  return { color: ink, fontSize: 'var(--text-micro)', boxShadow: `inset 0 0 0 1px ${ring}` }
}

// Filter state is read by ink and ring, never by a fill, so nothing on the row
// shifts when the selection moves and no pill becomes a coloured block.
function pillStyle(active, activeInk) {
  return active
    ? { color: activeInk, boxShadow: `inset 0 0 0 1px ${activeInk}` }
    : { color: 'var(--color-ink-3)', boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }
}

function timeAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function CallCard({ call, index }) {
  return (
    <motion.a
      href={call.link}
      target="_blank"
      rel="noreferrer noopener"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="panel group relative flex flex-col overflow-hidden p-[var(--space-4)] transition hover:shadow-low"
    >
      {/* Two chips at most. The target used to be a third, painted mulberry on
          a mulberry plate on every card in the grid, which is how an accent
          stops being an accent. It is a number, so it is set as one below. */}
      <div className="flex flex-wrap items-center gap-[var(--space-1)]">
        <Chip>
          <Building2 size={11} aria-hidden="true" /> {call.broker}
        </Chip>
        {call.rating && <Chip>{call.rating}</Chip>}
        {call.kind === 'view' && <Chip>MARKET VIEW</Chip>}
      </div>

      <h3 className="mt-[var(--space-3)] flex-1 leading-snug">{call.title}</h3>
      {call.summary && (
        <p className="mt-[var(--space-2)] line-clamp-3 text-sm leading-relaxed text-ink-2">{call.summary}</p>
      )}

      {call.target && (
        <p className="mt-[var(--space-3)] flex items-center gap-1.5 text-ink-3">
          <Target size={12} aria-hidden="true" />
          <span className="readout text-sm text-ink">{call.target}</span>
        </p>
      )}

      <div className="eyebrow mt-[var(--space-3)] flex items-center justify-between gap-[var(--space-2)]">
        <span>{call.source}</span>
        <span className="flex items-center gap-1.5">
          <Clock size={11} aria-hidden="true" /> {timeAgo(call.publishedAt)} <ExternalLink size={11} aria-hidden="true" />
        </span>
      </div>
    </motion.a>
  )
}

function PickCard({ pick, index }) {
  const stance = STANCE_STYLE[pick.stance] ?? STANCE_STYLE.watching
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="panel relative overflow-hidden p-[var(--space-4)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-2)]">
        <div>
          <h3>{pick.company}</h3>
          <p className="readout mt-[var(--space-1)] text-xs text-ink-3">
            {pick.symbol}
            {pick.sector ? ` · ${pick.sector}` : ''}
          </p>
        </div>
        <Chip style={chipInk(stance)}>{stance.label}</Chip>
      </div>

      <p className="mt-[var(--space-3)] text-sm leading-relaxed text-ink-2">{pick.thesis}</p>

      {/* Not a Notice: a Notice is a panel, and this already sits inside one.
          A rule and an eyebrow separate it without nesting a second sheet in
          the card, and without the tinted plate the old version painted. */}
      {pick.risk && (
        <div className="mt-[var(--space-3)] border-t border-hairline pt-[var(--space-3)]">
          <p className="eyebrow">what would make this wrong</p>
          <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">{pick.risk}</p>
        </div>
      )}

      <div className="eyebrow mt-[var(--space-4)] flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <span>
          added <span className="readout">{new Date(pick.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {pick.addedPrice ? (
            <>
              {' at Rs '}
              <span className="readout">{pick.addedPrice}</span>
            </>
          ) : (
            ''
          )}
        </span>
        {pick.sourceUrl && (
          <a href={pick.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-ink-2 transition hover:text-ink">
            source <ExternalLink size={11} aria-hidden="true" />
          </a>
        )}
      </div>
    </motion.div>
  )
}

export default function Recommendations() {
  const [data, setData] = useState(null)
  const [broker, setBroker] = useState('All')
  const [rating, setRating] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/reco`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load broker coverage.')
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const calls = useMemo(() => {
    if (!data) return []
    return data.calls.filter((c) => {
      if (broker !== 'All' && c.broker !== broker) return false
      if (rating !== 'All' && c.rating !== rating) return false
      return true
    })
  }, [data, broker, rating])

  return (
    <div className="mx-auto max-w-7xl px-4 py-[var(--space-6)] sm:px-6">
      <Seo title="Broker calls and research coverage" description="Published research calls from Indian and global broking desks, attributed to the firm that made them, with rating and target where stated." />
      <div className="flex flex-wrap items-end justify-between gap-[var(--space-4)]">
        <div>
          <span className="eyebrow">What the desks are saying</span>
          {/* The one voice moment on this page. */}
          <h1 className="display mt-[var(--space-2)]">Broker calls</h1>
          <p className="prose mt-[var(--space-3)]">
            Published research calls from Indian and global desks covering this market, each one attributed to the firm
            that made it and linked to the story it came from.
          </p>
        </div>
        <div className="flex items-center gap-[var(--space-2)]">
          {data && (
            <div className="panel hidden items-center gap-[var(--space-4)] px-[var(--space-4)] py-[var(--space-2)] sm:flex">
              <div>
                <div className="readout text-2xl text-ink">{data.counts?.calls ?? 0}</div>
                <div className="eyebrow">rated calls</div>
              </div>
              <div className="h-8 w-px bg-hairline" />
              <div>
                <div className="readout text-2xl text-ink">{data.counts?.views ?? 0}</div>
                <div className="eyebrow">views</div>
              </div>
            </div>
          )}
          <button onClick={load} className="panel grid h-12 w-12 place-items-center text-ink-3 transition hover:text-ink" aria-label="Refresh">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Was a panel with a left border drawn on top of the panel's own ring,
          two lines a pixel apart. Notice draws the rail as an inset shadow
          alongside that ring instead. */}
      <Notice className="mt-[var(--space-5)]">
        Every call on this page belongs to the brokerage named on it, not to us. We reproduce the headline and link back
        to the source. InvestoMillionaire is not a SEBI registered research analyst, makes no recommendation of its own,
        and takes no position on whether any of these calls is right.{' '}
        <Link to="/disclaimer" className="text-accent hover:underline">
          Full disclaimer
        </Link>
      </Notice>

      {data?.brokers?.length > 1 && (
        <div className="mt-[var(--space-6)] space-y-[var(--space-3)]">
          <div className="flex flex-wrap gap-[var(--space-1)]">
            {['All', 'BUY', 'HOLD', 'SELL'].map((name) => (
              <button
                key={name}
                onClick={() => setRating(name)}
                className="eyebrow rounded-full px-[var(--space-3)] py-[var(--space-1)] transition"
                style={pillStyle(rating === name, 'var(--color-accent)')}
              >
                {name}
              </button>
            ))}
          </div>
          {/* Broker is the second filter, so it never takes the accent. Same
              ink-and-ring language one step quieter. */}
          <div className="flex flex-wrap gap-[var(--space-1)]">
            {data.brokers.map((name) => (
              <button
                key={name}
                onClick={() => setBroker(name)}
                className="rounded-full px-[var(--space-3)] py-[var(--space-1)] text-sm transition"
                style={pillStyle(broker === name, 'var(--color-ink)')}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <Notice tone="loss" className="mt-[var(--space-5)]">
          {error}{' '}
          <button onClick={load} className="text-ink underline underline-offset-2">
            Try again
          </button>
        </Notice>
      )}

      {loading && !data ? (
        <div className="mt-[var(--space-5)] grid gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel h-56 p-[var(--space-4)]">
              <div className="h-3 w-24 rounded bg-hairline" />
              <div className="mt-[var(--space-4)] h-4 w-full rounded bg-hairline" />
              <div className="mt-2 h-4 w-2/3 rounded bg-hairline" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-[var(--space-5)] grid gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3">
            {calls.map((call, i) => (
              <CallCard key={call.id} call={call} index={i} />
            ))}
          </div>
          {calls.length === 0 && !error && (
            <p className="mt-[var(--space-7)] text-center text-ink-3">
              No calls match that filter right now. Coverage refreshes every fifteen minutes.
            </p>
          )}
        </>
      )}

      {/* Owner maintained notes. The section break is the largest gap on the
          page, which is what tells you it is a different thing; it used to be
          announced by a mulberry notebook icon instead. */}
      <section className="mt-[var(--space-7)]">
        <h2>On our desk</h2>
        <p className="prose mt-[var(--space-3)]">
          Companies we are reading about, with the reasoning written down and the thing that would prove it wrong
          written down next to it. These are study notes kept in public, not calls to buy anything.
        </p>

        {data?.picks?.length ? (
          <div className="mt-[var(--space-5)] grid gap-[var(--space-3)] lg:grid-cols-2">
            {data.picks.map((pick, i) => (
              <PickCard key={pick.id} pick={pick} index={i} />
            ))}
          </div>
        ) : (
          <p className="panel mt-[var(--space-5)] p-[var(--space-5)] text-center text-sm text-ink-3">
            Nothing on the desk yet. Notes appear here once they are added.
          </p>
        )}
      </section>
    </div>
  )
}
