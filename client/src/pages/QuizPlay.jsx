import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Timer, Zap, ArrowRight, RotateCcw } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth, BADGE_META } from '../lib/store.js'
import { TRACK_META } from '../data/lessons.js'

function Timerbar({ secondsLeft, total }) {
  const ratio = secondsLeft / total
  const colour = ratio > 0.5 ? '#33e29b' : ratio > 0.2 ? '#eaa81e' : '#ff5d5d'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${ratio * 100}%`, background: colour }} />
    </div>
  )
}

function Results({ result, track, level, onRetry }) {
  const meta = TRACK_META[track]
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-3xl p-8 text-center">
        <div className="text-6xl">{result.passed ? '🎉' : '😤'}</div>
        <h1 className="mt-4 text-4xl font-extrabold">
          {result.score} / {result.total}
        </h1>
        <p className="mt-1 text-xl font-bold" style={{ color: result.passed ? '#33e29b' : '#ff5d5d' }}>
          {result.percent}% · {result.passed ? 'Cleared' : `Need ${result.passPercent}% to clear`}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-gold/15 px-4 py-2 font-mono text-sm text-gold">
            <Zap size={14} /> +{result.xpEarned} XP
          </span>
          {result.nextLevelUnlocked && (
            <span className="rounded-full bg-mint/15 px-4 py-2 font-mono text-sm text-mint">
              level {result.nextLevelUnlocked} unlocked
            </span>
          )}
        </div>

        {result.earnedBadges?.length > 0 && (
          <div className="mt-6">
            <p className="font-mono text-[10px] tracking-widest text-white/40 uppercase">New badges</p>
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              {result.earnedBadges.map((badge) => (
                <span key={badge} className="glass rounded-2xl px-4 py-3">
                  <span className="text-2xl">{BADGE_META[badge]?.emoji ?? '🏅'}</span>
                  <span className="mt-1 block text-xs font-bold">{BADGE_META[badge]?.label ?? badge}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold transition hover:border-gold/50 hover:text-gold">
            <RotateCcw size={15} /> Retry
          </button>
          <Link to="/quiz" className="rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink transition hover:bg-gold-soft">
            All levels
          </Link>
          {!result.passed && (
            <Link to={`/learn/${track}/${level}`} className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold transition hover:border-gold/50 hover:text-gold">
              Re-read the lesson
            </Link>
          )}
        </div>
      </motion.div>

      <h2 className="mt-12 text-2xl font-bold">Review</h2>
      <div className="mt-5 space-y-4">
        {result.review.map((item) => (
          <div key={item.position} className={`glass rounded-2xl border-l-2 p-6 ${item.correct ? 'border-l-mint' : 'border-l-flame'}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.correct ? 'bg-mint/20 text-mint' : 'bg-flame/20 text-flame'}`}>
                {item.correct ? <Check size={14} /> : <X size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.question}</p>
                <div className="mt-3 space-y-1.5">
                  {item.options.map((option, i) => {
                    const isCorrect = i === item.correctIndex
                    const isGiven = i === item.givenIndex
                    return (
                      <p
                        key={option}
                        className={`rounded-lg px-3 py-1.5 text-sm ${
                          isCorrect
                            ? 'bg-mint/12 text-mint'
                            : isGiven
                              ? 'bg-flame/12 text-flame line-through'
                              : 'text-white/45'
                        }`}
                      >
                        {option}
                      </p>
                    )
                  })}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/60">
                  <span className="font-bold" style={{ color: meta.accent }}>Why: </span>
                  {item.explanation}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
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
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-flame">{error}</p>
        <button onClick={() => navigate('/quiz')} className="mt-6 rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink">
          Back to levels
        </button>
      </div>
    )
  }

  if (result) return <Results result={result} track={track} level={level} onRetry={load} />
  if (!quiz) return <p className="py-24 text-center text-white/40">Loading quiz…</p>

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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color: meta.accent }}>
            {meta.label} · Level {quiz.level}
          </span>
          <h1 className="text-2xl font-extrabold">{quiz.meta.title}</h1>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 font-mono text-sm">
          <Timer size={14} className={secondsLeft < 30 ? 'text-flame' : 'text-white/50'} />
          {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
      </div>

      <div className="mt-5">
        <Timerbar secondsLeft={secondsLeft} total={quiz.timeLimitSec} />
      </div>

      <div className="mt-4 flex gap-1.5">
        {quiz.questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-1.5 flex-1 rounded-full transition ${
              i === index ? 'bg-gold' : answers[i] !== -1 ? 'bg-white/40' : 'bg-white/10'
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
          className="glass mt-8 rounded-3xl p-7"
        >
          <span className="font-mono text-xs text-white/35">
            Question {index + 1} of {quiz.questions.length}
          </span>
          <h2 className="mt-3 text-xl leading-snug font-bold sm:text-2xl">{question.question}</h2>

          <div className="mt-7 space-y-3">
            {question.options.map((option, i) => {
              const selected = answers[index] === i
              return (
                <button
                  key={option}
                  onClick={() => choose(i)}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition ${
                    selected ? 'border-gold bg-gold/12 text-white' : 'border-white/10 text-white/70 hover:border-white/25 hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold ${
                      selected ? 'bg-gold text-ink' : 'bg-white/8 text-white/50'
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="leading-snug">{option}</span>
                </button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between gap-4">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-white/70 transition disabled:opacity-30"
        >
          Back
        </button>

        {isLast ? (
          <button
            onClick={() => submit(answers)}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3 text-sm font-bold text-ink transition hover:bg-gold-soft disabled:opacity-50"
          >
            {submitting ? 'Scoring…' : 'Submit quiz'} <Check size={16} />
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => i + 1)}
            className="inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3 text-sm font-bold text-ink transition hover:bg-gold-soft"
          >
            {answered ? 'Next' : 'Skip'} <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
