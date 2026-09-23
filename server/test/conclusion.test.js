// Run with: node --test test/
//
// The conclusion layer is the one module allowed to name a call, so the things worth
// testing here are not arithmetic. They are the four claims the feature is published
// on, and each of them is a case below:
//
//   the mapping is deterministic, so two readers of the same scorecard get the same
//   label and the bands are where the comments say they are,
//
//   ANALYZER_VERDICT=off removes the label completely rather than replacing it with a
//   politely empty one,
//
//   a price target and a stop loss are still withheld with the flag on, because the
//   exemption policy.js grants covers the clause that turns on consideration and not
//   the clauses that turn on content,
//
//   every rule that moved the call comes back with it, including the ones that did
//   not fire, so a reader can strike one out and recompute by hand.
//
// The scorecards below are hand-built rather than produced by running the route. The
// route's own suite covers the join; what this file needs is a normalised score at an
// exact value, which a live pipeline cannot be asked for.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conclude, consideration, VERDICT_ENABLED, VERDICT_DISCLOSURE } from '../src/data/conclusion.js'
import { assertPublishable, CONCLUSION_EXEMPTION } from '../src/data/policy.js'

/**
 * A scorecard with a chosen normalised score.
 *
 * score, best and worst only reach the printed prose, so they are set to a spread
 * that reproduces the normalised value rather than to anything meaningful: nothing in
 * the mapping recomputes them.
 */
function scorecardAt(normalised, rulesFired = 8) {
  const best = 10
  const worst = -10
  return {
    band: 'fixture',
    score: Number((worst + normalised * (best - worst)).toFixed(2)),
    best,
    worst,
    normalised,
    rulesFired,
    rules: [],
    confidence: rulesFired >= 8 ? 'high' : rulesFired >= 4 ? 'medium' : 'low',
  }
}

const VERIFIED = [
  { field: 'daily price series', detail: '1488 bars from 2019-09-20 to 2026-09-19', source: 'Upstox v3 historical-candle' },
  { field: 'quarterly filings', detail: '12 quarters from 2022-09-30 to 2025-06-30, consolidated basis', source: 'NSE corporates-financial-results' },
]

const call = (normalised, over = {}) =>
  conclude({ scorecard: scorecardAt(normalised, over.rulesFired ?? 8), horizon: over.horizon ?? 'swing', type: over.type ?? 'both', verified: VERIFIED })

// The whole file assumes the default. If the environment running the suite has the
// label switched off, every assertion below would pass against a module that does
// nothing, which is the one result worth refusing outright.
test('the suite runs against the label switched on', () => {
  assert.equal(VERDICT_ENABLED, true, 'unset ANALYZER_VERDICT before running this file')
})

// ---------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------

test('the bands sit exactly where the constants say, and the edge belongs to the band above', () => {
  assert.equal(call(1).verdict, 'buy')
  assert.equal(call(0.7).verdict, 'buy')
  assert.equal(call(0.699).verdict, 'hold')
  assert.equal(call(0.5).verdict, 'hold')
  assert.equal(call(0.3).verdict, 'hold')
  assert.equal(call(0.299).verdict, 'sell')
  assert.equal(call(0).verdict, 'sell')
})

test('the same scorecard maps to the same call, rule for rule', () => {
  assert.deepEqual(call(0.82), call(0.82))
  assert.deepEqual(call(0.11, { horizon: 'long', type: 'technical' }), call(0.11, { horizon: 'long', type: 'technical' }))
})

test('the call is the band the score fell into and the band it came from is reported beside it', () => {
  const buy = call(0.9)
  assert.equal(buy.fromBand, 'buy')
  assert.equal(buy.demoted, false)
  assert.equal(buy.inputs.normalised, 0.9)
  assert.equal(buy.inputs.horizon, 'swing')
})

// ---------------------------------------------------------------------------
// The rules, and the direction they are allowed to move the call
// ---------------------------------------------------------------------------

test('every rule comes back, fired or not, with what the call was before and after it', () => {
  const out = call(0.95)
  assert.equal(out.rules.length, 3)
  assert.deepEqual(out.rules.map((r) => r.label), ['Scorecard band', 'Weight of evidence', 'Evidence against the requested period'])

  // The chain has to be continuous: each rule's starting call is the previous rule's
  // result, and the last one is the published call. A rule that reported a `to` the
  // next rule did not start from would make the printed derivation a fiction.
  assert.equal(out.rules[0].from, null)
  for (let i = 1; i < out.rules.length; i++) assert.equal(out.rules[i].from, out.rules[i - 1].to)
  assert.equal(out.rules[out.rules.length - 1].to, out.verdict)

  for (const rule of out.rules) {
    assert.ok(rule.detail.length > 40, `${rule.label} came back without a readable reason`)
    assert.ok(rule.effect, `${rule.label} came back without saying what it did`)
  }
})

