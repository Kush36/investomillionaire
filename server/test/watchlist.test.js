// Run with: node --test test/
//
// The watchlist is the only place in the analyzer where a reader writes to the
// database, so it is the only place where what they send has to be distrusted. Three
// things can go wrong and each gets a section below.
//
// An identifier that is not a listed company must never be stored, because everything
// downstream — the dashboard row, the Analyse link, the report — treats what is on
// this list as a company that exists.
//
// The cap must hold. An uncapped array on a user document is an unbounded write that
// anybody with an account can perform, one request at a time, for free.
//
// And one account must not be able to see or change another's list. The defence is
// that every handler reads and writes req.user and nothing else, so the tests push a
// user id through every channel a request has — body, query, path — and assert it
// changes nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.JWT_SECRET = 'watchlist-test'

const express = (await import('express')).default
const jwt = (await import('jsonwebtoken')).default
const { analyzeRouter, deps } = await import('../src/routes/analyze.js')
const { User, WATCHLIST_CAP } = await import('../src/models/User.js')

const RELIANCE = { symbol: 'RELIANCE', name: 'Reliance Industries Limited', isin: 'INE002A01018', series: 'EQ' }
const TCS = { symbol: 'TCS', name: 'Tata Consultancy Services Limited', isin: 'INE467B01029', series: 'EQ' }

// No network. The universe is the one outbound call these handlers make and it is
// behind the deps seam for exactly this reason. A well-formed ISIN that is absent from
// this map is the "bogus ISIN" case: it passes the format check and must still be
// refused, because format is not existence.
deps.loadUniverse = async () => ({ byIsin: new Map([RELIANCE, TCS].map((r) => [r.isin, r])) })

const app = express()
app.use(express.json())
app.use('/api/analyze', analyzeRouter)
const server = app.listen(0)
const { port } = server.address()
test.after(() => server.close())

// Stands in for a hydrated Mongoose document. save() counts calls so a test can assert
// that a refused request wrote nothing rather than only that it answered with an error.
let saves = 0
function makeUser(id, watchlist = []) {
  return { _id: id, name: id, watchlist, save: async () => void saves++ }
}

// requireAuth resolves the token to a user through this one static, which is the whole
// of the authorisation surface. Everything the handlers do is scoped to what it returns.
function stubUsers(...users) {
  saves = 0
  const byId = new Map(users.map((u) => [u._id, u]))
  User.findById = async (id) => byId.get(id) ?? null
  return byId
}

const tokenFor = (id) => jwt.sign({ sub: id }, process.env.JWT_SECRET)

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

/* -------------------------------------------------------- a bogus identifier -- */

test('an ISIN that is not a listed company is refused and nothing is stored', async () => {
  const alice = makeUser('alice')
  stubUsers(alice)

  // Correctly shaped — two letters, nine alphanumerics, a check digit — and not on the
  // equity list. This is the case a format check alone would wave through.
  const res = await call('POST', '/api/analyze/watchlist', { token: tokenFor('alice'), body: { isin: 'INE999Z01019' } })

  assert.equal(res.status, 404)
  assert.match(res.body.error, /not on the NSE equity list/)
  assert.deepEqual(alice.watchlist, [], 'an unlisted identifier was stored')
  assert.equal(saves, 0, 'the document was saved for a request that was refused')
})

test('free text is refused before the equity list is even consulted', async () => {
  const alice = makeUser('alice')
  stubUsers(alice)

  for (const isin of ['RELIANCE', '', 'INE002A0101', 'INE002A0101X', '../../etc/passwd']) {
    const res = await call('POST', '/api/analyze/watchlist', { token: tokenFor('alice'), body: { isin } })
    assert.equal(res.status, 400, `${JSON.stringify(isin)} was not rejected as malformed`)
  }
  assert.deepEqual(alice.watchlist, [])
  assert.equal(saves, 0)
})

