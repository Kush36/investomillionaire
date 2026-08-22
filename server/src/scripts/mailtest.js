import 'dotenv/config'
import { sendOtp, mailerReady } from '../lib/mailer.js'

// node src/scripts/mailtest.js you@example.com
const to = process.argv[2] || process.env.SMTP_USER

if (!mailerReady) {
  console.error('SMTP is not configured. Set SMTP_USER and SMTP_PASS in server/.env first.')
  process.exit(1)
}
if (!to) {
  console.error('Pass a recipient: node src/scripts/mailtest.js you@example.com')
  process.exit(1)
}

try {
  const result = await sendOtp(to, '123456', 'signup')
  console.log(result.delivered ? `Sent. Check the inbox for ${to}.` : 'Not delivered.')
} catch (err) {
  console.error('Send failed:', err.message)
  if (/Username and Password not accepted|BadCredentials|Invalid login/i.test(err.message)) {
    console.error('Gmail rejected the credentials. Use a 16 character App Password, not the account password.')
  }
  process.exit(1)
}
