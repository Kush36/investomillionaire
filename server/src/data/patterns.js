// Chart patterns, and an honest account of what finding one is worth.
//
// Pure computation: bars in, data out. Nothing here fetches, and nothing here knows
// which company it is looking at. The caller supplies bars from prices.js (oldest
// first) and, when it has them, the swing points from indicators.js.
//
// Two decisions shape this whole module.
//
// The first is regulatory. The original spec asked each pattern to carry a target
// zone and an invalidation level. Both are named verbatim in SEBI reg 2(1)(wa)(iv)
// as a price target and a stop loss, so neither is computed here, under any name.
// policy.js throws if either reaches a response. What survives is the description:
// where the points sit, what the neckline is, which bar broke it, how much volume
// came with it, whether price came back to test it. All of that is measurement.
//
// The second is statistical, and it is the reason this file is longer than the
// detectors need to be. A fully confirmed double bottom fires on roughly 95% of
// four-year geometric random walks. A detector that reports a pattern without
// reporting that number is selling false precision. So every detection carries the
// base rate as data, and randomWalkBaseline() re-measures it on a synthetic series
// matched to the length and volatility of the real one.

/**
 * Every threshold the detectors use, in one place, because a pattern engine is
 * nothing but its tolerances and a reader who cannot see them cannot argue with
 * the result. Each is overridable per call.
 */
export const TOLERANCES = {
  // A bar is a swing low when no bar within this many either side traded lower.
  // Five is one trading week on the daily timeframe. Tighter produces pivots on
  // ordinary noise; wider misses the second bottom of a fast W.
  swingLookback: 5,

  // How close two bottoms must be to count as the same level, as a fraction of
  // their mean. A daily bar on a liquid NSE mid-cap ranges 1.5-2%, so two lows
  // within 3% are inside about two bars of noise of each other and a trader
  // reading the chart would call them equal. Bulkowski's survey uses 4%; this is
  // deliberately tighter, because every point of slack multiplies the number of
  // random pairs that qualify.
  equalityPct: 0.03,

  // Closer than this and the two lows are one consolidation with a notch in it,
  // not two separate tests of a level. Ten daily bars is a fortnight.
  minSeparationBars: 10,

  // Farther than this and the level is older than what the order book remembers.
  // It also bounds the cost: qualifying pairs grow with the square of the window,
  // and so does the false positive rate. 120 daily bars is roughly six months.
  maxSeparationBars: 120,

  // The rally between the bottoms must lift price at least this far off them,
  // otherwise the shape is a flat base with two ticks in it rather than a W. The
  // same figure gates the decline into the first bottom: a double bottom with no
  // downtrend before it is not a reversal of anything.
  minRisePct: 0.08,

  // How far back to look for that prior decline.
  priorTrendBars: 30,

  // A breakout is a CLOSE above the neckline by this much, never an intraday
  // poke. Intraday pokes that close back inside are the single largest source of
  // phantom breakouts, and half a percent clears ordinary tick noise.
  breakoutBufferPct: 0.005,

  // How long after the second bottom a breakout still belongs to the pattern.
  breakoutWindowBars: 60,

  // Volume confirmation is the breakout bar's volume against the MEDIAN of this
  // many bars before it. Median, not mean, because one news day drags a mean up
  // and quietly excuses a weak breakout.
  volumeBaselineBars: 20,

  // The conventional threshold for "volume confirmed the breakout". The measured
  // ratio is always reported whether it clears this or not, so a reader who uses
  // 2.0 can apply their own.
  volumeConfirmRatio: 1.5,

  // A retest is price returning to within this much of the broken neckline, and
  // then closing back on the breakout side, inside this many bars.
  retestTolerancePct: 0.02,
  retestWindowBars: 20,

  // Channel: how many recent bars to fit, how close a swing must sit to a line to
  // count as touching it, and how many touches each line needs. Two points define
  // any line, so the third touch is what makes it a channel rather than arithmetic.
  channelWindowBars: 120,
  channelTouchTolerancePct: 0.02,
  channelMinTouches: 3,

  // Parallel, measured without units: the channel's width where the fit starts and
  // where it ends may differ by at most this fraction. Comparing slopes directly
  // would need a price scale to be meaningful; comparing widths does not.
  channelWidthDriftPct: 0.25,

  // A channel that does not contain price is not a channel. At least this fraction
  // of closes in the window must sit inside the two lines.
  channelContainmentPct: 0.9,

  // The most recent N of each kind are returned. A double bottom from 2021 is
  // history, not a finding, and returning forty of them buries the recent one.
  maxPerKind: 3,
}