test('thin evidence moves a directional call to hold, in both directions', () => {
  const thinBuy = call(0.95, { rulesFired: 5 })
  assert.equal(thinBuy.fromBand, 'buy')
  assert.equal(thinBuy.verdict, 'hold')
  assert.equal(thinBuy.demoted, true)
  assert.equal(thinBuy.rules[1].effect, 'moved the call to hold')

  const thinSell = call(0.05, { rulesFired: 5 })
  assert.equal(thinSell.fromBand, 'sell')
  assert.equal(thinSell.verdict, 'hold')

  // Six is the threshold, so six rows still point.
  assert.equal(call(0.95, { rulesFired: 6 }).verdict, 'buy')
})

test('a call on evidence sampled at the wrong rate for the requested period is held', () => {
  const chartOnly = call(0.95, { horizon: 'multiYear', type: 'technical' })
  assert.equal(chartOnly.verdict, 'hold')
  assert.equal(chartOnly.rules[2].effect, 'moved the call to hold')
  assert.match(chartOnly.rules[2].detail, /No filing was read/)

  const filingsOnly = call(0.05, { horizon: 'short', type: 'fundamental' })
  assert.equal(filingsOnly.verdict, 'hold')

  // Same data, a period it can actually answer: nothing is taken away.
  assert.equal(call(0.05, { horizon: 'long', type: 'fundamental' }).verdict, 'sell')
  assert.equal(call(0.95, { horizon: 'multiYear', type: 'both' }).verdict, 'buy')
})

