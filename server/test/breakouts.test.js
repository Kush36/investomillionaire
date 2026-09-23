// Run with: node --test test/
//
// Every series here is constructed, so the expected prior high, the expected
// breakout bar and the expected shape are arithmetic rather than a snapshot of
// whatever the market happened to do. Three of the five tests are refusals, which is
// the right ratio for a detector whose failure mode is finding what it was asked to
// find.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectBreakouts,
  multiYearBreakout,
  cupAndHandle,
  roundedness,
  breakoutBaseline,
  BREAKOUT_TOLERANCES,
} from '../src/data/breakouts.js'
import { assertPublishable } from '../src/data/policy.js'

/**
 * Bars from a list of closes. The intrabar range is a fixed 0.4% either side, which
 * puts every high exactly where the close is and makes the expected levels below
 * computable by hand.
 *
 * stepDays is what makes these tests about CALENDAR windows rather than bar counts:
 * 30 days a bar is a monthly series, so 88 bars is seven years of history.
 */
function bars(closes, { stepDays = 1, start = Date.UTC(2015, 0, 5), volume = 100000 } = {}) {
  return closes.map((close, i) => ({
    date: new Date(start + i * stepDays * 86400000).toISOString().slice(0, 10),
    open: close,
    high: close * 1.004,
    low: close * 0.996,
    close,
    volume,
  }))
}

/** Closes walked linearly between the prices given. */
function walk(start, segments) {
  const closes = [start]
  for (const { to, bars: n } of segments) {
    const from = closes[closes.length - 1]
    for (let i = 1; i <= n; i++) closes.push(from + ((to - from) * i) / n)
  }
  return closes
}

/* ------------------------------------------------- multi-year breakout ---- */

// A monthly series: a peak at index 20, a two-year decline, a long base, then a
// close back through the old high at index 73, and a continuation above it.
//
//   index 20 is the peak       close 200, so the high is 200.8
//   index 73 is the breakout   close 202.6, the first close above 200.8 + 0.5%
//   the gap is 53 bars         1,590 days, or 4.35 years, inside the 5-year window
const MULTI_YEAR = () =>
  bars(
    walk(100, [
      { to: 200, bars: 20 },
      { to: 120, bars: 15 },
      { to: 118, bars: 20 },
      { to: 212, bars: 20 },
      { to: 250, bars: 12 },
    ]),
    { stepDays: 30 }
  )

test('a constructed multi-year breakout is found with the right prior high and date', () => {
  const series = MULTI_YEAR()
  const found = multiYearBreakout(series, { timeframe: 'monthly', years: 5 })

  assert.equal(found.found, true, found.reason)
  assert.equal(found.kind, 'multi-year-breakout')

  // The prior high is the INTRADAY high of the peak bar, and it is dated to the bar
  // that set it rather than to the bar that broke it.
  assert.equal(found.priorHigh.index, 20)
  assert.equal(found.priorHigh.date, series[20].date)
  assert.equal(found.priorHigh.price, Number((200 * 1.004).toFixed(2)))
  assert.equal(found.priorHigh.stoodForBars, 53)
  assert.ok(found.priorHigh.stoodForYears > 4.3 && found.priorHigh.stoodForYears < 4.4)

  // The breakout is the first close through the level, not the first bar above it
  // intraday and not the fiftieth bar of the trend that followed.
  assert.equal(found.breakout.index, 73)
  assert.equal(found.breakout.date, series[73].date)
  assert.equal(found.breakout.close, Number(series[73].close.toFixed(2)))
  assert.ok(series[72].close <= found.priorHigh.price * (1 + BREAKOUT_TOLERANCES.breakoutBufferPct))

  // The base: how long it lasted and how deep it went, both measured off the bars.
  assert.equal(found.base.bars, 53)
  assert.equal(found.base.fromDate, series[20].date)
  assert.ok(found.base.depthPercent > 40, `base depth was ${found.base.depthPercent}%`)

  // Volume is a measured ratio against the median of the base, and every bar here
  // carries the same volume, so the breakout bar is exactly the median.
  assert.equal(found.volume.baselineMedian, 100000)
  assert.equal(found.volume.ratio, 1)
  assert.equal(found.volume.confirmed, false)

  // The close stayed above the old high for the whole confirmation window.
  assert.equal(found.confirmation.barsAvailable, BREAKOUT_TOLERANCES.confirmationBars)
  assert.equal(found.confirmation.closedAboveOnEveryBar, true)
  assert.equal(found.confirmation.complete, true)

  // Which series the finding came from, and how far above the old high it sits now.
  assert.equal(found.series.timeframe, 'monthly')
  assert.equal(found.series.standing, 'highest')
  assert.equal(found.now.abovePriorHighPercent, Number(((250 / 200.8 - 1) * 100).toFixed(2)))

  // The score shows its inputs and adds up to what it says it adds up to.
  assert.ok(found.confidence.rules.length >= 5)
  assert.equal(
    found.confidence.score,
    found.confidence.rules.reduce((sum, r) => sum + r.points, 0),
    'the score does not equal the sum of the rules shown'
  )
})

