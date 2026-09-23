import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'
import Logo from '../components/Logo.jsx'
import Notice from '../components/Notice.jsx'
import { useAuth } from '../lib/store.js'
import Seo from '../components/Seo.jsx'

// 17px, not 14px. A sign-up form set at 14px is the reason iOS zooms the
// viewport the moment a field takes focus, and a form that jumps when you touch
// it is the single least trustworthy thing a finance site can do on a phone.
//
// No focus:ring-accent, and no outline-none. outline-none is what forced the
// hand-rolled ring in the first place; without it the sheet's one focus
// treatment applies here like it does everywhere else, which is the point of
// having one.
const inputClass =
  'well w-full px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--text-body)] text-ink transition placeholder:text-ink-3'

// One filled mulberry button per step, and never two on a screen. Every other
// control in this file is ink on canvas.
const submitClass =
  'flex w-full items-center justify-center gap-2 rounded-md bg-accent py-[var(--space-2)] text-[length:var(--text-body)] text-canvas transition hover:opacity-90 disabled:opacity-50'

const quietClass = 'flex w-full items-center justify-center gap-1.5 text-sm text-ink-3 transition hover:text-ink'

function CodeInput({ value, onChange, onComplete }) {
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  // The six progress dashes underneath this field are gone. They restated, in
  // mulberry, what the six digits above them already showed.
  return (
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
      className="well w-full px-[var(--space-3)] py-[var(--space-3)] text-center font-mono text-3xl tracking-[0.5em] text-ink transition placeholder:text-ink-3"
    />
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
    <div className="mt-[var(--space-4)] text-center">
      {seconds > 0 ? (
        <p className="readout text-[length:var(--text-micro)] text-ink-3">You can ask for another code in {seconds}s</p>
      ) : (
        <button onClick={resend} disabled={busy} className="text-sm text-ink-2 underline underline-offset-4 transition hover:text-ink disabled:opacity-50">
          {busy ? 'Sending…' : 'Send another code'}
        </button>
      )}
      {note && <p className="mt-[var(--space-1)] text-[length:var(--text-small)] text-ink-2">{note}</p>}
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
      // mailerReady describes the server, not the address, so it is safe to branch
      // on. `delivered` describes one address and the reset endpoint no longer
      // returns it, because knowing whether a code went out is knowing whether the
      // account exists.
      setNotice(
        res.mailerReady
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

  // Five hand-rolled error boxes collapse into the shared Notice. One recipe for
  // a message that has to be read is worth more than five that nearly match.
  const errorNotice = error ? <Notice tone="loss">{error}</Notice> : null

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-[var(--space-7)]">
      <Seo title="Sign in" description="Create a free account to save your XP, streak and level progress." noindex />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="panel w-full p-[var(--space-5)]">
        <div className="flex justify-center">
          <Logo size="lg" withText={false} />
        </div>

        {/* No display serif on this page: the wordmark already carries it, and a
            five-word step heading set at 48px inside a 448px card wraps to three
            lines. Hierarchy comes from the space above it instead. */}
        <h1 className="mt-[var(--space-4)] text-center text-[length:var(--text-heading)] text-ink">{heading}</h1>
        <p className="mt-[var(--space-1)] text-center text-[length:var(--text-small)] leading-relaxed text-ink-2">{sub}</p>

        {notice && (
          <Notice tone="info" className="mt-[var(--space-4)]">
            {notice}
          </Notice>
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
              <form onSubmit={onLogin} className="mt-[var(--space-5)] space-y-[var(--space-2)]">
                <input {...field('email')} type="email" placeholder="Email" required autoComplete="email" className={inputClass} />
                <input {...field('password')} type="password" placeholder="Password" required autoComplete="current-password" className={inputClass} />
                {errorNotice}
                <button type="submit" disabled={busy} className={submitClass}>
                  {busy && <Loader2 size={16} className="animate-spin" />} Log in
                </button>
                <button type="button" onClick={() => go('forgot')} className={`${quietClass} pt-[var(--space-1)]`}>
                  Forgot your password?
                </button>
              </form>
            )}

            {step === 'signup' && (
              <form onSubmit={onSignupStart} className="mt-[var(--space-5)] space-y-[var(--space-2)]">
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
                {errorNotice}
                <button type="submit" disabled={busy} className={submitClass}>
                  {busy && <Loader2 size={16} className="animate-spin" />} Send verification code
                </button>
                {/* Was 11px ink-3. The sentence that explains what happens to a
                    stranger's mobile number is the one line on this page most
                    worth reading, so it is set at the small size in ink-2 rather
                    than filed away at the bottom in grey. */}
                <p className="flex items-start gap-[var(--space-1)] pt-[var(--space-1)] text-[length:var(--text-small)] leading-relaxed text-ink-2">
                  <ShieldCheck size={14} className="mt-1 shrink-0 text-ink-3" aria-hidden="true" />
                  Your mobile number is stored encrypted, is never shown on the site, and is never shared. We use it only
                  to reach you about your account.
                </p>
              </form>
            )}

            {step === 'verify' && (
              <div className="mt-[var(--space-5)] space-y-[var(--space-2)]">
                <CodeInput value={code} onChange={setCode} onComplete={onVerify} />
                {errorNotice}
                <button onClick={() => onVerify()} disabled={busy || code.length !== 6} className={submitClass}>
                  {busy && <Loader2 size={16} className="animate-spin" />} Verify and create account
                </button>
                <Resend onResend={() => resendSignupCode(form.email)} />
                <button onClick={() => go('signup')} className={`${quietClass} pt-[var(--space-1)]`}>
                  <ArrowLeft size={14} aria-hidden="true" /> Change details
                </button>
              </div>
            )}

            {step === 'forgot' && (
              <form onSubmit={onForgot} className="mt-[var(--space-5)] space-y-[var(--space-2)]">
                <input {...field('email')} type="email" placeholder="Email" required autoComplete="email" className={inputClass} />
                {errorNotice}
                <button type="submit" disabled={busy} className={submitClass}>
                  {busy && <Loader2 size={16} className="animate-spin" />} Send reset code
                </button>
                <button type="button" onClick={() => go('login')} className={`${quietClass} pt-[var(--space-1)]`}>
                  <ArrowLeft size={14} aria-hidden="true" /> Back to log in
                </button>
              </form>
            )}

            {step === 'reset' && (
              <form onSubmit={onReset} className="mt-[var(--space-5)] space-y-[var(--space-2)]">
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
                {errorNotice}
                <button type="submit" disabled={busy || code.length !== 6} className={submitClass}>
                  {busy && <Loader2 size={16} className="animate-spin" />} Set new password
                </button>
                <Resend onResend={() => forgot(form.email)} />
                <button type="button" onClick={() => go('login')} className={`${quietClass} pt-[var(--space-1)]`}>
                  <ArrowLeft size={14} aria-hidden="true" /> Back to log in
                </button>
              </form>
            )}
          </motion.div>
        </AnimatePresence>

        {(step === 'login' || step === 'signup') && (
          <p className="mt-[var(--space-4)] text-center text-[length:var(--text-small)] text-ink-2">
            {step === 'signup' ? 'Already have an account? ' : 'New here? '}
            <button onClick={() => go(step === 'signup' ? 'login' : 'signup')} className="text-ink underline underline-offset-4">
              {step === 'signup' ? 'Log in' : 'Create one'}
            </button>
          </p>
        )}
      </motion.div>

      {/* Moved out of the card and onto the canvas. Inside the panel it was a
          fourth grey paragraph under the fold of a form; out here it is the last
          thing on the page and it sits at its own measure, which is what
          "legible rather than hidden" means for a compliance line. */}
      <p className="mt-[var(--space-4)] max-w-[var(--measure)] text-[length:var(--text-small)] leading-relaxed text-ink-2">
        Educational content only. InvestoMillionaire is not a SEBI registered adviser and gives no investment advice.{' '}
        <Link to="/disclaimer" className="text-ink underline underline-offset-4">
          Read the disclaimer
        </Link>
      </p>
    </div>
  )
}
