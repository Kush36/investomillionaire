import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ExternalLink, RefreshCw, ShieldAlert, Target, Building2, NotebookPen, Clock } from 'lucide-react'
import Seo from '../components/Seo.jsx'
import { API_BASE } from '../lib/api.js'

const RATING_STYLE = {
  BUY: { color: '#33e29b' },
  SELL: { color: '#ff5d5d' },
  HOLD: { color: '#eaa81e' },
}

const STANCE_STYLE = {
  watching: { color: '#eaa81e', label: 'WATCHING' },
  studying: { color: '#5ee0ff', label: 'STUDYING' },
  avoiding: { color: '#ff5d5d', label: 'AVOIDING' },
}

function timeAgo(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function CallCard({ call, index }) {
  const rating = call.rating ? RATING_STYLE[call.rating] : null
  return (
    <motion.a
      href={call.link}
      target="_blank"
      rel="noreferrer noopener"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="glass group relative flex flex-col overflow-hidden rounded-2xl p-6 transition hover:-translate-y-1 hover:border-white/25"
    >
      <span
        className="absolute top-0 left-0 h-full w-[3px]"
        style={{ background: rating?.color ?? '#8b5cf6', opacity: 0.75 }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-white/80">
          <Building2 size={11} /> {call.broker}
        </span>
        {call.rating && (
          <span
            className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest"
            style={{ background: `${rating.color}1f`, color: rating.color }}
          >
            {call.rating}
          </span>
        )}
        {call.target && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest text-gold">
            <Target size={11} /> {call.target}
          </span>
        )}
        {call.kind === 'view' && (
          <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[10px] tracking-widest text-white/40">
            MARKET VIEW
          </span>
        )}
      </div>

      <h3 className="mt-4 flex-1 text-[17px] leading-snug font-bold transition group-hover:text-gold">{call.title}</h3>
      {call.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/50">{call.summary}</p>}

      <div className="mt-5 flex items-center justify-between font-mono text-[10px] tracking-widest text-white/35 uppercase">
        <span>{call.source}</span>
        <span className="flex items-center gap-1.5">
          <Clock size={11} /> {timeAgo(call.publishedAt)} <ExternalLink size={11} />
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
      className="glass relative overflow-hidden rounded-2xl p-6"
    >
      <span className="absolute top-0 left-0 h-full w-[3px]" style={{ background: stance.color, opacity: 0.8 }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{pick.company}</h3>
          <p className="font-mono text-xs text-white/35">
            {pick.symbol}
            {pick.sector ? ` · ${pick.sector}` : ''}
          </p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest"
          style={{ background: `${stance.color}1f`, color: stance.color }}
        >
          {stance.label}
        </span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-white/70">{pick.thesis}</p>

      {pick.risk && (
        <div className="mt-4 rounded-xl border-l-2 border-l-flame/60 bg-flame/5 px-4 py-3">
          <p className="font-mono text-[10px] tracking-widest text-flame uppercase">what would make this wrong</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">{pick.risk}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] tracking-widest text-white/35 uppercase">
        <span>
          added {new Date(pick.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          {pick.addedPrice ? ` at Rs ${pick.addedPrice}` : ''}
        </span>
        {pick.sourceUrl && (
          <a href={pick.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-gold hover:underline">
            source <ExternalLink size={11} />
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
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Seo title="Broker calls and research coverage" description="Published research calls from Indian and global broking desks, attributed to the firm that made them, with rating and target where stated." />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest text-gold uppercase">
            <Building2 size={13} /> What the desks are saying
          </span>
          <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">Broker calls</h1>
          <p className="mt-2 max-w-2xl text-white/55">
            Published research calls from Indian and global desks covering this market, each one attributed to the firm
            that made it and linked to the story it came from.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <div className="glass hidden items-center gap-4 rounded-2xl px-5 py-3 sm:flex">
              <div className="text-center">
                <div className="font-mono text-lg font-bold text-mint">{data.counts?.calls ?? 0}</div>
                <div className="font-mono text-[9px] tracking-widest text-white/35 uppercase">rated calls</div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <div className="font-mono text-lg font-bold text-gold">{data.counts?.views ?? 0}</div>
                <div className="font-mono text-[9px] tracking-widest text-white/35 uppercase">views</div>
              </div>
            </div>
          )}
          <button onClick={load} className="glass grid h-12 w-12 place-items-center rounded-2xl transition hover:text-gold" aria-label="Refresh">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="glass mt-8 flex items-start gap-3 rounded-2xl border-l-2 border-l-flame p-5">
        <ShieldAlert size={17} className="mt-0.5 shrink-0 text-flame" />
        <p className="text-sm leading-relaxed text-white/60">
          Every call on this page belongs to the brokerage named on it, not to us. We reproduce the headline and link
          back to the source. InvestoMillionaire is not a SEBI registered research analyst, makes no recommendation of
          its own, and takes no position on whether any of these calls is right.{' '}
          <Link to="/disclaimer" className="font-semibold text-gold hover:underline">
            Full disclaimer
          </Link>
        </p>
      </div>

      {data?.brokers?.length > 1 && (
        <div className="mt-8 space-y-3">
          <div className="flex flex-wrap gap-2">
            {['All', 'BUY', 'HOLD', 'SELL'].map((name) => (
              <button
                key={name}
                onClick={() => setRating(name)}
                className={`rounded-full border px-4 py-2 font-mono text-[11px] tracking-widest uppercase transition ${
                  rating === name ? 'border-transparent bg-gold text-ink' : 'border-white/10 text-white/50 hover:text-white'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.brokers.map((name) => (
              <button
                key={name}
                onClick={() => setBroker(name)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  broker === name ? 'bg-white/15 text-white' : 'bg-white/5 text-white/45 hover:text-white'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-2xl border border-flame/30 bg-flame/5 p-6 text-center">
          <p className="text-flame">{error}</p>
          <button onClick={load} className="mt-3 text-sm text-white/60 underline">Try again</button>
        </div>
      )}

      {loading && !data ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass h-56 animate-pulse rounded-2xl p-6">
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="mt-6 h-4 w-full rounded bg-white/10" />
              <div className="mt-2 h-4 w-2/3 rounded bg-white/10" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {calls.map((call, i) => (
              <CallCard key={call.id} call={call} index={i} />
            ))}
          </div>
          {calls.length === 0 && !error && (
            <p className="mt-16 text-center text-white/40">
              No calls match that filter right now. Coverage refreshes every fifteen minutes.
            </p>
          )}
        </>
      )}

      {/* Owner maintained notes */}
      <section className="mt-16">
        <div className="flex items-center gap-2">
          <NotebookPen size={20} className="text-gold" />
          <h2 className="text-3xl font-extrabold">On our desk</h2>
        </div>
        <p className="mt-2 max-w-2xl text-white/55">
          Companies we are reading about, with the reasoning written down and the thing that would prove it wrong
          written down next to it. These are study notes kept in public, not calls to buy anything.
        </p>

        {data?.picks?.length ? (
          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            {data.picks.map((pick, i) => (
              <PickCard key={pick.id} pick={pick} index={i} />
            ))}
          </div>
        ) : (
          <p className="glass mt-7 rounded-2xl p-8 text-center text-sm text-white/45">
            Nothing on the desk yet. Notes appear here once they are added.
          </p>
        )}
      </section>
    </div>
  )
}