// Attached to every detection. The numbers are from this project's own testing and
// are restated rather than recomputed per request, because recomputing them costs a
// few hundred detector passes; randomWalkBaseline() is the live measurement.
export const BASE_RATE_CAVEAT = {
  what: 'A chart pattern is a description of what price already did. It is not evidence about what price does next.',
  measured:
    'In this project\'s testing a fully confirmed double bottom fired on 94.7% of four-year geometric random walks, with a measured expectancy of +0.004R on pure noise.',
  meaning:
    'A series of this length produces this shape by chance at close to the rate it produces it for any other reason, so the detection on its own carries almost no information.',
  howToCheck:
    'randomWalkBaseline(bars) runs these same detectors over synthetic series matched to this series in length and volatility, and reports how often each one fires by chance.',
}

/* ------------------------------------------------------------- helpers ---- */

const pct = (value) => Number((value * 100).toFixed(2))
const round = (value) => Number(value.toFixed(2))

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Swing pivots, used only when the caller passes none.
 *
 * indicators.js owns the canonical swing series; a route should pass it in so the
 * chart and the pattern list agree about where the pivots are. This fallback exists
 * so the module and its tests stand alone with no cross-import.
 *
 * The left comparison is inclusive and the right is strict, which makes the FIRST
 * bar of a flat bottom the pivot instead of emitting one pivot per equal bar.
 */
export function pivots(bars, lookback = TOLERANCES.swingLookback) {
  const lows = []
  const highs = []
  for (let i = lookback; i < bars.length - lookback; i++) {
    let isLow = true
    let isHigh = true
    for (let k = i - lookback; k <= i + lookback && (isLow || isHigh); k++) {
      if (k === i) continue
      const left = k < i
      if (left ? bars[k].low <= bars[i].low : bars[k].low < bars[i].low) isLow = false
      if (left ? bars[k].high >= bars[i].high : bars[k].high > bars[i].high) isHigh = false
    }
    if (isLow) lows.push({ index: i, date: bars[i].date, price: bars[i].low, kind: 'low' })
    if (isHigh) highs.push({ index: i, date: bars[i].date, price: bars[i].high, kind: 'high' })
  }
  return { lows, highs }
}

// Accepts what indicators.js is likely to hand over in any of the obvious shapes,
// and re-reads the price off the bar rather than trusting the caller's copy of it.
function normaliseSwings(bars, swings, lookback) {
  if (!swings) return pivots(bars, lookback)

  const flat = Array.isArray(swings) ? swings : [...(swings.lows ?? []), ...(swings.highs ?? [])]
  const lows = []
  const highs = []
  for (const point of flat) {
    const index = point.index ?? point.i ?? point.bar
    const bar = bars[index]
    if (!bar) continue
    const kind = point.kind ?? point.type ?? (Array.isArray(swings) ? null : swings.lows?.includes(point) ? 'low' : 'high')
    const entry = { index, date: bar.date, price: kind === 'low' ? bar.low : bar.high, kind }
    if (kind === 'low') lows.push(entry)
    else if (kind === 'high') highs.push(entry)
  }
  if (!lows.length && !highs.length) return pivots(bars, lookback)
  lows.sort((a, b) => a.index - b.index)
  highs.sort((a, b) => a.index - b.index)
  return { lows, highs }
}

// The house scoring shape, the same one verdict.js uses: every rule that fired, with
// its own points and the range it could have contributed, so the reader can discard
// any single rule and recompute.
function rule(label, detail, points, min, max) {
  return { label, detail, points, min, max }
}

