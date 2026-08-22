import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Flame, Target, BookOpenCheck } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth, rankFor, BADGE_META } from '../lib/store.js'
import { LESSONS, TRACK_META } from '../data/lessons.js'
import Seo from '../components/Seo.jsx'

function Stat({ icon: Icon, value, label, color }) {
  return (
    <div className="glass rounded-2xl p-5">
      <Icon size={20} style={{ color }} />
      <div className="mt-3 text-3xl font-extrabold">{value}</div>
      <div className="font-mono text-[10px] tracking-widest text-white/35 uppercase">{label}</div>
    </div>
  )
}

function TrackProgress({ track, levels }) {
  const meta = TRACK_META[track]
  const cleared = levels.filter((l) => l.passed).length

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.emoji}</span>
          <h3 className="font-bold">{meta.label}</h3>
        </div>
        <span className="font-mono text-xs" style={{ color: meta.accent }}>
          {cleared}/{levels.length}
        </span>
      </div>

      <div className="mt-4 flex gap-1.5">
        {levels.map((level) => (
          <div
            key={level.level}
            className="h-2 flex-1 rounded-full"
            style={{ background: level.passed ? meta.accent : level.unlocked ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)' }}
          />
        ))}
      </div>

      <ul className="mt-5 space-y-2">
        {levels.map((level) => (
          <li key={level.level} className="flex items-center justify-between text-sm">
            <span className={level.unlocked ? 'text-white/70' : 'text-white/30'}>
              {level.level}. {level.title}
            </span>
            <span className="font-mono text-xs" style={{ color: level.passed ? meta.accent : 'rgba(255,255,255,0.3)' }}>
              {level.attempts > 0 ? `${level.bestScore}%` : level.unlocked ? 'open' : 'locked'}
            </span>
          </li>
        ))}
      </ul>

      <Link
        to={`/quiz`}
        className="mt-5 inline-block rounded-full px-5 py-2 text-sm font-bold text-ink"
        style={{ background: meta.accent }}
      >
        {cleared === levels.length ? 'Revise' : 'Continue'}
      </Link>
    </div>
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
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Seo title="Your progress" description="Your XP, streak, badges and level progress." noindex />
      <h1 className="text-4xl font-extrabold sm:text-5xl">
        Hey, <span className="gold-text">{user.name.split(' ')[0]}</span>
      </h1>
      <p className="mt-2 text-white/55">
        Rank: <span className="font-bold text-gold">{rank.current.name}</span>
        {rank.next && <span className="text-white/40"> · {rank.next.min - user.xp} XP to {rank.next.name}</span>}
      </p>

      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft transition-[width] duration-700"
          style={{ width: `${rank.progress * 100}%` }}
        />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Zap} value={user.xp} label="total XP" color="#eaa81e" />
        <Stat icon={Flame} value={user.streak} label="day streak" color="#ff5d5d" />
        <Stat icon={BookOpenCheck} value={`${user.lessonsRead?.length ?? 0}/${totalLessons}`} label="lessons read" color="#33e29b" />
        <Stat icon={Target} value={user.badges?.length ?? 0} label="badges" color="#8b5cf6" />
      </div>

      {levels && (
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <TrackProgress track="fundamental" levels={levels.fundamental} />
          <TrackProgress track="technical" levels={levels.technical} />
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Badges</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(BADGE_META).map(([key, badge]) => {
            const earned = user.badges?.includes(key)
            return (
              <div key={key} className={`glass rounded-2xl p-5 text-center ${earned ? '' : 'opacity-35 grayscale'}`}>
                <div className="text-3xl">{badge.emoji}</div>
                <h4 className="mt-2 text-sm font-bold">{badge.label}</h4>
                <p className="mt-1 text-xs text-white/45">{badge.note}</p>
              </div>
            )
          })}
        </div>
      </section>

      {history.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Recent attempts</h2>
          <div className="glass mt-5 overflow-hidden rounded-2xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 font-mono text-[10px] tracking-widest text-white/40 uppercase">
                <tr>
                  <th className="px-5 py-3">Track</th>
                  <th className="px-5 py-3">Level</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3">XP</th>
                  <th className="hidden px-5 py-3 sm:table-cell">When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((attempt) => (
                  <tr key={attempt._id} className="border-t border-white/5">
                    <td className="px-5 py-3 capitalize">{attempt.track}</td>
                    <td className="px-5 py-3">{attempt.level}</td>
                    <td className="px-5 py-3 font-mono" style={{ color: attempt.passed ? '#33e29b' : '#ff5d5d' }}>
                      {attempt.percent}%
                    </td>
                    <td className="px-5 py-3 font-mono text-gold">+{attempt.xpEarned}</td>
                    <td className="hidden px-5 py-3 text-white/40 sm:table-cell">
                      {new Date(attempt.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
