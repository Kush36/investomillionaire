// Breakouts: the two shapes the owner starred, and what each one is actually worth.
//
// Pure computation. Bars in, data out; nothing here fetches and nothing here knows
// which company it is looking at. prices.js hands bars over oldest first and that
// ordering is assumed throughout, exactly as it is in indicators.js and patterns.js.
//
// This is a separate file from patterns.js for one reason, and it is not filing
// tidiness. Both shapes in here are defined against CALENDAR time rather than
// against a bar count. A double bottom is a shape over forty bars whatever those
// bars are, but a multi-year breakout is a statement about YEARS, and forty bars is
// two months of daily candles or three years of monthly ones. So every window here
// is measured in days off the bar dates, and the series a finding came from travels
// with it as data rather than as an assumption.
//
// Two rules carry over from patterns.js unchanged, because breaking either one here
// would make the two engines disagree about the same chart:
//
//   A breakout is a CLOSE through the level by a buffer, never an intraday poke.
//   Intraday pokes that close back inside are the largest single source of phantom
//   breakouts, and on a multi-year level the poke is the thing that gets reported.
//
//   Every detection carries the base rate. A shape that also fires on random data is
//   a shape, not a signal. breakoutBaseline() measures that for these two detectors
//   the way patterns.randomWalkBaseline() measures it for the other three.
//
// One rule is specific to the cup. The textbook cup and handle ships with a measured
// move objective: the rim plus the depth of the cup. That objective is a price
// target, it is named in SEBI reg 2(1)(wa)(iv), and policy.js throws on it. It is
// not computed here under any name, so no later refactor can expose it. The depth IS
// reported, because a depth is a measurement of something that already happened.
// What never happens is adding it to the rim and calling the sum a destination.
//
// Four small helpers below (round, pct, median, the rule/confidence pair) are copies
// of private helpers in patterns.js. Copying twenty lines is the cheaper mistake:
// the alternative is editing a module three other things already depend on so this
// one can import its internals. If a third detector file ever appears, move all four
// into one place and delete both copies.

import { pivots, BASE_RATE_CAVEAT } from './patterns.js'

// Average Gregorian year. The windows here are multi-year, so leap days matter less
// than being able to state the rule in one line that a reader can check.
const YEAR_MS = 365.2425 * 24 * 60 * 60 * 1000

/**
 * Every threshold both detectors use, in one place, because a breakout engine is
 * nothing but its tolerances. Each is overridable per call.
 */
export const BREAKOUT_TOLERANCES = {
  // Same buffer patterns.js uses, for the same reason and deliberately the same
  // number: a close above the level by half a percent clears ordinary tick noise.
  breakoutBufferPct: 0.005,

  // The guard that separates a breakout from a trend. In a series making new highs
  // every week, the "highest high of the preceding five years" is last week's bar,
  // and closing above it is what an uptrend does all day. So the old high has to
  // have STOOD for a while: at least this fraction of the window itself. Half of a
  // five-year window is two and a half years, which is long enough that the level
  // is a fact about the stock rather than a fact about the last month.
  minBaseAgeFraction: 0.5,

  // A base has to be a base. If price never traded this far below the old high
  // between setting it and clearing it, the series drifted sideways at its high and
  // the eventual close through it is arithmetic, not a breakout.
  minBaseDepthPct: 0.1,

  // Closes checked after the breakout to see whether it stuck. Five bars is a week
  // of daily candles and five months of monthly ones; the count is reported with
  // the result so the reader can see which they got.
  confirmationBars: 5,

  // Cup: how close the right rim must sit to the left, as a fraction of their mean.
  // Bulkowski's survey allows the right rim within a few percent of the left; wider
  // than this and the shape is a rally into fresh resistance, not a cup.
  rimTolerancePct: 0.05,

  // Cup duration in bars. O'Neil's classic range is seven to sixty-five WEEKS,
  // which is 35 to 325 daily bars and 7 to 65 weekly ones. Bars cannot express
  // that without knowing the timeframe, so this is a wide default and the caller
  // narrows it per series.
  cupMinBars: 20,
  cupMaxBars: 260,

  // Depth of the cup as a fraction of the rim. Shallower than this is a pause;
  // deeper is a crash with a recovery, and the recovery is the story.
  cupMinDepthPct: 0.1,
  cupMaxDepthPct: 0.5,

  // Roundedness, the test that separates a cup from a failed double bottom. The
  // base path is fitted twice, once against x squared and once against |x|, and the
  // parabola has to fit at least this much better. 1.1 is a tenth better, which is
  // past the point where two models disagree by noise alone.
  roundednessMinRatio: 1.1,

  // The second roundedness measure, kept because the first is a statistic and this
  // one is something a reader can see on the chart: how much of the base sat in the
  // bottom quarter of its own depth. A V spends two bars there. A cup spends weeks.
  nearLowBandPct: 0.25,
  minTimeNearLowPct: 0.15,

  // Handle: a shallow pullback off the right rim, not a second leg down.
  handleMinBars: 3,
  handleMaxBars: 40,
  handleMinDepthPct: 0.02,
  handleMaxRetraceOfCup: 0.5,

  // How long after the handle low a breakout still belongs to the pattern.
  breakoutWindowBars: 60,

  // The conventional threshold for "volume confirmed it". The measured ratio is
  // always reported whether it clears this or not.
  volumeConfirmRatio: 1.5,

  // Pivot detection, when the caller passes no swings of its own.
  swingLookback: 5,

  // A cup from four years ago is history, not a finding.
  maxPerKind: 2,
}

