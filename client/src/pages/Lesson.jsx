import { useEffect, useState } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import LessonScene from '../three/LessonScene.jsx'
import { findLesson, LESSONS, TRACK_META } from '../data/lessons.js'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.js'
import Seo from '../components/Seo.jsx'
import Chip from '../components/Chip.jsx'

export default function Lesson() {
  const { track, level } = useParams()
  const { user, setUser } = useAuth()
  const [marked, setMarked] = useState(false)
  const lesson = findLesson(track, level)

  const alreadyRead = user?.lessonsRead?.includes(lesson?.id)

  useEffect(() => setMarked(false), [track, level])

  if (!lesson) return <Navigate to="/learn" replace />

  const meta = TRACK_META[track]
  const lessons = LESSONS[track]
  const next = lessons.find((l) => l.level === lesson.level + 1)
  const prev = lessons.find((l) => l.level === lesson.level - 1)

  async function markRead() {
    if (!user || alreadyRead) {
      setMarked(true)
      return
    }
    try {
      const data = await api('/progress/lesson-read', { method: 'POST', body: { lessonId: lesson.id } })
      setUser(data.user)
      setMarked(true)
    } catch {
      setMarked(true)
    }
  }

  return (
    <article className="mx-auto max-w-[var(--page-max)] px-[var(--page-inset)] py-[var(--space-6)]">
      <Seo
        title={lesson.title}
        description={`${lesson.subtitle}. Level ${lesson.level} of the ${meta.label.toLowerCase()} track, a ${lesson.minutes} minute read built around an interactive 3D diagram.`}
        type="article"
      />
      <Link
        to={`/learn/${track}`}
        className="eyebrow inline-flex items-center gap-[var(--space-1)] transition hover:text-ink"
      >
        <ArrowLeft size={13} /> {meta.label}
      </Link>

      {/* The one voice moment. Instrument Serif appears here and nowhere else on
          the page, on the thing the page is actually about. The level and the
          length sit above it as the single eyebrow this screen is allowed. */}
      <header className="mt-[var(--space-6)]">
        <p className="eyebrow">
          Level {lesson.level} · {lesson.minutes} min read
        </p>
        <h1 className="display mt-[var(--space-3)]">{lesson.title}</h1>
        <p className="prose mt-[var(--space-4)]" style={{ fontSize: 'var(--text-heading)', lineHeight: 1.35 }}>
          {lesson.subtitle}
        </p>
      </header>

      <figure className="my-[var(--space-6)]">
        <LessonScene scene={lesson.scene} height={460} />
        <figcaption className="eyebrow mt-[var(--space-2)]">interactive diagram · drag, zoom, hover</figcaption>
      </figure>

      {/* Big gaps between sections, tight gaps inside one. The separation is
          done by air, so a heading needs no colour and no extra weight. */}
      <div className="space-y-[var(--space-6)]">
        {lesson.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body && <p className="prose mt-[var(--space-3)]">{section.body}</p>}

            {section.bullets && (
              <ul className="prose mt-[var(--space-3)] space-y-[var(--space-2)]">
                {section.bullets.map((point) => (
                  <li key={point} className="flex gap-[var(--space-2)]">
                    <span className="mt-[0.7em] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* A worked example is an aside, so it recesses into a well rather
                than floating on a second panel inside the reading column. */}
            {section.example && (
              <aside className="well mt-[var(--space-4)] max-w-[var(--measure)] p-[var(--space-4)]">
                <h3>{section.example.title}</h3>
                <p className="mt-[var(--space-2)] text-[length:var(--text-small)] leading-relaxed text-ink-2">
                  {section.example.body}
                </p>
              </aside>
            )}
          </section>
        ))}
      </div>

      {/* A glossary is a definition list, not three cards. Term names carry in
          the mono face; hairlines do the separating that the card edges did. */}
      <section className="mt-[var(--space-6)]">
        <h2>Words worth knowing</h2>
        <dl className="mt-[var(--space-4)] max-w-[var(--measure)] border-b border-hairline">
          {lesson.terms.map((term) => (
            <div
              key={term.term}
              className="grid gap-[var(--space-1)] border-t border-hairline py-[var(--space-3)] sm:grid-cols-[13rem_1fr] sm:gap-[var(--space-4)]"
            >
              <dt className="readout text-[length:var(--text-small)] text-ink">{term.term}</dt>
              <dd className="text-[length:var(--text-small)] leading-relaxed text-ink-2">{term.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The one accent on the screen: the action the page exists to send you to. */}
      <section className="mt-[var(--space-7)] flex flex-wrap items-center justify-between gap-[var(--space-4)] border-t border-hairline pt-[var(--space-4)]">
        <div className="max-w-[var(--measure)]">
          <h3>Done reading?</h3>
          <p className="mt-[var(--space-1)] text-[length:var(--text-small)] text-ink-2">
            {alreadyRead || marked
              ? 'Marked complete. Now go prove it.'
              : 'Mark it complete for +15 XP, then take the level quiz.'}
          </p>
        </div>
        <div className="flex items-center gap-[var(--space-2)]">
          {!alreadyRead && !marked && (
            <button
              onClick={markRead}
              className="rounded-full px-[var(--space-4)] py-[var(--space-2)] text-[length:var(--text-small)] text-ink-2 transition hover:text-ink"
              style={{ boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }}
            >
              Mark complete
            </button>
          )}
          {(alreadyRead || marked) && (
            <Chip size="md">
              <CheckCircle2 size={13} /> Complete
            </Chip>
          )}
          <Link
            to={`/quiz/${track}/${lesson.level}`}
            className="rounded-full bg-accent px-[var(--space-4)] py-[var(--space-2)] text-[length:var(--text-small)] text-canvas transition hover:bg-accent/90"
          >
            Take level <span className="readout">{lesson.level}</span> quiz
          </Link>
        </div>
      </section>

      <nav className="mt-[var(--space-6)] grid gap-[var(--space-4)] border-t border-hairline pt-[var(--space-4)] sm:grid-cols-2">
        {prev ? (
          <Link to={`/learn/${track}/${prev.level}`} className="group block min-w-0">
            <span className="eyebrow">Previous</span>
            <p className="mt-[var(--space-1)] truncate text-ink transition group-hover:text-ink-2">{prev.title}</p>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next && (
          <Link to={`/learn/${track}/${next.level}`} className="group block min-w-0 sm:text-right">
            <span className="eyebrow">Next</span>
            <p className="mt-[var(--space-1)] flex items-center gap-[var(--space-1)] truncate text-ink transition group-hover:text-ink-2 sm:justify-end">
              {next.title} <ArrowRight size={14} className="shrink-0" />
            </p>
          </Link>
        )}
      </nav>
    </article>
  )
}
