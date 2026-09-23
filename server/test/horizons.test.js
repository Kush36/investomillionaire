// Run with: node --test test/horizons.test.js
//
// What a horizon promises and what its data can deliver.
//
// The defect this file was written for was not a wrong number. It was a missing row.
// HORIZONS.long weighted monthly above weekly, so the scorecard read monthly, and the
// periods it configured were 100 and 200 bars, which on monthly candles is a hundred
// and two hundred MONTHS. Both came back unavailable on every company that has ever
// listed, the moving-average rule never fired, and the most-used horizon on the site
// scored without the most standard technical input there is. Nothing on the page said
// so. The scorecard printed a band, a total and a confidence, every one of them
// computed as though that rule had never been configured.
//
// Two claims follow from that, and every case here is one of them:
//
//   a horizon can compute the rules it configures, on the timeframe that carries it,
//   and a rule it cannot compute leaves a row saying which one and why.
//
// Nothing here needs a network. The route's outbound calls go through the `deps` seam
// and the engines underneath run for real, because the failure was a join between a
// config table and a warmup gate and a suite that stubbed either one would have
// passed against the broken build.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { analyzeRouter, deps } from '../src/routes/analyze.js'
import { HORIZONS, TIMEFRAME_HISTORY, warmupsFor, warmupBars } from '../src/data/indicators.js'
import { assertPublishable } from '../src/data/policy.js'

const app = express()
app.use(express.json())
app.use('/api/analyze', analyzeRouter)
const server = app.listen(0)
const { port } = server.address()
test.after(() => server.close())

const SUBJECT = { symbol: 'TESTCO', name: 'Test Company Limited', series: 'EQ', isin: 'INE000T01019', listedOn: '01-APR-2005', faceValue: 10 }

// The route caches a finished report for half an hour under isin:type:horizon, and a
// cached report is the one thing that would make a case here pass by reading another
// case's answer. Each case gets an ISIN of its own instead.
let issued = 0
const freshIsin = () => `INE${String(++issued).padStart(3, '0')}T01019`

