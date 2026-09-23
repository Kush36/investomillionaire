// Mail goes out over Resend's HTTPS API rather than SMTP. Render blocks outbound
// traffic on ports 25, 465 and 587 for free instances, so an SMTP transport there
// hangs until the socket times out and then fails. HTTPS is not blocked.
const ENDPOINT = 'https://api.resend.com/emails'
// Overridable so the timeout path is testable without a ten second wait.
const TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS) || 10_000

const apiKey = process.env.RESEND_API_KEY || ''

// The address has to be on a domain verified in Resend. Sending as a gmail.com
// address will be rejected.
const FROM = process.env.MAIL_FROM || 'InvestoMillionaire <no-reply@investomillionaire.com>'

export const mailerReady = Boolean(apiKey)

function template(heading, code, reason) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#050a16;padding:40px 24px;color:#e8edf7">
    <div style="max-width:480px;margin:0 auto;background:#0a1224;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:36px">
      <p style="margin:0;font-size:12px;letter-spacing:3px;color:#eaa81e;text-transform:uppercase">InvestoMillionaire</p>
      <h1 style="margin:16px 0 8px;font-size:24px;color:#fff">${heading}</h1>
      <p style="margin:0 0 28px;color:rgba(232,237,247,0.6);line-height:1.6">${reason}</p>
      <div style="background:rgba(234,168,30,0.12);border:1px solid rgba(234,168,30,0.3);border-radius:14px;padding:20px;text-align:center">
        <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#eaa81e">${code}</span>
      </div>
      <p style="margin:24px 0 0;font-size:13px;color:rgba(232,237,247,0.45);line-height:1.6">
        This code expires in 10 minutes. If you did not ask for it, ignore this email and nothing changes.
        We will never ask you for this code on a call or a chat.
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:rgba(232,237,247,0.3)">
        InvestoMillionaire is an educational site and is not a SEBI registered adviser.
      </p>
    </div>
  </div>`
}

// Never throws. A caller that cannot send mail still has to answer the browser,
// and a mail outage must not turn signup into a 500.
export async function sendOtp(email, code, purpose) {
  const heading = purpose === 'reset' ? 'Reset your password' : 'Confirm your email'
  const reason =
    purpose === 'reset'
      ? 'Enter this code on the reset screen to choose a new password.'
      : 'Enter this code to finish creating your account.'

  // No key on a laptop is the normal case. Print the code so signup and reset stay
  // testable without a mail account.
  if (!apiKey) {
    console.log(`[mail] not configured. OTP for ${email} (${purpose}) is ${code}`)
    return { delivered: false, reason: 'not-configured' }
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        subject: purpose === 'reset' ? 'Your password reset code' : 'Your verification code',
        html: template(heading, code, reason),
        text: `${heading}\n\nYour code is ${code}. It expires in 10 minutes.`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[mail] Resend responded ${res.status} for ${email}: ${body.slice(0, 200)}`)
      return { delivered: false, reason: `http-${res.status}` }
    }
    return { delivered: true }
  } catch (err) {
    // Timeout, DNS, TLS. The code is already stored, the caller decides what to do.
    console.error(`[mail] send failed for ${email}: ${err.message}`)
    return { delivered: false, reason: err.name === 'TimeoutError' ? 'timeout' : 'network' }
  }
}
