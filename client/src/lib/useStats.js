import { useEffect, useState } from 'react'
import { LESSONS } from '../data/lessons.js'
import { api } from './api.js'

// Lesson counts come straight from the content file. Question counts live on the
// server, so they are fetched. Both fall back to something true rather than to a
// hardcoded number that goes stale the moment a level is added.
const FALLBACK = {
  tracks: Object.keys(LESSONS).length,
  levelsPerTrack: LESSONS.fundamental.length,
  levels: LESSONS.fundamental.length + LESSONS.technical.length,
  questions: null,
  questionsPerQuiz: null,
  passPercent: 70,
}

let cached = null

export function useStats() {
  const [stats, setStats] = useState(cached ?? FALLBACK)

  useEffect(() => {
    if (cached) return
    api('/quiz/stats', { auth: false })
      .then((data) => {
        cached = data
        setStats(data)
      })
      .catch(() => {})
  }, [])

  return stats
}
