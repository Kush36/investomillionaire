import 'dotenv/config'
import { sendOtp, mailerReady } from '../lib/mailer.js'

// node src/scripts/mailtest.js you@example.com
const to = process.argv[2]

if (!mailerReady) {
  console.error('RESEND_API_KEY is not set. Add it to server/.env first.')
  process.exit(1)
}
if (!to) {
  console.error('Pass a recipient: node src/scripts/mailtest.js you@example.com')
  process.exit(1)
}

const result = await sendOtp(to, '123456', 'signup')
if (result.delivered) {
  console.log(`Sent. Check the inbox for ${to}.`)
  process.exit(0)
}

console.error(`Not delivered (${result.reason}).`)
if (result.reason === 'http-403') {
  console.error('Resend refuses a From address on an unverified domain. Verify the domain, then set MAIL_FROM to an address on it.')
}
process.exit(1)
