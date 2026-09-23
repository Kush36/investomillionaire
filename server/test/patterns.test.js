// Run with: node --test test/
//
// A pattern detector is only as good as the things it refuses to find, so most of
// this file is about refusals: a series with no shape, a second bottom a fraction
// too high, two lows a fraction too close, a rally that stops just under the
// neckline. The last test is the regulatory one and it is the reason the module
// exists in the form it does.
//
// Every series here is constructed, not sampled, so the expected values are
// arithmetic rather than a snapshot of whatever the market did.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPatterns, randomWalkBaseline, TOLERANCES } from '../src/data/patterns.js'
import { assertPublishable } from '../src/data/policy.js'

/**
 * Build bars by walking linearly between the prices given.
 *
 * The intrabar range is a fixed 0.4% either side of the close, which keeps every
 * swing low exactly where the close turns and makes the expected numbers in these
 * tests computable by hand.
 */
function series(start, segments) {
  const closes = [start]
  for (const { to, bars } of segments) {
    const from = closes[closes.length - 1]
    for (let i = 1; i <= bars; i++) closes.push(from + ((to - from) * i) / bars)
  }
  const t0 = Date.UTC(2024, 0, 1)
  return closes.map((close, i) => ({
    date: new Date(t0 + i * 86400000).toISOString().slice(0, 10),
    open: close,
    high: close * 1.004,
    low: close * 0.996,
    close,
    volume: 100000,
  }))
}

// Decline into a low at index 40, a rally to 118, a second low at index 80, then a
// close above the neckline, a pullback to it, and a continuation.
const TEXTBOOK = () =>
  series(160, [
    { to: 100, bars: 40 },
    { to: 118, bars: 20 },
    { to: 101, bars: 20 },
    { to: 125, bars: 20 },
    { to: 118.8, bars: 6 },
    { to: 135, bars: 15 },
  ])

const kinds = (result, kind) => result.patterns.filter((p) => p.kind === kind)

/* ------------------------------------------------------- double bottom ---- */

test('a constructed textbook double bottom is detected with its components', () => {
  const bars = TEXTBOOK()
  const result = detectPatterns(bars)
  const [pattern, ...extras] = kinds(result, 'double-bottom')

  assert.ok(pattern, 'no double bottom found in a textbook double bottom')
  assert.equal(extras.length, 0, 'one chart feature was reported more than once')
  assert.equal(pattern.status, 'confirmed')

  // The two lows are the bar where the trend turned, and the neckline is the high
  // of the rally between them.
  assert.equal(pattern.bottoms[0].index, 40)
  assert.equal(pattern.bottoms[1].index, 80)
  assert.equal(pattern.neckline.index, 60)
  assert.equal(pattern.neckline.price, Number((118 * 1.004).toFixed(2)))

  // Breakout is the first CLOSE clearing the neckline by the buffer.
  assert.ok(pattern.breakout, 'the breakout was not located')
  assert.ok(pattern.breakout.close > pattern.neckline.price * (1 + TOLERANCES.breakoutBufferPct))
  assert.ok(bars[pattern.breakout.index - 1].close <= pattern.neckline.price * (1 + TOLERANCES.breakoutBufferPct))

  assert.equal(pattern.retest.occurred, true, 'the pullback to the neckline was missed')
  assert.ok(pattern.measurements.separationBars === 40)
  assert.ok(pattern.confidence.rules.length >= 5, 'the score did not expose its inputs')
  assert.equal(
    pattern.confidence.score,
    pattern.confidence.rules.reduce((sum, r) => sum + r.points, 0),
    'the score does not equal the sum of the rules shown'
  )
})

test('volume confirmation is a measured ratio, not a label', () => {
  const flat = detectPatterns(TEXTBOOK())
  const quiet = kinds(flat, 'double-bottom')[0]
  // Every bar carries the same volume, so the breakout bar is exactly the median.
  assert.equal(quiet.volume.ratio, 1)
  assert.equal(quiet.volume.confirmed, false)

  const bars = TEXTBOOK()
  bars[quiet.breakout.index].volume = 300000
  const loud = kinds(detectPatterns(bars), 'double-bottom')[0]
  assert.equal(loud.volume.baselineMedian, 100000)
  assert.equal(loud.volume.ratio, 3)
  assert.equal(loud.volume.confirmed, true)
})

