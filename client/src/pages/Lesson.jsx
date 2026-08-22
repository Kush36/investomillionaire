import { useEffect, useState } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, BookOpen, Lightbulb, CheckCircle2 } from 'lucide-react'
import LessonScene from '../three/LessonScene.jsx'
import { findLesson, LESSONS, TRACK_META } from '../data/lessons.js'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.js'
import Seo from '../components/Seo.jsx'

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
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Seo
        title={lesson.title}
        description={`${lesson.subtitle}. Level ${lesson.level} of the ${meta.label.toLowerCase()} track, a ${lesson.minutes} minute read built around an interactive 3D diagram.`}
        type="article"
      />
      <Link to={`/learn/${track}`} className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-white/40 uppercase hover:text-gold">
        <ArrowLeft size={14} /> {meta.label}
      </Link>

      <header className="mt-6">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] tracking-widest uppercase"
          style={{ background: `${meta.accent}1f`, color: meta.accent }}
        >
          Level {lesson.level} · {lesson.minutes} min read
        </span>
        <h1 className="mt-5 text-4xl leading-tight font-extrabold sm:text-5xl">{lesson.title}</h1>
        <p className="mt-3 text-lg text-white/55">{lesson.subtitle}</p>
      </header>

      <div className="my-10">
        <LessonScene scene={lesson.scene} height={460} />
        <p className="mt-3 text-center font-mono text-[11px] tracking-widest text-white/30 uppercase">
          interactive diagram · drag, zoom, hover
        </p>
      </div>

      <div className="space-y-10">
        {lesson.sections.map((section, i) => (
          <motion.section
            key={section.heading}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
          >
            <h2 className="text-2xl font-bold" style={{ color: meta.accent }}>
              {section.heading}
            </h2>
            {section.body && <p className="mt-4 text-[17px] leading-relaxed text-white/70">{section.body}</p>}

            {section.bullets && (
              <ul className="mt-5 space-y-3">
                {section.bullets.map((point) => (
                  <li key={point} className="flex gap-3 text-white/65">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.accent }} />
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            )}

            {section.example && (
              <div className="glass mt-6 rounded-2xl border-l-2 p-6" style={{ borderLeftColor: meta.accent }}>
                <div className="flex items-center gap-2">
                  <Lightbulb size={16} style={{ color: meta.accent }} />
                  <h3 className="font-bold">{section.example.title}</h3>
                </div>
                <p className="mt-3 leading-relaxed text-white/65">{section.example.body}</p>
              </div>
            )}
          </motion.section>
        ))}
      </div>

      <section className="mt-14">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen size={17} className="text-gold" />
          <h2 className="text-xl font-bold">Words worth knowing</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {lesson.terms.map((term) => (
            <div key={term.term} className="glass rounded-2xl p-5">
              <h4 className="font-mono text-sm font-bold text-gold">{term.term}</h4>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{term.meaning}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="glass mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div>
          <h3 className="font-bold">Done reading?</h3>
          <p className="text-sm text-white/50">
            {alreadyRead || marked ? 'Marked complete. Now go prove it.' : 'Mark it complete for +15 XP, then take the level quiz.'}
          </p>
        </div>
        <div className="flex gap-3">
          {!alreadyRead && !marked && (
            <button onClick={markRead} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:border-gold/50 hover:text-gold">
              Mark complete
            </button>
          )}
          {(alreadyRead || marked) && (
            <span className="inline-flex items-center gap-2 rounded-full bg-mint/15 px-5 py-2.5 text-sm font-semibold text-mint">
              <CheckCircle2 size={15} /> Complete
            </span>
          )}
          <Link to={`/quiz/${track}/${lesson.level}`} className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-ink transition hover:bg-gold-soft">
            Take level {lesson.level} quiz
          </Link>
        </div>
      </div>

      <nav className="mt-8 flex items-center justify-between gap-4">
        {prev ? (
          <Link to={`/learn/${track}/${prev.level}`} className="glass flex-1 rounded-2xl p-4 transition hover:border-white/25">
            <span className="font-mono text-[10px] tracking-widest text-white/35 uppercase">Previous</span>
            <p className="mt-1 truncate font-semibold">{prev.title}</p>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Link to={`/learn/${track}/${next.level}`} className="glass flex-1 rounded-2xl p-4 text-right transition hover:border-white/25">
            <span className="font-mono text-[10px] tracking-widest text-white/35 uppercase">Next</span>
            <p className="mt-1 flex items-center justify-end gap-2 truncate font-semibold">
              {next.title} <ArrowRight size={15} />
            </p>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>
    </article>
  )
}
