import { useEffect, useState } from 'react'
import { Flame, Zap } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.js'
import Chip from '../components/Chip.jsx'
import Seo from '../components/Seo.jsx'

export default function Leaderboard() {
  const { user } = useAuth()
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/progress/leaderboard', { auth: false })
      .then((data) => setLeaders(data.leaders))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 py-[var(--space-7)] sm:px-6">
      <Seo title="Leaderboard" description="Top learners by XP. Read lessons, clear quiz levels, build a streak and climb." />

      {/* The trophy glyph beside the title has gone with the medal emoji. A
          ranked table does not need a picture of a trophy to say what it is, and
          the serif title is the one voice moment the page gets. */}
      <h1 className="display">Leaderboard</h1>
      <p className="prose mt-[var(--space-3)]">Top 20 by XP. Read lessons, clear levels, climb.</p>

      {loading ? (
        <p className="mt-[var(--space-6)] text-ink-3">Loading…</p>
      ) : leaders.length === 0 ? (
        <p className="mt-[var(--space-6)] text-ink-3">Nobody has scored yet. Be the first.</p>
      ) : (
        <div className="mt-[var(--space-6)] space-y-[var(--space-1)]">
          {leaders.map((leader) => {
            const isMe = user?.name === leader.name
            return (
              <div
                key={`${leader.rank}-${leader.name}`}
                className="panel flex items-center gap-[var(--space-3)] p-[var(--space-3)]"
                // Your row is marked by a 2px mulberry rail and nothing else.
                // The old treatment painted an accent border AND an accent tint
                // AND an accent label, three mulberry surfaces on one row, which
                // is how an accent stops being one. The ring is listed alongside
                // because an inline box-shadow replaces the panel's rather than
                // adding to it.
                style={isMe ? { boxShadow: 'inset 2px 0 0 var(--color-accent), var(--shadow-ring)' } : undefined}
              >
                {/* Rank as a typeset numeral in a fixed right-aligned column, so
                    every rank in the list shares one edge. Gold, silver and
                    bronze emoji made the first three rows a different height and
                    a different typeface from the other seventeen. */}
                <span
                  className={`readout w-[var(--space-5)] shrink-0 text-right text-[length:var(--text-small)] ${
                    leader.rank <= 3 ? 'text-ink' : 'text-ink-3'
                  }`}
                >
                  {leader.rank}
                </span>

                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[length:var(--text-small)] text-ink-3">
                  {leader.name.charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-[var(--space-2)] text-ink">
                    <span className="min-w-0 truncate">{leader.name}</span>
                    {isMe && <Chip className="shrink-0">You</Chip>}
                  </p>
                  <p className="readout text-[length:var(--text-micro)] text-ink-3">{leader.badgeCount} badges</p>
                </div>

                <span className="readout flex shrink-0 items-center gap-1 text-[length:var(--text-micro)] text-ink-3">
                  <Flame size={12} aria-hidden="true" /> {leader.streak}
                </span>
                {/* XP is what the list is sorted by, so it is the only figure in
                    the row set at full ink and body size. */}
                <span className="readout flex shrink-0 items-center gap-1 text-ink">
                  <Zap size={12} aria-hidden="true" /> {leader.xp}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