function confidenceFrom(rules) {
  const score = rules.reduce((sum, r) => sum + r.points, 0)
  const worst = rules.reduce((sum, r) => sum + r.min, 0)
  const best = rules.reduce((sum, r) => sum + r.max, 0)
  const normalised = best === worst ? 0 : (score - worst) / (best - worst)
  return {
    score,
    best,
    worst,
    normalised: Number(normalised.toFixed(3)),
    band: normalised >= 0.75 ? 'textbook' : normalised >= 0.5 ? 'partial' : 'loose',
    // Said plainly because the word "confidence" invites the wrong reading.
    means: 'How closely the shape matched the definition above. It is not a probability that the move continues.',
    rules,
  }
}

function extremeBetween(bars, from, to, field) {
  let best = null
  for (let i = from; i <= to && i < bars.length; i++) {
    const value = bars[i][field]
    if (best === null || (field === 'high' ? value > best.price : value < best.price)) {
      best = { index: i, date: bars[i].date, price: value }
    }
  }
  return best
}

/**
 * Volume on the breakout bar against the median of the bars before it.
 *
 * Returns the measured ratio either way. "Confirmed" is a label applied to a number
 * the reader can see, not a verdict replacing it.
 */
function volumeAt(bars, index, t) {
  const from = Math.max(0, index - t.volumeBaselineBars)
  const baseline = median(bars.slice(from, index).map((b) => b.volume).filter((v) => Number.isFinite(v) && v > 0))
  const breakoutVolume = bars[index]?.volume

  if (!baseline || !Number.isFinite(breakoutVolume) || breakoutVolume <= 0) {
    return {
      unavailable: 'Volume unavailable: the source reported zero or missing volume across the baseline window.',
      breakoutVolume: Number.isFinite(breakoutVolume) ? breakoutVolume : null,
      baselineMedian: baseline,
    }
  }

  const ratio = Number((breakoutVolume / baseline).toFixed(2))
  return {
    breakoutVolume,
    baselineMedian: Math.round(baseline),
    baselineBars: index - from,
    ratio,
    threshold: t.volumeConfirmRatio,
    confirmed: ratio >= t.volumeConfirmRatio,
    basis: `Breakout bar volume divided by the median volume of the ${index - from} bars before it.`,
  }
}

// First close clearing a level by the buffer, searched forward inside a window.
function breakoutAbove(bars, level, fromIndex, t) {
  const limit = Math.min(bars.length - 1, fromIndex + t.breakoutWindowBars)
  for (let i = fromIndex; i <= limit; i++) {
    if (bars[i].close > level * (1 + t.breakoutBufferPct)) {
      return {
        index: i,
        date: bars[i].date,
        close: round(bars[i].close),
        marginPercent: pct(bars[i].close / level - 1),
        basis: `Close above the level by more than ${pct(t.breakoutBufferPct)}%. An intraday high above it does not count.`,
      }
    }
  }
  return null
}

/**
 * Did price come back and test the level it broke?
 *
 * Stated as an observation, not as a quality: a retest is simply a later bar that
 * traded back to the level and closed on the breakout side of it.
 */
function retestAfter(bars, level, breakoutIndex, t, direction = 'above') {
  const limit = Math.min(bars.length - 1, breakoutIndex + t.retestWindowBars)
  for (let i = breakoutIndex + 1; i <= limit; i++) {
    const touched =
      direction === 'above'
        ? bars[i].low <= level * (1 + t.retestTolerancePct)
        : bars[i].high >= level * (1 - t.retestTolerancePct)
    const heldSide = direction === 'above' ? bars[i].close >= level : bars[i].close <= level
    if (touched && heldSide) {
      const extreme = direction === 'above' ? bars[i].low : bars[i].high
      return {
        occurred: true,
        index: i,
        date: bars[i].date,
        price: round(extreme),
        distancePercent: pct(Math.abs(extreme / level - 1)),
        barsAfterBreakout: i - breakoutIndex,
      }
    }
  }
  return {
    occurred: false,
    reason:
      breakoutIndex + t.retestWindowBars >= bars.length - 1
        ? `The series ends ${bars.length - 1 - breakoutIndex} bars after the breakout, so the ${t.retestWindowBars}-bar retest window is incomplete.`
        : `No bar within ${t.retestWindowBars} of the breakout traded back to within ${pct(t.retestTolerancePct)}% of the level.`,
  }
}