/**
 * Default window per horizon, in years.
 *
 * indicators.HORIZONS states its spans in prose ("one to three years") because
 * nothing there needed a number. This is that prose as arithmetic, and it is a
 * separate map rather than an import so that changing a weight in indicators.js
 * cannot silently change what "multi-year" means here.
 */
export const HORIZON_YEARS = {
  short: 1,
  swing: 1,
  medium: 2,
  long: 3,
  multiYear: 5,
}

const DEFAULT_YEARS = 3

/**
 * Which series a finding carries weight on, as data, so the report can print it.
 *
 * This is the owner's own point restated: a multi-year level read off daily candles
 * is a 1,250-bar scan for something a monthly chart shows in sixty bars, and the
 * daily feed only reaches back six years, so a five-year daily breakout can only
 * ever be found inside the last year of it. Weekly reaches twelve years and monthly
 * twenty, which is why those two carry the finding.
 */
export const SERIES_STANDING = {
  monthly: {
    standing: 'highest',
    reach: 'about 20 years of candles, 12 bars a year',
    why: 'A multi-year level is a monthly-chart fact. One bar is one month, so a five-year base is sixty bars and the level is visible rather than inferred.',
  },
  weekly: {
    standing: 'high',
    reach: 'about 12 years of candles, 52 bars a year',
    // "hold a five-year base" tripped policy.js on the buy/sell/hold clause. The
    // sentence was describing the reach of the series, not a position, but the checker
    // matches the word and not the intent, and it is right to: an exemption carved for
    // a turn of phrase is an exemption. Reworded rather than excused.
    why: 'Long enough to carry a five-year base with room in front of it, and coarse enough that a single session cannot set the level.',
  },
  daily: {
    standing: 'lowest',
    reach: 'about 6 years of candles, roughly 250 bars a year',
    why: 'A five-year window consumes five of the six years available, so only the last year of the series can contain a breakout at all, and one noisy session can set the level the whole finding rests on.',
  },
}

export const BREAKOUT_BASE_RATE = {
  ...BASE_RATE_CAVEAT,
  what: 'A breakout is a description of a close that exceeded an old level. It is not evidence about what price does next.',
  measured:
    'Not restated from memory. These two detectors are specific enough to this series that the only honest figure is one measured on it.',
  howToCheck:
    'breakoutBaseline(bars, { timeframe, years }) runs these same two detectors over synthetic series matched to this one in length and volatility, and reports how often each fires by chance.',
  related:
    'patterns.randomWalkBaseline() does the same for the double bottom, triple bottom and channel detectors.',
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

// The house scoring shape, the same one verdict.js and patterns.js use: every rule
// that fired, with its own points and the range it could have contributed, so a
// reader can discard any single rule and recompute the total by hand.
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
    means: 'How closely the shape matched the definition above. It is not a probability that the move continues.',
    rules,
  }
}

// Bars usable for a calendar-windowed detector: a finite OHLC and a date that parses.
// A bar whose date does not parse cannot be placed in a five-year window, and placing
// it anyway would put the whole finding on a guess.
function usable(bars) {
  const rows = []
  const times = []
  for (const bar of Array.isArray(bars) ? bars : []) {
    if (!bar || !Number.isFinite(bar.close) || !Number.isFinite(bar.high) || !Number.isFinite(bar.low)) continue
    const time = Date.parse(bar.date)
    if (!Number.isFinite(time)) continue
    rows.push(bar)
    times.push(time)
  }
  return { rows, times }
}

/**
 * Volume on one bar against the median of an explicit window.
 *
 * patterns.js measures against a fixed twenty-bar median. Here the window is named
 * by the caller, because the owner asked for the breakout bar against the MEDIAN OF
 * THE BASE, and a base can be two hundred bars long. Median, not mean, because one
 * results-day print drags a mean up and quietly excuses a weak breakout.
 */
function volumeAgainst(bars, index, from, to, basis, threshold) {
  const window = bars.slice(from, to).map((b) => b.volume).filter((v) => Number.isFinite(v) && v > 0)
  const baseline = median(window)
  const onBreakout = bars[index]?.volume

  if (!baseline || !Number.isFinite(onBreakout) || onBreakout <= 0) {
    return {
      unavailable: 'Volume unavailable: the source reported zero or missing volume across this window.',
      breakoutVolume: Number.isFinite(onBreakout) ? onBreakout : null,
      baselineMedian: baseline,
    }
  }

  const ratio = Number((onBreakout / baseline).toFixed(2))
  return {
    breakoutVolume: onBreakout,
    baselineMedian: Math.round(baseline),
    baselineBars: window.length,
    ratio,
    threshold,
    confirmed: ratio >= threshold,
    basis,
  }
}

function volumePoints(volume, threshold) {
  if (volume?.ratio == null) return 0
  return volume.ratio >= threshold ? 2 : volume.ratio >= 1 ? 1 : -1
}

const yearsBetween = (from, to) => Number(((to - from) / YEAR_MS).toFixed(2))

/* ------------------------------------------------- multi-year breakout ---- */

/**
 * The highest high strictly inside [t(i) - windowMs, t(i)).
 *
 * Linear scan backwards from the bar before i. That is O(bars in the window) per
 * candidate and O(n * w) for a series with no breakout in it, which on 1,500 daily
 * bars with a five-year window is about two million comparisons: irrelevant for one
 * report, and the reason breakoutBaseline() defaults to forty trials rather than the
 * two hundred patterns.js uses. A monotonic deque would make it O(n) if the trial
 * count ever needs to go up.
 */
