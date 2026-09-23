import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth, rankFor, BADGE_META } from '../lib/store.js'
import { LESSONS, TRACK_META } from '../data/lessons.js'
import Seo from '../components/Seo.jsx'

// Every figure on this page is a readout. That is not a formatting preference:
// the XP number ticks, the lesson count is a fraction, and the score column is a
// table. Proportional digits in any of those means the row reflows as the value
// changes and the decimal points stop lining up.
//
// The icon that used to sit above each figure is gone. Four ink-3 glyphs that
// repeat the word underneath them are the kind of decoration a page reaches for
// when it does not trust its own spacing.
function Stat({ value, label }) {
  return (
    <div className="panel p-[var(--space-4)]">
      <div className="readout text-[length:var(--text-heading)] text-ink">{value}</div>
      <div className="mt-[var(--space-1)] text-[length:var(--text-small)] text-ink-3">{label}</div>
    </div>
  )
}

function TrackProgress({ track, levels }) {
  const meta = TRACK_META[track]
  const cleared = levels.filter((l) => l.passed).length

  return (
    <div className="panel p-[var(--space-4)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[var(--space-1)]">
          <span>{meta.emoji}</span>
          <h3>{meta.label}</h3>
        </div>
        <span className="readout text-[length:var(--text-small)] text-ink-3">
          {cleared}/{levels.length}
        </span>
      </div>

      {/* Cleared segments are ink, not mulberry. Two of these cards sit side by
          side, so an accent here would put the page's scarce colour on ten bars
          at once and leave the rank bar in the hero with nothing to say. */}
      <div className="mt-[var(--space-3)] flex gap-1">
        {levels.map((level) => (
          <div
            key={level.level}
            className={`h-1.5 flex-1 rounded-full ${
              level.passed ? 'bg-ink-2' : level.unlocked ? 'bg-hairline-strong' : 'bg-surface-2'
            }`}
          />
        ))}
      </div>

      <ul className="mt-[var(--space-4)] space-y-[var(--space-1)]">
        {levels.map((level) => (
          <li key={level.level} className="flex items-center justify-between gap-[var(--space-3)] text-sm">
            <span className={level.unlocked ? 'text-ink-2' : 'text-ink-3'}>
              {level.level}. {level.title}
            </span>
            <span className={`readout shrink-0 text-[length:var(--text-micro)] ${level.passed ? 'text-ink' : 'text-ink-3'}`}>
              {level.attempts > 0 ? `${level.bestScore}%` : level.unlocked ? 'open' : 'locked'}
            </span>
          </li>
        ))}
      </ul>

      {/* A hairline-ringed link rather than a filled button. There are two of
          these on screen and they are peers, so neither is "the one action"
          mulberry is reserved for. */}
      <Link
        to={`/quiz`}
        className="mt-[var(--space-4)] inline-block rounded-full px-[var(--space-3)] py-[var(--space-1)] text-sm text-ink ring-1 ring-hairline-strong transition hover:bg-surface-2"
      >
        {cleared === levels.length ? 'Revise' : 'Continue'}
      </Link>
    </div>
  )
}

/**
 * The saved companies, newest first, as the server returns them.
 *
 * Each row prints the name and symbol recorded when the entry was added rather than
 * one looked up now. The list has to render when the NSE equity list is unreachable,
 * and the analyzer re-identifies the ISIN on the way to a report regardless, so a
 * lookup here would buy a second failure mode and nothing else.
 *
 * Analyse is a link carrying the ISIN, never the ticker: a symbol freed by a delisting
 * can be reassigned, and a link keyed on one would quietly start opening a different
 * company.
 */