/* ------------------------------------------------- double and triple bottom ---- */

// Both bottoms detectors share their entire vocabulary, so they share one builder.
// The only structural differences are how many lows are involved and which peak
// becomes the neckline.
function bottomPattern(kind, bars, points, t) {
  const first = points[0]
  const last = points[points.length - 1]
  const prices = points.map((p) => p.price)
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length
  const spreadPct = (Math.max(...prices) - Math.min(...prices)) / mean

  // The neckline is the highest high between the outer bottoms. For a triple bottom
  // that is the higher of the two intervening peaks, which is the conventional and
  // the more demanding choice.
  const neckline = extremeBetween(bars, first.index, last.index, 'high')
  if (!neckline) return null

  const base = Math.min(...prices)
  const risePct = (neckline.price - base) / base
  if (risePct < t.minRisePct) return null

  // No decline into the first bottom means there is nothing for a reversal pattern
  // to reverse; two dips inside a rising series are not a double bottom.
  const priorHigh = extremeBetween(bars, Math.max(0, first.index - t.priorTrendBars), first.index - 1, 'high')
  if (!priorHigh || (priorHigh.price - first.price) / first.price < t.minRisePct) return null

  const breakout = breakoutAbove(bars, neckline.price, last.index + 1, t)
  const volume = breakout ? volumeAt(bars, breakout.index, t) : null
  const retest = breakout ? retestAfter(bars, neckline.price, breakout.index, t) : null

  const rules = [
    rule(
      'Level agreement',
      `The ${points.length} lows sit within ${pct(spreadPct)}% of each other, against a tolerance of ${pct(t.equalityPct)}%`,
      spreadPct <= t.equalityPct / 3 ? 2 : spreadPct <= t.equalityPct / 1.5 ? 1 : 0,
      0,
      2
    ),
    rule(
      'Separation',
      `${last.index - first.index} bars between the outer lows`,
      last.index - first.index >= 20 && last.index - first.index <= 90 ? 1 : 0,
      0,
      1
    ),
    rule(
      'Neckline prominence',
      `The rally between the lows reached ${pct(risePct)}% above the lower of them`,
      risePct >= 0.2 ? 2 : risePct >= 0.12 ? 1 : 0,
      0,
      2
    ),
    rule(
      'Breakout',
      breakout
        ? `Closed ${breakout.marginPercent}% above the neckline on ${breakout.date}`
        : 'No close above the neckline yet, so the shape is unconfirmed',
      breakout ? 2 : 0,
      0,
      2
    ),
    rule(
      'Volume on the breakout',
      volume?.unavailable ?? (volume ? `Breakout volume was ${volume.ratio}x the ${volume.baselineBars}-bar median` : 'No breakout to measure'),
      volume?.ratio == null ? 0 : volume.ratio >= t.volumeConfirmRatio ? 2 : volume.ratio >= 1 ? 1 : -1,
      -1,
      2
    ),
    rule(
      'Retest',
      retest?.occurred ? `Price returned to within ${retest.distancePercent}% of the neckline on ${retest.date} and closed above it` : 'No retest recorded',
      retest?.occurred ? 1 : 0,
      0,
      1
    ),
  ]

  return {
    kind,
    status: breakout ? 'confirmed' : 'unconfirmed',
    definition:
      kind === 'double-bottom'
        ? 'Two lows at the same level separated by a rally, with a close above the high of that rally.'
        : 'Three lows at the same level separated by two rallies, with a close above the higher of them.',
    bottoms: points.map((p, i) => ({ order: i + 1, index: p.index, date: p.date, price: round(p.price) })),
    neckline: {
      price: round(neckline.price),
      index: neckline.index,
      date: neckline.date,
      basis: 'The highest high traded between the outer lows.',
    },
    breakout,
    volume,
    retest,
    measurements: {
      lowSpreadPercent: pct(spreadPct),
      separationBars: last.index - first.index,
      riseToNecklinePercent: pct(risePct),
      priorDeclinePercent: pct((priorHigh.price - first.price) / first.price),
      necklineToLastClosePercent: pct(bars[bars.length - 1].close / neckline.price - 1),
    },
    confidence: confidenceFrom(rules),
    tolerances: {
      equalityPct: t.equalityPct,
      minSeparationBars: t.minSeparationBars,
      maxSeparationBars: t.maxSeparationBars,
      minRisePct: t.minRisePct,
      breakoutBufferPct: t.breakoutBufferPct,
      volumeConfirmRatio: t.volumeConfirmRatio,
    },
    baseRate: BASE_RATE_CAVEAT,
  }
}