function highestHighBefore(rows, times, i, windowMs) {
  const cutoff = times[i] - windowMs
  let best = null
  for (let k = i - 1; k >= 0 && times[k] >= cutoff; k--) {
    if (best === null || rows[k].high > rows[best].high) best = k
  }
  return best
}

/**
 * Price closing above the highest high of the preceding N years.
 *
 * Returns the finding, or { found: false, reason } naming exactly what stopped it.
 * A bare empty result would read as "nothing happened" when the truth is usually
 * "the series is too short" or "this stock has been making new highs all year", and
 * those are different facts about the chart.
 *
 * The scan runs from the newest bar backwards and stops at the first candidate that
 * passes, so the finding is the MOST RECENT qualifying breakout. Older ones are
 * history: the reader is looking at a chart that has already moved past them.
 */
export function multiYearBreakout(bars, { timeframe = 'daily', horizon = null, years = null, tolerances = {} } = {}) {
  const t = { ...BREAKOUT_TOLERANCES, ...tolerances }
  const kind = 'multi-year-breakout'
  const window = years ?? HORIZON_YEARS[horizon] ?? DEFAULT_YEARS
  const { rows, times } = usable(bars)

  const series = {
    timeframe,
    ...(SERIES_STANDING[timeframe] ?? {
      standing: 'unstated',
      why: 'This timeframe is not one the price feed publishes, so nothing is claimed about its standing.',
    }),
  }

  if (rows.length < 30) {
    return { kind, found: false, series, window: { years: window }, reason: `An ${window}-year high needs a series; this one has ${rows.length} usable bars.` }
  }

  const windowMs = window * YEAR_MS
  const spanYears = yearsBetween(times[0], times[times.length - 1])
  if (times[times.length - 1] - times[0] < windowMs) {
    return {
      kind,
      found: false,
      series,
      window: { years: window },
      reason: `This ${timeframe} series covers ${spanYears} years, and an ${window}-year high cannot be established until ${window} years have passed inside the series itself. The weekly series reaches about 12 years and the monthly about 20.`,
    }
  }

  const level = (price) => price * (1 + t.breakoutBufferPct)
  let firstRejection = null

  for (let i = rows.length - 1; i >= 1; i--) {
    if (times[i] - times[0] < windowMs) break // no full window in front of this bar

    const priorIndex = highestHighBefore(rows, times, i, windowMs)
    if (priorIndex === null) continue

    const priorHigh = rows[priorIndex].high
    // The breakout is the FIRST close through the level, not the fiftieth day of
    // sitting above it. If the previous bar already closed above, this bar is the
    // continuation of somebody else's breakout.
    if (!(rows[i].close > level(priorHigh)) || rows[i - 1].close > level(priorHigh)) continue

    const baseYears = yearsBetween(times[priorIndex], times[i])
    const baseBars = i - priorIndex

    // The trend guard. A level set a fortnight ago is not a multi-year level, and
    // clearing it is what an uptrend does by definition.
    if (baseYears < window * t.minBaseAgeFraction) {
      firstRejection ??= `The highest high of the preceding ${window} years was set only ${baseBars} bars (${baseYears} years) before the close that exceeded it, so this series is making new highs rather than breaking out of a base. A base has to have stood for at least ${window * t.minBaseAgeFraction} years to count here.`
      continue
    }

    let lowIndex = priorIndex
    for (let k = priorIndex; k < i; k++) if (rows[k].low < rows[lowIndex].low) lowIndex = k
    const baseDepth = (priorHigh - rows[lowIndex].low) / priorHigh
    if (baseDepth < t.minBaseDepthPct) {
      firstRejection ??= `Between setting the ${window}-year high and clearing it, price never traded more than ${pct(baseDepth)}% below it, against a floor of ${pct(t.minBaseDepthPct)}%. The series drifted at its high rather than building a base under it.`
      continue
    }

    const volume = volumeAgainst(
      rows,
      i,
      priorIndex,
      i,
      `Breakout bar volume divided by the median volume of the ${baseBars} bars of the base, measured from the bar that set the old high to the bar before the breakout.`,
      t.volumeConfirmRatio
    )

    // Confirmation is measured against the OLD HIGH itself, not the buffered level:
    // the question is whether price stayed on the far side of the level it cleared.
    const after = rows.slice(i + 1, i + 1 + t.confirmationBars)
    const closesAbove = after.filter((b) => b.close >= priorHigh).length
    const confirmation = {
      barsRequested: t.confirmationBars,
      barsAvailable: after.length,
      closesAbove,
      complete: after.length === t.confirmationBars,
      closedAboveOnEveryBar: after.length > 0 && closesAbove === after.length,
      basis: `Closes on the ${t.confirmationBars} bars after the breakout, measured against the old high of ${round(priorHigh)} rather than against the buffered level.`,
      ...(after.length < t.confirmationBars
        ? { reason: `The series ends ${after.length} bars after the breakout, so the ${t.confirmationBars}-bar window is incomplete.` }
        : {}),
    }

    const last = rows[rows.length - 1]
    const rules = [
      rule(
        'How long the old high stood',
        `${baseYears} years and ${baseBars} bars between the high being set on ${rows[priorIndex].date} and the close through it`,
        baseYears >= 5 ? 2 : baseYears >= 3 ? 1 : 0,
        0,
        2
      ),
      rule(
        'Depth of the base',
        `Price traded ${pct(baseDepth)}% below the old high at its lowest, on ${rows[lowIndex].date}`,
        baseDepth >= 0.25 ? 2 : baseDepth >= 0.15 ? 1 : 0,
        0,
        2
      ),
      rule(
        'Volume on the breakout',
        volume.unavailable ?? `Breakout volume was ${volume.ratio}x the median of the ${volume.baselineBars} bars of the base`,
        volumePoints(volume, t.volumeConfirmRatio),
        -1,
        2
      ),
      rule(
        'Closes after the breakout',
        confirmation.reason ??
          `${closesAbove} of the ${after.length} bars after the breakout closed above the old high of ${round(priorHigh)}`,
        !confirmation.complete ? 0 : confirmation.closedAboveOnEveryBar ? 2 : closesAbove >= Math.ceil(after.length / 2) ? 1 : 0,
        0,
        2
      ),
      rule(
        'Series the finding came from',
        `Detected on the ${timeframe} series, whose standing for a multi-year level is ${series.standing}. ${series.why}`,
        timeframe === 'monthly' || timeframe === 'weekly' ? 2 : 0,
        0,
        2
      ),
      rule(
        'Margin over the old high',
        `The breakout bar closed ${pct(rows[i].close / priorHigh - 1)}% above it`,
        rows[i].close / priorHigh - 1 >= 0.03 ? 1 : 0,
        0,
        1
      ),
    ]

    return {
      kind,
      found: true,
      status: 'confirmed',
      series,
      definition: `A close above the highest high of the preceding ${window} years, where that high had already stood for at least ${window * t.minBaseAgeFraction} years.`,
      window: {
        years: window,
        describedAs: window >= 3 ? `${window}-year high` : `${window === 1 ? '52-week' : `${window}-year`} high`,
        source: years != null ? 'years given by the caller' : horizon ? `default for the ${horizon} horizon` : 'module default',
        fromDate: new Date(times[i] - windowMs).toISOString().slice(0, 10),
        toDate: rows[i].date,
      },
      priorHigh: {
        price: round(priorHigh),
        index: priorIndex,
        date: rows[priorIndex].date,
        stoodForYears: baseYears,
        stoodForBars: baseBars,
        basis: `The highest INTRADAY high of any bar inside the ${window} years before the breakout bar.`,
      },
      base: {
        fromDate: rows[priorIndex].date,
        toDate: rows[i - 1].date,
        bars: baseBars,
        years: baseYears,
        lowestLow: round(rows[lowIndex].low),
        lowestLowDate: rows[lowIndex].date,
        depthPercent: pct(baseDepth),
        basis: 'Measured from the bar that set the old high to the bar before the breakout.',
      },
      breakout: {
        index: i,
        date: rows[i].date,
        close: round(rows[i].close),
        marginPercent: pct(rows[i].close / priorHigh - 1),
        basis: `Close above the old high by more than ${pct(t.breakoutBufferPct)}%. An intraday high above it does not count, and the previous bar had not already closed above it.`,
      },
      volume,
      confirmation,
      now: {
        asOf: last.date,
        lastClose: round(last.close),
        abovePriorHighPercent: pct(last.close / priorHigh - 1),
        barsSinceBreakout: rows.length - 1 - i,
      },
      confidence: confidenceFrom(rules),
      tolerances: {
        breakoutBufferPct: t.breakoutBufferPct,
        minBaseAgeFraction: t.minBaseAgeFraction,
        minBaseDepthPct: t.minBaseDepthPct,
        confirmationBars: t.confirmationBars,
        volumeConfirmRatio: t.volumeConfirmRatio,
      },
      baseRate: BREAKOUT_BASE_RATE,
    }
  }

  return {
    kind,
    found: false,
    series,
    window: { years: window, seriesSpanYears: spanYears },
    reason:
      firstRejection ??
      `No close in this ${timeframe} series exceeded the highest high of the preceding ${window} years by more than ${pct(t.breakoutBufferPct)}%.`,
  }
}

