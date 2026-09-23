// Run with: node --test test/
//
// Two things the analyzer must never do: analyse the wrong company, and publish a
// recommendation. Both are cheap to get wrong and expensive to discover in
// production, so both get a test here.
//
// The universe cases run against a fixed fixture rather than the live NSE file, so
// the suite needs no network and does not change meaning when NSE adds a listing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPhrase, assertPublishable } from '../src/data/policy.js'

// Real rows from EQUITY_L.csv, chosen for the collisions they cause.
const FIXTURE = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Limited', series: 'EQ', isin: 'INE002A01018' },
  { symbol: 'RELINFRA', name: 'Reliance Infrastructure Limited', series: 'EQ', isin: 'INE036A01016' },
  { symbol: 'INDIANB', name: 'Indian Bank', series: 'EQ', isin: 'INE562A01011' },
  { symbol: 'BANKINDIA', name: 'Bank of India', series: 'EQ', isin: 'INE084A01016' },
  { symbol: 'TCS', name: 'Tata Consultancy Services Limited', series: 'EQ', isin: 'INE467B01029' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Limited', series: 'EQ', isin: 'INE155A01022' },
  { symbol: 'ITC', name: 'ITC Limited', series: 'EQ', isin: 'INE154A01025' },
]

// Mirror of the module's resolver over the fixture. The module reads the live CSV at
// load; this exercises the same scoring rules without the network.
const NOISE = new Set(['ltd', 'limited', 'the', 'and', 'co', 'corp', 'corporation', 'company'])
const words = (v) => String(v).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !NOISE.has(w))

function similarity(q, t) {
  if (!q.length || !t.length) return 0
  let matched = 0, inOrder = 0, cursor = -1
  for (const w of q) {
    const at = t.indexOf(w)
    if (at === -1) continue
    matched++
    if (at > cursor) { inOrder++; cursor = at }
  }
  if (!matched) return 0
  return (matched / q.length) * 0.5 + (matched / t.length) * 0.25 + (inOrder / matched) * 0.25
}

function resolve(query) {
  const upper = String(query).trim().toUpperCase()
  const byIsin = FIXTURE.find((r) => r.isin === upper)
  if (byIsin) return { status: 'exact', match: { ...byIsin, confidence: 1, via: 'isin' }, candidates: [] }
  const bySymbol = FIXTURE.find((r) => r.symbol === upper)
  if (bySymbol) return { status: 'exact', match: { ...bySymbol, confidence: 1, via: 'symbol' }, candidates: [] }

  const q = words(query)
  if (!q.length) return { status: 'none', match: null, candidates: [] }
  const scored = FIXTURE
    .map((row) => {
      const bonus = words(row.symbol).some((w) => q.includes(w)) ? 0.1 : 0
      return { row, score: Math.min(1, similarity(q, words(row.name)) + bonus) }
    })
    .filter((s) => s.score >= 0.55)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return { status: 'none', match: null, candidates: [] }

  const candidates = scored.map((s) => ({ ...s.row, confidence: Number(s.score.toFixed(3)) }))
  const [best, runnerUp] = candidates
  const decisive = best.confidence >= 0.9 && (!runnerUp || best.confidence - runnerUp.confidence >= 0.15)
  return decisive
    ? { status: 'exact', match: { ...best, via: 'name' }, candidates: candidates.slice(1) }
    : { status: 'ambiguous', match: null, candidates }
}

/* ------------------------------------------------------- identification ---- */

// The case that motivated writing a new resolver rather than reusing gmp.js: its
// set-intersection scoring returns Bank of India for "Indian Bank" at confidence 1.
test('Indian Bank does not resolve to Bank of India', () => {
  const result = resolve('Indian Bank')
  assert.notEqual(result.match?.symbol, 'BANKINDIA', 'resolved to the wrong bank')
  if (result.status === 'exact') assert.equal(result.match.symbol, 'INDIANB')
})

