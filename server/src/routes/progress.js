import { Router } from 'express'
import { z } from 'zod'
import { Attempt } from '../models/Attempt.js'
import { User } from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'

export const progressRouter = Router()

progressRouter.post('/lesson-read', requireAuth, async (req, res) => {
  const parsed = z.object({ lessonId: z.string().min(1).max(80) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'lessonId is required.' })

  const user = req.user
  if (!user.lessonsRead.includes(parsed.data.lessonId)) {
    user.lessonsRead.push(parsed.data.lessonId)
    user.xp += 15
    await user.save()
  }
  res.json({ user: user.publicProfile() })
})

progressRouter.get('/history', requireAuth, async (req, res) => {
  const attempts = await Attempt.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(25).lean()
  res.json({ attempts })
})

progressRouter.get('/leaderboard', async (_req, res) => {
  const top = await User.find({ xp: { $gt: 0 } })
    .sort({ xp: -1 })
    .limit(20)
    .select('name xp streak badges')
    .lean()
  res.json({
    leaders: top.map((u, i) => ({
      rank: i + 1,
      name: u.name,
      xp: u.xp,
      streak: u.streak,
      badgeCount: u.badges?.length ?? 0,
    })),
  })
})
