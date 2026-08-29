import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowLeft, MailCheck, ShieldCheck } from 'lucide-react'
import Logo from '../components/Logo.jsx'
import { useAuth } from '../lib/store.js'
import Seo from '../components/Seo.jsx'

const inputClass =
  'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm outline-none transition placeholder:text-white/30 focus:border-gold/50'

function CodeInput({ value, onChange, onComplete }) {
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div>
      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
          onChange(digits)
          if (digits.length === 6) onComplete?.(digits)
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        aria-label="Six digit code"
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center font-mono text-3xl tracking-[0.5em] outline-none transition placeholder:text-white/15 focus:border-gold/50"
      />
      <div className="mt-3 flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className={`h-1 w-8 rounded-full transition ${i < value.length ? 'bg-gold' : 'bg-white/10'}`}
          />
        ))}
      </div>
    </div>
  )
}

function Resend({ onResend }) {
  const [seconds, setSeconds] = useState(60)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (seconds <= 0) return
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [seconds])

  async function resend() {
    setBusy(true)
    setNote('')
    try {
      await onResend()
      setSeconds(60)
      setNote('A new code is on its way.')
    } catch (err) {
      setNote(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 text-center">
      {seconds > 0 ? (
        <p className="font-mono text-xs text-white/35">You can ask for another code in {seconds}s</p>
      ) : (
        <button onClick={resend} disabled={busy} className="text-sm font-semibold text-gold hover:underline disabled:opacity-50">
          {busy ? 'Sending…' : 'Send another code'}
        </button>
      )}
      {note && <p className="mt-2 text-xs text-white/50">{note}</p>}
    </div>
  )
}

export default function Auth() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { signupStart, signupVerify, resendSignupCode, login, forgot, resetPassword } = useAuth()

  const requested = params.get('mode')
  const next = params.get('next') || '/dashboard'

  // login | signup | verify | forgot | reset
  const [step, setStep] = useState(requested === 'signup' ? 'signup' : requested === 'forgot' ? 'forgot' : 'login')
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '' })
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  })

  function go(nextStep) {
    setError('')
    setNotice('')
    setCode('')
    setStep(nextStep)
  }

  async function run(fn) {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onLogin = (e) => {
    e.preventDefault()
    run(async () => {
      await login({ email: form.email, password: form.password })
      navigate(next, { replace: true })
    })
  }

  const onSignupStart = (e) => {
    e.preventDefault()
    run(async () => {
      const res = await signupStart(form)
      setNotice(
        res.delivered
          ? `We sent a six digit code to ${form.email}.`
          : 'Email is not configured on this server, so the code was written to the server log.'
      )
      setStep('verify')
    })
  }

  const onVerify = (submitted) => {
    const value = typeof submitted === 'string' ? submitted : code
    run(async () => {
      await signupVerify({ email: form.email, code: value })
      navigate(next, { replace: true })
    })
  }

  const onForgot = (e) => {
    e.preventDefault()
    run(async () => {
      const res = await forgot(form.email)
      setNotice(
        res.delivered
          ? `If that address has an account, a reset code is on its way to ${form.email}.`
          : 'Email is not configured on this server, so the code was written to the server log.'
      )
      setStep('reset')
    })
  }

  const onReset = (e) => {
    e.preventDefault()
    run(async () => {
      await resetPassword({ email: form.email, code, password: newPassword })
      navigate('/dashboard', { replace: true })
    })
  }

  const HEADINGS = {
    login: ['Welcome back', 'Pick up where you left off.'],
    signup: ['Create your account', 'Free forever. Your XP, streak and level progress get saved.'],
    verify: ['Check your email', `Enter the six digit code we sent to ${form.email}.`],
    forgot: ['Forgot your password', 'Enter your email and we will send a reset code.'],
    reset: ['Choose a new password', 'Enter the code from your email and a new password.'],
  }
  const [heading, sub] = HEADINGS[step]

  return (
    <div className="relative mx-auto flex min-h-[80vh] max-w-md items-center px-4 py-12">
      <Seo title="Sign in" description="Create a free account to save your XP, streak and level progress." noindex />
      <div className="absolute top-10 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass relative w-full rounded-3xl p-8">
        <div className="flex justify-center">
          <Logo size="lg" withText={false} />
        </div>

        <h1 className="mt-6 text-center text-3xl font-extrabold">{heading}</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-white/50">{sub}</p>

        {notice && (
          <div className="mt-5 rounded-xl bg-mint/10 px-4 py-3 text-sm text-mint">
            <p className="flex items-start gap-2">
              <MailCheck size={15} className="mt-0.5 shrink-0" />
              {notice}
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
          >
            {step === 'login' && (
              <form onSubmit={onLogin} className="mt-7 space-y-3">
                <input {...field('email')} type="email" placeholder="Email" required autoComplete="email" className={inputClass} />
                <input {...field('password')} type="password" placeholder="Password" required autoComplete="current-password" className={inputClass} />
                {error && <p className="rounded-xl bg-flame/10 px-4 py-3 text-sm text-flame">{error}</p>}
                <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-3.5 font-bold text-ink transition hover:bg-gold-soft disabled:opacity-60">
                  {busy && <Loader2 size={16} className="animate-spin" />} Log in
                </button>
                <button type="button" onClick={() => go('forgot')} className="w-full pt-1 text-center text-sm text-white/50 transition hover:text-gold">
                  Forgot your password?
                </button>
              </form>
            )}

            {step === 'signup' && (
              <form onSubmit={onSignupStart} className="mt-7 space-y-3">
                <input {...field('name')} placeholder="Your name" required minLength={2} maxLength={40} className={inputClass} />
                <input {...field('email')} type="email" placeholder="Email" required autoComplete="email" className={inputClass} />
                <input
                  {...field('mobile')}
                  type="tel"
                  placeholder="Mobile number (10 digits)"
                  required
                  inputMode="numeric"
                  autoComplete="tel"
                  className={inputClass}
                />
                <input {...field('password')} type="password" placeholder="Password (8+ characters)" required minLength={8} autoComplete="new-password" className={inputClass} />
                {error && <p className="rounded-xl bg-flame/10 px-4 py-3 text-sm text-flame">{error}</p>}
                <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-3.5 font-bold text-ink transition hover:bg-gold-soft disabled:opacity-60">
                  {busy && <Loader2 size={16} className="animate-spin" />} Send verification code
                </button>
                <p className="flex items-start gap-2 pt-1 text-[11px] leading-relaxed text-white/35">
                  <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                  Your mobile number is stored encrypted, is never shown on the site, and is never shared. We use it only
                  to reach you about your account.
                </p>
              </form>
            )}

            {step === 'verify' && (
              <div className="mt-7">
                <CodeInput value={code} onChange={setCode} onComplete={onVerify} />
                {error && <p className="mt-4 rounded-xl bg-flame/10 px-4 py-3 text-sm text-flame">{error}</p>}
                <button
                  onClick={() => onVerify()}
                  disabled={busy || code.length !== 6}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-3.5 font-bold text-ink transition hover:bg-gold-soft disabled:opacity-40"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />} Verify and create account
                </button>
                <Resend onResend={() => resendSignupCode(form.email)} />
                <button onClick={() => go('signup')} className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm text-white/45 transition hover:text-white">
                  <ArrowLeft size={14} /> Change details
                </button>
              </div>
            )}

            {step === 'forgot' && (
              <form onSubmit={onForgot} className="mt-7 space-y-3">
                <input {...field('email')} type="email" placeholder="Email" required autoComplete="email" className={inputClass} />
                {error && <p className="rounded-xl bg-flame/10 px-4 py-3 text-sm text-flame">{error}</p>}
                <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-3.5 font-bold text-ink transition hover:bg-gold-soft disabled:opacity-60">
                  {busy && <Loader2 size={16} className="animate-spin" />} Send reset code
                </button>
                <button type="button" onClick={() => go('login')} className="flex w-full items-center justify-center gap-1.5 pt-1 text-sm text-white/45 transition hover:text-white">
                  <ArrowLeft size={14} /> Back to log in
                </button>
              </form>
            )}

            {step === 'reset' && (
              <form onSubmit={onReset} className="mt-7 space-y-4">
                <CodeInput value={code} onChange={setCode} />
                <input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type="password"
                  placeholder="New password (8+ characters)"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputClass}
                />
                {error && <p className="rounded-xl bg-flame/10 px-4 py-3 text-sm text-flame">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-3.5 font-bold text-ink transition hover:bg-gold-soft disabled:opacity-40">
                  {busy && <Loader2 size={16} className="animate-spin" />} Set new password
                </button>
                <Resend onResend={() => forgot(form.email)} />
                <button type="button" onClick={() => go('login')} className="flex w-full items-center justify-center gap-1.5 text-sm text-white/45 transition hover:text-white">
                  <ArrowLeft size={14} /> Back to log in
                </button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>

        {(step === 'login' || step === 'signup') && (
          <p className="mt-6 text-center text-sm text-white/50">
            {step === 'signup' ? 'Already have an account? ' : 'New here? '}
            <button onClick={() => go(step === 'signup' ? 'login' : 'signup')} className="font-semibold text-gold hover:underline">
              {step === 'signup' ? 'Log in' : 'Create one'}
            </button>
          </p>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/30">
          Educational content only. InvestoMillionaire is not a SEBI registered adviser and gives no investment advice.{' '}
          <Link to="/disclaimer" className="underline hover:text-white/50">
            Read the disclaimer
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
