// Run with: node --test test/
//
// Four things have to be true for the indicator module to be worth having, and each
// gets a test here: the arithmetic agrees with a value computed by hand, it agrees
// with a published worked example, it refuses to answer when the history is too
// short, and the swing detector finds the swings a human would point at.
//
// The refusal test is the important one. Every other failure produces a number that
// is visibly wrong; a missing refusal produces a number that looks right.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  warmupBars,
  rsiWarmup,
  macdWarmup,
  ema,
  rsi,
  macd,
  atr,
  relativeVolume,
  deliveryPercent,
  swingPoints,
  marketStructure,
  HORIZONS,
} from '../src/data/indicators.js'
import { assertPublishable } from '../src/data/policy.js'

// Bars in the shape prices.js emits. high and low sit one rupee either side of the
// close, so a local maximum of the close sequence is also a local maximum of the
// highs and the swing cases stay readable.
function series(closes, start = 0) {
  return closes.map((close, i) => {
    const day = new Date(Date.UTC(2026, 0, 1 + start + i))
    return {
      date: day.toISOString().slice(0, 10),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100000,
    }
  })
}

test('EMA matches a value computed by hand', () => {
  // Closes 2, 4, 6 ... 24. Period 3, so alpha = 2/4 = 0.5 and the seed is the SMA of
  // the first three closes, (2+4+6)/3 = 4.
  //   bar 4 (close 8):  8 * 0.5 + 4 * 0.5 = 6
  //   bar 5 (close 10): 10 * 0.5 + 6 * 0.5 = 8
  //   bar 6 (close 12): 12 * 0.5 + 8 * 0.5 = 10
  // On an arithmetic series of step 2 the EMA settles exactly two behind the close,
  // so the last bar, close 24, must give 22.
  const bars = series(Array.from({ length: 12 }, (_, i) => 2 * (i + 1)))
  const out = ema(bars, 3)

  assert.equal(out.value, 22)
  assert.equal(out.period, 3)
  assert.equal(out.asOf, bars[bars.length - 1].date)
  // 12 bars clears the 10 a 3 EMA needs, which is why this one answers at all.
  assert.equal(out.warmup, 10)
})

// Wilder's 14-day RSI worked example, the one reproduced in his own book and in the
// StockCharts write-up of it. Any implementation that disagrees with this table is
// not computing RSI, whatever it computes.
const WILDER = [
  44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433,
  46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282, 46.0028, 46.0328, 46.4116,
  46.2222, 45.6439, 46.2122, 46.2521, 45.7137, 46.4515, 45.7835, 45.3548, 44.0288,
  44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314,
]

test('RSI matches the published Wilder worked example', () => {
  const bars = series(WILDER)
  // minBars is the deliberate test hatch: the published example runs on 33 bars and
  // the honest gate wants 78, so the gate is lowered HERE and nowhere else. Its own
  // test is below.
  const at = (n) => rsi(bars.slice(0, n), 14, { minBars: 15 }).value

  assert.equal(at(15), 70.53) // first value, from the seeding averages
  assert.equal(at(16), 66.32) // first value produced by Wilder's smoothing
  assert.equal(at(17), 66.55)
  assert.equal(at(18), 69.41)
  assert.equal(at(33), 37.77) // last row of the published table
})

test('the insufficient-history refusal fires instead of a number', () => {
  // 661, not "about 200". A 200 EMA seeded at bar 200 still carries more than 1% of
  // that seed 460 bars later.
  assert.equal(warmupBars(200), 661)
  assert.equal(rsiWarmup(14), 78)
  assert.deepEqual(macdWarmup(12, 26, 9), { line: 86, signal: 115 })

  const bars = series(Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 7) * 5))

  const slow = ema(bars, 200)
  assert.equal(slow.value, undefined)
  assert.equal(slow.unavailable, 'needs 661 bars, have 300')
  assert.equal(slow.needs, 661)
  assert.equal(slow.have, 300)

  // The gate is per indicator, not per request: 300 bars is plenty for a 50 EMA.
  assert.equal(typeof ema(bars, 50).value, 'number')

  const short = series(WILDER)
  assert.equal(rsi(short, 14).unavailable, 'needs 78 bars, have 33')
  assert.equal(atr(short, 14).unavailable, 'needs 78 bars, have 33')
  assert.equal(relativeVolume(short.slice(0, 10), 20).unavailable, 'needs 21 bars, have 10')

  // MACD refuses its line and its signal separately, because the line becomes
  // trustworthy 29 bars before the signal does.
  const hundred = bars.slice(0, 100)
  const partial = macd(hundred)
  assert.equal(typeof partial.value, 'number')
  assert.equal(partial.signal.unavailable, 'needs 115 bars, have 100')
  assert.equal(partial.histogram.unavailable, 'needs 115 bars, have 100')
  assert.equal(typeof macd(bars).histogram, 'number')

  // Nothing derives delivery from OHLCV, so the answer is the reason it is missing.
  assert.match(deliveryPercent(bars).unavailable, /bhavcopy/)
  assert.equal(deliveryPercent(series([10, 20]).map((b) => ({ ...b, deliveryPercent: 41.2 }))).value, 41.2)
})