// Many pairs of lows share a second bottom and describe the same chart feature.
// Keeping the best-scoring one per anchor stops the list reporting one pattern six
// times with slightly different first legs.
function pickBest(found, anchorOf, limit) {
  const byAnchor = new Map()
  for (const item of found) {
    const key = anchorOf(item)
    const held = byAnchor.get(key)
    if (!held || item.confidence.normalised > held.confidence.normalised) byAnchor.set(key, item)
  }
  return [...byAnchor.values()].sort((a, b) => b.bottoms[b.bottoms.length - 1].index - a.bottoms[a.bottoms.length - 1].index).slice(0, limit)
}

export function doubleBottoms(bars, lows, t = TOLERANCES) {
  const found = []
  for (let a = 0; a < lows.length; a++) {
    for (let b = a + 1; b < lows.length; b++) {
      const gap = lows[b].index - lows[a].index
      if (gap < t.minSeparationBars) continue
      if (gap > t.maxSeparationBars) break // lows are ordered, so every later one is farther still
      const spread = Math.abs(lows[b].price - lows[a].price) / ((lows[a].price + lows[b].price) / 2)
      if (spread > t.equalityPct) continue
      const pattern = bottomPattern('double-bottom', bars, [lows[a], lows[b]], t)
      if (pattern) found.push(pattern)
    }
  }
  return pickBest(found, (p) => p.bottoms[1].index, t.maxPerKind)
}

export function tripleBottoms(bars, lows, t = TOLERANCES) {
  const found = []
  for (let a = 0; a < lows.length; a++) {
    for (let b = a + 1; b < lows.length; b++) {
      if (lows[b].index - lows[a].index < t.minSeparationBars) continue
      if (lows[b].index - lows[a].index > t.maxSeparationBars) break
      for (let c = b + 1; c < lows.length; c++) {
        if (lows[c].index - lows[b].index < t.minSeparationBars) continue
        // The span is measured end to end: three lows spread over more than the
        // window are three separate events that happen to share a price.
        if (lows[c].index - lows[a].index > t.maxSeparationBars) break
        const trio = [lows[a], lows[b], lows[c]]
        const prices = trio.map((p) => p.price)
        const mean = prices.reduce((x, y) => x + y, 0) / 3
        if ((Math.max(...prices) - Math.min(...prices)) / mean > t.equalityPct) continue
        const pattern = bottomPattern('triple-bottom', bars, trio, t)
        if (pattern) found.push(pattern)
      }
    }
  }
  return pickBest(found, (p) => p.bottoms[2].index, t.maxPerKind)
}

/* ---------------------------------------------------- parallel channel ---- */

function fitLine(points) {
  const n = points.length
  if (n < 2) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    sx += p.index
    sy += p.price
    sxx += p.index * p.index
    sxy += p.index * p.price
  }
  const denom = n * sxx - sx * sx
  if (!denom) return null
  const slope = (n * sxy - sx * sy) / denom
  return { slope, intercept: (sy - slope * sx) / n }
}

const priceOn = (line, index) => line.intercept + line.slope * index

/**
 * A channel is two roughly parallel lines that have each been touched at least
 * three times and that actually contain price between them. Two points define any
 * line, so the third touch is what separates a channel from arithmetic.
 *
 * The lines are fitted independently by least squares and then tested for
 * parallelism by how much the gap between them drifts across the window. Comparing
 * the slopes directly would need a price scale to mean anything; comparing the
 * width to itself does not.
 */