/* ----------------------------------------------------- cup and handle ---- */

// Least squares against three fixed basis functions, solved through the normal
// equations with partial pivoting. Three parameters is small enough that the
// conditioning worry a textbook raises about normal equations does not apply, and x
// is normalised to [-1, 1] before it gets here, which is the other half of that
// worry dealt with.
function solve3(matrix, vector) {
  const a = matrix.map((row, i) => [...row, vector[i]])
  for (let c = 0; c < 3; c++) {
    let p = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    if (Math.abs(a[p][c]) < 1e-12) return null
    const swap = a[c]
    a[c] = a[p]
    a[p] = swap
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = a[r][c] / a[c][c]
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k]
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]]
}

function fit(points, basis) {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const v = [0, 0, 0]
  for (const { x, y } of points) {
    const b = basis(x)
    for (let i = 0; i < 3; i++) {
      v[i] += b[i] * y
      for (let j = 0; j < 3; j++) m[i][j] += b[i] * b[j]
    }
  }
  const coefficients = solve3(m, v)
  if (!coefficients) return null

  let rss = 0
  for (const { x, y } of points) {
    const b = basis(x)
    const predicted = coefficients[0] * b[0] + coefficients[1] * b[1] + coefficients[2] * b[2]
    rss += (y - predicted) ** 2
  }
  return { coefficients, rss }
}

