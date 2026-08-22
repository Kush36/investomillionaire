import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, RefreshCw, Search, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react'
import Seo from '../components/Seo.jsx'
import { API_BASE } from '../lib/api.js'

const MOODS = [
  { key: 'All', label: 'Everything', icon: Minus, color: '#eaa81e' },
  { key: 'bullish', label: 'Bullish', icon: TrendingUp, color: '#33e29b' },
  { key: 'bearish', label: 'Bearish', icon: TrendingDown, color: '#ff5d5d' },
  { key: 'neutral', label: 'Neutral', icon: Minus, color: '#8b5cf6' },
]

const MOOD_STYLE = {
  bullish: { color: '#33e29b', label: 'BULLISH', icon: TrendingUp },
  bearish: { color: '#ff5d5d', label: 'BEARISH', icon: TrendingDown },
  neutral: { color: '#8b5cf6', label: 'NEUTRAL', icon: Minus },
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function MoodTag({ mood }) {
  const style = MOOD_STYLE[mood] ?? MOOD_STYLE.neutral
  const Icon = style.icon
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest"
      style={{ background: `${style.color}1f`, color: style.color }}
    >
      <Icon size={11} /> {style.label}
    </span>
  )
}

function FeaturedCard({ article }) {
  const style = MOOD_STYLE[article.mood] ?? MOOD_STYLE.neutral
  return (
    <motion.a
      href={article.link}
      target="_blank"
      rel="noreferrer noopener"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass group relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl p-8"
    >
      {article.image && (
        <img
          src={article.image}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-25 transition duration-700 group-hover:scale-105 group-hover:opacity-35"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-transparent" />
      <div
        className="absolute -top-24 -right-16 h-64 w-64 rounded-full blur-[90px]"
        style={{ background: style.color, opacity: 0.18 }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3">
          <MoodTag mood={article.mood} />
          <span className="font-mono text-[10px] tracking-widest text-white/45 uppercase">{article.source}</span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-white/35">
            <Clock size={11} /> {timeAgo(article.publishedAt)}
          </span>
        </div>
        <h2 className="mt-4 text-2xl leading-tight font-extrabold sm:text-4xl">{article.title}</h2>
        {article.summary && <p className="mt-3 max-w-2xl text-white/60">{article.summary}</p>}
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-gold">
          Read the full story <ExternalLink size={14} />
        </span>
      </div>
    </motion.a>
  )
}

function NewsCard({ article, index }) {
  const style = MOOD_STYLE[article.mood] ?? MOOD_STYLE.neutral
  return (
    <motion.a
      href={article.link}
      target="_blank"
      rel="noreferrer noopener"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      className="glass group relative flex flex-col overflow-hidden rounded-2xl p-6 transition hover:-translate-y-1 hover:border-white/25"
    >
      <span className="absolute top-0 left-0 h-full w-[3px]" style={{ background: style.color, opacity: 0.7 }} />
      <div className="flex items-center justify-between gap-3">
        <MoodTag mood={article.mood} />
        <span className="font-mono text-[10px] text-white/30">{timeAgo(article.publishedAt)}</span>
      </div>
      <h3 className="mt-4 flex-1 text-[17px] leading-snug font-bold transition group-hover:text-gold">{article.title}</h3>
      {article.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/50">{article.summary}</p>}
      <div className="mt-5 flex items-center justify-between font-mono text-[10px] tracking-widest text-white/35 uppercase">
        <span>{article.source}</span>
        <span>{article.readMinutes} min</span>
      </div>
    </motion.a>
  )
}

function Skeleton() {
  return (
    <div className="glass h-52 animate-pulse rounded-2xl p-6">
      <div className="h-3 w-24 rounded bg-white/10" />
      <div className="mt-5 h-4 w-full rounded bg-white/10" />
      <div className="mt-2 h-4 w-3/4 rounded bg-white/10" />
      <div className="mt-6 h-3 w-1/2 rounded bg-white/5" />
    </div>
  )
}

export default function News() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState(['All'])
  const [category, setCategory] = useState('All')
  const [mood, setMood] = useState('All')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchedAt, setFetchedAt] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/news`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load the feed.')
      setItems(data.items)
      setCategories(data.categories)
      setFetchedAt(data.fetchedAt)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Feeds are cached server side for 10 minutes, so refresh on the same cadence.
    const id = setInterval(load, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((article) => {
      if (category !== 'All' && article.category !== category) return false
      if (mood !== 'All' && article.mood !== mood) return false
      if (needle && !`${article.title} ${article.summary}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [items, category, mood, query])

  const [featured, ...rest] = filtered

  const counts = useMemo(
    () => ({
      bullish: items.filter((a) => a.mood === 'bullish').length,
      bearish: items.filter((a) => a.mood === 'bearish').length,
    }),
    [items]
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <Seo title="Indian stock market news" description="Market headlines from Economic Times, Livemint, Business Standard and BusinessLine, filtered to the Indian market and tagged bullish, bearish or neutral." />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-widest text-gold uppercase">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
            </span>
            Live feed
          </span>
          <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">Market news</h1>
          <p className="mt-2 max-w-xl text-white/55">
            Headlines from Economic Times, Livemint, Business Standard and BusinessLine, tagged by tone so you can read
            the mood of a session at a glance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="glass hidden items-center gap-4 rounded-2xl px-5 py-3 sm:flex">
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-mint">{counts.bullish}</div>
              <div className="font-mono text-[9px] tracking-widest text-white/35 uppercase">bullish</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <div className="font-mono text-lg font-bold text-flame">{counts.bearish}</div>
              <div className="font-mono text-[9px] tracking-widest text-white/35 uppercase">bearish</div>
            </div>
          </div>
          <button
            onClick={load}
            className="glass grid h-12 w-12 place-items-center rounded-2xl transition hover:text-gold"
            aria-label="Refresh news"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="mt-9 space-y-4">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search headlines, companies, sectors…"
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pr-4 pl-11 text-sm outline-none transition placeholder:text-white/30 focus:border-gold/50"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {MOODS.map((option) => (
            <button
              key={option.key}
              onClick={() => setMood(option.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 font-mono text-[11px] tracking-widest uppercase transition ${
                mood === option.key ? 'border-transparent text-ink' : 'border-white/10 text-white/50 hover:text-white'
              }`}
              style={mood === option.key ? { background: option.color } : undefined}
            >
              <option.icon size={12} /> {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((name) => (
            <button
              key={name}
              onClick={() => setCategory(name)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                category === name ? 'bg-white/15 text-white' : 'bg-white/5 text-white/45 hover:text-white'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {fetchedAt && (
        <p className="mt-5 font-mono text-[10px] tracking-widest text-white/25 uppercase">
          updated {timeAgo(fetchedAt)} · {filtered.length} stories
        </p>
      )}

      {error && (
        <div className="mt-8 rounded-2xl border border-flame/30 bg-flame/5 p-6 text-center">
          <p className="text-flame">{error}</p>
          <button onClick={load} className="mt-3 text-sm text-white/60 underline">
            Try again
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {featured && (
            <div className="mt-8">
              <FeaturedCard article={featured} />
            </div>
          )}
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((article, i) => (
              <NewsCard key={article.id} article={article} index={i} />
            ))}
          </div>
          {filtered.length === 0 && !error && (
            <p className="mt-16 text-center text-white/40">Nothing matches that filter. Try clearing the search.</p>
          )}
        </>
      )}
    </div>
  )
}
