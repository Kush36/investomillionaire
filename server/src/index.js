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
import { analyzeRouter } from './routes/analyze.js'

const app = express()
app.set('trust proxy', 1)
// Vercel mints a fresh preview URL on every deployment, so an allow-list of
// exact strings goes stale constantly. Named origins are matched exactly, and
// this project's own *.vercel.app deployments are allowed by pattern.
const allowed = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin, curl and server-to-server requests send no Origin header.
      if (!origin) return callback(null, true)
      if (allowed.includes(origin)) return callback(null, true)
      if (VERCEL_PREVIEW.test(origin)) return callback(null, true)
      // Do not throw. Throwing turns a blocked origin into a 500 that looks
      // like the API is down; omitting the header is the browser's cue that
      // the origin is not permitted.
      return callback(null, false)
    },
    credentials: false,
  })
)
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

// Every other route here serves a cached feed. One analyzer report costs up to three
// candle series and a dozen XBRL fetches against NSE and Upstox, neither of which
// publishes a quota, so the budget is set by what this server can afford to ask of
// them rather than by what a reader can afford to read. Twelve a minute is a person
// working through a watchlist; the general 120 is a scraper.
app.use(
  '/api/analyze',
  rateLimit({
    windowMs: 60_000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Analyzer requests are limited to twelve a minute. Try again shortly.' },
    // The watchlist sits under /api/analyze but costs nothing outbound: it reads the
    // signed-in user's own document and looks an ISIN up in the equity list already
    // cached for the day. Counting it against the report budget would mean somebody
    // adding a dozen companies could not then read a single one of them. The general
    // 120-a-minute limiter above still covers these.
    skip: (req) => req.path === '/watchlist' || req.path.startsWith('/watchlist/'),
  })
)

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))
app.use('/api/auth', authRouter)
app.use('/api/news', newsRouter)
app.use('/api/ipo', ipoRouter)
app.use('/api/admin', adminRouter)
app.use('/api/reco', recoRouter)
app.use('/api/quiz', quizRouter)
app.use('/api/progress', progressRouter)
app.use('/api/analyze', analyzeRouter)

app.use((err, _req, res, next) => {
  console.error('[error]', err)
  // /auth/forgot answers before it finishes working, so a handler can fail with the
  // reply already on the wire. Writing a second one throws ERR_HTTP_HEADERS_SENT and
  // loses the original error; handing it back lets Express close the socket.
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Something broke on our side.' })
})

const port = process.env.PORT || 5050
connectDB()
  .then(() => app.listen(port, () => console.log(`[server] http://localhost:${port}`)))
  .catch((err) => {
    console.error('[startup]', err.message)
    process.exit(1)
  })
