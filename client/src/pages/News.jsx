import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, RefreshCw, Search, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react'
import Seo from '../components/Seo.jsx'
import Chip from '../components/Chip.jsx'
import Notice from '../components/Notice.jsx'
import { API_BASE } from '../lib/api.js'

const MOODS = [
  { key: 'All', label: 'Everything', icon: Minus },
  { key: 'bullish', label: 'Bullish', icon: TrendingUp },
  { key: 'bearish', label: 'Bearish', icon: TrendingDown },
  { key: 'neutral', label: 'Neutral', icon: Minus },
]

// The copy promises headlines tagged by tone, and the old tag drew all three
// tones in the same ink behind the same hairline, which made the promise a lie.
// Tone here is a judgement about a headline, not realised profit and loss, so
// the gain and loss inks are not available and colour cannot carry it. The
// ladder is ink strength and ring strength instead: a directional tag sits at
// full ink behind a strong hairline, a neutral one recedes to ink-3 behind the
// ordinary one. Which direction it points is the arrow's job.
const MOOD_STYLE = {
  bullish: { label: 'BULLISH', icon: TrendingUp, ink: 'var(--color-ink)', ring: 'var(--color-hairline-strong)' },
  bearish: { label: 'BEARISH', icon: TrendingDown, ink: 'var(--color-ink)', ring: 'var(--color-hairline-strong)' },
  neutral: { label: 'NEUTRAL', icon: Minus, ink: 'var(--color-ink-3)', ring: 'var(--color-hairline)' },
}

// Chip spreads its rest props after its own style attribute, so a style prop
// replaces that object rather than merging into it. The micro size has to be
// restated or the chip grows; colour and ring are the two things this varies.
function chipInk({ ink, ring }) {
  return { color: ink, fontSize: 'var(--text-micro)', boxShadow: `inset 0 0 0 1px ${ring}` }
}

// Filter state is read by ink and ring, never by a fill, so nothing on the row
// shifts when the selection moves and no pill becomes a coloured block. The
// ring is inset for the same reason it is inset on a chip: it costs no width.
function pillStyle(active, activeInk) {
  return active
    ? { color: activeInk, boxShadow: `inset 0 0 0 1px ${activeInk}` }
    : { color: 'var(--color-ink-3)', boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }
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
    <Chip style={chipInk(style)}>
      <Icon size={11} aria-hidden="true" /> {style.label}
    </Chip>
  )
}