test('volume that the source did not report is unavailable, not assumed', () => {
  const bars = TEXTBOOK().map((b) => ({ ...b, volume: 0 }))
  const pattern = kinds(detectPatterns(bars), 'double-bottom')[0]
  assert.match(pattern.volume.unavailable, /zero or missing volume/)
  assert.equal(pattern.volume.ratio, undefined)
})

test('a triple bottom is reported as a triple bottom', () => {
  const bars = series(160, [
    { to: 100, bars: 40 },
    { to: 115, bars: 12 },
    { to: 101, bars: 12 },
    { to: 116, bars: 12 },
    { to: 100.8, bars: 12 },
    { to: 130, bars: 25 },
    { to: 128, bars: 10 },
  ])
  const pattern = kinds(detectPatterns(bars), 'triple-bottom')[0]
  assert.ok(pattern, 'three lows at one level were not reported as a triple bottom')
  assert.equal(pattern.bottoms.length, 3)
  // The neckline is the higher of the two intervening peaks, which is the second.
  assert.equal(pattern.neckline.index, 76)
  assert.equal(pattern.status, 'confirmed')
})

/* ------------------------------------------------------------ refusals ---- */

test('a series with no pattern returns nothing rather than the nearest shape', () => {
  const bars = series(100, [{ to: 200, bars: 150 }])
  const result = detectPatterns(bars)
  assert.deepEqual(result.patterns, [])
  assert.equal(result.unavailable, undefined, 'a clean series is not an unavailable one')
  assert.equal(result.swings.lows.length, 0)
})

test('too few bars is unavailable with the reason, not an empty result', () => {
  const result = detectPatterns(series(100, [{ to: 120, bars: 40 }]))
  assert.deepEqual(result.patterns, [])
  assert.match(result.unavailable, /at least \d+ bars and received 41/)
})

/* -------------------------------------------------------- the tolerances ---- */

test('the equality tolerance decides where two lows stop being one level', () => {
  const at = (second) =>
    kinds(
      detectPatterns(
        series(160, [
          { to: 100, bars: 40 },
          { to: 118, bars: 20 },
          { to: second, bars: 20 },
          { to: 135, bars: 30 },
        ])
      ),
      'double-bottom'
    )

  // 2.5% apart: inside the 3% tolerance, so the same level.
  assert.equal(at(102.5).length, 1)
  // 5% apart: two different lows that happen to be near each other.
  assert.equal(at(105).length, 0)
})

test('the separation tolerance decides where one notch becomes two bottoms', () => {
  const at = (leg) =>
    kinds(
      detectPatterns(
        series(160, [
          { to: 100, bars: 40 },
          { to: 112, bars: leg },
          { to: 100.5, bars: leg },
          { to: 130, bars: 25 },
          { to: 128, bars: 30 },
        ])
      ),
      'double-bottom'
    )

  // 8 bars apart is one consolidation with a spike through it.
  assert.equal(at(4).length, 0)
  // 12 bars apart clears the 10-bar floor.
  assert.equal(at(6).length, 1)
})

test('an intraday poke above the neckline is not a breakout', () => {
  // The rally stops at a close 0.1% above the neckline, under the 0.5% buffer, while
  // the bar's high is well above it.
  const bars = series(160, [
    { to: 100, bars: 40 },
    { to: 118, bars: 20 },
    { to: 101, bars: 20 },
    { to: 118.6, bars: 20 },
    { to: 118, bars: 10 },
  ])
  const pattern = kinds(detectPatterns(bars), 'double-bottom')[0]

  assert.ok(pattern, 'the shape itself should still be described')
  assert.equal(pattern.status, 'unconfirmed')
  assert.equal(pattern.breakout, null)
  assert.equal(pattern.volume, null)
  const highest = Math.max(...bars.slice(81).map((b) => b.high))
  assert.ok(highest > pattern.neckline.price, 'the test series never pierced the neckline intraday')
})