function Watchlist() {
  const { watchlist, watchlistCap, loadWatchlist, removeFromWatchlist } = useAuth()
  const [removing, setRemoving] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadWatchlist().catch((err) => setError(err.message))
  }, [loadWatchlist])

  async function remove(isin) {
    setRemoving(isin)
    setError('')
    try {
      await removeFromWatchlist(isin)
    } catch (err) {
      setError(err.message)
    } finally {
      setRemoving('')
    }
  }

  return (
    <section className="mt-[var(--space-7)]">
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)]">
        <h2>Watchlist</h2>
        {watchlist && watchlistCap != null && (
          <p className="eyebrow">
            {watchlist.length} of {watchlistCap}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-[var(--space-3)] text-sm text-loss" role="status">
          {error}
        </p>
      )}

      {/* Not loaded and loaded-but-empty are different things and say so. A nought
          drawn before the reply lands is a figure the page has not earned yet. */}
      {watchlist === null ? (
        <p className="mt-[var(--space-4)] text-sm text-ink-3">Loading your list…</p>
      ) : watchlist.length === 0 ? (
        <p className="well mt-[var(--space-4)] p-[var(--space-4)] text-sm leading-relaxed text-ink-2">
          Nothing saved yet.{' '}
          <Link to="/analyze" className="text-ink underline decoration-1 underline-offset-4">
            Find a listing
          </Link>{' '}
          and add it here to run its report again without searching for it.
        </p>
      ) : (
        <ul className="well mt-[var(--space-4)]">
          {watchlist.map((entry) => (
            <li
              key={entry.isin}
              className="flex flex-wrap items-center justify-between gap-[var(--space-2)] border-t border-hairline p-[var(--space-3)] first:border-t-0"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">{entry.name}</p>
                <p className="readout mt-[var(--space-1)] text-[length:var(--text-micro)] text-ink-3">
                  {entry.symbol} · {entry.isin}
                  {entry.addedAt
                    ? ` · added ${new Date(entry.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : ''}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-[var(--space-2)]">
                <Link
                  to={`/analyze?isin=${encodeURIComponent(entry.isin)}`}
                  className="inline-flex min-h-11 items-center rounded-full px-[var(--space-3)] text-sm text-ink ring-1 ring-hairline-strong transition hover:bg-surface-2"
                >
                  Analyse
                </Link>
                <button
                  type="button"
                  onClick={() => remove(entry.isin)}
                  disabled={removing === entry.isin}
                  className="inline-flex min-h-11 items-center rounded-full px-[var(--space-3)] text-sm text-ink-3 transition hover:text-ink disabled:opacity-50"
                >
                  {removing === entry.isin ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [levels, setLevels] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    api('/quiz/levels').then(setLevels).catch(() => {})
    api('/progress/history').then((data) => setHistory(data.attempts)).catch(() => {})
  }, [])

  if (!user) return null
  const rank = rankFor(user.xp)
  const totalLessons = LESSONS.fundamental.length + LESSONS.technical.length

  return (
    <div className="mx-auto max-w-6xl px-4 py-[var(--space-6)] sm:px-6">
      <Seo title="Your progress" description="Your XP, streak, badges and level progress." noindex />

      {/* The one serif line on the page, on the thing the page is actually
          about, which is this person. */}
      <h1 className="display">Hey, {user.name.split(' ')[0]}</h1>

      <p className="mt-[var(--space-3)] text-ink-2">
        Rank: <span className="text-ink">{rank.current.name}</span>
        {rank.next && (
          <span className="text-ink-3">
            {' · '}
            <span className="readout">{rank.next.min - user.xp}</span> XP to {rank.next.name}
          </span>
        )}
      </p>

      {/* The single accent on this page. It is the one figure the page exists to
          report, so it gets the one colour. */}
      <div className="mt-[var(--space-3)] h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[var(--dur-data)] ease-[var(--ease-data)]"
          style={{ width: `${rank.progress * 100}%` }}
        />
      </div>

      <div className="mt-[var(--space-5)] grid grid-cols-2 gap-[var(--space-2)] lg:grid-cols-4">
        <Stat value={user.xp} label="total XP" />
        <Stat value={user.streak} label="day streak" />
        <Stat value={`${user.lessonsRead?.length ?? 0}/${totalLessons}`} label="lessons read" />
        <Stat value={user.badges?.length ?? 0} label="badges" />
      </div>

      {levels && (
        <div className="mt-[var(--space-5)] grid gap-[var(--space-3)] lg:grid-cols-2">
          <TrackProgress track="fundamental" levels={levels.fundamental} />
          <TrackProgress track="technical" levels={levels.technical} />
        </div>
      )}

      <Watchlist />

      {/* Sections are separated by air, not by rules or tinted bands. space-7
          between sections against space-1 inside a card is the beat. */}
      <section className="mt-[var(--space-7)]">
        <h2>Badges</h2>
        <div className="mt-[var(--space-4)] grid gap-[var(--space-3)] sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(BADGE_META).map(([key, badge]) => {
            const earned = user.badges?.includes(key)
            return (
              <div key={key} className={`panel p-[var(--space-4)] text-center ${earned ? '' : 'opacity-35 grayscale'}`}>
                <div className="text-[length:var(--text-heading)]">{badge.emoji}</div>
                <h4 className="mt-[var(--space-1)] text-sm text-ink">{badge.label}</h4>
                <p className="mt-1 text-[length:var(--text-micro)] text-ink-3">{badge.note}</p>
              </div>
            )
          })}
        </div>
      </section>

      {history.length > 0 && (
        <section className="mt-[var(--space-7)]">
          <h2>Recent attempts</h2>
          <div className="panel mt-[var(--space-4)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="eyebrow bg-surface-2">
                  <tr>
                    <th className="px-[var(--space-3)] py-[var(--space-2)]">Track</th>
                    <th className="px-[var(--space-3)] py-[var(--space-2)]">Level</th>
                    <th className="px-[var(--space-3)] py-[var(--space-2)] text-right">Score</th>
                    <th className="px-[var(--space-3)] py-[var(--space-2)] text-right">XP</th>
                    <th className="hidden px-[var(--space-3)] py-[var(--space-2)] text-right sm:table-cell">When</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((attempt) => (
                    <tr key={attempt._id} className="border-t border-hairline">
                      <td className="px-[var(--space-3)] py-[var(--space-2)] text-ink-2 capitalize">{attempt.track}</td>
                      <td className="readout px-[var(--space-3)] py-[var(--space-2)] text-ink-2">{attempt.level}</td>
                      {/* Numeric columns right-align so the units stack. A
                          left-ragged percentage column is the tell of a table
                          nobody set. */}
                      <td
                        className={`readout px-[var(--space-3)] py-[var(--space-2)] text-right ${
                          attempt.passed ? 'text-gain' : 'text-loss'
                        }`}
                      >
                        {attempt.percent}%
                      </td>
                      <td className="readout px-[var(--space-3)] py-[var(--space-2)] text-right text-ink">
                        +{attempt.xpEarned}
                      </td>
                      <td className="readout hidden px-[var(--space-3)] py-[var(--space-2)] text-right text-ink-3 sm:table-cell">
                        {new Date(attempt.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
