// Indicators, and the refusals that keep them honest.
//
// Everything here is a pure function of a bars array: data in, data out, no fetching,
// no caching and no idea which company it is looking at. prices.js hands over bars
// oldest-first, and that ordering is assumed throughout.
//
// The hard part of this module is not the arithmetic, it is knowing when NOT to
// answer. A recursive average has to be seeded with something, and the seed is an
// arbitrary choice: for the first few hundred bars the number you print is mostly a
// statement about that choice rather than about the market. Printing it anyway
// produces a figure that looks authoritative, is reproducible by nobody else, and
// disagrees with every chart the reader can check it against. So each indicator
// computes how long its own seed takes to stop mattering and returns
// { unavailable: 'needs X bars, have Y' } until it has that much history.
//
// Nothing in here interprets a number. "RSI is 71" is this module's job; what that
// means is not, and policy.js exists to keep it that way.

// A residual weight of 1% is the line between "the seed still shows" and "the seed
// is noise". It is a convention, not a law, which is why it is named and exported
// rather than buried as 0.01 in three places.
export const SEED_RESIDUAL = 0.01

/**
 * Bars needed before a recursive average has forgotten its seed.
 *
 * After k updates the seed still carries (1 - alpha)^k of the weight. Solving
 * (1 - alpha)^k < SEED_RESIDUAL gives k = ln(0.01) / ln(1 - alpha), and the period
 * itself is added because those first N bars are consumed building the seed.
 *
 * Both logs are negative, so the quotient is positive. For a 200 EMA
 * (alpha = 2/201) that is 200 + 461 = 661 daily bars; the Upstox daily series runs
 * about 1,488 bars, so a 200 EMA is reachable and a 200 WEEK EMA is not.
 *
 * The number this returns is large and it is supposed to be. 661 bars for a 200 EMA
 * reads like a bug next to the 200 a chart package needs before it draws a line, and
 * the difference is that the chart package draws the seed and this does not. Lowering
 * SEED_RESIDUAL toward 1 shortens the wait by publishing the seed under another name;
 * the figure then reproduces on nobody else's screen and moves when the fetch window
 * moves. The fix for a horizon that cannot reach its own average is a period sized to
 * the timeframe, which is what HORIZONS does, not a looser gate here.
 */
export function warmupBars(period, alpha = 2 / (period + 1)) {
  if (!(period >= 1) || !(alpha > 0) || !(alpha < 1)) throw new Error(`Bad warmup inputs: period=${period} alpha=${alpha}`)
  return period + Math.ceil(Math.log(SEED_RESIDUAL) / Math.log(1 - alpha))
}

const round = (value, places = 2) => Number(value.toFixed(places))

function short(need, have, what = 'bars') {
  return { unavailable: `needs ${need} ${what}, have ${have}`, needs: need, have }
}

// Every emitted figure says which bar it belongs to and how much history produced
// it. A number without its as-of date is unauditable, and the reader has no way to
// tell a stale series from a fresh one.
function stamp(bars, used = bars.length) {
  return { asOf: bars[bars.length - 1].date, barsUsed: used, from: bars[0].date }
}

const closesOf = (bars) => bars.map((b) => b.close)

function usable(bars) {
  return Array.isArray(bars) ? bars.filter((b) => b && Number.isFinite(b.close)) : []
}

// ---------------------------------------------------------------------------
// Moving averages
// ---------------------------------------------------------------------------

/**
 * EMA series over plain numbers, seeded with the SMA of the first N values.
 *
 * The seed has to come from somewhere, and the SMA of the first window is the
 * choice every charting package makes, so it is the one that reproduces what the
 * reader sees elsewhere. Returns nulls until the seed exists; callers never publish
 * from that region, the warmup gate above stops them long before it.
 */
function emaOver(values, period) {
  if (values.length < period) return null
  const alpha = 2 / (period + 1)
  const out = new Array(values.length).fill(null)

  let current = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period
  out[period - 1] = current
  for (let i = period; i < values.length; i++) {
    current = values[i] * alpha + current * (1 - alpha)
    out[i] = current
  }
  return out
}

/** Simple moving average of the last `period` values. */
function smaOver(values, period) {
  if (values.length < period) return null
  return values.slice(-period).reduce((sum, v) => sum + v, 0) / period
}

