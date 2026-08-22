import nodemailer from 'nodemailer'

// Works without SMTP configured: the code is printed to the server log instead of
// being sent, so signup and reset are testable on a laptop with no mail account.
const configured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)

const transport = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null

export const mailerReady = configured

// When real SMTP is missing or broken, fall back to an auto-created Ethereal
// mailbox. Nothing reaches the recipient's real inbox, but the message is
// genuinely sent and comes back with a preview URL, so the flow is fully usable
// and the template renders exactly as it will in production.
let etherealTransport = null
let etherealFailed = false

async function ethereal() {
  if (etherealTransport || etherealFailed) return etherealTransport
  try {
    const account = await nodemailer.createTestAccount()
    etherealTransport = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    })
    console.log('[mail] using an Ethereal test mailbox. Real inbox delivery needs SMTP_PASS.')
  } catch (err) {
    etherealFailed = true
    console.error('[mail] could not reach Ethereal:', err.message)
  }
  return etherealTransport
}

async function viaEthereal(email, code, purpose, heading, reason) {
  const transport = await ethereal()
  if (!transport) {
    console.log(`[mail] OTP for ${email} (${purpose}) is ${code}`)
    return { delivered: false, reason: 'no-transport' }
  }
  const info = await transport.sendMail({
    from: FROM,
    to: email,
    subject: purpose === 'reset' ? 'Your password reset code' : 'Your verification code',
    html: template(heading, code, reason),
    text: `${heading}\n\nYour code is ${code}. It expires in 10 minutes.`,
  })
  const previewUrl = nodemailer.getTestMessageUrl(info)
  console.log(`[mail] OTP for ${email} (${purpose}) is ${code} | preview: ${previewUrl}`)
  return { delivered: false, preview: true, previewUrl }
}

const FROM = process.env.SMTP_FROM || `InvestoMillionaire <${process.env.SMTP_USER || 'investomillionaire@gmail.com'}>`

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

export async function sendOtp(email, code, purpose) {
  const heading = purpose === 'reset' ? 'Reset your password' : 'Confirm your email'
  const reason =
    purpose === 'reset'
      ? 'Enter this code on the reset screen to choose a new password.'
      : 'Enter this code to finish creating your account.'

  if (!transport) {
    return viaEthereal(email, code, purpose, heading, reason)
  }

  try {
    await transport.sendMail({
      from: FROM,
      to: email,
      subject: purpose === 'reset' ? 'Your password reset code' : 'Your verification code',
      html: template(heading, code, reason),
      text: `${heading}\n\nYour code is ${code}. It expires in 10 minutes.`,
    })
    return { delivered: true }
  } catch (err) {
    // Credentials wrong, quota hit, Gmail down. Falling back to the log keeps
    // signup and reset working instead of returning a 500 to the user.
    console.error(`[mail] send failed for ${email}: ${err.message.split('\n')[0]}`)
    return viaEthereal(email, code, purpose, heading, reason)
  }
}