test('volume on the breakout is measured against the base median, not assumed', () => {
  const series = MULTI_YEAR()
  series[73].volume = 350000
  const found = multiYearBreakout(series, { timeframe: 'monthly', years: 5 })
  assert.equal(found.volume.ratio, 3.5)
  assert.equal(found.volume.confirmed, true)

  const blind = MULTI_YEAR().map((b) => ({ ...b, volume: 0 }))
  const unavailable = multiYearBreakout(blind, { timeframe: 'monthly', years: 5 })
  assert.match(unavailable.volume.unavailable, /zero or missing volume/)
  assert.equal(unavailable.volume.ratio, undefined)
})

test('a series making new highs constantly is not a breakout', () => {
  // Three percent a bar, every bar, for a hundred monthly bars. Every one of them
  // closes above the highest high of the preceding five years, because the highest
  // high of the preceding five years is the bar before it.
  const closes = Array.from({ length: 100 }, (_, i) => 100 * 1.03 ** i)
  const found = multiYearBreakout(bars(closes, { stepDays: 30 }), { timeframe: 'monthly', years: 5 })

  assert.equal(found.found, false)
  assert.match(found.reason, /making new highs rather than breaking out of a base/)
  assert.equal(found.breakout, undefined)
})

test('a series shorter than the window is refused with the reason, not with a guess', () => {
  const short = multiYearBreakout(MULTI_YEAR().slice(0, 40), { timeframe: 'monthly', years: 5 })
  assert.equal(short.found, false)
  assert.match(short.reason, /covers 3\.\d+ years/)
  assert.match(short.reason, /weekly series reaches about 12 years/)
})

/* ----------------------------------------------------- cup and handle ---- */

/**
 * A cup base, traced as a parabola between two equal rims, then a handle and a
 * breakout. `shape` decides what the base does between the rims: x squared for a
 * cup, |x| for the V that must be rejected.
 */
function cupSeries(shape) {
  const rim = 100
  const depth = 25
  const closes = walk(70, [{ to: rim, bars: 60 }]) // indices 0..60, the left rim at 60

  for (let i = 1; i <= 80; i++) {
    const x = (2 * i) / 80 - 1
    closes.push(rim - depth * (1 - shape(x))) // index 61..140, the right rim at 140
  }
  for (let i = 1; i <= 15; i++) closes.push(rim - (8 * i) / 15) // handle, index 141..155
  for (let i = 1; i <= 15; i++) closes.push(92 + (16 * i) / 15) // breakout leg, 156..170
  for (let i = 1; i <= 15; i++) closes.push(108 + (7 * i) / 15) // continuation

  const series = bars(closes)
  // Volume dries up through the handle and comes back on the breakout. Both are
  // measurements the detector makes, so both have to be in the fixture.
  for (let i = 141; i <= 155; i++) series[i].volume = 60000
  series[164].volume = 250000
  return series
}

const CUP = () => cupSeries((x) => x * x)
const VEE = () => cupSeries((x) => Math.abs(x))

test('a cup with a handle is found with its rims, base, handle and breakout', () => {
  const series = CUP()
  const [cup, ...extras] = cupAndHandle(series).found

  assert.ok(cup, 'a parabolic base between two equal rims was not reported as a cup')
  assert.equal(extras.length, 0, 'one chart feature was reported more than once')
  assert.equal(cup.status, 'confirmed')

  assert.equal(cup.leftRim.index, 60)
  assert.equal(cup.rightRim.index, 140)
  assert.equal(cup.rimLine.price, Number((100 * 1.004).toFixed(2)))
  assert.equal(cup.base.lowIndex, 100)
  assert.ok(cup.base.depthPercentOfRim > 24 && cup.base.depthPercentOfRim < 27)

  // The handle is a shallow pullback on lighter volume, and both halves of that
  // sentence are numbers here.
  assert.equal(cup.handle.lowIndex, 155)
  assert.equal(cup.handle.bars, 15)
  assert.ok(cup.handle.retracementOfCupPercent < BREAKOUT_TOLERANCES.handleMaxRetraceOfCup * 100)
  assert.equal(cup.handle.volume.declining, true)
  assert.equal(cup.handle.volume.ratio, 0.6)

  // The breakout is the first close through the rim line, and its volume is measured
  // against the median from the left rim forward.
  assert.equal(cup.breakout.index, 164)
  assert.equal(cup.breakout.date, series[164].date)
  assert.ok(series[163].close <= cup.rimLine.price * (1 + BREAKOUT_TOLERANCES.breakoutBufferPct))
  assert.equal(cup.volume.ratio, 2.5)
  assert.equal(cup.volume.confirmed, true)

  // The roundedness test is reported with its inputs, not as a verdict.
  assert.equal(cup.roundedness.betterFit, 'parabola')
  assert.equal(cup.roundedness.opensUpward, true)
  assert.ok(cup.roundedness.ratio >= BREAKOUT_TOLERANCES.roundednessMinRatio)
  assert.ok(cup.roundedness.timeNearLowPercent >= 25)
})