/**
 * Exponential moving average of the closes.
 *
 * minBars overrides the warmup gate. It exists so a test can check this arithmetic
 * against a worked example computed on a handful of bars; the analyzer pipeline
 * never passes it, because relaxing the gate is exactly the failure this module is
 * built to prevent.
 */
export function ema(bars, period = 20, { minBars } = {}) {
  const rows = usable(bars)
  const need = minBars ?? warmupBars(period)
  if (rows.length < need) return short(need, rows.length)

  const series = emaOver(closesOf(rows), period)
  return { value: round(series[series.length - 1]), period, warmup: warmupBars(period), ...stamp(rows) }
}

/** Simple moving average. A plain window has no seed, so its warmup is exactly N. */
export function sma(bars, period = 20) {
  const rows = usable(bars)
  if (rows.length < period) return short(period, rows.length)
  return { value: round(smaOver(closesOf(rows), period)), period, warmup: period, ...stamp(rows) }
}

// ---------------------------------------------------------------------------
// RSI
// ---------------------------------------------------------------------------

const rsiFrom = (gain, loss) => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))

/**
 * Wilder's RSI.
 *
 * The averages are Wilder's smoothing, avg = (prev * (N-1) + today) / N, which is an
 * EMA with alpha = 1/N. It is NOT a rolling mean of the last N changes, and the
 * difference is not cosmetic: a rolling mean drops its oldest change outright, so
 * when a large bar falls out of the window RSI moves on information that is two
 * weeks old, and the same series scores several points differently depending on
 * which implementation drew it. Wilder's version keeps a decaying weight on every
 * past bar, and it is what every published RSI value and every chart assumes.
 *
 * Cost of that memory: the seed never fully leaves, hence the warmup. With N = 14
 * that is 78 bars, not the 15 a naive reading suggests.
 */
function rsiOver(closes, period) {
  if (closes.length < period + 1) return null
  const out = new Array(closes.length).fill(null)

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) gain += change
    else loss -= change
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = rsiFrom(avgGain, avgLoss)

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period
    out[i] = rsiFrom(avgGain, avgLoss)
  }
  return out
}

/** Bars, not changes: RSI consumes differences, so N changes cost N+1 bars. */
export function rsiWarmup(period) {
  return 1 + warmupBars(period, 1 / period)
}

export function rsi(bars, period = 14, { minBars } = {}) {
  const rows = usable(bars)
  const need = minBars ?? rsiWarmup(period)
  if (rows.length < need) return short(need, rows.length)

  const series = rsiOver(closesOf(rows), period)
  return { value: round(series[series.length - 1]), period, warmup: rsiWarmup(period), ...stamp(rows) }
}

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

/**
 * The signal line is an EMA of an EMA difference, so its warmup composes: the MACD
 * line is only trustworthy once the slow EMA has settled, and the signal then needs
 * its own run of trustworthy MACD values on top of that. For 12/26/9 that is 86
 * bars for the line and 115 for the signal, which is why a fresh listing shows a
 * MACD line and no histogram for months.
 */
export function macdWarmup(fast = 12, slow = 26, signal = 9) {
  const line = Math.max(warmupBars(fast), warmupBars(slow))
  return { line, signal: line + warmupBars(signal) - 1 }
}

export function macd(bars, { fast = 12, slow = 26, signal = 9, minBars } = {}) {
  const rows = usable(bars)
  const warmup = macdWarmup(fast, slow, signal)
  const need = minBars ?? warmup.line
  if (rows.length < need) return short(need, rows.length)

  const closes = closesOf(rows)
  const fastEma = emaOver(closes, fast)
  const slowEma = emaOver(closes, slow)

  // The MACD line starts where the slow EMA starts; before that there is nothing to
  // subtract from.
  const start = slow - 1
  const line = []
  for (let i = start; i < closes.length; i++) line.push(fastEma[i] - slowEma[i])

  const value = line[line.length - 1]
  const out = { value: round(value, 4), fast, slow, signalPeriod: signal, warmup, ...stamp(rows) }

  const signalNeed = minBars ?? warmup.signal
  if (rows.length < signalNeed) {
    // The line is publishable and the histogram is not, so say so per figure rather
    // than withholding both.
    out.signal = short(signalNeed, rows.length)
    out.histogram = out.signal
    return out
  }

  const signalSeries = emaOver(line, signal)
  const signalValue = signalSeries[signalSeries.length - 1]
  out.signal = round(signalValue, 4)
  out.histogram = round(value - signalValue, 4)
  return out
}

