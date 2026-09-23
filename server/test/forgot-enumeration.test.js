// Run with: node --test test/
//
// One rule, four ways it used to break. POST /auth/forgot has to answer identically
// whether or not the submitted address has an account, because anyone can submit any
// address. It gave the answer away through the `delivered` flag, through a 429 when a
// code had just been sent, through a 502 when the mail provider was down, and through
// the several hundred milliseconds an awaited send added for registered addresses
// only. Each of those gets a case below.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// mailer.js reads RESEND_API_KEY once, at module load, so the environment has to be
// set before the import graph runs. Static imports hoist above this, which is why
// these are dynamic.
process.env.JWT_SECRET = 'forgot-enumeration-test'
process.env.RESEND_API_KEY = 're_test_key'

const express = (await import('express')).default
const { authRouter } = await import('../src/routes/auth.js')
const { User } = await import('../src/models/User.js')
const { Otp } = await import('../src/models/Otp.js')

const realFetch = globalThis.fetch.bind(globalThis)

// Stands in for Resend. The delay is deliberately long: if the handler ever goes back
// to awaiting the send, the last test fails on the clock rather than on the body.
const MAIL_LATENCY_MS = 300
let mailStatus = 200
globalThis.fetch = (url, options) => {
  if (String(url).includes('api.resend.com')) {
    // Read the status now, not when the timer fires. The send outlives the response
    // it was triggered by, so a case that restores this on its way out would other-
    // wise have its value read instead, and the failure path would never run.
    const status = mailStatus
    return new Promise((resolve) =>
      setTimeout(() => resolve(new Response('{}', { status })), MAIL_LATENCY_MS)
    )
  }
  return realFetch(url, options)
}

const app = express()
app.use(express.json())
app.use('/api/auth', authRouter)
const server = app.listen(0)
const { port } = server.address()
test.after(() => server.close())

// No database in this suite. The handler only ever reaches these four statics, so
// swapping them out is cheaper and steadier than standing up Mongo.
let created = []
function stubDb({ accountExists, recentCode = false }) {
  created = []
  User.findOne = async () => (accountExists ? { _id: 'user-1' } : null)
  Otp.findOne = () => ({
    sort: async () => (recentCode ? { createdAt: new Date(), consumedAt: null } : null),
  })
  Otp.deleteMany = async () => ({})
  Otp.create = async (doc) => {
    created.push(doc)
    return { ...doc, createdAt: new Date(), deleteOne: async () => {} }
  }
}

// The reply now lands before the code is written, so anything asserting on the write
// has to give it a moment. Returns early as soon as the row shows up.
async function settled(attempts = 50) {
  for (let i = 0; i < attempts && created.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return created
}

async function forgot(email) {
  const startedAt = process.hrtime.bigint()
  const res = await realFetch(`http://127.0.0.1:${port}/api/auth/forgot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const body = await res.json()
  return { status: res.status, body, ms: Number(process.hrtime.bigint() - startedAt) / 1e6 }
}

// Every other case here asserts that two things look the same, which a handler that
// does nothing at all would also satisfy. This one holds the feature up.
test('a registered address is still actually sent a reset code', async () => {
  stubDb({ accountExists: true })
  await forgot('someone@example.com')
  const rows = await settled()

  assert.equal(rows.length, 1, 'no reset code was issued, so password reset is broken')
  assert.equal(rows[0].purpose, 'reset')
  assert.ok(rows[0].codeHash, 'the code was stored without a hash')
  assert.ok(rows[0].expiresAt > new Date(), 'the code was born expired')
})

test('an unregistered address is sent nothing', async () => {
  stubDb({ accountExists: false })
  await forgot('nobody@example.com')
  await new Promise((resolve) => setTimeout(resolve, 60))

  assert.deepEqual(created, [], 'a code was issued for an address with no account')
})

test('a registered address answers exactly like an unregistered one', async () => {
  stubDb({ accountExists: false })
  const absent = await forgot('nobody@example.com')
  stubDb({ accountExists: true })
  const present = await forgot('someone@example.com')

  assert.equal(present.status, 200)
  assert.equal(absent.status, present.status)
  assert.deepEqual(absent.body, present.body)
})

test('the reply carries no field that describes one address', async () => {
  stubDb({ accountExists: true })
  const { body } = await forgot('someone@example.com')

  assert.deepEqual(Object.keys(body).sort(), ['mailerReady', 'ok'])
  // mailerReady is a property of the server and reads the same for every caller.
  // `delivered` answered the attacker's question outright.
  assert.equal('delivered' in body, false)
})

test('a resend held back by the sixty second gap still looks like a fresh one', async () => {
  stubDb({ accountExists: true, recentCode: true })
  const heldBack = await forgot('someone@example.com')
  stubDb({ accountExists: false, recentCode: true })
  const absent = await forgot('nobody@example.com')

  assert.equal(heldBack.status, 200, 'a 429 here announces that the address is registered')
  assert.deepEqual(heldBack.body, absent.body)
})

test('a mail provider that is refusing mail still looks like one that is not', async () => {
  mailStatus = 403
  stubDb({ accountExists: true })
  const failed = await forgot('someone@example.com')
  stubDb({ accountExists: false })
  const absent = await forgot('nobody@example.com')
  mailStatus = 200

  assert.equal(failed.status, 200, 'a 502 here announces that the address is registered')
  assert.deepEqual(failed.body, absent.body)
})

// The probe that survived the first round of this fix. /forgot leaves a reset row
// behind only for registered addresses, and /reset used to read that back: "that code
// is wrong, 4 tries left" against "that code has expired".
test('a junk code at /reset cannot be used to read back what /forgot did', async () => {
  const reset = (email) =>
    realFetch(`http://127.0.0.1:${port}/api/auth/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: '000000', password: 'aaaaaaaa' }),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))

  // A live reset code exists, which is only ever true for a registered address.
  User.findOne = async () => ({ _id: 'user-1' })
  Otp.findOne = () => ({
    sort: async () => ({
      codeHash: 'not-the-hash-of-000000',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
      save: async () => {},
    }),
  })
  const registered = await reset('someone@example.com')

  // No row at all, which is what an unregistered address leaves behind.
  User.findOne = async () => null
  Otp.findOne = () => ({ sort: async () => null })
  const unregistered = await reset('nobody@example.com')

  assert.equal(registered.status, unregistered.status)
  assert.deepEqual(
    registered.body,
    unregistered.body,
    'the reset error still says whether the address has an account'
  )
  assert.equal(/tries left/.test(registered.body.error), false)
})

test('the reply does not wait for the mail, so the clock says nothing either', async () => {
  stubDb({ accountExists: false })
  const absent = await forgot('nobody@example.com')
  stubDb({ accountExists: true })
  const present = await forgot('someone@example.com')

  const ceiling = MAIL_LATENCY_MS / 2
  assert.ok(
    present.ms < ceiling,
    `registered address answered in ${present.ms.toFixed(0)}ms and the send takes ${MAIL_LATENCY_MS}ms, so the send is being awaited`
  )
  assert.ok(
    Math.abs(present.ms - absent.ms) < ceiling,
    `registered ${present.ms.toFixed(0)}ms against unregistered ${absent.ms.toFixed(0)}ms is a usable timing oracle`
  )
})