test('no rule can point the call anywhere; they only take the point away', () => {
  // Every combination of the demotion conditions, against every band. A rule that
  // promoted would show up here as a call that is not its own band and not hold.
  for (const normalised of [0.05, 0.5, 0.95]) {
    for (const rulesFired of [3, 5, 6, 9]) {
      for (const [type, horizon] of [['both', 'swing'], ['technical', 'long'], ['fundamental', 'short']]) {
        const out = call(normalised, { rulesFired, type, horizon })
        assert.ok(
          out.verdict === out.fromBand || out.verdict === 'hold',
          `${normalised}/${rulesFired}/${type}/${horizon} produced ${out.verdict} from a ${out.fromBand} band`
        )
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test('a horizon with no data behind it gets the refusal, not a hold', () => {
  const out = conclude({ scorecard: scorecardAt(0.9), horizon: 'intraday', type: 'both', verified: VERIFIED })
  assert.equal(out.verdict, null)
  assert.match(out.unavailable, /No free intraday source exists/)
  // Nothing was named, so nothing needs the exemption.
  assert.equal(out.policyExemption, undefined)
})

test('a scorecard with no rules in it produces no call at all', () => {
  const out = conclude({ scorecard: scorecardAt(0.5, 0), horizon: 'swing' })
  assert.equal(out.verdict, null)
  assert.match(out.unavailable, /No scoring rule could be computed/)
})

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

test('ANALYZER_VERDICT=off removes the verdict entirely', async () => {
  const before = process.env.ANALYZER_VERDICT
  process.env.ANALYZER_VERDICT = 'off'
  try {
    // A query string gives the loader a distinct specifier, so the module is evaluated
    // again and reads the environment as it stands now. The statically imported copy
    // at the top of this file is untouched and stays on.
    const off = await import('../src/data/conclusion.js?flag=off')
    assert.equal(off.VERDICT_ENABLED, false)
    assert.equal(off.conclude({ scorecard: scorecardAt(0.95), horizon: 'swing', verified: VERIFIED }), null)
    // Not an empty object and not { verdict: null }: null is what lets the route omit
    // the key, so a report with the label off is the report it was before the label.
    assert.equal(off.conclude({ scorecard: scorecardAt(0.05, 2), horizon: 'intraday' }), null)
    assert.equal(VERDICT_ENABLED, true)
  } finally {
    if (before === undefined) delete process.env.ANALYZER_VERDICT
    else process.env.ANALYZER_VERDICT = before
  }
})

test('a name that reads like revenue stops the module from loading', () => {
  for (const key of ['AFFILIATE_TOKEN', 'ADS_CLIENT_ID', 'GOOGLE_ADSENSE_ID', 'PAYWALL_SECRET', 'BROKER_REFERRAL_URL', 'AD_SLOT']) {
    assert.throws(
      () => consideration({ [key]: 'x' }),
      (err) => err.message.includes(key) && /16 December 2024/.test(err.message),
      `${key} did not trip the consideration check`
    )
  }
})

test('the consideration check does not fire on ordinary configuration', () => {
  const out = consideration({ PORT: '4000', MONGO_URL: 'mongodb://x', UPLOAD_DIR: '/tmp', HEADLESS: '1', NODE_ENV: 'test', ADMIN_EMAIL: 'x@y.z' })
  assert.equal(out.ok, true)
  assert.equal(out.variablesChecked, 6)

  // A variable that is declared and empty is not money changing hands.
  assert.equal(consideration({ ADS_CLIENT_ID: '' }).ok, true)
})

// ---------------------------------------------------------------------------
// The exemption, and its edges
// ---------------------------------------------------------------------------

const reportWith = (conclusion) => ({
  request: { isin: 'INE002A01018', horizon: 'swing' },
  scorecard: { band: 'mixed', rules: [{ label: 'Relative strength index', detail: 'RSI(14) on the daily series is 58.2.' }] },
  conclusion,
})

test('a real conclusion clears the gate', () => {
  const out = assertPublishable(reportWith(call(0.95)))
  assert.equal(out.conclusion.verdict, 'buy')
  assert.equal(out.conclusion.policyExemption, CONCLUSION_EXEMPTION)
})

test('the exemption is the marker, and nothing else in the report gets it', () => {
  // Same words, same report, no marker.
  const unmarked = { ...call(0.95) }
  delete unmarked.policyExemption
  assert.throws(() => assertPublishable(reportWith(unmarked)), /buy, sell or hold recommendation/)

  // And a sibling block cannot borrow it: the marker scopes to its own subtree.
  assert.throws(
    () => assertPublishable({ ...reportWith(call(0.95)), summary: 'The readings support a buy.' }),
    /summary: "buy"/
  )
})

test('a price target and a stop loss stay forbidden inside the conclusion, flag on', () => {
  const withTarget = call(0.95)
  withTarget.rules.push({ label: 'Invented', detail: 'A target price of Rs 1,500 over this horizon.', from: 'buy', to: 'buy', effect: 'x' })
  assert.throws(() => assertPublishable(reportWith(withTarget)), /is a price target/)

  const withStop = call(0.95)
  withStop.duration.means = 'Place a stop loss below the last swing low.'
  assert.throws(() => assertPublishable(reportWith(withStop)), /is a stop loss/)

  // The other content clauses too, so the exemption is demonstrably one row of the
  // list and not the top of it.
  const withForecast = call(0.95)
  withForecast.method = 'The price is expected to rise from here.'
  assert.throws(() => assertPublishable(reportWith(withForecast)), /is a price forecast/)
})

// ---------------------------------------------------------------------------
// What ships with the call
// ---------------------------------------------------------------------------

test('the duration is the period read, not a period promised', () => {
  const out = call(0.95, { horizon: 'medium' })
  assert.equal(out.duration.horizon, 'medium')
  assert.equal(out.duration.span, 'three months to a year')
  assert.deepEqual(out.duration.covers, VERIFIED.map((v) => `${v.field}: ${v.detail}`))
  assert.match(out.duration.means, /not a period over which anything is promised/)
})

test('the risk disclosure, the loss statistics and the unregistered-party statement travel with every call', () => {
  for (const out of [call(0.95), call(0.5), call(0.05), conclude({ scorecard: scorecardAt(0.5, 0), horizon: 'swing' })]) {
    assert.equal(out.disclosure, VERDICT_DISCLOSURE)
  }
  assert.match(VERDICT_DISCLOSURE.risk, /losing part or all of your capital/)
  assert.match(VERDICT_DISCLOSURE.losses, /lose money/)
  assert.match(VERDICT_DISCLOSURE.who, /not registered with SEBI/)
  assert.match(VERDICT_DISCLOSURE.who, /mechanical read of published exchange and filing data by an unregistered party/)
  assert.match(VERDICT_DISCLOSURE.consideration, /no advertising, no paywall, no affiliate link and no broker referral/)
  // The measured base rate is the pattern engine's own figure, not a second copy.
  assert.match(VERDICT_DISCLOSURE.baseRate, /random walks/)
})