// ---------------------------------------------------------------------------
// ATR
// ---------------------------------------------------------------------------

/**
 * True range takes the widest of today's range and the two gaps against yesterday's
 * close, so an overnight gap counts as movement rather than being erased.
 */
function trueRanges(bars) {
  const out = []
  for (let i = 1; i < bars.length; i++) {
    const { high, low } = bars[i]
    const prev = bars[i - 1].close
    out.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)))
  }
  return out
}

/** Same smoothing as RSI, so the same warmup: N+1 bars to seed, then the decay. */
export function atrWarmup(period) {
  return 1 + warmupBars(period, 1 / period)
}

export function atr(bars, period = 14, { minBars } = {}) {
  const rows = usable(bars).filter((b) => Number.isFinite(b.high) && Number.isFinite(b.low))
  const need = minBars ?? atrWarmup(period)
  if (rows.length < need) return short(need, rows.length)

  const ranges = trueRanges(rows)
  let value = ranges.slice(0, period).reduce((sum, r) => sum + r, 0) / period
  for (let i = period; i < ranges.length; i++) value = (value * (period - 1) + ranges[i]) / period

  const last = rows[rows.length - 1].close
  return {
    value: round(value),
    // The same volatility reads very differently on a Rs 40 stock and a Rs 4,000 one,
    // so the percentage travels with it.
    percentOfClose: round((value / last) * 100),
    period,
    warmup: atrWarmup(period),
    ...stamp(rows),
  }
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export function averageVolume(bars, period = 20) {
  const rows = usable(bars).filter((b) => Number.isFinite(b.volume))
  if (rows.length < period) return short(period, rows.length)
  return { value: Math.round(smaOver(rows.map((b) => b.volume), period)), period, warmup: period, ...stamp(rows) }
}

/**
 * Latest volume against its own recent baseline.
 *
 * The baseline deliberately excludes the latest bar: a genuine spike would otherwise
 * inflate the average it is being measured against and understate itself. Hence
 * period + 1 bars.
 */
export function relativeVolume(bars, period = 20) {
  const rows = usable(bars).filter((b) => Number.isFinite(b.volume))
  const need = period + 1
  if (rows.length < need) return short(need, rows.length)

  const latest = rows[rows.length - 1]
  const baseline = smaOver(rows.slice(0, -1).map((b) => b.volume), period)
  if (!baseline) {
    return { unavailable: `baseline volume over ${period} bars is zero, so a ratio would be meaningless` }
  }

  return {
    value: round(latest.volume / baseline, 2),
    latestVolume: latest.volume,
    baselineVolume: Math.round(baseline),
    period,
    warmup: need,
    ...stamp(rows),
  }
}

/**
 * Delivery percentage: how much of the day's traded quantity actually changed hands
 * rather than being squared off intraday.
 *
 * Pure passthrough. It is not derivable from OHLCV, so if the caller did not attach
 * it the answer is that it is missing, with the reason and where it comes from.
 */
export function deliveryPercent(bars) {
  const rows = Array.isArray(bars) ? bars : []
  const latest = rows[rows.length - 1]
  if (!latest) return short(1, 0)

  if (!Number.isFinite(latest.deliveryPercent)) {
    return {
      unavailable:
        'Delivery percentage is not published in the candle feed. It appears only in the NSE daily bhavcopy (sec_bhavdata_full.csv, column DELIV_PER) and was not attached to this series.',
    }
  }
  return { value: round(latest.deliveryPercent), asOf: latest.date, source: 'Attached to the bar series by the caller' }
}

// ---------------------------------------------------------------------------
// Market structure
// ---------------------------------------------------------------------------

/**
 * Fractal swing points: a bar is a swing high when its high exceeds the highs of the
 * `lookback` bars on both sides, and a swing low when its low is below both sides.
 *
 * Two deliberate properties:
 *
 *   Strict comparison. A plateau of equal highs yields no swing at all rather than
 *   an arbitrary pick, because "the first of the equal bars" and "the last of them"
 *   are both defensible and the choice would change the pattern engine's output.
 *
 *   The last `lookback` bars are never classified. A fractal is confirmed by the
 *   bars that come after it, and a swing announced before its right shoulder exists
 *   is a swing the next bar can erase.
 */
export function swingPoints(bars, { lookback = 2 } = {}) {
  const rows = usable(bars).filter((b) => Number.isFinite(b.high) && Number.isFinite(b.low))
  const need = lookback * 2 + 1
  if (rows.length < need) return short(need, rows.length)

  const points = []
  for (let i = lookback; i < rows.length - lookback; i++) {
    let isHigh = true
    let isLow = true
    for (let k = 1; k <= lookback; k++) {
      if (rows[i].high <= rows[i - k].high || rows[i].high <= rows[i + k].high) isHigh = false
      if (rows[i].low >= rows[i - k].low || rows[i].low >= rows[i + k].low) isLow = false
    }
    if (isHigh) points.push({ index: i, date: rows[i].date, kind: 'high', price: rows[i].high, confirmedOn: rows[i + lookback].date })
    if (isLow) points.push({ index: i, date: rows[i].date, kind: 'low', price: rows[i].low, confirmedOn: rows[i + lookback].date })
  }

  return { points, lookback, unconfirmedTailBars: lookback, ...stamp(rows) }
}

function label(previous, current, kind) {
  if (current > previous) return kind === 'high' ? 'higher-high' : 'higher-low'
  if (current < previous) return kind === 'high' ? 'lower-high' : 'lower-low'
  return kind === 'high' ? 'equal-high' : 'equal-low'
}

function sequence(points, kind) {
  const of = points.filter((p) => p.kind === kind)
  return of.map((p, i) => ({ ...p, label: i === 0 ? null : label(of[i - 1].price, p.price, kind) }))
}

const STRUCTURES = {
  'HH-HL': 'Each of the last two swing highs is above the one before it, and so is each of the last two swing lows',
  'LH-LL': 'Each of the last two swing highs is below the one before it, and so is each of the last two swing lows',
  range: 'Recent swing highs and swing lows sit inside one narrow band',
  mixed: 'The recent swing highs and swing lows do not agree on a direction',
}

/**
 * Swing sequence, its classification, and a range test.
 *
 * The swing points themselves come back so the pattern engine can consume them
 * rather than re-detecting and possibly disagreeing about where the swings are.
 *
 * rangeTolerance is the width of the band, as a fraction of its own midpoint, that
 * still counts as consolidation. 6% is a knob, not a discovery: it is wide enough
 * that ordinary daily noise on a large cap stays inside it and tight enough that a
 * real leg out of the range breaks it.
 */
export function marketStructure(bars, { lookback = 2, rangeTolerance = 0.06, swingWindow = 6 } = {}) {
  const swings = swingPoints(bars, { lookback })
  if (swings.unavailable) return swings

  const highs = sequence(swings.points, 'high')
  const lows = sequence(swings.points, 'low')
  if (highs.length < 2 || lows.length < 2) {
    return {
      unavailable: `needs 2 confirmed swing highs and 2 swing lows, have ${highs.length} and ${lows.length}`,
      swings: swings.points,
      lookback,
    }
  }

  const recent = swings.points.slice(-swingWindow)
  const top = Math.max(...recent.map((p) => p.price))
  const bottom = Math.min(...recent.map((p) => p.price))
  const band = (top - bottom) / ((top + bottom) / 2)
  const range = {
    inRange: band <= rangeTolerance,
    bandPercent: round(band * 100),
    tolerancePercent: round(rangeTolerance * 100),
    high: top,
    low: bottom,
    swingsConsidered: recent.length,
  }

  const lastHigh = highs[highs.length - 1].label
  const lastLow = lows[lows.length - 1].label
  let structure = 'mixed'
  if (lastHigh === 'higher-high' && lastLow === 'higher-low') structure = 'HH-HL'
  else if (lastHigh === 'lower-high' && lastLow === 'lower-low') structure = 'LH-LL'
  else if (range.inRange) structure = 'range'

  return {
    structure,
    description: STRUCTURES[structure],
    lastSwingHigh: highs[highs.length - 1],
    lastSwingLow: lows[lows.length - 1],
    highs,
    lows,
    swings: swings.points,
    range,
    lookback,
    unconfirmedTailBars: lookback,
    asOf: swings.asOf,
    barsUsed: swings.barsUsed,
    from: swings.from,
  }
}

// ---------------------------------------------------------------------------
// Horizons
// ---------------------------------------------------------------------------

/**
 * The most bars each timeframe's feed can ever hand over.
 *
 * prices.js asks Upstox for six years of daily candles, twelve of weekly and twenty
 * of monthly. NSE trades roughly 248 sessions and 52 weeks a year, so those requests
 * cap out at the counts below on a company that has been listed the whole time. A
 * younger listing has a fraction of them, which is why every indicator still runs its
 * own warmup gate at request time.
 *
 * The job of these ceilings is narrower and it happens once, at import. A period
 * whose warmup exceeds the ceiling can never be computed on that timeframe for any
 * company on any day. That is a mistake in the table below, not a gap in the data,
 * and CONFIGURED_PERIODS_FIT refuses to load rather than let a horizon ship a rule it
 * can never fire.
 */
export const TIMEFRAME_HISTORY = { daily: 6 * 248, weekly: 12 * 52, monthly: 20 * 12 }

/**
 * Which timeframes carry weight for which holding period, as data rather than as
 * branching code, so the report can print the weights it actually used.
 *
 * Weights are per horizon and sum to 1.
 *
 * PERIODS ARE PER TIMEFRAME, and that is the whole point of this table's shape.
 *
 * A period is a count of bars, so the same number means a different length of time on
 * every chart it is put on. A 200 EMA is 200 sessions, about ten months, and that is
 * the reason the figure is famous. Put the same 200 on monthly candles and it asks
 * for 200 months, about seventeen years of average, seeded from a warmup that needs
 * 661 monthly candles or roughly 55 years of history. No listed company has that, so
 * the figure is not slow, it is unobtainable, and a horizon that configured it scored
 * every report without a moving-average row and said nothing.
 *
 * So each timeframe gets the periods that express the SPAN the horizon cares about,
 * converted at about 21 sessions and 4.3 weeks to the month:
 *
 *     span        daily    weekly   monthly
 *     one month      20         4         -
 *     one quarter    50        10         3
 *     half a year   100        20         6
 *     ten months    200        40        10     <- the classic long-term average
 *     two years       -       100        24
 *
 * The bottom row of that table is the honest answer to "what is the long-term average
 * on a monthly chart": ten bars, not two hundred. It is the same ten months the
 * 200-day EMA measures, read off candles that are twenty-one times wider.
 *
 * rsi, atr and volume stay flat across timeframes. RSI(14) and ATR(14) are 14-period
 * settings by convention on whatever chart they are drawn on, and their warmup is 78
 * bars, which fits inside every ceiling above (240 monthly is the tightest). MACD
 * keeps its 12/26/9 defaults for the same reason: its signal line warms up in 115
 * bars. Only the moving averages were ever in conflict with the history available.
 */
export const HORIZONS = {
  intraday: {
    label: 'Intraday',
    span: 'within one session',
    supported: false,
    unavailable:
      'No free intraday source exists. The price feed publishes daily, weekly and monthly candles without a key; anything finer needs a paid, authenticated market data feed. Intraday is refused here rather than approximated from daily bars, which would describe the wrong thing entirely.',
    timeframes: {},
    periods: {},
  },
  short: {
    label: 'Short term',
    span: 'days to about four weeks',
    supported: true,
    timeframes: { daily: 0.8, weekly: 0.2 },
    // Two weeks, one month and one quarter, read off the daily chart this horizon
    // lives on. Weekly carries a fifth of the weight and gets the same last two spans.
    periods: {
      daily: { ema: [9, 20, 50], rsi: 14, atr: 14, volume: 20 },
      weekly: { ema: [4, 10], rsi: 14, atr: 14, volume: 20 },
    },
  },
  swing: {
    label: 'Swing',
    span: 'about four weeks to three months',
    supported: true,
    timeframes: { daily: 0.6, weekly: 0.4 },
    periods: {
      daily: { ema: [20, 50], rsi: 14, atr: 14, volume: 20 },
      weekly: { ema: [4, 10], rsi: 14, atr: 14, volume: 20 },
    },
  },
  medium: {
    label: 'Medium term',
    span: 'three months to a year',
    supported: true,
    timeframes: { daily: 0.3, weekly: 0.5, monthly: 0.2 },
    // A quarter and half a year, which is the band this horizon covers.
    periods: {
      daily: { ema: [50, 100], rsi: 14, atr: 14, volume: 50 },
      weekly: { ema: [10, 20], rsi: 14, atr: 14, volume: 20 },
      monthly: { ema: [3, 6], rsi: 14, atr: 14, volume: 12 },
    },
  },
  long: {
    label: 'Long term',
    span: 'one to three years',
    supported: true,
    timeframes: { daily: 0.1, weekly: 0.4, monthly: 0.5 },
    // Monthly outweighs weekly here, so monthly is the series the scorecard reads and
    // the one whose periods have to be reachable. Half a year and ten months: 6 and 10
    // monthly bars, warming up in 20 and 33 candles. The daily column keeps 100 and
    // 200 because that is the same half-year and ten months in sessions.
    periods: {
      daily: { ema: [100, 200], rsi: 14, atr: 14, volume: 50 },
      weekly: { ema: [20, 40], rsi: 14, atr: 14, volume: 20 },
      monthly: { ema: [6, 10], rsi: 14, atr: 14, volume: 12 },
    },
  },
  multiYear: {
    label: 'Multi-year',
    span: 'three years and beyond',
    supported: true,
    timeframes: { weekly: 0.3, monthly: 0.7 },
    // Ten months and two years. The 24-month EMA warms up in 80 monthly candles, so a
    // company listed under seven years ago reports it unavailable with the shortfall
    // and the row scores on the 10-month figure alone. That is a data gap the report
    // names, not a rule the table made unreachable.
    periods: {
      weekly: { ema: [40, 100], rsi: 14, atr: 14, volume: 20 },
      monthly: { ema: [10, 24], rsi: 14, atr: 14, volume: 12 },
    },
  },
}

/**
 * Every warmup the periods configured for one timeframe imply, labelled.
 *
 * Exported so the horizon table can be audited from a test rather than by rerunning
 * the arithmetic in a comment, and so the check below and that test agree by
 * construction instead of by someone remembering to update both.
 */
export function warmupsFor({ ema: emaPeriods, rsi: rsiPeriod, atr: atrPeriod, volume }) {
  return [
    ...emaPeriods.map((period) => ({ what: `${period} EMA`, need: warmupBars(period) })),
    { what: `RSI(${rsiPeriod})`, need: rsiWarmup(rsiPeriod) },
    { what: `ATR(${atrPeriod})`, need: atrWarmup(atrPeriod) },
    { what: `${volume}-bar relative volume`, need: volume + 1 },
    { what: 'MACD signal line', need: macdWarmup().signal },
  ]
}

/**
 * Refuse to load a horizon that configures a rule it can never fire.
 *
 * This throws at import, which is deliberate and is the difference between the two
 * kinds of missing number this codebase cares about. A company with three years of
 * history cannot produce a 24-month EMA, the warmup gate says so with the bar counts,
 * and the report prints that as a gap. A horizon that asks a 240-bar feed for a
 * 661-bar average produces the same "unavailable" string for a completely different
 * reason: nobody will ever see that figure, the scorecard will quietly run one rule
 * short on every report forever, and the string blames the data for a decision made
 * here.
 *
 * Crashing the process is the cheapest way to keep those apart. A period added to the
 * table without checking it against the feed fails the first time anyone starts the
 * server, not silently on production reports nobody diffs.
 */
for (const [name, horizon] of Object.entries(HORIZONS)) {
  if (!horizon.supported) continue

  const weighted = Object.keys(horizon.timeframes)
  const configured = Object.keys(horizon.periods)
  const mismatched = [
    ...weighted.filter((tf) => !configured.includes(tf)),
    ...configured.filter((tf) => !weighted.includes(tf)),
  ]
  if (mismatched.length) {
    throw new Error(
      `HORIZONS.${name}: weights and periods disagree about ${mismatched.join(', ')}. A weighted timeframe with no periods computes nothing; periods on an unweighted timeframe are never read.`
    )
  }

  for (const timeframe of weighted) {
    const ceiling = TIMEFRAME_HISTORY[timeframe]
    if (!ceiling) throw new Error(`HORIZONS.${name}: ${timeframe} is not a timeframe prices.js fetches`)
    for (const { what, need } of warmupsFor(horizon.periods[timeframe])) {
      if (need > ceiling) {
        throw new Error(
          `HORIZONS.${name}.${timeframe}: a ${what} needs ${need} ${timeframe} bars and the feed publishes at most ${ceiling}, so this rule could never fire for any company.`
        )
      }
    }
  }
}
