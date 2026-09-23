import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../lib/api.js'
import { TRACK_META } from '../data/lessons.js'
import Seo from '../components/Seo.jsx'
import Chip from '../components/Chip.jsx'

// Two button recipes for the whole page. The filled one renders at most twice,
// on the level each track is actually up to; every other card offers the same
// action in ink. Forty mulberry buttons is not an accent, it is a background.
const BUTTON =
  'inline-flex items-center rounded-full px-[var(--space-3)] py-[var(--space-1)] text-small transition-colors duration-[var(--dur-tap)] ease-[var(--ease-standard)]'
const RESUME = `${BUTTON} bg-accent text-canvas hover:bg-accent/90`
const OPEN = `${BUTTON} text-ink-2 shadow-[inset_0_0_0_1px_var(--color-hairline)] hover:text-ink`

function LevelCard({ level, track, index, resume }) {
  const locked = !level.unlocked

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="panel flex flex-col p-[var(--space-4)]"
    >
      {/* The level number is set as a figure, not painted into a tinted tile.
          Zero-padded so column one of every card lines up down the grid. */}
      <div className="flex items-baseline justify-between gap-[var(--space-2)]">
        <span className={`readout text-small ${locked ? 'text-ink-3' : 'text-ink'}`}>
          {String(level.level).padStart(2, '0')}
        </span>
        {level.passed && <Chip>cleared</Chip>}
      </div>

      <h3 className={`mt-[var(--space-3)] ${locked ? 'text-ink-3' : ''}`}>{level.title}</h3>
      <p className="eyebrow mt-[var(--space-1)]">{level.tag}</p>
      <p className="mt-[var(--space-2)] text-small text-ink-2">{level.blurb}</p>

      {/* One tabular line for every count on the card, so the three facts read
          as a readout rather than three separately styled badges. */}
      <p className="readout mt-[var(--space-3)] text-micro text-ink-3">
        {level.questionCount} questions
        {level.attempts > 0 && ` · best ${level.bestScore}% · ${level.attempts} tries`}
      </p>

      {/* mt-auto: the action sits on a shared baseline across the row however
          long the blurb above it runs. */}
      <div className="mt-auto pt-[var(--space-4)]">
        {locked ? (
          <p className="text-small text-ink-3">Clear level {level.level - 1} to unlock.</p>
        ) : (
          <Link to={`/quiz/${track}/${level.level}`} className={resume ? RESUME : OPEN}>
            {level.passed ? 'Retry' : 'Start'}
          </Link>
        )}
      </div>
    </motion.article>
  )
}

export default function Quiz() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/quiz/levels').then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="mx-auto max-w-3xl px-4 py-[var(--space-7)] text-center text-loss">{error}</p>
  if (!data) return <p className="py-[var(--space-7)] text-center text-small text-ink-3">Loading levels…</p>

  return (
    <div className="mx-auto max-w-6xl px-4 py-[var(--space-6)] sm:px-6">
      <Seo title="Stock market quizzes by level" description="Two hundred questions across twenty gated levels, scored on the server, with an explanation behind every answer." />

      {/* The one serif line on the page. */}
      <header>
        <p className="eyebrow">Practice</p>
        <h1 className="display mt-[var(--space-2)]">Quizzes</h1>
        <p className="prose mt-[var(--space-4)]">
          {data.fundamental[0]?.questionCount} questions per level, timed, scored on the server. Hit {data.passPercent}% to
          clear a level and unlock the next one. Every wrong answer comes back with an explanation.
        </p>
      </header>

      {Object.entries(TRACK_META).map(([key, meta]) => {
        // The one card in each track worth pointing at: unlocked, not yet cleared.
        const resume = data[key].find((l) => l.unlocked && !l.passed)

        return (
          <section key={key} className="mt-[var(--space-7)]">
            {/* A hairline under the section head instead of an emoji in front of it. */}
            <div className="flex items-baseline justify-between gap-[var(--space-3)] border-b border-hairline pb-[var(--space-2)]">
              <h2>{meta.label}</h2>
              <span className="readout text-micro text-ink-3">
                {data[key].filter((l) => l.passed).length} / {data[key].length} cleared
              </span>
            </div>

            <div className="mt-[var(--space-4)] grid gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-3">
              {data[key].map((level, i) => (
                <LevelCard
                  key={level.level}
                  level={level}
                  track={key}
                  index={i}
                  resume={level.level === resume?.level}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