test('the stored entry is the equity list row, not what the request said it was', async () => {
  const alice = makeUser('alice')
  stubUsers(alice)

  // The name and symbol are denormalised onto the entry, so a request that supplies its
  // own must not be the thing that ends up on the dashboard.
  const res = await call('POST', '/api/analyze/watchlist', {
    token: tokenFor('alice'),
    body: { isin: 'INE002A01018', symbol: 'FAKE', name: 'Something Else Entirely' },
  })

  assert.equal(res.status, 201)
  assert.equal(alice.watchlist.length, 1)
  assert.deepEqual(
    { isin: alice.watchlist[0].isin, symbol: alice.watchlist[0].symbol, name: alice.watchlist[0].name },
    { isin: RELIANCE.isin, symbol: RELIANCE.symbol, name: RELIANCE.name }
  )
  assert.equal(saves, 1)
})

test('adding the same company twice leaves one entry and is not an error', async () => {
  const alice = makeUser('alice')
  stubUsers(alice)

  const first = await call('POST', '/api/analyze/watchlist', { token: tokenFor('alice'), body: { isin: 'INE002A01018' } })
  const second = await call('POST', '/api/analyze/watchlist', { token: tokenFor('alice'), body: { isin: 'INE002A01018' } })

  assert.equal(first.status, 201)
  assert.ok(second.status < 400, 'a repeated tap on the control reported an error')
  assert.equal(second.body.watchlist.length, 1)
  assert.equal(saves, 1, 'the duplicate was written again')
})

/* -------------------------------------------------------------------- the cap -- */

test('the cap holds, and the reply says what the cap is', async () => {
  // Filled to the brim with entries that are not the one being added, so the refusal
  // can only be the cap and not the duplicate rule.
  const full = Array.from({ length: WATCHLIST_CAP }, (_, i) => ({
    isin: `INE000A0${String(i).padStart(4, '0')}`,
    symbol: `S${i}`,
    name: `Company ${i}`,
    addedAt: new Date(),
  }))
  const alice = makeUser('alice', full)
  stubUsers(alice)

  const res = await call('POST', '/api/analyze/watchlist', { token: tokenFor('alice'), body: { isin: 'INE002A01018' } })

  assert.equal(res.status, 409)
  assert.match(res.body.error, new RegExp(String(WATCHLIST_CAP)), 'the refusal does not name the limit')
  assert.equal(alice.watchlist.length, WATCHLIST_CAP, 'the cap was exceeded')
  assert.equal(saves, 0)
  assert.equal(res.body.cap, WATCHLIST_CAP)
})

test('one below the cap still accepts, so the boundary is off-by-one safe', async () => {
  const nearlyFull = Array.from({ length: WATCHLIST_CAP - 1 }, (_, i) => ({
    isin: `INE000A0${String(i).padStart(4, '0')}`,
    symbol: `S${i}`,
    name: `Company ${i}`,
    addedAt: new Date(),
  }))
  const alice = makeUser('alice', nearlyFull)
  stubUsers(alice)

  const res = await call('POST', '/api/analyze/watchlist', { token: tokenFor('alice'), body: { isin: 'INE002A01018' } })

  assert.equal(res.status, 201)
  assert.equal(alice.watchlist.length, WATCHLIST_CAP)
})

/* ------------------------------------------------------------------ isolation -- */

test('a list is readable only by the account it belongs to', async () => {
  const alice = makeUser('alice', [{ isin: RELIANCE.isin, symbol: RELIANCE.symbol, name: RELIANCE.name, addedAt: new Date() }])
  const bob = makeUser('bob', [{ isin: TCS.isin, symbol: TCS.symbol, name: TCS.name, addedAt: new Date() }])
  stubUsers(alice, bob)

  const hers = await call('GET', '/api/analyze/watchlist', { token: tokenFor('alice') })
  const his = await call('GET', '/api/analyze/watchlist', { token: tokenFor('bob') })

  assert.deepEqual(hers.body.watchlist.map((e) => e.isin), [RELIANCE.isin])
  assert.deepEqual(his.body.watchlist.map((e) => e.isin), [TCS.isin])

  // The handler takes no user id from the request, so there is nothing here to aim at
  // another account. This asserts that stays true.
  const spoofed = await call('GET', '/api/analyze/watchlist?user=alice&userId=alice', { token: tokenFor('bob') })
  assert.deepEqual(spoofed.body.watchlist.map((e) => e.isin), [TCS.isin], "a query parameter reached another account's list")
})