export function parallelChannel(bars, swings, t = TOLERANCES) {
  const start = Math.max(0, bars.length - t.channelWindowBars)
  const end = bars.length - 1
  const highs = swings.highs.filter((p) => p.index >= start)
  const lows = swings.lows.filter((p) => p.index >= start)
  if (highs.length < t.channelMinTouches || lows.length < t.channelMinTouches) return null

  const upper = fitLine(highs)
  const lower = fitLine(lows)
  if (!upper || !lower) return null

  const touching = (line, points) =>
    points.filter((p) => Math.abs(p.price / priceOn(line, p.index) - 1) <= t.channelTouchTolerancePct)
  const upperTouches = touching(upper, highs)
  const lowerTouches = touching(lower, lows)
  if (upperTouches.length < t.channelMinTouches || lowerTouches.length < t.channelMinTouches) return null

  const widthStart = priceOn(upper, start) - priceOn(lower, start)
  const widthEnd = priceOn(upper, end) - priceOn(lower, end)
  if (widthStart <= 0 || widthEnd <= 0) return null // the lines cross, so it is a wedge, not a channel
  const drift = Math.abs(widthEnd - widthStart) / Math.max(widthStart, widthEnd)
  if (drift > t.channelWidthDriftPct) return null

  let inside = 0
  let counted = 0
  for (let i = start; i <= end; i++) {
    counted++
    const hi = priceOn(upper, i) * (1 + t.channelTouchTolerancePct)
    const lo = priceOn(lower, i) * (1 - t.channelTouchTolerancePct)
    if (bars[i].close <= hi && bars[i].close >= lo) inside++
  }
  const containment = inside / counted
  if (containment < t.channelContainmentPct) return null

  // A channel breakout is the first close outside either line after the last touch.
  const lastTouch = Math.max(upperTouches[upperTouches.length - 1].index, lowerTouches[lowerTouches.length - 1].index)
  let breakout = null
  for (let i = lastTouch + 1; i <= end; i++) {
    const above = bars[i].close > priceOn(upper, i) * (1 + t.breakoutBufferPct)
    const below = bars[i].close < priceOn(lower, i) * (1 - t.breakoutBufferPct)
    if (above || below) {
      const line = above ? upper : lower
      breakout = {
        index: i,
        date: bars[i].date,
        close: round(bars[i].close),
        direction: above ? 'above the upper line' : 'below the lower line',
        linePrice: round(priceOn(line, i)),
        marginPercent: pct(Math.abs(bars[i].close / priceOn(line, i) - 1)),
        basis: `Close outside the fitted line by more than ${pct(t.breakoutBufferPct)}%.`,
      }
      break
    }
  }

  const volume = breakout ? volumeAt(bars, breakout.index, t) : null
  const retest = breakout
    ? retestAfter(bars, breakout.linePrice, breakout.index, t, breakout.direction.startsWith('above') ? 'above' : 'below')
    : null

  const slopePercentPerBar = pct(upper.slope / priceOn(upper, end))
  const rules = [
    rule('Upper line touches', `${upperTouches.length} swing highs within ${pct(t.channelTouchTolerancePct)}% of the fitted line`, Math.min(2, upperTouches.length - 2), 0, 2),
    rule('Lower line touches', `${lowerTouches.length} swing lows within ${pct(t.channelTouchTolerancePct)}% of the fitted line`, Math.min(2, lowerTouches.length - 2), 0, 2),
    rule('Parallelism', `Channel width drifted ${pct(drift)}% across the window, against a tolerance of ${pct(t.channelWidthDriftPct)}%`, drift <= 0.1 ? 2 : drift <= 0.18 ? 1 : 0, 0, 2),
    rule('Containment', `${pct(containment)}% of closes in the window sat between the lines`, containment >= 0.97 ? 2 : containment >= 0.93 ? 1 : 0, 0, 2),
    rule(
      'Breakout',
      breakout ? `Closed ${breakout.marginPercent}% ${breakout.direction} on ${breakout.date}` : 'Price is still between the lines',
      breakout ? 1 : 0,
      0,
      1
    ),
    rule(
      'Volume on the breakout',
      volume?.unavailable ?? (volume ? `Breakout volume was ${volume.ratio}x the ${volume.baselineBars}-bar median` : 'No breakout to measure'),
      volume?.ratio == null ? 0 : volume.ratio >= t.volumeConfirmRatio ? 2 : volume.ratio >= 1 ? 1 : -1,
      -1,
      2
    ),
  ]

  return {
    kind: 'parallel-channel',
    status: breakout ? 'broken' : 'intact',
    definition: 'Two parallel lines, each touched at least three times, containing price between them.',
    window: { fromIndex: start, fromDate: bars[start].date, toIndex: end, toDate: bars[end].date, bars: counted },
    upperLine: {
      slopePerBar: Number(upper.slope.toFixed(4)),
      slopePercentPerBar,
      priceAtStart: round(priceOn(upper, start)),
      priceAtEnd: round(priceOn(upper, end)),
      touches: upperTouches.map((p) => ({ index: p.index, date: p.date, price: round(p.price) })),
    },
    lowerLine: {
      slopePerBar: Number(lower.slope.toFixed(4)),
      slopePercentPerBar: pct(lower.slope / priceOn(lower, end)),
      priceAtStart: round(priceOn(lower, start)),
      priceAtEnd: round(priceOn(lower, end)),
      touches: lowerTouches.map((p) => ({ index: p.index, date: p.date, price: round(p.price) })),
    },
    breakout,
    volume,
    retest,
    measurements: {
      widthAtStartPercent: pct(widthStart / priceOn(lower, start)),
      widthAtEndPercent: pct(widthEnd / priceOn(lower, end)),
      widthDriftPercent: pct(drift),
      containmentPercent: pct(containment),
      direction: upper.slope > 0 ? 'rising' : upper.slope < 0 ? 'falling' : 'flat',
    },
    confidence: confidenceFrom(rules),
    tolerances: {
      channelWindowBars: t.channelWindowBars,
      channelTouchTolerancePct: t.channelTouchTolerancePct,
      channelMinTouches: t.channelMinTouches,
      channelWidthDriftPct: t.channelWidthDriftPct,
      channelContainmentPct: t.channelContainmentPct,
    },
    baseRate: BASE_RATE_CAVEAT,
  }
}

