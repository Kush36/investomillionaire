// Run with: node --test test/
//
// The one rule this file guards: sendOtp never throws and never hangs. A mail
// outage used to bubble out of the Ethereal fallback as an unhandled rejection,
// which turned every signup into a two minute wait and then a 500.
import { test } from 'node:test'
import assert from 'node:assert/strict'

let bust = 0
// The module reads its key once at load, so each case needs a fresh instance.
async function loadMailer(apiKey) {
  process.env.MAIL_TIMEOUT_MS = '50'
  if (apiKey) process.env.RESEND_API_KEY = apiKey
  else delete process.env.RESEND_API_KEY
  bust += 1
  return import(`../src/lib/mailer.js?case=${bust}`)
}

test('no key configured: reports it and does not throw', async () => {
  const { sendOtp, mailerReady } = await loadMailer(null)
  assert.equal(mailerReady, false)
  const result = await sendOtp('someone@example.com', '123456', 'signup')
  assert.deepEqual(result, { delivered: false, reason: 'not-configured' })
})

test('successful send reports delivered', async () => {
  const { sendOtp, mailerReady } = await loadMailer('re_test_key')
  assert.equal(mailerReady, true)
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 })
  assert.deepEqual(await sendOtp('someone@example.com', '123456', 'signup'), { delivered: true })
})

test('provider rejection is reported, not thrown', async () => {
  const { sendOtp } = await loadMailer('re_test_key')
  globalThis.fetch = async () => new Response('domain is not verified', { status: 403 })
  const result = await sendOtp('someone@example.com', '123456', 'reset')
  assert.equal(result.delivered, false)
  assert.equal(result.reason, 'http-403')
})

test('network failure is reported, not thrown', async () => {
  const { sendOtp } = await loadMailer('re_test_key')
  globalThis.fetch = async () => { throw new Error('connect ECONNREFUSED') }
  const result = await sendOtp('someone@example.com', '123456', 'signup')
  assert.deepEqual(result, { delivered: false, reason: 'network' })
})

test('a hanging provider gives up instead of blocking the request', async () => {
  const { sendOtp } = await loadMailer('re_test_key')
  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      // Mirror what fetch does when the AbortSignal fires.
      options.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        reject(err)
      })
    })
  const result = await sendOtp('someone@example.com', '123456', 'signup')
  assert.deepEqual(result, { delivered: false, reason: 'timeout' })
})
