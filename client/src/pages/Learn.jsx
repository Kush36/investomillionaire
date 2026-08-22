import { Link, useParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, ArrowRight, CheckCircle2 } from 'lucide-react'
import { LESSONS, TRACK_META } from '../data/lessons.js'
import { useStats } from '../lib/useStats.js'
import { useAuth } from '../lib/store.js'
import Seo from '../components/Seo.jsx'

function TrackChooser() {
  const stats = useStats()

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <Seo
        title="Learn the Indian stock market"
        description="Two tracks, ten gated levels each, every lesson built around a 3D diagram you can rotate."
      />
      <h1 className="text-4xl font-extrabold sm:text-5xl">Learn</h1>
      <p className="mt-3 max-w-2xl text-white/55">
        {stats.levels} lessons, each built around a diagram you can rotate. Read a lesson, then prove it in the quiz for
        that level.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {Object.entries(TRACK_META).map(([key, meta]) => (
          <Link
            key={key}
            to={`/learn/${key}`}
            className="glass group rounded-3xl p-8 transition hover:border-white/25"
          >
            <span className="text-4xl">{meta.emoji}</span>
            <h2 className="mt-4 text-2xl font-bold">{meta.label}</h2>
            <p className="mt-2 text-white/55">{meta.description}</p>
            <span className="mt-6 inline-flex items-center gap-2 font-semibold" style={{ color: meta.accent }}>
              {LESSONS[key].length} lessons <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Learn() {
  const { track } = useParams()
  const { user } = useAuth()

  if (!track) return <TrackChooser />
  if (!LESSONS[track]) return <Navigate to="/learn" replace />

  const meta = TRACK_META[track]
  const lessons = LESSONS[track]

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <Seo
        title={`${meta.label} track for the Indian market`}
        description={`${meta.description} Ten gated levels, each built around a 3D diagram, followed by a quiz.`}
      />
      <Link to="/learn" className="font-mono text-xs tracking-widest text-white/40 uppercase hover:text-gold">
        ← all tracks
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span className="text-5xl">{meta.emoji}</span>
        <div>
          <h1 className="text-4xl font-extrabold sm:text-5xl">{meta.label}</h1>
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: meta.accent }}>
            {meta.tagline}
          </p>
        </div>
      </div>
      <p className="mt-4 max-w-2xl text-white/55">{meta.description}</p>

      <div className="mt-12 space-y-4">
        {lessons.map((lesson, index) => {
          const read = user?.lessonsRead?.includes(lesson.id)
          return (
            <motion.div
              key={lesson.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
            >
              <Link
                to={`/learn/${track}/${lesson.level}`}
                className="glass group flex items-center gap-5 rounded-2xl p-5 transition hover:border-white/25"
              >
                <span
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-extrabold"
                  style={{ background: `${meta.accent}1f`, color: meta.accent }}
                >
                  {lesson.level}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-lg font-bold">{lesson.title}</h3>
                    {read && <CheckCircle2 size={16} className="shrink-0 text-mint" />}
                  </div>
                  <p className="truncate text-sm text-white/50">{lesson.subtitle}</p>
                </div>
                <span className="hidden items-center gap-1.5 font-mono text-xs text-white/35 sm:flex">
                  <Clock size={13} /> {lesson.minutes}m
                </span>
                <ArrowRight size={18} className="shrink-0 text-white/30 transition group-hover:translate-x-1 group-hover:text-gold" />
              </Link>
            </motion.div>
          )
        })}
      </div>

      <div className="glass mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div>
          <h3 className="font-bold">Think you have it?</h3>
          <p className="text-sm text-white/50">
            {lessons.length} levels of quizzes, each gated behind the last.
          </p>
        </div>
        <Link to="/quiz" className="rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink transition hover:bg-gold-soft">
          Go to quizzes
        </Link>
      </div>
    </div>
  )
}