/**
 * Is this base round, or is it a V?
 *
 * This is the test that separates a cup from a failed double bottom, and it is the
 * reason the cup detector is not just the bottoms detector with different names. A V
 * is a base that turned on one bar: buyers and sellers never agreed on a price down
 * there, so nothing was absorbed and nothing was built. A cup turned over weeks.
 * Both shapes have two rims and a low between them, so nothing about the rims can
 * tell them apart, and a detector that skips this test reports every failed
 * reversal as a cup.
 *
 * Two independent measures, because each one alone has an obvious failure:
 *
 *   The fit. The base path is fitted twice over x normalised to [-1, 1], once
 *   against x squared and once against |x|, and BOTH fits carry a linear tilt term
 *   so the two models have the same number of parameters and their residual sums
 *   compare directly. A parabola is the shape of a cup; |x| is the shape of a V.
 *   Whichever leaves less residual is the shape the base actually traced. This is
 *   precise and it is invisible on a chart.
 *
 *   Time near the low. The fraction of base bars that traded in the bottom quarter
 *   of the base's own depth. A V spends one or two bars there; a rounded base spends
 *   a third of its life there. This is crude and it is exactly what the eye does.
 *
 * The fit decides. The time measure is reported beside it so a reader can see the
 * same thing in units they can check against the chart.
 */
export function roundedness(bars, fromIndex, toIndex, tolerances = {}) {
  const t = { ...BREAKOUT_TOLERANCES, ...tolerances }
  const span = toIndex - fromIndex
  if (span < 4) return { unavailable: `A base needs at least 5 bars to have a shape; this one has ${span + 1}.` }

  const rim = Math.max(bars[fromIndex].high, bars[toIndex].high)
  let lowest = fromIndex
  for (let i = fromIndex; i <= toIndex; i++) if (bars[i].low < bars[lowest].low) lowest = i
  const depth = rim - bars[lowest].low
  if (!(depth > 0)) return { unavailable: 'The base has no depth, so it has no shape to test.' }

  // y is normalised by the rim so the residuals of two different stocks are the same
  // size. The RATIO below is scale free either way; this only makes the numbers in
  // the response readable.
  const points = []
  for (let i = fromIndex; i <= toIndex; i++) {
    points.push({ x: (2 * (i - fromIndex)) / span - 1, y: bars[i].low / rim })
  }

  const parabola = fit(points, (x) => [1, x, x * x])
  const vee = fit(points, (x) => [1, x, Math.abs(x)])
  if (!parabola || !vee) return { unavailable: 'The base path is degenerate: the fit could not be solved.' }

  // Infinity does not survive JSON, and a perfect parabola fit is a constructed
  // series rather than a market, so the ratio is capped at a number that plainly
  // means "the parabola won outright".
  const ratio = parabola.rss > 1e-12 ? Number(Math.min(vee.rss / parabola.rss, 999).toFixed(2)) : 999

  const band = bars[lowest].low + depth * t.nearLowBandPct
  const barsNearLow = points.filter((_, k) => bars[fromIndex + k].low <= band).length
  const timeNearLow = barsNearLow / points.length

  return {
    parabolaRss: Number(parabola.rss.toFixed(6)),
    vRss: Number(vee.rss.toFixed(6)),
    ratio,
    betterFit: parabola.rss <= vee.rss ? 'parabola' : 'v',
    curvature: Number(parabola.coefficients[2].toFixed(5)),
    opensUpward: parabola.coefficients[2] > 0,
    barsNearLow,
    barsInBase: points.length,
    timeNearLowPercent: pct(timeNearLow),
    nearLowBand: round(band),
    thresholds: { ratio: t.roundednessMinRatio, timeNearLowPercent: pct(t.minTimeNearLowPct) },
    round: parabola.coefficients[2] > 0 && ratio >= t.roundednessMinRatio && timeNearLow >= t.minTimeNearLowPct,
    basis:
      'Least squares fit of the base lows against x squared and against |x| over x normalised to [-1, 1], both models carrying a linear tilt term so their residual sums are comparable. The ratio is the V residual over the parabola residual, so above 1 means the base was rounder than it was pointed.',
  }
}

