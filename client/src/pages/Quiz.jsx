import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Trophy, RotateCcw, Play } from 'lucide-react'
import { api } from '../lib/api.js'
import { TRACK_META } from '../data/lessons.js'
import Seo from '../components/Seo.jsx'

function LevelCard({ level, track, accent, index }) {
  const locked = !level.unlocked

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`glass relative overflow-hidden rounded-2xl p-6 ${locked ? 'opacity-55' : ''}`}
    >
      {level.passed && (
        <span className="absolute top-4 right-4 rounded-full bg-mint/15 px-3 py-1 font-mono text-[10px] tracking-widest text-mint uppercase">
          cleared
        </span>
      )}

      <div className="flex items-start gap-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-extrabold"
          style={{ background: `${accent}1f`, color: accent }}
        >
          {locked ? <Lock size={18} /> : level.level}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{level.title}</h3>
          <p className="font-mono text-[10px] tracking-widest uppercase" style={{ color: accent }}>
            {level.tag}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-white/55">{level.blurb}</p>

      <div className="mt-5 flex items-center gap-4 font-mono text-[11px] text-white/40">
        <span>{level.questionCount} questions</span>
        {level.attempts > 0 && <span>best {level.bestScore}%</span>}
        {level.attempts > 0 && <span>{level.attempts} tries</span>}
      </div>

      {locked ? (
        <p className="mt-5 text-sm text-white/35">Clear level {level.level - 1} to unlock.</p>
      ) : (
        <Link
          to={`/quiz/${track}/${level.level}`}
          className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-ink transition"
          style={{ background: accent }}
        >
          {level.passed ? <RotateCcw size={14} /> : <Play size={14} />}
          {level.passed ? 'Retry' : 'Start'}
        </Link>
      )}
    </motion.div>
  )
}

export default function Quiz() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/quiz/levels').then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="mx-auto max-w-3xl px-4 py-20 text-center text-flame">{error}</p>
  if (!data) return <p className="py-24 text-center text-white/40">Loading levels…</p>

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <Seo title="Stock market quizzes by level" description="Two hundred questions across twenty gated levels, scored on the server, with an explanation behind every answer." />
      <div className="flex items-center gap-3">
        <Trophy className="text-gold" size={28} />
        <h1 className="text-4xl font-extrabold sm:text-5xl">Quizzes</h1>
      </div>
      <p className="mt-3 max-w-2xl text-white/55">
        {data.fundamental[0]?.questionCount} questions per level, timed, scored on the server. Hit {data.passPercent}% to
        clear a level and unlock the next one. Every wrong answer comes back with an explanation.
      </p>

      {Object.entries(TRACK_META).map(([key, meta]) => (
        <section key={key} className="mt-14">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.emoji}</span>
            <h2 className="text-2xl font-bold">{meta.label}</h2>
            <span className="font-mono text-xs text-white/35">
              {data[key].filter((l) => l.passed).length} / {data[key].length} cleared
            </span>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data[key].map((level, i) => (
              <LevelCard key={level.level} level={level} track={key} accent={meta.accent} index={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