test('one account cannot write to or delete from another account\'s list', async () => {
  const alice = makeUser('alice', [{ isin: RELIANCE.isin, symbol: RELIANCE.symbol, name: RELIANCE.name, addedAt: new Date() }])
  const bob = makeUser('bob')
  stubUsers(alice, bob)

  // Bob names Alice every way a request can name anybody.
  const added = await call('POST', '/api/analyze/watchlist', {
    token: tokenFor('bob'),
    body: { isin: TCS.isin, user: 'alice', userId: 'alice', _id: 'alice' },
  })
  assert.equal(added.status, 201)
  assert.deepEqual(alice.watchlist.map((e) => e.isin), [RELIANCE.isin], "the write landed on another account's list")
  assert.deepEqual(bob.watchlist.map((e) => e.isin), [TCS.isin])

  // And a delete of an entry that exists, but on somebody else's list.
  const removed = await call('DELETE', `/api/analyze/watchlist/${RELIANCE.isin}`, { token: tokenFor('bob') })
  assert.ok(removed.status < 400)
  assert.deepEqual(alice.watchlist.map((e) => e.isin), [RELIANCE.isin], "one account deleted another account's entry")
})

test('no token reaches the list at all', async () => {
  stubUsers(makeUser('alice', [{ isin: RELIANCE.isin, symbol: 'RELIANCE', name: 'Reliance', addedAt: new Date() }]))

  const calls = [
    await call('GET', '/api/analyze/watchlist'),
    await call('POST', '/api/analyze/watchlist', { body: { isin: RELIANCE.isin } }),
    await call('DELETE', `/api/analyze/watchlist/${RELIANCE.isin}`),
    // A token this server did not sign is the other half of the same door.
    await call('GET', '/api/analyze/watchlist', { token: jwt.sign({ sub: 'alice' }, 'not-the-secret') }),
  ]

  for (const res of calls) {
    assert.equal(res.status, 401)
    assert.equal(res.body.watchlist, undefined, 'an unauthenticated reply carried a list')
  }
  assert.equal(saves, 0)
})

/* --------------------------------------------------------------------- remove -- */

test('removing is idempotent and only ever removes the one entry', async () => {
  const alice = makeUser('alice', [
    { isin: RELIANCE.isin, symbol: RELIANCE.symbol, name: RELIANCE.name, addedAt: new Date() },
    { isin: TCS.isin, symbol: TCS.symbol, name: TCS.name, addedAt: new Date() },
  ])
  stubUsers(alice)

  const first = await call('DELETE', `/api/analyze/watchlist/${RELIANCE.isin}`, { token: tokenFor('alice') })
  assert.deepEqual(first.body.watchlist.map((e) => e.isin), [TCS.isin])

  // Gone already is the state that was asked for, so it answers with the list rather
  // than a 404 every client would then have to special case.
  const second = await call('DELETE', `/api/analyze/watchlist/${RELIANCE.isin}`, { token: tokenFor('alice') })
  assert.ok(second.status < 400)
  assert.deepEqual(second.body.watchlist.map((e) => e.isin), [TCS.isin])
  assert.equal(saves, 1, 'a delete that removed nothing still wrote the document')
})

test('a lowercase ISIN in the path removes the entry it names', async () => {
  const alice = makeUser('alice', [{ isin: RELIANCE.isin, symbol: RELIANCE.symbol, name: RELIANCE.name, addedAt: new Date() }])
  stubUsers(alice)

  const res = await call('DELETE', `/api/analyze/watchlist/${RELIANCE.isin.toLowerCase()}`, { token: tokenFor('alice') })
  assert.deepEqual(res.body.watchlist, [], 'the path ISIN was compared case sensitively')
})

/* ----------------------------------------------------------------- the source -- */

test('an unreachable equity list fails the add rather than storing an unchecked ISIN', async () => {
  const alice = makeUser('alice')
  stubUsers(alice)
  const good = deps.loadUniverse
  deps.loadUniverse = async () => {
    throw new Error('NSE equity list responded 503')
  }

  const res = await call('POST', '/api/analyze/watchlist', { token: tokenFor('alice'), body: { isin: RELIANCE.isin } })
  deps.loadUniverse = good

  assert.equal(res.status, 502)
  assert.deepEqual(alice.watchlist, [], 'an ISIN was stored without anything vouching for it')
  assert.equal(saves, 0)
})