function analyseCup(bars, left, right, t) {
  const rim = Math.max(left.price, right.price)
  const shape = roundedness(bars, left.index, right.index, t)
  if (shape.unavailable) return { rejected: 'the base is too short to have a shape' }

  let lowest = left.index
  for (let i = left.index; i <= right.index; i++) if (bars[i].low < bars[lowest].low) lowest = i
  const cupDepth = (rim - bars[lowest].low) / rim
  if (cupDepth < t.cupMinDepthPct) return { rejected: `the base is only ${pct(cupDepth)}% deep, which is a pause rather than a cup` }
  if (cupDepth > t.cupMaxDepthPct) return { rejected: `the base is ${pct(cupDepth)}% deep, which is a collapse and a recovery rather than a cup` }

  if (!shape.round) {
    return {
      rejected:
        shape.betterFit === 'v'
          ? 'the base is V-shaped: it is fitted better by |x| than by a parabola, so price turned on a bar instead of rounding'
          : `the base is not round enough: the parabola fitted ${shape.ratio}x better than the V against a floor of ${t.roundednessMinRatio}, with ${shape.timeNearLowPercent}% of bars near the low`,
    }
  }

  // The handle is the pullback off the right rim. Its low is the deepest low inside
  // the handle window; anything deeper than half the cup is a second leg down and
  // the shape has stopped being a cup with a handle.
  const limit = Math.min(bars.length - 1, right.index + t.handleMaxBars)
  let handleLow = null
  for (let i = right.index + 1; i <= limit; i++) if (handleLow === null || bars[i].low < bars[handleLow].low) handleLow = i
  if (handleLow === null) return { rejected: 'the series ends at the right rim, so there is no handle yet' }

  const handleBars = handleLow - right.index
  if (handleBars < t.handleMinBars) return { rejected: `the pullback off the right rim lasted ${handleBars} bars, which is a dip rather than a handle` }

  const handleDepth = (right.price - bars[handleLow].low) / right.price
  if (handleDepth < t.handleMinDepthPct) return { rejected: 'price never pulled back off the right rim, so there is no handle' }
  if (handleDepth > cupDepth * t.handleMaxRetraceOfCup) {
    return {
      rejected: `the pullback retraced ${pct(handleDepth / cupDepth)}% of the cup, past the ${pct(t.handleMaxRetraceOfCup)}% a handle is allowed, so it is a second leg down`,
    }
  }

  // Declining volume through the handle is the part of the textbook description that
  // is actually a measurement, so it is measured: the handle's own median against
  // the cup's. Reported either way, scored either way.
  const cupVolumes = bars.slice(left.index, right.index).map((b) => b.volume).filter((v) => Number.isFinite(v) && v > 0)
  const handleVolumes = bars.slice(right.index + 1, handleLow + 1).map((b) => b.volume).filter((v) => Number.isFinite(v) && v > 0)
  const cupMedian = median(cupVolumes)
  const handleMedian = median(handleVolumes)
  const handleVolume =
    cupMedian && handleMedian
      ? {
          handleMedian: Math.round(handleMedian),
          cupMedian: Math.round(cupMedian),
          ratio: Number((handleMedian / cupMedian).toFixed(2)),
          declining: handleMedian < cupMedian,
          basis: 'Median volume across the handle divided by the median across the cup.',
        }
      : { unavailable: 'Volume unavailable: the source reported zero or missing volume across the cup or the handle.' }

  const levelPrice = rim * (1 + t.breakoutBufferPct)
  let breakout = null
  const breakoutLimit = Math.min(bars.length - 1, handleLow + t.breakoutWindowBars)
  for (let i = handleLow + 1; i <= breakoutLimit; i++) {
    if (bars[i].close > levelPrice) {
      breakout = {
        index: i,
        date: bars[i].date,
        close: round(bars[i].close),
        marginPercent: pct(bars[i].close / rim - 1),
        basis: `Close above the rim line by more than ${pct(t.breakoutBufferPct)}%. An intraday high through the rim does not count.`,
      }
      break
    }
  }

  const volume = breakout
    ? volumeAgainst(
        bars,
        breakout.index,
        left.index,
        breakout.index,
        `Breakout bar volume divided by the median volume of the ${breakout.index - left.index} bars from the left rim to the bar before the breakout.`,
        t.volumeConfirmRatio
      )
    : null

  const last = bars[bars.length - 1]
  const rules = [
    rule(
      'Rim agreement',
      `The two rims sit ${pct(Math.abs(right.price - left.price) / ((left.price + right.price) / 2))}% apart, against a tolerance of ${pct(t.rimTolerancePct)}%`,
      Math.abs(right.price - left.price) / ((left.price + right.price) / 2) <= t.rimTolerancePct / 2 ? 2 : 1,
      0,
      2
    ),
    rule(
      'Roundedness of the base',
      `The parabola fitted ${shape.ratio}x better than the V, and ${shape.timeNearLowPercent}% of the base traded in the bottom ${pct(t.nearLowBandPct)}% of its depth`,
      shape.ratio >= 2 && shape.timeNearLowPercent >= 25 ? 2 : 1,
      0,
      2
    ),
    rule(
      'Depth of the cup',
      `${pct(cupDepth)}% below the rim at the base low on ${bars[lowest].date}`,
      cupDepth >= 0.12 && cupDepth <= 0.33 ? 2 : 1,
      0,
      2
    ),
    rule(
      'Handle',
      `A ${handleBars}-bar pullback of ${pct(handleDepth)}%, which is ${pct(handleDepth / cupDepth)}% of the cup`,
      handleDepth / cupDepth <= 0.33 ? 2 : 1,
      0,
      2
    ),
    rule(
      'Volume through the handle',
      handleVolume.unavailable ?? `Handle volume ran at ${handleVolume.ratio}x the cup's median`,
      handleVolume.ratio == null ? 0 : handleVolume.ratio <= 0.8 ? 2 : handleVolume.ratio < 1 ? 1 : -1,
      -1,
      2
    ),
    rule(
      'Breakout through the rim line',
      breakout ? `Closed ${breakout.marginPercent}% above the rim line on ${breakout.date}` : 'No close above the rim line yet, so the shape is unconfirmed',
      breakout ? 2 : 0,
      0,
      2
    ),
    rule(
      'Volume on the breakout',
      volume?.unavailable ?? (volume ? `Breakout volume was ${volume.ratio}x the median of the ${volume.baselineBars} bars before it` : 'No breakout to measure'),
      volumePoints(volume, t.volumeConfirmRatio),
      -1,
      2
    ),
  ]

  return {
    kind: 'cup-and-handle',
    status: breakout ? 'confirmed' : 'unconfirmed',
    definition:
      'A left rim, a rounded base, a right rim at the same level, a shallow pullback on lighter volume, and a close back through the rim line.',
    leftRim: { index: left.index, date: bars[left.index].date, price: round(left.price) },
    rightRim: { index: right.index, date: bars[right.index].date, price: round(right.price) },
    rimLine: {
      price: round(rim),
      basis: 'The higher of the two rim highs, which is the level the breakout has to close through.',
    },
    base: {
      lowIndex: lowest,
      lowDate: bars[lowest].date,
      low: round(bars[lowest].low),
      depthPercentOfRim: pct(cupDepth),
      bars: right.index - left.index,
      fromDate: bars[left.index].date,
      toDate: bars[right.index].date,
    },
    roundedness: shape,
    handle: {
      lowIndex: handleLow,
      lowDate: bars[handleLow].date,
      low: round(bars[handleLow].low),
      bars: handleBars,
      depthPercentOfRightRim: pct(handleDepth),
      retracementOfCupPercent: pct(handleDepth / cupDepth),
      volume: handleVolume,
    },
    breakout,
    volume,
    now: {
      asOf: last.date,
      lastClose: round(last.close),
      againstRimLinePercent: pct(last.close / rim - 1),
    },
    confidence: confidenceFrom(rules),
    tolerances: {
      rimTolerancePct: t.rimTolerancePct,
      cupMinBars: t.cupMinBars,
      cupMaxBars: t.cupMaxBars,
      cupMinDepthPct: t.cupMinDepthPct,
      cupMaxDepthPct: t.cupMaxDepthPct,
      roundednessMinRatio: t.roundednessMinRatio,
      minTimeNearLowPct: t.minTimeNearLowPct,
      handleMaxRetraceOfCup: t.handleMaxRetraceOfCup,
      breakoutBufferPct: t.breakoutBufferPct,
      volumeConfirmRatio: t.volumeConfirmRatio,
    },
    baseRate: BREAKOUT_BASE_RATE,
  }
}