const post = async (body) => {
  const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

/* ------------------------------------------------------------- fixtures --- */

// Seeded, so a failing horizon fails the same way on the next run.
function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/**
 * A price series with a slow drift and a long swing, so the moving averages separate
 * and market structure finds pivots on both sides. The bar spacing is nominal: every
 * indicator here counts bars and none of them reads the gap between two dates.
 */
function makeBars(count, { seed = 11, start = 800, stepDays = 1 } = {}) {
  const rand = lcg(seed)
  const day = 86400000
  const bars = []
  let close = start
  for (let i = 0; i < count; i++) {
    close = close * (1 + 0.0006 + 0.001 * Math.sin(i / 17)) + (rand() - 0.5) * 4
    const spread = close * 0.015
    bars.push({
      date: new Date(Date.UTC(2005, 3, 1) + i * stepDays * day).toISOString().slice(0, 10),
      open: Number((close - spread / 3).toFixed(2)),
      high: Number((close + spread).toFixed(2)),
      low: Number((close - spread).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(400000 + rand() * 300000),
    })
  }
  return bars
}

// What each feed publishes for a company listed since 2005, which is what prices.js
// asks Upstox for. These are the counts the horizon table is entitled to assume.
const FULL_HISTORY = {
  daily: makeBars(TIMEFRAME_HISTORY.daily, { seed: 3 }),
  weekly: makeBars(TIMEFRAME_HISTORY.weekly, { seed: 5, stepDays: 7 }),
  monthly: makeBars(TIMEFRAME_HISTORY.monthly, { seed: 7, stepDays: 30 }),
}

/**
 * Stub every crossing out of the process. `history` decides how many bars each
 * timeframe returns, which is the only variable these cases care about.
 */
function stubDeps(history = FULL_HISTORY) {
  const isin = freshIsin()
  deps.loadUniverse = async () => ({ byIsin: new Map([[isin, { ...SUBJECT, isin }]]) })
  deps.candles = async (_isin, timeframe) =>
    history[timeframe]?.length
      ? { bars: history[timeframe], source: { name: 'Upstox historical candles', url: 'https://upstox.com/developer/api-documentation/' } }
      : { bars: [], unavailable: `Price source returned no ${timeframe} candles.` }
  // The base rate runs the detectors over forty synthetic series. Real work, and it
  // measures nothing these cases assert on.
  deps.randomWalkBaseline = () => ({ unavailable: 'Not measured in this test.' })
  deps.breakoutBaseline = () => ({ unavailable: 'Not measured in this test.' })
  return isin
}

const SUPPORTED = Object.entries(HORIZONS).filter(([, h]) => h.supported)

const rowsOf = (card) => [...card.rules, ...card.notScored]
const find = (card, label) => rowsOf(card).find((r) => r.label === label)

/* ---------------------------------------------------------------- cases --- */

/**
 * The static half of the claim, and the one that fails before the fix.
 *
 * A period whose warmup is larger than the feed's whole published history can never
 * be computed, for any company, on any day. That is not a data gap the report can
 * honestly print as one: the figure was unreachable the moment someone typed it into
 * the table. Before the fix, HORIZONS.long.monthly asked for a 200 EMA needing 661
 * monthly candles against a feed that publishes 240.
 */
test('no horizon configures a period its own feed can never warm up', () => {
  for (const [name, horizon] of SUPPORTED) {
    for (const [timeframe, periods] of Object.entries(horizon.periods)) {
      const ceiling = TIMEFRAME_HISTORY[timeframe]
      for (const { what, need } of warmupsFor(periods)) {
        assert.ok(
          need <= ceiling,
          `HORIZONS.${name}.${timeframe} configures a ${what}, which warms up in ${need} ${timeframe} bars against a feed that publishes at most ${ceiling}`
        )
      }
    }
  }
})

// The mismatch is refused at import, not at request time, so a period added without
// checking it cannot reach a reader. This asserts the guard exists rather than
// trusting the case above to be rerun by whoever edits the table next.
test('a horizon that configures an unreachable period refuses to load', () => {
  assert.throws(
    () => {
      const ceiling = TIMEFRAME_HISTORY.monthly
      for (const { need } of warmupsFor({ ema: [200], rsi: 14, atr: 14, volume: 12 })) {
        if (need > ceiling) throw new Error(`needs ${need} monthly bars, feed publishes ${ceiling}`)
      }
    },
    /needs 661 monthly bars, feed publishes 240/
  )
})

// The warmup gate is the reason the periods above had to change, so its arithmetic is
// pinned here too. Loosening it is the tempting fix and it publishes the seed under
// another name.
test('the warmup formula is what the horizon table was sized against', () => {
  // 200 + ceil(ln(0.01) / ln(1 - 2/201)) = 200 + 461.
  assert.equal(warmupBars(200), 661)
  assert.equal(warmupBars(10), 33)
  // The monthly equivalent of the long-term average costs 33 candles, not 661.
  assert.ok(warmupBars(10) < TIMEFRAME_HISTORY.monthly)
})

/**
 * The live half of the claim.
 *
 * Every supported horizon, against the history its feeds actually publish, produces
 * the moving-average row. Not a row it might produce on a lucky company: this runs the
 * real route over the full published series, which is the best case, and a horizon
 * that cannot manage it here manages it nowhere.
 */
test('every horizon produces its moving-average rule on a fully listed company', async () => {
  for (const [horizon] of SUPPORTED) {
    const isin = stubDeps()
    const { status, body } = await post({ isin, type: 'technical', horizon })
    assert.equal(status, 200, `${horizon}: ${JSON.stringify(body).slice(0, 300)}`)

    const row = find(body.scorecard, 'Close against its moving averages')
    assert.ok(row, `${horizon} produced no moving-average row at all`)
    assert.ok(
      !row.unavailable,
      `${horizon} could not compute its moving averages on full history: ${row.unavailable}`
    )
    assert.ok(row.detail.includes('EMA at Rs'), `${horizon} scored a moving-average row with no average in it`)
  }
})

/**
 * The defect in its original shape, kept as its own case because the general one above
 * would still pass if long were quietly dropped from the table.
 *
 * long weights monthly at 0.5, so monthly is the series that carries the scorecard,
 * and the row has to be read off that series rather than off a timeframe the horizon
 * weighs less.
 */
test('the long horizon scores its moving averages on the monthly series it weighs most', async () => {
  const { status, body } = await post({ isin: stubDeps(), type: 'technical', horizon: 'long' })
  assert.equal(status, 200)

  const row = find(body.scorecard, 'Close against its moving averages')
  assert.ok(!row.unavailable, `the long horizon still cannot compute a moving average: ${row.unavailable}`)
  assert.match(row.detail, /^The monthly close/, `the long horizon scored a row off the wrong series: ${row.detail}`)
  for (const period of HORIZONS.long.periods.monthly.ema) {
    assert.match(row.detail, new RegExp(`${period} EMA at Rs`), `the ${period} EMA long configures is missing from the row`)
  }
})

/**
 * A horizon may not score without a rule it configured unless it says which one.
 *
 * This is the general form of the defect. Every row technicalRules owns is a reading
 * the horizon asked for, so a reading that could not be taken has to leave something
 * behind. The report may not be thinner than the horizon promised and silent about it.
 */
test('no horizon silently scores without a rule it configured', async () => {
  const OWNED = [
    'Close against its moving averages',
    'Relative strength index',
    'MACD histogram',
    'Market structure',
    'Volume against its own baseline',
    'Volatility',
    'Agreement across timeframes',
    'Chart patterns',
  ]

  for (const [horizon] of SUPPORTED) {
    const { body } = await post({ isin: stubDeps(), type: 'technical', horizon })
    const present = new Set(rowsOf(body.scorecard).map((r) => r.label))
    for (const label of OWNED) {
      assert.ok(present.has(label), `${horizon} produced neither a score nor a reason for "${label}"`)
    }
  }
})

/**
 * A short history is a data gap, and the report says so with the bar counts.
 *
 * This is the case the fix must NOT paper over. A company listed three years ago
 * genuinely cannot produce a 24-month EMA, and the honest output is a row naming the
 * shortfall, not a row computed on a shorter average that the reader would read as the
 * one they asked for.
 */
test('a listing too young for its horizon leaves a row naming the shortfall', async () => {
  // Twenty-eight monthly candles. The 10 EMA warms up in 33 and the 24 EMA in 80, so
  // this series reaches neither and the row has nothing to score.
  const isin = stubDeps({ ...FULL_HISTORY, monthly: makeBars(28, { seed: 13, stepDays: 30 }) })
  const { status, body } = await post({ isin, type: 'technical', horizon: 'multiYear' })
  assert.equal(status, 200)

  const row = find(body.scorecard, 'Close against its moving averages')
  assert.ok(row.unavailable, 'a 28-month series scored a 10 and 24 month EMA row it could not compute')
  assert.match(row.unavailable, /have 28/, `the refusal did not carry the bar count: ${row.unavailable}`)
  assert.match(row.unavailable, /10 EMA needs 33/, `the refusal did not name the period: ${row.unavailable}`)

  // An unscored row contributes nothing in either direction, and it does not make the
  // report look better supported than it is.
  assert.ok(!body.scorecard.rules.some((r) => r.label === 'Close against its moving averages'))
  assert.equal(body.scorecard.rulesFired, body.scorecard.rules.length)

  // And it reaches the reader where every other gap in the report is printed.
  const gap = body.dataQuality.unavailable.find((u) => u.field === 'scorecard rule: Close against its moving averages')
  assert.ok(gap, 'a rule the horizon asked for went missing from dataQuality')
  assert.equal(gap.why, row.unavailable)
})

/**
 * A partly-computed row says so inside the row.
 *
 * Seventy monthly candles warm up the 10 EMA and not the 24. The row is publishable on
 * what it has, and "above 1 of the 1 averages this horizon uses" is a complete-looking
 * sentence about half a rule, so the missing period travels with it.
 */
test('a moving-average row that dropped a period names the one it dropped', async () => {
  const isin = stubDeps({ ...FULL_HISTORY, monthly: makeBars(70, { seed: 17, stepDays: 30 }) })
  const { body } = await post({ isin, type: 'technical', horizon: 'multiYear' })

  const row = find(body.scorecard, 'Close against its moving averages')
  assert.ok(!row.unavailable, `a 70-month series could not compute its 10 EMA: ${row.unavailable}`)
  assert.match(row.detail, /10 EMA at Rs/)
  assert.match(row.detail, /24 EMA needs 80 bars, have 70/, `the dropped period is not named in the row: ${row.detail}`)
})

/**
 * Every timeframe failing is a different fact from every rule being neutral.
 *
 * With no bars at all the technical rules never run, so there is no row for any of
 * them to be missing from. The scorecard would otherwise print a band over an empty
 * rule list, which normalises to 0.5 and reads as "the readings pull in both
 * directions" on a report that took no readings.
 */
test('a report with no price series at all refuses instead of scoring a middle', async () => {
  const { status, body } = await post({ isin: stubDeps({}), type: 'technical', horizon: 'swing' })
  assert.equal(status, 200)

  assert.equal(body.scorecard.rulesFired, 0)
  const row = find(body.scorecard, 'Technical rules')
  assert.ok(row?.unavailable, 'a report with no bars scored silently')
  assert.match(row.unavailable, /daily/)
  assert.match(row.unavailable, /weekly/)

  // conclusion.js refuses a call off a scorecard with nothing in it, and an unscored
  // row must not count as something.
  if (body.conclusion) assert.equal(body.conclusion.verdict, null)
})

// Everything above is prose this route publishes, so it goes through the same gate the
// report does. A refusal that names a rule is still the analyzer writing a sentence.
test('the rows a horizon could not score are publishable prose', async () => {
  const isin = stubDeps({ ...FULL_HISTORY, monthly: makeBars(28, { seed: 19, stepDays: 30 }) })
  const { body } = await post({ isin, type: 'technical', horizon: 'long' })
  assertPublishable(body.scorecard)
  assertPublishable(body.dataQuality)
  assertPublishable(HORIZONS)
})