function FeaturedCard({ article }) {
  return (
    <motion.a
      href={article.link}
      target="_blank"
      rel="noreferrer noopener"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel group relative flex min-h-[360px] flex-col justify-end overflow-hidden p-[var(--space-5)] sm:min-h-[440px]"
    >
      {article.image && (
        <img
          src={article.image}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/90 to-transparent" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <MoodTag mood={article.mood} />
          <span className="eyebrow">{article.source}</span>
          <span className="eyebrow flex items-center gap-1">
            <Clock size={11} aria-hidden="true" /> {timeAgo(article.publishedAt)}
          </span>
        </div>
        {/* The first item is stronger by size alone: title scale against the
            17px of every other card, not a second colour and not a heavier
            weight. */}
        <h2 className="mt-[var(--space-3)] max-w-[var(--measure)] text-2xl leading-tight sm:text-4xl">{article.title}</h2>
        {article.summary && <p className="prose mt-[var(--space-2)] text-ink-2">{article.summary}</p>}
        <span className="mt-[var(--space-4)] inline-flex items-center gap-2 text-sm text-accent">
          Read the full story <ExternalLink size={14} aria-hidden="true" />
        </span>
      </div>
    </motion.a>
  )
}

function NewsCard({ article, index }) {
  return (
    <motion.a
      href={article.link}
      target="_blank"
      rel="noreferrer noopener"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      className="panel group relative flex flex-col overflow-hidden p-[var(--space-4)] transition hover:shadow-low"
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <MoodTag mood={article.mood} />
        <span className="eyebrow">{timeAgo(article.publishedAt)}</span>
      </div>
      {/* h3 already carries 17px at 600 from the sheet. Restating either here
          was two of the declarations that made weight meaningless. */}
      <h3 className="mt-[var(--space-3)] flex-1 leading-snug">{article.title}</h3>
      {article.summary && (
        <p className="mt-[var(--space-2)] line-clamp-3 text-sm leading-relaxed text-ink-2">{article.summary}</p>
      )}
      <div className="eyebrow mt-[var(--space-3)] flex items-center justify-between gap-[var(--space-2)]">
        <span>{article.source}</span>
        <span className="readout">{article.readMinutes} min</span>
      </div>
    </motion.a>
  )
}

function Skeleton() {
  return (
    <div className="panel h-52 p-[var(--space-4)]">
      <div className="h-3 w-24 rounded bg-hairline" />
      <div className="mt-[var(--space-4)] h-4 w-full rounded bg-hairline" />
      <div className="mt-2 h-4 w-3/4 rounded bg-hairline" />
      <div className="mt-[var(--space-4)] h-3 w-1/2 rounded bg-surface-2" />
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
    <div className="mx-auto max-w-7xl px-4 py-[var(--space-6)] sm:px-6">
      <Seo title="Indian stock market news" description="Market headlines from Economic Times, Livemint, Business Standard and BusinessLine, filtered to the Indian market and tagged bullish, bearish or neutral." />
      <div className="flex flex-wrap items-end justify-between gap-[var(--space-4)]">
        <div>
          <span className="eyebrow">Live feed</span>
          {/* The one voice moment on this page. */}
          <h1 className="display mt-[var(--space-2)]">Market news</h1>
          <p className="prose mt-[var(--space-3)]">
            Headlines from Economic Times, Livemint, Business Standard and BusinessLine, tagged by tone so you can read
            the mood of a session at a glance.
          </p>
        </div>

        <div className="flex items-center gap-[var(--space-2)]">
          {/* Left aligned, because a ledger column reads down its left edge and
              tabular figures only line up if something lines them up. */}
          <div className="panel hidden items-center gap-[var(--space-4)] px-[var(--space-4)] py-[var(--space-2)] sm:flex">
            <div>
              <div className="readout text-2xl text-ink">{counts.bullish}</div>
              <div className="eyebrow">bullish</div>
            </div>
            <div className="h-8 w-px bg-hairline" />
            <div>
              <div className="readout text-2xl text-ink">{counts.bearish}</div>
              <div className="eyebrow">bearish</div>
            </div>
          </div>
          <button
            onClick={load}
            className="panel grid h-12 w-12 place-items-center text-ink-3 transition hover:text-ink"
            aria-label="Refresh news"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* filters */}
      <div className="mt-[var(--space-6)] space-y-[var(--space-3)]">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search headlines, companies, sectors…"
            className="well w-full py-3.5 pr-4 pl-11 text-sm text-ink transition placeholder:text-ink-3"
          />
        </div>

        <div className="flex flex-wrap gap-[var(--space-1)]">
          {MOODS.map((option) => (
            <button
              key={option.key}
              onClick={() => setMood(option.key)}
              className="eyebrow inline-flex items-center gap-1.5 rounded-full px-[var(--space-3)] py-[var(--space-1)] transition"
              style={pillStyle(mood === option.key, 'var(--color-accent)')}
            >
              <option.icon size={12} aria-hidden="true" /> {option.label}
            </button>
          ))}
        </div>

        {/* Category is the second filter, so it never takes the accent. Same
            ink-and-ring language one step quieter: ink instead of mulberry. */}
        <div className="flex flex-wrap gap-[var(--space-1)]">
          {categories.map((name) => (
            <button
              key={name}
              onClick={() => setCategory(name)}
              className="rounded-full px-[var(--space-3)] py-[var(--space-1)] text-sm transition"
              style={pillStyle(category === name, 'var(--color-ink)')}
            >
              {name}
            </button>
          ))}
        </div>

        {fetchedAt && (
          <p className="eyebrow">
            updated {timeAgo(fetchedAt)} · {filtered.length} stories
          </p>
        )}
      </div>

      {error && (
        <Notice tone="loss" className="mt-[var(--space-5)]">
          {error}{' '}
          <button onClick={load} className="text-ink underline underline-offset-2">
            Try again
          </button>
        </Notice>
      )}

      {loading && items.length === 0 ? (
        <div className="mt-[var(--space-5)] grid gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {featured && (
            <div className="mt-[var(--space-5)]">
              <FeaturedCard article={featured} />
            </div>
          )}
          {/* Tight between cards, wide above the block. The gap does the
              grouping, so the cards need no decoration to read as one set. */}
          <div className="mt-[var(--space-3)] grid gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((article, i) => (
              <NewsCard key={article.id} article={article} index={i} />
            ))}
          </div>
          {filtered.length === 0 && !error && (
            <p className="mt-[var(--space-7)] text-center text-ink-3">Nothing matches that filter. Try clearing the search.</p>
          )}
        </>
      )}
    </div>
  )
}