/**
 * Every cup and handle in the series, newest first, plus why the near misses missed.
 *
 * The rejection tally is not decoration. Nearly every candidate pair of rims fails,
 * and "no cup found" with no reason attached is indistinguishable from a detector
 * that is quietly broken.
 */
export function cupAndHandle(bars, { swings = null, tolerances = {} } = {}) {
  const t = { ...BREAKOUT_TOLERANCES, ...tolerances }
  const { rows } = usable(bars)

  // Supplied swing indices are positions in whatever series the CALLER filtered, and
  // usable() above may have dropped a bar this one never saw. An index that is off by
  // one reads the rim off the wrong bar and every number downstream inherits it
  // silently, so the alignment is checked here rather than trusted: same length, every
  // index in range, and every supplied price still equal to the high it claims to be.
  // The check lives in this function instead of in the route because both callers
  // would otherwise need their own copy of it.
  const supplied = swings?.highs?.length ? swings.highs : null
  const aligned =
    supplied !== null &&
    rows.length === (Array.isArray(bars) ? bars.length : -1) &&
    supplied.every((p) => rows[p.index] && Math.abs(rows[p.index].high - p.price) <= Math.abs(p.price) * 1e-9)

  const highs = aligned ? supplied : pivots(rows, t.swingLookback).highs

  const found = []
  const rejections = new Map()
  const note = (why) => rejections.set(why, (rejections.get(why) ?? 0) + 1)

  for (let a = 0; a < highs.length; a++) {
    for (let b = a + 1; b < highs.length; b++) {
      const span = highs[b].index - highs[a].index
      if (span < t.cupMinBars) continue
      if (span > t.cupMaxBars) break // highs are ordered, so every later one is wider still

      const gap = Math.abs(highs[b].price - highs[a].price) / ((highs[a].price + highs[b].price) / 2)
      if (gap > t.rimTolerancePct) {
        note(`the right rim sat ${pct(gap)}% from the left, outside the ${pct(t.rimTolerancePct)}% tolerance`)
        continue
      }

      const result = analyseCup(rows, highs[a], highs[b], t)
      if (result.rejected) note(result.rejected)
      else found.push(result)
    }
  }

  // Many rim pairs describe the same chart feature with a different left rim. Keep
  // the best-scoring one per right rim so the list does not report one cup six times.
  const byRightRim = new Map()
  for (const cup of found) {
    const held = byRightRim.get(cup.rightRim.index)
    if (!held || cup.confidence.normalised > held.confidence.normalised) byRightRim.set(cup.rightRim.index, cup)
  }

  return {
    found: [...byRightRim.values()].sort((x, y) => y.rightRim.index - x.rightRim.index).slice(0, t.maxPerKind),
    rejections: [...rejections.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([why, count]) => ({ why, candidates: count })),
    swingHighs: highs.length,
    swingsFrom: aligned
      ? 'supplied by the caller'
      : supplied
        ? 'computed here: the swings the caller supplied are indexed against a different series'
        : 'computed here',
  }
}

/* -------------------------------------------------------------- entry ---- */

/**
 * Both detectors over one series.
 *
 * @param bars       OHLCV oldest first, as prices.js returns them.
 * @param timeframe  Which series these bars are, because a multi-year window means
 *                   something different on each and the finding says which it used.
 * @param horizon    A key of HORIZON_YEARS, used only to default the window.
 * @param years      Explicit window in years, which wins over the horizon default.
 * @param swings     Optional {lows, highs} from indicators.js, so the chart and the
 *                   finding agree about where the pivots are.
 */
