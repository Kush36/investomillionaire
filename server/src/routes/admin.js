import { Router } from 'express'
import crypto from 'node:crypto'
import { User } from '../models/User.js'
import { decryptField } from '../lib/crypto.js'

export const adminRouter = Router()

// Guarded by a shared secret in ADMIN_TOKEN, compared in constant time. This is
// the only path in the codebase that can turn a stored mobile number back into
// plain text, and it never runs for a signed-in site user.
function requireAdmin(req, res, next) {
  const supplied = req.headers['x-admin-token']
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return res.status(503).json({ error: 'Admin access is not configured.' })
  if (typeof supplied !== 'string' || supplied.length !== expected.length) {
    return res.status(404).json({ error: 'Not found.' })
  }
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (!crypto.timingSafeEqual(a, b)) return res.status(404).json({ error: 'Not found.' })
  next()
}

adminRouter.use(requireAdmin)

adminRouter.get('/users', async (req, res) => {
  const reveal = req.query.reveal === 'true'
  const users = await User.find({})
    .select('+mobileEnc +mobileLast4 +mobileFingerprint')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean()

  res.json({
    count: users.length,
    users: users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      // Masked by default. Pass ?reveal=true to decrypt.
      mobile: reveal ? decryptField(u.mobileEnc) : u.mobileLast4 ? `••••••${u.mobileLast4}` : null,
      xp: u.xp,
      streak: u.streak,
      badges: u.badges,
      joined: u.createdAt,
    })),
  })
})