test('swing detection finds the constructed swings and reads the structure', () => {
  //  idx: 0    1    2    3    4    5    6    7    8    9   10   11   12   13   14  15
  //       100  102  104 [106] 104 [102] 104  106 [110] 108 [106] 108 [112] 110  108 109
  // Peaks at 3, 8 and 12, troughs at 5 and 10, each with two lower or higher bars on
  // both sides. Index 2 is not a peak: 104 does not exceed the 104 at index 4.
  const bars = series([100, 102, 104, 106, 104, 102, 104, 106, 110, 108, 106, 108, 112, 110, 108, 109])
  const { points, unconfirmedTailBars } = swingPoints(bars, { lookback: 2 })

  assert.deepEqual(
    points.map((p) => [p.index, p.kind, p.price]),
    [
      [3, 'high', 107],
      [5, 'low', 101],
      [8, 'high', 111],
      [10, 'low', 105],
      [12, 'high', 113],
    ]
  )
  // A fractal is only confirmed by the bars after it, so the last two bars are never
  // classified, however tempting the shape looks.
  assert.equal(unconfirmedTailBars, 2)
  assert.equal(points[0].confirmedOn, bars[5].date)

  const structure = marketStructure(bars, { lookback: 2 })
  assert.equal(structure.structure, 'HH-HL')
  assert.deepEqual(structure.highs.map((h) => h.label), [null, 'higher-high', 'higher-high'])
  assert.deepEqual(structure.lows.map((l) => l.label), [null, 'higher-low'])
  assert.equal(structure.range.inRange, false)
  // The pattern engine gets the points themselves rather than re-detecting them and
  // disagreeing about where the swings are.
  assert.equal(structure.swings.length, 5)
})

test('a flat oscillation reads as a range, and too little history refuses', () => {
  const bars = series([100, 101, 102, 101, 100, 101, 102, 101, 100, 101, 102, 101, 100, 101])
  const structure = marketStructure(bars, { lookback: 2 })

  assert.equal(structure.structure, 'range')
  assert.equal(structure.range.inRange, true)
  assert.deepEqual(structure.highs.map((h) => h.label), [null, 'equal-high', 'equal-high'])

  assert.match(swingPoints(series([100, 101, 102, 101]), { lookback: 2 }).unavailable, /needs 5 bars, have 4/)
  // Swings exist but there is only one of each, which is not a sequence.
  assert.match(
    marketStructure(series([100, 102, 104, 102, 100, 102, 104]), { lookback: 2 }).unavailable,
    /needs 2 confirmed swing highs and 2 swing lows/
  )
})

test('the horizon map is data the engine may publish', () => {
  assert.equal(HORIZONS.intraday.supported, false)
  assert.match(HORIZONS.intraday.unavailable, /No free intraday source/)
  assert.deepEqual(HORIZONS.intraday.timeframes, {})

  for (const [name, horizon] of Object.entries(HORIZONS)) {
    if (!horizon.supported) continue
    const weights = Object.values(horizon.timeframes)
    const total = weights.reduce((sum, w) => sum + w, 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `${name} weights sum to ${total}`)
  }

  // Everything the engine emits goes through policy.js, including its static data.
  assertPublishable(HORIZONS)
  const bars = series([100, 102, 104, 106, 104, 102, 104, 106, 110, 108, 106, 108, 112, 110, 108, 109])
  assertPublishable(marketStructure(bars, { lookback: 2 }))
})
