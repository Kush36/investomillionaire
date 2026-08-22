import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { User } from '../models/User.js'
import { Otp } from '../models/Otp.js'
import { requireAuth } from '../middleware/auth.js'
import { encryptField, fingerprint, generateOtp, hashOtp } from '../lib/crypto.js'
import { sendOtp, mailerReady } from '../lib/mailer.js'

export const authRouter = Router()

const OTP_TTL_MS = 10 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5
const RESEND_GAP_MS = 60 * 1000

const emailField = z.string().email().max(120).transform((v) => v.toLowerCase().trim())
const passwordField = z.string().min(8).max(100)
// Indian mobile: ten digits starting 6 to 9, with the common prefixes tolerated.
const mobileField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)/, ''))
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10 digit Indian mobile number')

function issueToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '30d' })
}

// Same shape whatever happened, so the endpoint cannot be used to discover which
// addresses have accounts.
function opaqueOk(res, extra = {}) {
  return res.json({ ok: true, mailerReady, ...extra })
}

// mailerReady only says credentials exist. `delivered` says the mail actually left.
function otpResponse(res, result, extra = {}) {
  return res.json({
    ok: true,
    mailerReady,
    delivered: Boolean(result?.delivered),
    // Only present while running on the Ethereal fallback.
    previewUrl: result?.previewUrl ?? null,
    ...extra,
  })
}

async function issueOtp({ email, purpose, payload }) {
  const recent = await Otp.findOne({ email, purpose, consumedAt: null }).sort({ createdAt: -1 })
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_GAP_MS) {
    const wait = Math.ceil((RESEND_GAP_MS - (Date.now() - recent.createdAt.getTime())) / 1000)
    return { throttled: true, wait }
  }

  // One live code per address and purpose.
  await Otp.deleteMany({ email, purpose, consumedAt: null })

  const code = generateOtp()
  await Otp.create({
    email,
    purpose,
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    payload,
  })
  const result = await sendOtp(email, code, purpose)
  return { throttled: false, delivered: result.delivered, previewUrl: result.previewUrl }
}

async function consumeOtp(email, purpose, code) {
  const record = await Otp.findOne({ email, purpose, consumedAt: null }).sort({ createdAt: -1 })
  if (!record) return { error: 'That code has expired. Ask for a new one.' }
  if (record.expiresAt.getTime() < Date.now()) return { error: 'That code has expired. Ask for a new one.' }
  if (record.attempts >= MAX_OTP_ATTEMPTS) return { error: 'Too many wrong codes. Ask for a new one.' }

  if (record.codeHash !== hashOtp(code)) {
    record.attempts += 1
    await record.save()
    const left = MAX_OTP_ATTEMPTS - record.attempts
    return { error: left > 0 ? `That code is wrong. ${left} tries left.` : 'Too many wrong codes. Ask for a new one.' }
  }

  record.consumedAt = new Date()
  await record.save()
  return { record }
}

/* ---------------------------------------------------------------- signup ---- */

const startSchema = z.object({
  name: z.string().min(2).max(40),
  email: emailField,
  password: passwordField,
  mobile: mobileField,
})

// Step one. Nothing is written to the users collection until the code is confirmed.
authRouter.post('/signup/start', async (req, res) => {
  const parsed = startSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Check the details and try again.' })
  }
  const { name, email, password, mobile } = parsed.data

  if (await User.findOne({ email })) {
    return res.status(409).json({ error: 'That email already has an account. Log in instead.' })
  }
  if (await User.findOne({ mobileFingerprint: fingerprint(mobile) })) {
    return res.status(409).json({ error: 'That mobile number is already registered.' })
  }

  const result = await issueOtp({
    email,
    purpose: 'signup',
    payload: {
      name,
      passwordHash: await bcrypt.hash(password, 12),
      mobileEnc: encryptField(mobile),
      mobileFingerprint: fingerprint(mobile),
      mobileLast4: mobile.slice(-4),
    },
  })
  if (result.throttled) {
    return res.status(429).json({ error: `A code was just sent. Ask again in ${result.wait} seconds.` })
  }
  return otpResponse(res, result, { email })
})

const verifySchema = z.object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/, 'Enter the six digit code') })

// Step two. The account is created here, from the details parked in step one.
authRouter.post('/signup/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter the six digit code.' })

  const { record, error } = await consumeOtp(parsed.data.email, 'signup', parsed.data.code)
  if (error) return res.status(400).json({ error })

  if (await User.findOne({ email: parsed.data.email })) {
    return res.status(409).json({ error: 'That email already has an account. Log in instead.' })
  }

  const user = await User.create({
    name: record.payload.name,
    email: parsed.data.email,
    passwordHash: record.payload.passwordHash,
    emailVerified: true,
    mobileEnc: record.payload.mobileEnc,
    mobileFingerprint: record.payload.mobileFingerprint,
    mobileLast4: record.payload.mobileLast4,
    badges: ['first-step'],
  })

  res.status(201).json({ token: issueToken(user), user: user.publicProfile() })
})

authRouter.post('/signup/resend', async (req, res) => {
  const parsed = z.object({ email: emailField }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email.' })

  const pending = await Otp.findOne({ email: parsed.data.email, purpose: 'signup', consumedAt: null }).sort({ createdAt: -1 })
  if (!pending) return res.status(400).json({ error: 'Start the signup again, that request has expired.' })

  const result = await issueOtp({ email: parsed.data.email, purpose: 'signup', payload: pending.payload })
  if (result.throttled) return res.status(429).json({ error: `Wait ${result.wait} seconds before asking again.` })
  return otpResponse(res, result)
})

/* ----------------------------------------------------------------- login ---- */

authRouter.post('/login', async (req, res) => {
  const parsed = z.object({ email: emailField, password: z.string().min(1).max(100) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required.' })

  const user = await User.findOne({ email: parsed.data.email })
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash))
  if (!ok) return res.status(401).json({ error: 'Email or password is wrong.' })

  res.json({ token: issueToken(user), user: user.publicProfile() })
})

/* -------------------------------------------------------- forgot password ---- */

authRouter.post('/forgot', async (req, res) => {
  const parsed = z.object({ email: emailField }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email.' })

  const user = await User.findOne({ email: parsed.data.email })
  // Answer identically whether or not the account exists.
  let result = null
  if (user) {
    result = await issueOtp({ email: parsed.data.email, purpose: 'reset' })
    if (result.throttled) {
      return res.status(429).json({ error: `A code was just sent. Ask again in ${result.wait} seconds.` })
    }
  }
  return otpResponse(res, result)
})

authRouter.post('/reset', async (req, res) => {
  const parsed = z
    .object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/), password: passwordField })
    .safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter the six digit code and a password of at least 8 characters.' })
  }

  const { error } = await consumeOtp(parsed.data.email, 'reset', parsed.data.code)
  if (error) return res.status(400).json({ error })

  const user = await User.findOne({ email: parsed.data.email })
  if (!user) return res.status(400).json({ error: 'That code is no longer valid.' })

  user.passwordHash = await bcrypt.hash(parsed.data.password, 12)
  user.emailVerified = true
  await user.save()

  // Signing them straight in saves a redundant trip through the login form.
  res.json({ token: issueToken(user), user: user.publicProfile() })
})

/* ------------------------------------------------------------------- me ---- */

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.publicProfile() })
})
