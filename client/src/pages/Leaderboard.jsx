import { useEffect, useState } from 'react'
import { Trophy, Flame, Zap } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.js'
import Seo from '../components/Seo.jsx'

const MEDALS = ['🥇', '🥈', '🥉']

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
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <Seo title="Leaderboard" description="Top learners by XP. Read lessons, clear quiz levels, build a streak and climb." />
      <div className="flex items-center gap-3">
        <Trophy className="text-gold" size={28} />
        <h1 className="text-4xl font-extrabold sm:text-5xl">Leaderboard</h1>
      </div>
      <p className="mt-3 text-white/55">Top 20 by XP. Read lessons, clear levels, climb.</p>

      {loading ? (
        <p className="py-20 text-center text-white/40">Loading…</p>
      ) : leaders.length === 0 ? (
        <p className="py-20 text-center text-white/40">Nobody has scored yet. Be the first.</p>
      ) : (
        <div className="mt-9 space-y-2">
          {leaders.map((leader) => {
            const isMe = user?.name === leader.name
            return (
              <div
                key={`${leader.rank}-${leader.name}`}
                className={`glass flex items-center gap-4 rounded-2xl p-4 ${isMe ? 'border-gold/50 bg-gold/5' : ''}`}
              >
                <span className="w-9 text-center text-lg font-extrabold">
                  {MEDALS[leader.rank - 1] ?? <span className="font-mono text-sm text-white/35">{leader.rank}</span>}
                </span>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 font-bold text-gold">
                  {leader.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {leader.name} {isMe && <span className="font-mono text-[10px] text-gold">YOU</span>}
                  </p>
                  <p className="font-mono text-[11px] text-white/35">{leader.badgeCount} badges</p>
                </div>
                <span className="flex items-center gap-1 font-mono text-sm text-flame">
                  <Flame size={13} /> {leader.streak}
                </span>
                <span className="flex items-center gap-1 font-mono text-sm font-bold text-gold">
                  <Zap size={13} /> {leader.xp}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
