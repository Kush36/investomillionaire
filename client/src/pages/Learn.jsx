import { Link, useParams, Navigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { LESSONS, TRACK_META } from '../data/lessons.js'
import { useStats } from '../lib/useStats.js'
import { useAuth } from '../lib/store.js'
import Seo from '../components/Seo.jsx'

function TrackChooser() {
  const stats = useStats()

  return (
    <div className="mx-auto max-w-[var(--page-max)] px-[var(--page-inset)] py-[var(--space-6)]">
      <Seo
        title="Learn the Indian stock market"
        description="Two tracks, ten gated levels each, every lesson built around a 3D diagram you can rotate."
      />
      <h1 className="display">Learn</h1>
      <p className="prose mt-[var(--space-4)]">
        <span className="readout">{stats.levels}</span> lessons, each built around a diagram you can rotate. Read a
        lesson, then prove it in the quiz for that level.
      </p>

      {/* Two entries, separated by a rule. A card each would make the choice
          look like merchandise; a rule makes it look like a contents page. */}
      <div className="mt-[var(--space-6)] border-t border-hairline">
        {Object.entries(TRACK_META).map(([key, meta]) => (
          <Link
            key={key}
            to={`/learn/${key}`}
            className="group grid gap-[var(--space-2)] border-b border-hairline py-[var(--space-5)] sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-[var(--space-5)]"
          >
            <div className="max-w-[var(--measure)]">
              <p className="eyebrow">{meta.tagline}</p>
              <h2 className="mt-[var(--space-2)] transition group-hover:text-ink-2">{meta.label}</h2>
              <p className="mt-[var(--space-2)] text-ink-2">{meta.description}</p>
            </div>
            <span className="eyebrow inline-flex items-center gap-[var(--space-1)] whitespace-nowrap">
              {LESSONS[key].length} lessons <ArrowRight size={13} className="shrink-0" />
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
    <div className="mx-auto max-w-[var(--page-max)] px-[var(--page-inset)] py-[var(--space-6)]">
      <Seo
        title={`${meta.label} track for the Indian market`}
        description={`${meta.description} Ten gated levels, each built around a 3D diagram, followed by a quiz.`}
      />
      <Link to="/learn" className="eyebrow transition hover:text-ink">
        ← all tracks
      </Link>

      <header className="mt-[var(--space-6)]">
        <p className="eyebrow">{meta.tagline}</p>
        <h1 className="display mt-[var(--space-3)]">{meta.label}</h1>
        <p className="prose mt-[var(--space-4)]">{meta.description}</p>
      </header>

      {/* The contents page: a set numeral, a title, a rule between entries.
          No card per lesson, no tinted plate behind the level number. */}
      <ol className="mt-[var(--space-6)] border-t border-hairline">
        {lessons.map((lesson) => {
          const read = user?.lessonsRead?.includes(lesson.id)
          return (
            <li key={lesson.id} className="border-b border-hairline">
              <Link
                to={`/learn/${track}/${lesson.level}`}
                className="group grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-[var(--space-3)] py-[var(--space-4)] sm:gap-[var(--space-4)]"
              >
                <span className="readout text-[length:var(--text-small)] text-ink-3">
                  {String(lesson.level).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-[var(--space-2)]">
                    <span className="truncate text-ink transition group-hover:text-ink-2">{lesson.title}</span>
                    {read && (
                      <CheckCircle2
                        size={13}
                        className="shrink-0 translate-y-px text-ink-3"
                        aria-label="Already read"
                      />
                    )}
                  </span>
                  <span className="mt-[var(--space-1)] block truncate text-[length:var(--text-small)] text-ink-3">
                    {lesson.subtitle}
                  </span>
                </span>
                <span className="readout hidden text-[length:var(--text-micro)] text-ink-3 sm:block">{lesson.minutes}m</span>
              </Link>
            </li>
          )
        })}
      </ol>

      {/* The one accent on the screen. */}
      <section className="mt-[var(--space-7)] flex flex-wrap items-center justify-between gap-[var(--space-4)]">
        <div className="max-w-[var(--measure)]">
          <h3>Think you have it?</h3>
          <p className="mt-[var(--space-1)] text-[length:var(--text-small)] text-ink-2">
            <span className="readout">{lessons.length}</span> levels of quizzes, each gated behind the last.
          </p>
        </div>
        <Link
          to="/quiz"
          className="rounded-full bg-accent px-[var(--space-4)] py-[var(--space-2)] text-[length:var(--text-small)] text-canvas transition hover:bg-accent/90"
        >
          Go to quizzes
        </Link>
      </section>
    </div>
  )
}