export function detectBreakouts(bars, { timeframe = 'daily', horizon = null, years = null, swings = null, tolerances = {} } = {}) {
  const t = { ...BREAKOUT_TOLERANCES, ...tolerances }
  const multiYear = multiYearBreakout(bars, { timeframe, horizon, years, tolerances: t })
  const cups = cupAndHandle(bars, { swings, tolerances: t })

  const findings = []
  const notFound = []
  if (multiYear.found) findings.push(multiYear)
  else notFound.push({ kind: multiYear.kind, reason: multiYear.reason, window: multiYear.window })

  if (cups.found.length) findings.push(...cups.found)
  else {
    notFound.push({
      kind: 'cup-and-handle',
      reason: cups.swingHighs < 2
        ? `Only ${cups.swingHighs} confirmed swing highs in this series, and a cup needs two rims.`
        : `None of the rim pairs in this series completed a cup with a handle. ${cups.rejections.length ? 'The closest misses:' : 'No pair came close enough to name a reason.'}`,
      rejections: cups.rejections,
    })
  }

  return {
    series: { timeframe, ...(SERIES_STANDING[timeframe] ?? {}) },
    findings,
    notFound,
    swings: { highs: cups.swingHighs, from: cups.swingsFrom, lookback: t.swingLookback },
    tolerances: t,
    baseRate: BREAKOUT_BASE_RATE,
  }
}

/* ------------------------------------------------------- the base rate ---- */

// Seeded, because a base rate that moves on every refresh is not a measurement.
// This is patterns.js's generator, copied rather than imported: that module keeps
// its RNG private and the two files are better off unable to break each other.
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
  const u = Math.max(rand(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

/**
 * How often these two detectors fire on pure noise shaped like this series.
 *
 * Same method as patterns.randomWalkBaseline, and deliberately so, because the two
 * figures are meant to be read side by side: a geometric random walk of the same
 * length, starting price and log-return volatility as the real series, with each
 * synthetic bar's intrabar range and volume bootstrapped from a real bar. The dates
 * are the REAL dates, which matters more here than it does there: a multi-year
 * window is calendar arithmetic, so a synthetic series with invented dates would be
 * answering a different question.
 *
 * Forty trials rather than the two hundred patterns.js uses, because the multi-year
 * scan is O(bars x window) and a thousand-bar daily series with a five-year window
 * costs about two million comparisons per trial. Raise it for an offline measurement.
 */
export function breakoutBaseline(bars, { trials = 40, seed = 20260920, timeframe = 'daily', horizon = null, years = null, tolerances = {} } = {}) {
  const t = { ...BREAKOUT_TOLERANCES, ...tolerances }
  const { rows } = usable(bars)
  if (rows.length < 60) {
    return { unavailable: `A base rate needs at least 60 real bars to copy the volatility from; received ${rows.length}.` }
  }

  const returns = []
  for (let i = 1; i < rows.length; i++) {
    const r = Math.log(rows[i].close / rows[i - 1].close)
    if (Number.isFinite(r)) returns.push(r)
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const sigma = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1))

  const shapes = rows.map((b) => ({ up: b.high / b.close, down: b.low / b.close, volume: Number.isFinite(b.volume) ? b.volume : 0 }))
  const rand = mulberry32(seed)
  const counts = { 'multi-year-breakout': 0, 'cup-and-handle': 0 }
  const confirmed = { 'multi-year-breakout': 0, 'cup-and-handle': 0 }

  for (let trial = 0; trial < trials; trial++) {
    // Drift is dropped on purpose. The question is how often the shape appears in
    // noise; a synthetic series carrying the real one's drift answers a different
    // question, and for a multi-year HIGH the drift is most of the answer.
    const synthetic = []
    let price = rows[0].close
    for (let i = 0; i < rows.length; i++) {
      price *= Math.exp(sigma * gaussian(rand))
      const shape = shapes[Math.floor(rand() * shapes.length)]
      synthetic.push({
        date: rows[i].date,
        open: i ? synthetic[i - 1].close : price,
        high: price * shape.up,
        low: price * shape.down,
        close: price,
        volume: shape.volume,
      })
    }

    const result = detectBreakouts(synthetic, { timeframe, horizon, years, tolerances: t })
    for (const finding of result.findings) {
      counts[finding.kind]++
      if (finding.status === 'confirmed') confirmed[finding.kind]++
    }
  }

  const rate = (n) => Number(((n / trials) * 100).toFixed(1))
  return {
    trials,
    seed,
    barsPerTrial: rows.length,
    timeframe,
    windowYears: years ?? HORIZON_YEARS[horizon] ?? DEFAULT_YEARS,
    volatility: {
      dailySigma: Number(sigma.toFixed(5)),
      basis: 'Standard deviation of the log returns of the real series, per bar of this timeframe.',
    },
    firedPercent: {
      'multi-year-breakout': rate(counts['multi-year-breakout']),
      'cup-and-handle': rate(counts['cup-and-handle']),
    },
    confirmedPercent: {
      'multi-year-breakout': rate(confirmed['multi-year-breakout']),
      'cup-and-handle': rate(confirmed['cup-and-handle']),
    },
    method:
      "Geometric random walk of the same length, starting price, dates and log-return volatility as this series, with each bar's intrabar range and volume drawn from a real bar of it.",
    limitation:
      'A random walk has no volatility clustering and no trend persistence, so this is an approximation of the chance rate rather than a proof of one.',
  }
}
