import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Timer, ArrowRight, RotateCcw } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth, BADGE_META } from '../lib/store.js'
import { TRACK_META } from '../data/lessons.js'
import Chip from '../components/Chip.jsx'

// Two recipes, shared by the play screen, the results screen and the error
// screen, so exactly one filled button can ever be on screen at once. The ghost
// draws its edge as an inset ring rather than a border: no border ever sits a
// pixel away from the ring a panel already draws, and a ring costs no width.
const BUTTON =
  'inline-flex items-center gap-[var(--space-1)] rounded-full px-[var(--space-4)] py-[var(--space-2)] text-small transition-colors duration-[var(--dur-tap)] ease-[var(--ease-standard)]'
const PRIMARY = `${BUTTON} bg-accent text-canvas hover:bg-accent/90 disabled:opacity-50`
const GHOST = `${BUTTON} text-ink-2 shadow-[inset_0_0_0_1px_var(--color-hairline)] hover:text-ink disabled:opacity-30`

// A 2px ledger rule. Time running out is carried by the ink getting darker, not
// by the bar turning red: red on this page means a wrong answer and nothing else.
function Timerbar({ secondsLeft, total }) {
  const ratio = secondsLeft / total
  return (
    <div className="h-0.5 w-full overflow-hidden bg-hairline">
      <div
        className={`h-full transition-[width] duration-[var(--dur-data)] ease-[var(--ease-data)] ${ratio > 0.2 ? 'bg-ink-3' : 'bg-ink'}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  )
}

function Results({ result, track, level, onRetry }) {
  const meta = TRACK_META[track]

  return (
    <div className="mx-auto max-w-3xl px-4 py-[var(--space-6)] sm:px-6">
      <header>
        <p className="eyebrow">
          {meta?.label} · Level {level}
        </p>
        {/* The one serif line on this screen, on the thing the screen is about. */}
        <h1 className="display mt-[var(--space-2)]">{result.passed ? 'Cleared' : 'Not cleared'}</h1>

        {/* The score is typeset, not decorated: tabular mono on a shared
            baseline, the denominator dropped back to ink-3 so the numerator
            reads first. The percentage is the only coloured figure here. */}
        <div className="mt-[var(--space-4)] flex items-baseline gap-[var(--space-3)]">
          <span className="readout text-title leading-none">
            {result.score}
            <span className="text-ink-3">/{result.total}</span>
          </span>
          <span className={`readout text-heading leading-none ${result.passed ? 'text-gain' : 'text-loss'}`}>
            {result.percent}%
          </span>
        </div>
        {!result.passed && (
          <p className="mt-[var(--space-2)] text-small text-ink-3">Need {result.passPercent}% to clear</p>
        )}

        <div className="mt-[var(--space-4)] flex flex-wrap gap-[var(--space-1)]">
          <Chip>+{result.xpEarned} XP</Chip>
          {result.nextLevelUnlocked && <Chip>level {result.nextLevelUnlocked} unlocked</Chip>}
        </div>

        {result.earnedBadges?.length > 0 && (
          <div className="mt-[var(--space-5)]">
            <p className="eyebrow">New badges</p>
            <div className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
              {result.earnedBadges.map((badge) => (
                <span key={badge} className="well flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)]">
                  <span className="text-xl leading-none">{BADGE_META[badge]?.emoji ?? '🏅'}</span>
                  <span className="text-small">{BADGE_META[badge]?.label ?? badge}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-[var(--space-5)] flex flex-wrap items-center gap-[var(--space-2)]">
          <Link to="/quiz" className={PRIMARY}>
            All levels
          </Link>
          <button onClick={onRetry} className={GHOST}>
            <RotateCcw size={14} /> Retry
          </button>
          {!result.passed && (
            <Link to={`/learn/${track}/${level}`} className={GHOST}>
              Re-read the lesson
            </Link>
          )}
        </div>
      </header>

      <section className="mt-[var(--space-7)]">
        <h2>Review</h2>
        <div className="mt-[var(--space-4)] space-y-[var(--space-3)]">
          {result.review.map((item) => {
            const tone = item.correct ? 'var(--color-gain)' : 'var(--color-loss)'
            return (
              // The rail is an inset shadow listed alongside the panel ring.
              // An inline box-shadow replaces the utility's rather than adding
              // to it, so the ring has to ride in the same declaration or the
              // card silently loses its edge.
              <article
                key={item.position}
                className="panel p-[var(--space-4)]"
                style={{ boxShadow: `inset 2px 0 0 ${tone}, var(--shadow-ring)` }}
              >
                <div className="flex items-baseline gap-[var(--space-2)]">
                  <span className="readout text-micro text-ink-3">{String(item.position).padStart(2, '0')}</span>
                  <span className="eyebrow" style={{ color: tone }}>
                    {item.correct ? 'Correct' : 'Missed'}
                  </span>
                </div>

                {/* Three rungs, by size and space: the question, then the
                    options a step down, then the explanation set apart. */}
                <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-heading leading-snug">{item.question}</p>

                <ul className="mt-[var(--space-3)] space-y-[var(--space-1)]">
                  {item.options.map((option, i) => {
                    const isCorrect = i === item.correctIndex
                    const isGiven = i === item.givenIndex
                    return (
                      <li
                        key={option}
                        className={`flex gap-[var(--space-2)] text-small ${
                          isCorrect ? 'text-gain' : isGiven ? 'text-loss line-through' : 'text-ink-3'
                        }`}
                      >
                        <span className="readout w-[1.5em] shrink-0">{String.fromCharCode(65 + i)}</span>
                        <span>{option}</span>
                      </li>
                    )
                  })}
                </ul>

                <div className="mt-[var(--space-3)] max-w-[var(--measure)]">
                  <p className="eyebrow">Why</p>
                  <p className="mt-[var(--space-1)] text-small leading-relaxed text-ink-2">{item.explanation}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default function QuizPlay() {
  const { track, level } = useParams()
  const navigate = useNavigate()
  const setUser = useAuth((s) => s.setUser)

  const [quiz, setQuiz] = useState(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const startedAt = useRef(Date.now())

  const meta = TRACK_META[track]

  function load() {
    setQuiz(null)
    setResult(null)
    setIndex(0)
    setAnswers([])
    setError('')
    api(`/quiz/${track}/${level}`)
      .then((data) => {
        setQuiz(data)
        setAnswers(new Array(data.questions.length).fill(-1))
        setSecondsLeft(data.timeLimitSec)
        startedAt.current = Date.now()
      })
      .catch((err) => setError(err.message))
  }

  useEffect(load, [track, level])

  const submit = useMemo(
    () => async (finalAnswers) => {
      if (submitting) return
      setSubmitting(true)
      try {
        const data = await api('/quiz/submit', {
          method: 'POST',
          body: {
            sessionToken: quiz.sessionToken,
            answers: finalAnswers,
            durationMs: Date.now() - startedAt.current,
          },
        })
        setResult(data)
        setUser(data.user)
      } catch (err) {
        setError(err.message)
      } finally {
        setSubmitting(false)
      }
    },
    [quiz, submitting, setUser]
  )

  useEffect(() => {
    if (!quiz || result) return
    if (secondsLeft <= 0) {
      submit(answers)
      return
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [quiz, result, secondsLeft, answers, submit])

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-[var(--space-7)] text-center">
        <p className="text-loss">{error}</p>
        <button onClick={() => navigate('/quiz')} className={`${PRIMARY} mt-[var(--space-4)]`}>
          Back to levels
        </button>
      </div>
    )
  }

  if (result) return <Results result={result} track={track} level={level} onRetry={load} />
  if (!quiz) return <p className="py-[var(--space-7)] text-center text-small text-ink-3">Loading quiz…</p>

  const question = quiz.questions[index]
  const answered = answers[index] !== -1
  const isLast = index === quiz.questions.length - 1

  function choose(optionIndex) {
    setAnswers((prev) => {
      const copy = [...prev]
      copy[index] = optionIndex
      return copy
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-[var(--space-6)] sm:px-6">
      <header className="flex items-end justify-between gap-[var(--space-3)]">
        <div className="min-w-0">
          <p className="eyebrow">
            {meta.label} · Level {quiz.level}
          </p>
          <h1 className="mt-[var(--space-1)] text-heading">{quiz.meta.title}</h1>
        </div>
        {/* The clock is a readout: tabular figures, so the page never twitches
            as the seconds tick down. */}
        <div className="flex shrink-0 items-center gap-[var(--space-1)] text-ink-2">
          <Timer size={13} className="text-ink-3" />
          <span className="readout text-heading leading-none">
            {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
          </span>
        </div>
      </header>

      <div className="mt-[var(--space-3)]">
        <Timerbar secondsLeft={secondsLeft} total={quiz.timeLimitSec} />
      </div>

      {/* Three ink values, no colour: where you are, where you have been,
          where you have not. */}
      <div className="mt-[var(--space-2)] flex gap-1">
        {quiz.questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-1 flex-1 rounded-full transition-colors duration-[var(--dur-tap)] ease-[var(--ease-standard)] ${
              i === index ? 'bg-ink' : answers[i] !== -1 ? 'bg-ink-3' : 'bg-hairline'
            }`}
            aria-label={`Question ${i + 1}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22 }}
          className="mt-[var(--space-6)]"
        >
          <p className="eyebrow">
            Question {index + 1} of {quiz.questions.length}
          </p>
          {/* The question is the largest thing on the screen and carries no
              extra weight to say so. Size and the air above it do the work. */}
          <h2 className="mt-[var(--space-3)] max-w-[var(--measure)] text-title leading-[1.1] font-normal">
            {question.question}
          </h2>

          <div className="mt-[var(--space-5)] space-y-[var(--space-2)]">
            {question.options.map((option, i) => {
              const selected = answers[index] === i
              return (
                // Recessed well, generous target. Selected is a single 2px
                // mulberry ring and nothing else: no tint, no filled letter
                // plate, so the one accent on the screen stays one accent.
                <button
                  key={option}
                  onClick={() => choose(i)}
                  aria-pressed={selected}
                  className={`well flex w-full items-start gap-[var(--space-3)] p-[var(--space-3)] text-left transition-colors duration-[var(--dur-tap)] ease-[var(--ease-standard)] ${
                    selected ? 'text-ink' : 'text-ink-2 hover:text-ink'
                  }`}
                  style={selected ? { boxShadow: 'inset 0 0 0 2px var(--color-accent)' } : undefined}
                >
                  <span className={`readout w-[1.5em] shrink-0 text-small ${selected ? 'text-ink' : 'text-ink-3'}`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="leading-snug">{option}</span>
                </button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-[var(--space-5)] flex items-center justify-between gap-[var(--space-3)]">
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className={GHOST}>
          Back
        </button>

        {isLast ? (
          <button onClick={() => submit(answers)} disabled={submitting} className={PRIMARY}>
            {submitting ? 'Scoring…' : 'Submit quiz'} <Check size={16} />
          </button>
        ) : (
          <button onClick={() => setIndex((i) => i + 1)} className={PRIMARY}>
            {answered ? 'Next' : 'Skip'} <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
