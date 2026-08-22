import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { BANK, LEVELS, PASS_PERCENT, QUESTIONS_PER_QUIZ } from '../data/quizBank.js'
import { Attempt } from '../models/Attempt.js'
import { requireAuth } from '../middleware/auth.js'

export const quizRouter = Router()

const TRACKS = ['fundamental', 'technical']

function shuffle(list) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function findProgress(user, track, level) {
  return user.progress.find((p) => p.track === track && p.level === level)
}

function isUnlocked(user, track, level) {
  if (level === 1) return true
  const prev = findProgress(user, track, level - 1)
  return Boolean(prev?.passedAt)
}

function istToday() {
  // Streaks are counted on Indian calendar days, not the server's timezone.
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

function bumpStreak(user) {
  const today = istToday()
  if (user.lastActiveOn === today) return
  const yesterday = new Date(Date.now() + 5.5 * 3600 * 1000 - 86400000).toISOString().slice(0, 10)
  user.streak = user.lastActiveOn === yesterday ? user.streak + 1 : 1
  user.lastActiveOn = today
}

// Public counts so the marketing copy can never drift out of sync with the bank.
quizRouter.get('/stats', (_req, res) => {
  const questions = TRACKS.reduce(
    (sum, track) => sum + Object.values(BANK[track]).reduce((n, pool) => n + pool.length, 0),
    0
  )
  res.json({
    tracks: TRACKS.length,
    levelsPerTrack: LEVELS.fundamental.length,
    levels: TRACKS.reduce((n, track) => n + LEVELS[track].length, 0),
    questions,
    questionsPerQuiz: QUESTIONS_PER_QUIZ,
    passPercent: PASS_PERCENT,
  })
})

quizRouter.get('/levels', requireAuth, (req, res) => {
  const build = (track) =>
    LEVELS[track].map((meta) => {
      const progress = findProgress(req.user, track, meta.level)
      return {
        ...meta,
        track,
        unlocked: isUnlocked(req.user, track, meta.level),
        passed: Boolean(progress?.passedAt),
        bestScore: progress?.bestScore ?? 0,
        attempts: progress?.attempts ?? 0,
        questionCount: QUESTIONS_PER_QUIZ,
      }
    })
  res.json({ fundamental: build('fundamental'), technical: build('technical'), passPercent: PASS_PERCENT })
})

quizRouter.get('/:track/:level', requireAuth, (req, res) => {
  const { track } = req.params
  const level = Number(req.params.level)
  if (!TRACKS.includes(track) || !BANK[track][level]) return res.status(404).json({ error: 'No such quiz.' })
  if (!isUnlocked(req.user, track, level)) {
    return res.status(403).json({ error: `Clear level ${level - 1} first to unlock this one.` })
  }

  const pool = BANK[track][level]
  const order = shuffle(pool.map((_, i) => i)).slice(0, QUESTIONS_PER_QUIZ)
  // The order is signed rather than stored, so scoring stays stateless and the
  // browser never receives the answer key.
  const sessionToken = jwt.sign({ track, level, order }, process.env.JWT_SECRET, { expiresIn: '45m' })

  res.json({
    track,
    level,
    meta: LEVELS[track].find((l) => l.level === level),
    sessionToken,
    timeLimitSec: QUESTIONS_PER_QUIZ * 45,
    questions: order.map((idx, position) => ({
      position,
      question: pool[idx].q,
      options: pool[idx].o,
    })),
  })
})

const submitSchema = z.object({
  sessionToken: z.string(),
  answers: z.array(z.number().int().min(-1).max(3)),
  durationMs: z.number().int().min(0).max(3 * 3600 * 1000).optional(),
})

quizRouter.post('/submit', requireAuth, async (req, res) => {
  const parsed = submitSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Malformed submission.' })

  let session
  try {
    session = jwt.verify(parsed.data.sessionToken, process.env.JWT_SECRET)
  } catch {
    return res.status(400).json({ error: 'This quiz session expired. Start it again.' })
  }

  const { track, level, order } = session
  const pool = BANK[track]?.[level]
  if (!pool) return res.status(400).json({ error: 'Unknown quiz session.' })

  const review = order.map((idx, position) => {
    const question = pool[idx]
    const given = parsed.data.answers[position] ?? -1
    return {
      position,
      question: question.q,
      options: question.o,
      correctIndex: question.a,
      givenIndex: given,
      correct: given === question.a,
      explanation: question.e,
    }
  })

  const score = review.filter((r) => r.correct).length
  const total = review.length
  const percent = Math.round((score / total) * 100)
  const passed = percent >= PASS_PERCENT

  const user = req.user
  let progress = findProgress(user, track, level)
  if (!progress) {
    user.progress.push({ track, level, bestScore: 0, attempts: 0 })
    progress = findProgress(user, track, level)
  }

  const firstClear = passed && !progress.passedAt
  progress.attempts += 1
  progress.bestScore = Math.max(progress.bestScore, percent)
  if (firstClear) progress.passedAt = new Date()

  const xpEarned = score * 10 + (firstClear ? 50 : 0) + (percent === 100 ? 25 : 0)
  user.xp += xpEarned
  bumpStreak(user)

  const earnedBadges = []
  const award = (badge) => {
    if (!user.badges.includes(badge)) {
      user.badges.push(badge)
      earnedBadges.push(badge)
    }
  }
  if (percent === 100) award('perfect-score')
  if (user.streak >= 7) award('week-warrior')
  if (user.xp >= 1000) award('thousand-club')
  const clearedAll = (t) => LEVELS[t].every((l) => findProgress(user, t, l.level)?.passedAt)
  if (clearedAll('fundamental')) award('fundamental-graduate')
  if (clearedAll('technical')) award('technical-graduate')
  if (clearedAll('fundamental') && clearedAll('technical')) award('market-master')

  await user.save()
  await Attempt.create({
    user: user._id,
    track,
    level,
    score,
    total,
    percent,
    passed,
    xpEarned,
    durationMs: parsed.data.durationMs ?? 0,
  })

  res.json({
    score,
    total,
    percent,
    passed,
    passPercent: PASS_PERCENT,
    xpEarned,
    firstClear,
    earnedBadges,
    nextLevelUnlocked: firstClear && level < LEVELS[track].length ? level + 1 : null,
    review,
    user: user.publicProfile(),
  })
})