/* ---------------------------------------------------- parallel channel ---- */

test('a parallel channel is found and its lines carry their touches', () => {
  // Five swings between two rising rails.
  const bars = series(100, [
    { to: 90, bars: 15 },
    { to: 112, bars: 15 },
    { to: 96, bars: 15 },
    { to: 118, bars: 15 },
    { to: 102, bars: 15 },
    { to: 124, bars: 15 },
    { to: 108, bars: 15 },
    { to: 130, bars: 15 },
  ])
  const channel = kinds(detectPatterns(bars), 'parallel-channel')[0]

  assert.ok(channel, 'a rising channel with four touches a side was not found')
  assert.ok(channel.upperLine.touches.length >= TOLERANCES.channelMinTouches)
  assert.ok(channel.lowerLine.touches.length >= TOLERANCES.channelMinTouches)
  assert.ok(channel.upperLine.slopePerBar > 0 && channel.lowerLine.slopePerBar > 0)
  assert.ok(channel.measurements.widthDriftPercent <= TOLERANCES.channelWidthDriftPct * 100)
  assert.equal(channel.measurements.direction, 'rising')
})

test('a widening range is a wedge, not a channel', () => {
  const bars = series(100, [
    { to: 96, bars: 15 },
    { to: 106, bars: 15 },
    { to: 88, bars: 15 },
    { to: 116, bars: 15 },
    { to: 76, bars: 15 },
    { to: 128, bars: 15 },
    { to: 64, bars: 15 },
    { to: 140, bars: 15 },
  ])
  assert.equal(kinds(detectPatterns(bars), 'parallel-channel').length, 0)
})

/* ------------------------------------------------------- the base rate ---- */

test('the module can measure its own false positive rate', () => {
  const bars = TEXTBOOK()
  const measured = randomWalkBaseline(bars, { trials: 25, seed: 7 })

  assert.equal(measured.trials, 25)
  assert.equal(measured.barsPerTrial, bars.length)
  assert.ok(measured.volatility.dailySigma > 0)
  for (const kind of ['double-bottom', 'triple-bottom', 'parallel-channel']) {
    const rate = measured.firedPercent[kind]
    assert.ok(rate >= 0 && rate <= 100, `${kind} rate out of range: ${rate}`)
    assert.ok(measured.confirmedPercent[kind] <= rate, 'more confirmations than detections')
  }

  // A base rate that moves on every refresh is not a measurement.
  assert.deepEqual(randomWalkBaseline(bars, { trials: 25, seed: 7 }).firedPercent, measured.firedPercent)

  const tooShort = randomWalkBaseline(bars.slice(0, 30))
  assert.match(tooShort.unavailable, /at least 60 real bars/)
})

test('every detection carries the base rate caveat with it', () => {
  const pattern = kinds(detectPatterns(TEXTBOOK()), 'double-bottom')[0]
  assert.match(pattern.baseRate.measured, /random walks/)
  assert.match(pattern.baseRate.howToCheck, /randomWalkBaseline/)
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

test('nothing returned is a price target or a stop loss, by field or by phrase', () => {
  const bars = TEXTBOOK()
  bars[96].volume = 400000
  const results = [detectPatterns(bars), randomWalkBaseline(bars, { trials: 5, seed: 3 })]

  // The owner's spec asked for a target zone and an invalidation level on every
  // pattern. Both are named in reg 2(1)(wa)(iv). They are not computed, so they
  // cannot be exposed by a later refactor either.
  const banned = /target|invalidat|stop.?loss|projected|projection|expected.?move|entry|exit/i
  for (const result of results) {
    for (const key of keysOf(result)) {
      assert.equal(banned.test(key), false, `forbidden field name: ${key}`)
    }
    // And every string the engine wrote has to clear policy.js.
    assert.doesNotThrow(() => assertPublishable(result))
  }
})