/* -------------------------------------------------------------- entry ---- */

/**
 * Every pattern this module knows, over one series.
 *
 * @param bars    OHLCV oldest first, as prices.js returns them.
 * @param swings  Optional {lows, highs} from indicators.js. Passing them keeps the
 *                chart and the pattern list agreeing about where the pivots are.
 */
export function detectPatterns(bars, { swings = null, tolerances = {} } = {}) {
  const t = { ...TOLERANCES, ...tolerances }
  const series = Array.isArray(bars) ? bars : []

  // The shortest detectable pattern needs a prior trend, two separated lows and a
  // breakout window. Below that, say so rather than returning an empty list that
  // reads like "no patterns found".
  const minimum = t.priorTrendBars + t.minSeparationBars + t.breakoutWindowBars
  if (series.length < minimum) {
    return {
      patterns: [],
      unavailable: `Pattern detection needs at least ${minimum} bars and received ${series.length}. Shorter series cannot show a prior trend, two separated lows and a breakout window.`,
      tolerances: t,
    }
  }

  const points = normaliseSwings(series, swings, t.swingLookback)
  const patterns = [...doubleBottoms(series, points.lows, t), ...tripleBottoms(series, points.lows, t)]
  const channel = parallelChannel(series, points, t)
  if (channel) patterns.push(channel)

  return {
    patterns,
    swings: { lows: points.lows, highs: points.highs, lookback: t.swingLookback, from: swings ? 'supplied by the caller' : 'computed here' },
    tolerances: t,
    baseRate: BASE_RATE_CAVEAT,
  }
}

/* ------------------------------------------------------- the base rate ---- */