test('a V-shaped base is rejected as a cup', () => {
  const series = VEE()
  const result = cupAndHandle(series)

  assert.deepEqual(result.found, [], 'a V between two rims was reported as a cup')
  assert.match(result.rejections[0].why, /V-shaped/)

  // The rims, the depth and the handle are all identical to the cup fixture, so the
  // only thing that separated them was the shape of the base itself.
  const v = roundedness(series, 60, 140)
  assert.equal(v.betterFit, 'v')
  assert.equal(v.round, false)
  assert.ok(v.vRss < v.parabolaRss, 'the V fitted no better than the parabola')

  const cup = roundedness(CUP(), 60, 140)
  assert.equal(cup.betterFit, 'parabola')
  assert.equal(cup.round, true)
  assert.ok(cup.timeNearLowPercent > v.timeNearLowPercent, 'the V spent as long near its low as the cup did')
})

test('swing points indexed against a different series are not trusted', () => {
  const series = CUP()
  // The shape of what indicators.js hands over, but shifted by one bar, which is what
  // a filtered series does to an index. Reading the rim off bar 59 instead of 60 would
  // put every number in the finding on the wrong bar.
  const shifted = { highs: [{ index: 59, price: series[60].high, kind: 'high' }, { index: 139, price: series[140].high, kind: 'high' }] }
  const result = cupAndHandle(series, { swings: shifted })

  assert.match(result.swingsFrom, /indexed against a different series/)
  assert.equal(result.found[0].leftRim.index, 60, 'the detector used the misaligned indices')

  const honest = { highs: [{ index: 60, price: series[60].high, kind: 'high' }, { index: 140, price: series[140].high, kind: 'high' }] }
  assert.equal(cupAndHandle(series, { swings: honest }).swingsFrom, 'supplied by the caller')
})

/* ------------------------------------------------------- the base rate ---- */

test('the module can measure its own false positive rate, reproducibly', () => {
  const series = MULTI_YEAR()
  const measured = breakoutBaseline(series, { trials: 6, seed: 11, timeframe: 'monthly', years: 5 })

  assert.equal(measured.trials, 6)
  assert.equal(measured.barsPerTrial, series.length)
  assert.ok(measured.volatility.dailySigma > 0)
  for (const kind of ['multi-year-breakout', 'cup-and-handle']) {
    const rate = measured.firedPercent[kind]
    assert.ok(rate >= 0 && rate <= 100, `${kind} rate out of range: ${rate}`)
    assert.ok(measured.confirmedPercent[kind] <= rate, 'more confirmations than detections')
  }

  assert.deepEqual(
    breakoutBaseline(series, { trials: 6, seed: 11, timeframe: 'monthly', years: 5 }).firedPercent,
    measured.firedPercent
  )
  assert.match(breakoutBaseline(series.slice(0, 20)).unavailable, /at least 60 real bars/)
})

test('every finding carries the base rate with it', () => {
  const found = multiYearBreakout(MULTI_YEAR(), { timeframe: 'monthly', years: 5 })
  assert.match(found.baseRate.howToCheck, /breakoutBaseline/)
  assert.match(found.baseRate.what, /not evidence about what price does next/)
})

/* ------------------------------------------------------------ the line ---- */

function keysOf(node, found = []) {
  if (Array.isArray(node)) node.forEach((n) => keysOf(n, found))
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.push(key)
      keysOf(value, found)
    }
  }
  return found
}

test('no returned object carries a target or an invalidation level, by field or by phrase', () => {
  // The textbook cup and handle ships with a measured move objective: the rim plus
  // the depth of the cup. That objective is a price target under reg 2(1)(wa)(iv),
  // so the depth is reported and the sum is never computed. Neither is a stop loss.
  const banned = /target|invalidat|stop.?loss|projected|projection|measured.?move|expected.?move|objective|entry|exit/i
  const results = [
    detectBreakouts(MULTI_YEAR(), { timeframe: 'monthly', years: 5 }),
    detectBreakouts(CUP(), { timeframe: 'daily', years: 5 }),
    detectBreakouts(VEE(), { timeframe: 'daily', years: 3 }),
    breakoutBaseline(MULTI_YEAR(), { trials: 3, seed: 5, timeframe: 'monthly', years: 5 }),
  ]

  for (const result of results) {
    for (const key of keysOf(result)) {
      assert.equal(banned.test(key), false, `forbidden field name: ${key}`)
    }
    assert.doesNotThrow(() => assertPublishable(result))
  }
})

test('a series with no shape in it says so, with the reason, on both detectors', () => {
  const flat = detectBreakouts(bars(walk(100, [{ to: 104, bars: 300 }])), { timeframe: 'daily', years: 3 })
  assert.deepEqual(flat.findings, [])
  assert.equal(flat.notFound.length, 2)
  for (const missing of flat.notFound) assert.ok(missing.reason.length > 20, `${missing.kind} gave no reason`)
})