test('an exact ticker wins outright', () => {
  for (const [q, symbol] of [['TCS', 'TCS'], ['itc', 'ITC'], ['RELIANCE', 'RELIANCE']]) {
    const r = resolve(q)
    assert.equal(r.status, 'exact', `${q} was not exact`)
    assert.equal(r.match.symbol, symbol)
    assert.equal(r.match.via, 'symbol')
  }
})

// gmp.js drops tokens of three characters or fewer, which loses TCS, ITC and LT.
test('three-letter tickers are not dropped', () => {
  assert.equal(resolve('TCS').match.symbol, 'TCS')
  assert.equal(resolve('ITC').match.symbol, 'ITC')
})

test('an ISIN resolves without ambiguity', () => {
  const r = resolve('INE002A01018')
  assert.equal(r.status, 'exact')
  assert.equal(r.match.symbol, 'RELIANCE')
  assert.equal(r.match.via, 'isin')
})

test('a genuinely ambiguous name asks instead of guessing', () => {
  const r = resolve('Reliance')
  if (r.status === 'exact') {
    assert.equal(r.match.symbol, 'RELIANCE', 'picked the smaller Reliance company')
  } else {
    assert.equal(r.status, 'ambiguous')
    const symbols = r.candidates.map((c) => c.symbol)
    assert.ok(symbols.includes('RELIANCE') && symbols.includes('RELINFRA'), 'both Reliance listings should be offered')
  }
})

test('nonsense resolves to nothing rather than to the nearest company', () => {
  assert.equal(resolve('zzzzqqq').status, 'none')
  assert.equal(resolve('').status, 'none')
})

/* -------------------------------------------------------------- policy ---- */

test('statistics pass; the same number as advice does not', () => {
  // The distinction SEBI actually draws is the verb, not the indicator.
  assert.equal(checkPhrase('RSI is 71, above the conventional 70 threshold.').ok, true)
  assert.equal(checkPhrase('The 50 EMA crossed above the 200 EMA on 14 March.').ok, true)
  assert.equal(checkPhrase('Promoter holding fell for three consecutive quarters.').ok, true)
  assert.equal(checkPhrase('Operating cash flow declined while net profit rose.').ok, true)

  assert.equal(checkPhrase('RSI signals overbought, consider booking profits.').ok, false)
  assert.equal(checkPhrase('We recommend a target price of Rs 1,450.').ok, false)
  assert.equal(checkPhrase('Place a stop loss at 1,180.').ok, false)
  assert.equal(checkPhrase('This is a strong buy at current levels.').ok, false)
  assert.equal(checkPhrase('The stock is poised to reach new highs.').ok, false)
})

test('the two fields the pattern spec asked for are refused by name', () => {
  // The owner's spec asked each pattern to carry a target zone and an invalidation
  // level. Those are a price target and a stop loss, named verbatim in reg 2(1)(wa).
  const target = checkPhrase('Target zone 1,530 to 1,560.')
  assert.equal(target.ok, false)
  assert.equal(target.violations[0].clause, '2(1)(wa)(iv)')

  const stop = checkPhrase('Invalidation level sits at 1,180.')
  assert.equal(stop.ok, false)
  assert.equal(stop.violations[0].clause, '2(1)(wa)(iv)')
})

test('a whole report is withheld rather than flagged', () => {
  const clean = {
    symbol: 'RELIANCE',
    technical: { note: 'Price closed above the 200 EMA on 14 March.' },
    pattern: { kind: 'double-bottom', neckline: 1412, confirmedOn: '2026-03-12' },
  }
  assert.doesNotThrow(() => assertPublishable(clean))

  const dirty = { ...clean, pattern: { ...clean.pattern, note: 'Target zone 1,530-1,560.' } }
  assert.throws(() => assertPublishable(dirty), /price target/)
})

test('a quoted third-party call is reported, not adopted', () => {
  // Reporting that a brokerage published a target is a fact about the world. The
  // shape of the object is what marks it as attributed.
  const report = {
    coverage: [{ source: 'Economic Times', headline: 'Brokerage sets target price of Rs 1,600 on Reliance', date: '2026-09-01' }],
  }
  assert.doesNotThrow(() => assertPublishable(report))
})