// Seeded so a reported base rate is reproducible. An unseeded figure that moves
// every refresh is not a measurement.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  // Box-Muller. u is clamped off zero because log(0) is not a number anyone wants.
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/**
 * How often these detectors fire on pure noise shaped like this series.
 *
 * The synthetic series is a geometric random walk with the same length, the same
 * starting price and the same daily log-return standard deviation as the real one.
 * The intrabar shape and the volume of each synthetic bar are bootstrapped: one real
 * bar is drawn at random and its high/close ratio, low/close ratio and volume are
 * reused. That matters, because both the swing detector and volume confirmation read
 * those fields, and a walk of closes with a constant range and a constant volume
 * would confirm nothing and understate the rate.
 *
 * What this measures is chance under a random walk. A random walk has no volatility
 * clustering and no trend persistence, both of which real series have, so treat the
 * figure as an order of magnitude rather than a precise probability.
 */
export function randomWalkBaseline(bars, { trials = 200, seed = 20260920, tolerances = {} } = {}) {
  const t = { ...TOLERANCES, ...tolerances }
  const series = Array.isArray(bars) ? bars : []
  if (series.length < 60) {
    return { unavailable: `A base rate needs at least 60 real bars to copy the volatility from; received ${series.length}.` }
  }

  const returns = []
  for (let i = 1; i < series.length; i++) {
    const r = Math.log(series[i].close / series[i - 1].close)
    if (Number.isFinite(r)) returns.push(r)
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const sigma = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1))

  const shapes = series
    .filter((b) => b.close > 0 && Number.isFinite(b.high) && Number.isFinite(b.low))
    .map((b) => ({ up: b.high / b.close, down: b.low / b.close, volume: Number.isFinite(b.volume) ? b.volume : 0 }))

  const rand = mulberry32(seed)
  const counts = { 'double-bottom': 0, 'triple-bottom': 0, 'parallel-channel': 0 }
  const confirmed = { 'double-bottom': 0, 'triple-bottom': 0, 'parallel-channel': 0 }

  for (let trial = 0; trial < trials; trial++) {
    // Drift is deliberately dropped: the question is how often the shape appears in
    // noise, and a synthetic series carrying the real one's drift would answer a
    // different question.
    const synthetic = []
    let price = series[0].close
    for (let i = 0; i < series.length; i++) {
      price *= Math.exp(sigma * gaussian(rand))
      const shape = shapes[Math.floor(rand() * shapes.length)]
      synthetic.push({
        date: series[i].date,
        open: i ? synthetic[i - 1].close : price,
        high: price * shape.up,
        low: price * shape.down,
        close: price,
        volume: shape.volume,
      })
    }

    const found = detectPatterns(synthetic, { tolerances: t }).patterns
    for (const kind of Object.keys(counts)) {
      const hits = found.filter((p) => p.kind === kind)
      if (hits.length) counts[kind]++
      if (hits.some((p) => p.status === 'confirmed' || p.status === 'broken')) confirmed[kind]++
    }
  }

  const rate = (n) => Number(((n / trials) * 100).toFixed(1))
  return {
    trials,
    seed,
    barsPerTrial: series.length,
    volatility: {
      dailySigma: Number(sigma.toFixed(5)),
      annualisedPercent: Number((sigma * Math.sqrt(252) * 100).toFixed(1)),
      basis: 'Standard deviation of the log returns of the real series, annualised at 252 bars.',
    },
    firedPercent: {
      'double-bottom': rate(counts['double-bottom']),
      'triple-bottom': rate(counts['triple-bottom']),
      'parallel-channel': rate(counts['parallel-channel']),
    },
    confirmedPercent: {
      'double-bottom': rate(confirmed['double-bottom']),
      'triple-bottom': rate(confirmed['triple-bottom']),
      'parallel-channel': rate(confirmed['parallel-channel']),
    },
    method:
      'Geometric random walk of the same length, starting price and log-return volatility as this series, with each bar\'s intrabar range and volume drawn from a real bar of it.',
    limitation:
      'A random walk has no volatility clustering and no trend persistence, so this is an approximation of the chance rate rather than a proof of one.',
  }
}
