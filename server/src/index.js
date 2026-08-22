import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { connectDB } from './db.js'
import { authRouter } from './routes/auth.js'
import { newsRouter } from './routes/news.js'
import { ipoRouter } from './routes/ipo.js'
import { adminRouter } from './routes/admin.js'
import { recoRouter } from './routes/reco.js'
import { quizRouter } from './routes/quiz.js'
import { progressRouter } from './routes/progress.js'

const app = express()
app.set('trust proxy', 1)
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? '*' }))
app.use(express.json({ limit: '64kb' }))

app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }))

// Brute-force guard on the credential endpoints only. It deliberately does NOT
// cover /auth/me, which the app calls on every page load: sharing one budget
// meant normal browsing locked the user out of their own login.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Only wrong guesses count. Typing your password correctly can never lock you out.
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed attempts from this device. Try again in 15 minutes.' },
})
app.use('/api/auth/login', credentialLimiter)
app.use('/api/auth/signup', credentialLimiter)

// Sending mail costs money and can be abused to spam a stranger's inbox, so the
// endpoints that trigger an email are held to a tighter budget than login.
const otpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code requests from this device. Try again in 15 minutes.' },
})
app.use('/api/auth/signup/start', otpLimiter)
app.use('/api/auth/signup/resend', otpLimiter)
app.use('/api/auth/forgot', otpLimiter)

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))
app.use('/api/auth', authRouter)
app.use('/api/news', newsRouter)
app.use('/api/ipo', ipoRouter)
app.use('/api/admin', adminRouter)
app.use('/api/reco', recoRouter)
app.use('/api/quiz', quizRouter)
app.use('/api/progress', progressRouter)

app.use((err, _req, res, _next) => {
  console.error('[error]', err)
  res.status(500).json({ error: 'Something broke on our side.' })
})

const port = process.env.PORT || 5050
connectDB()
  .then(() => app.listen(port, () => console.log(`[server] http://localhost:${port}`)))
  .catch((err) => {
    console.error('[startup]', err.message)
    process.exit(1)
  })
