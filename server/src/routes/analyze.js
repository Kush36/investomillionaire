// The Stock Analyzer route: identification, collection, and the scorecard that
// reports what the other modules measured.
//
// Everything that computes a number lives in indicators.js, patterns.js and
// fundamentals.js, and every one of those is a pure function of data it was handed.
// This file is the only place that fetches, the only place that caches, and the only
// place that decides what goes in a response body. That split is the reason the
// engines are testable without a network and the reason a figure can never be
// invented here: there is nothing here to invent it with.
//
// Three things shape the handlers below.
//
// The first is that the wrong company is the worst possible answer, so resolution is
// its own endpoint. /resolve identifies and stops. The analysis endpoint takes an
// ISIN, never free text, which means the caller has already seen the name it is
// about to get a report on.
//
// The second is that this endpoint does real outbound work: up to three candle
// series and up to twelve XBRL documents per report. Hence the cache, and hence the
// tighter rate limit that index.js puts in front of it.
//
// The third is policy.js. The gate runs over the assembled report, once, immediately
// before the response, and it throws rather than flags. A report that fails it is
// withheld with a 500 and logged, because the alternative is shipping the sentence
// that failed.

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { resolve, loadUniverse } from '../data/universe.js'
import { candles, unexplainedJumps } from '../data/prices.js'
import {
  HORIZONS,
  ema,
  rsi,
  macd,
  atr,
  averageVolume,
  relativeVolume,
  deliveryPercent,
  marketStructure,
} from '../data/indicators.js'
import { detectPatterns, randomWalkBaseline, TOLERANCES } from '../data/patterns.js'
import { detectBreakouts, multiYearBreakout, breakoutBaseline, BREAKOUT_BASE_RATE } from '../data/breakouts.js'
import * as fundamentals from '../data/fundamentals.js'
import * as peers from '../data/peers.js'
import * as activity from '../data/activity.js'
import * as stocknews from '../data/stocknews.js'
import { assertPublishable, checkPhrase, disclosureFor, ANALYZER_DISCLOSURE } from '../data/policy.js'
import { LIMITS, ACCEPTED, sniffImage, filePartFrom, readCappedBody } from '../data/imageInput.js'
import { activeRecogniser, tickerCandidates, MAX_CANDIDATES, NOT_CONFIGURED } from '../data/ocr.js'
import { conclude } from '../data/conclusion.js'
import { WATCHLIST_CAP } from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'

export const analyzeRouter = Router()

/**
 * Every call that crosses out of this process, in one object.
 *
 * The handlers below go through `deps.x(...)` rather than calling the imports
 * directly, which is the seam the test suite replaces. It is the same trick
 * test/forgot-enumeration.test.js uses on the Mongoose statics, for the same reason:
 * a route test that needs NSE, Upstox and a live market to be up is a route test
 * nobody runs.
 */
export const deps = {
  resolve,
  loadUniverse,
  candles,
  detectPatterns,
  randomWalkBaseline,
  // The breakout detectors themselves are pure and run for real. Only the base rate
  // is seamed, for the same reason randomWalkBaseline is: it runs the detectors over
  // forty synthetic series, which is worth its cost against a live chart and not
  // worth it forty times inside a test suite.
  breakoutBaseline,
  quarterlySeries: fundamentals.quarterlySeries,
  corporateInfo: fundamentals.corporateInfo,
  peerComparison: peers.peerComparison,
  activityReport: activity.activityReport,
  companyNews: stocknews.companyNews,
  // Not an outbound HTTP call, but it is a trip to Mongo and it is the one piece of
  // /extract a route test cannot stand up. Same seam, same reason.
  requireAuth,
}

// Daily candles change once a day and a quarterly filing changes four times a year,
// so the only thing this TTL really governs is how hard a refresh button can hit
// NSE. Half an hour is short enough that a same-day filing shows up within one
// session and long enough that a reader clicking between horizons costs nothing.
const CACHE_TTL = 30 * 60 * 1000
const cache = new Map()

function cached(key) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.report
  return null
}

function store(key, report) {
  cache.set(key, { at: Date.now(), report })
  // Nothing evicts this except its own staleness, so cap it. An ISIN that nobody has
  // asked about in half an hour is not worth a megabyte of quarterly filings.
  if (cache.size > 200) {
    for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_TTL) cache.delete(k)
  }
  return report
}

// ---------------------------------------------------------------------------
// Scoring. The shape is verdict.js's: label, detail, points, and the min and max
// that rule could ever have contributed, so a reader can subtract any single row and
// recompute the total without trusting this file.
// ---------------------------------------------------------------------------

const rule = (label, detail, points, min, max) => ({ label, detail, points, min, max })

/**
 * A rule the horizon asked for and the data could not answer.
 *
 * A rule that simply disappears from the list is the failure this whole module exists
 * to prevent, one level up from a made-up number. The report still prints a band, a
 * total and a confidence, all of them computed as though the horizon had never
 * configured that input, and there is nothing on the page for a reader to notice. A
 * fetch that failed and a signal that was absent are different facts, and a rule with
 * no row is the report refusing to say which one it has.
 *
 * So the row survives with its reason instead of its points. scorecard() keeps it out
 * of the arithmetic, where a zero would drag the normalised score toward the middle,
 * and dataQuality prints it beside every other thing this report could not verify.
 */
const unscorable = (label, why) => ({ label, unavailable: why })

/** An engine's own refusal, which carries the bar counts that produced it. */
const why = (figure, fallback) => (typeof figure?.unavailable === 'string' ? figure.unavailable : fallback)

/**
 * Did this block fail, or is it a block that simply names its own gaps?
 *
 * Worth its own function because the two are told apart by TYPE and nothing else. A
 * stage that threw comes back as `{ unavailable: 'why' }`, a string. activityReport
 * and the news ranking both return `unavailable` as their list of named gaps, an
 * array, on every successful call they ever make. Testing the key for truthiness
 * reads a healthy activity section as a dead one and silently drops its rows from
 * the scorecard, which is exactly what it did before this existed.
 */
const failed = (block) => !block || typeof block.unavailable === 'string'

// Descriptive bands. Deliberately not APPLY/AVOID: verdict.js scores a decision a
// reader is about to make in a five-day window, and this scores a body of evidence
// about a listed company with no decision attached to it. A band here names how the
// readings fell, nothing more.
const BANDS = [
  { min: 0.75, band: 'mostly-positive', gist: 'Most of the readings that could be computed came out positive.' },
  { min: 0.55, band: 'leaning-positive', gist: 'More of the readings came out positive than negative.' },
  { min: 0.45, band: 'mixed', gist: 'The readings pull in both directions.' },
  { min: 0.25, band: 'leaning-negative', gist: 'More of the readings came out negative than positive.' },
  { min: -1, band: 'mostly-negative', gist: 'Most of the readings that could be computed came out negative.' },
]

const rupees = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`
const crore = (n) => (n == null ? null : `Rs ${fundamentals.toCrore(n).toLocaleString('en-IN')} cr`)
const signed = (n) => `${n > 0 ? '+' : ''}${n}`

/**
 * Technical rules, read off one timeframe.
 *
 * One timeframe rather than a weighted blend of all of them, because a blend turns
 * every row into a fraction of a point and the audit trail is the whole value of
 * this scorecard. The horizon's weights decide WHICH timeframe carries it; the
 * others contribute a single agreement row and are printed in full alongside.
 *
 * Every row below is configured by the horizon, so every one of them is a row the
 * reader was promised. A row whose input came back unavailable therefore has an else,
 * and the else carries the engine's own refusal rather than a shorter restatement of
 * it: "needs 661 bars, have 241" is the fact, and anything vaguer invites the reader
 * to assume the market was quiet when the truth is that the history was short.
 */
function technicalRules(primary, others, patterns) {
  const rules = []
  const { block, timeframe } = primary
  if (!block) return rules

  const close = block.lastClose
  const emas = block.ema.filter((e) => e.value != null)
  const missing = block.ema.filter((e) => e.value == null)
  if (close != null && emas.length) {
    const above = emas.filter((e) => close > e.value)
    const points = above.length === emas.length ? 2 : above.length === 0 ? -2 : above.length * 2 > emas.length ? 1 : -1
    // A partly-computed row says so inside the row. Printing "above 1 of the 1
    // averages this horizon uses" when the horizon configured two reads as a complete
    // finding, and the missing one is the slower of the pair every time.
    const shortfall = missing.length
      ? ` The ${missing.map((e) => `${e.period} EMA`).join(' and ')} this horizon also configures for the ${timeframe} series could not be computed (${missing.map((e) => `${e.period} EMA ${why(e, 'no reason was returned')}`).join('; ')}), so ${missing.length === 1 ? 'it is' : 'they are'} not in this row.`
      : ''
    rules.push(
      rule(
        'Close against its moving averages',
        `The ${timeframe} close of ${rupees(close)} on ${block.asOf} is above ${above.length} of the ${emas.length} exponential moving averages this horizon uses (${emas
          .map((e) => `${e.period} EMA at ${rupees(e.value)}`)
          .join(', ')}).${shortfall}`,
        points,
        -2,
        2
      )
    )
  } else {
    rules.push(
      unscorable(
        'Close against its moving averages',
        close == null
          ? `The ${timeframe} series carried no close, so there was nothing to compare a moving average against.`
          : `None of the ${block.ema.length} exponential moving averages this horizon configures for the ${timeframe} series could be computed: ${block.ema
              .map((e) => `${e.period} EMA ${why(e, 'no reason was returned')}`)
              .join('; ')}.`
      )
    )
  }

  if (block.rsi?.value != null) {
    const v = block.rsi.value
    const threshold = v >= 70 ? ', above the conventional 70 threshold' : v <= 30 ? ', below the conventional 30 threshold' : ''
    rules.push(
      rule(
        'Relative strength index',
        `RSI(${block.rsi.period}) on the ${timeframe} series is ${v}${threshold}, measured over ${block.rsi.barsUsed} bars to ${block.rsi.asOf}.`,
        v >= 60 ? 1 : v < 40 ? -1 : 0,
        -1,
        1
      )
    )
  } else {
    rules.push(unscorable('Relative strength index', `RSI on the ${timeframe} series: ${why(block.rsi, 'no value was returned')}.`))
  }

  if (typeof block.macd?.histogram === 'number') {
    const h = block.macd.histogram
    rules.push(
      rule(
        'MACD histogram',
        `The MACD line is ${block.macd.value} against a signal line of ${block.macd.signal}, so the histogram is ${signed(h)} on the ${timeframe} series to ${block.macd.asOf}.`,
        h > 0 ? 1 : h < 0 ? -1 : 0,
        -1,
        1
      )
    )
  } else {
    // macd() publishes the line before the signal line has warmed up, so the reason
    // lives on the histogram when the line itself is fine and on the block when it is
    // not. Both are the module's own wording.
    rules.push(
      unscorable(
        'MACD histogram',
        `The MACD histogram on the ${timeframe} series: ${why(block.macd?.histogram, why(block.macd, 'no value was returned'))}.`
      )
    )
  }

  if (block.structure?.structure) {
    const s = block.structure.structure
    rules.push(
      rule(
        'Market structure',
        `${block.structure.description}. Last confirmed swing high ${rupees(block.structure.lastSwingHigh.price)} on ${block.structure.lastSwingHigh.date}, last confirmed swing low ${rupees(block.structure.lastSwingLow.price)} on ${block.structure.lastSwingLow.date}.`,
        s === 'HH-HL' ? 2 : s === 'LH-LL' ? -2 : 0,
        -2,
        2
      )
    )
  } else {
    rules.push(unscorable('Market structure', `Market structure on the ${timeframe} series: ${why(block.structure, 'no classification was returned')}.`))
  }

  if (block.relativeVolume?.value != null) {
    const v = block.relativeVolume.value
    rules.push(
      rule(
        'Volume against its own baseline',
        `The latest ${timeframe} bar traded ${v}x the ${block.relativeVolume.period}-bar average volume that preceded it (${block.relativeVolume.latestVolume.toLocaleString('en-IN')} against ${block.relativeVolume.baselineVolume.toLocaleString('en-IN')}).`,
        // Participation only. A volume spike has no direction of its own, so this
        // row can add to the total and can never subtract from it.
        v >= 1.5 ? 1 : 0,
        0,
        1
      )
    )
  } else {
    rules.push(
      unscorable(
        'Volume against its own baseline',
        `Relative volume on the ${timeframe} series: ${why(block.relativeVolume, 'no ratio was returned')}.`
      )
    )
  }

  if (block.atr?.percentOfClose != null) {
    const v = block.atr.percentOfClose
    rules.push(
      rule(
        'Volatility',
        `Average true range over ${block.atr.period} bars is ${rupees(block.atr.value)}, which is ${v}% of the close.`,
        v > 4 ? -1 : 0,
        -1,
        0
      )
    )
  } else {
    rules.push(unscorable('Volatility', `Average true range on the ${timeframe} series: ${why(block.atr, 'no value was returned')}.`))
  }

  const structures = others.map((o) => o.block?.structure?.structure).filter(Boolean)
  if (structures.length && block.structure?.structure) {
    const agree = structures.filter((s) => s === block.structure.structure).length
    rules.push(
      rule(
        'Agreement across timeframes',
        `${agree} of the ${structures.length} other timeframes this horizon reads classify market structure the same way as the ${timeframe} series (${others
          .map((o) => `${o.timeframe}: ${o.block?.structure?.structure ?? 'not computed'}`)
          .join(', ')}).`,
        agree === structures.length ? 1 : agree === 0 ? -1 : 0,
        -1,
        1
      )
    )
  } else {
    // Three ways to have nothing to agree about, and they are different facts: the
    // horizon reads one series, the other series produced no structure, or the primary
    // series produced none and there is no opinion to compare theirs with.
    rules.push(
      unscorable(
        'Agreement across timeframes',
        !others.length
          ? `${timeframe} was the only timeframe this horizon weighs that returned usable bars, so there was no second series to agree or disagree with it.`
          : !block.structure?.structure
            ? `The ${timeframe} series produced no market structure, so there was nothing for the other timeframes this horizon reads to agree with.`
            : `The ${others.length} other ${others.length === 1 ? 'timeframe' : 'timeframes'} this horizon weighs produced no market structure to compare against the ${timeframe} series (${others
                .map((o) => `${o.timeframe}: ${why(o.block?.structure, why(o.block, 'not computed'))}`)
                .join('; ')}).`
      )
    )
  }

  const confirmed = (patterns?.patterns ?? []).filter((p) => p.status === 'confirmed')
  if (patterns && !patterns.unavailable) {
    rules.push(
      rule(
        'Chart patterns',
        confirmed.length
          ? `${confirmed.length} of the ${patterns.patterns.length} shapes detected on the ${timeframe} series are confirmed by a close through the neckline (${confirmed.map((p) => p.kind).join(', ')}). ${patterns.baseRate.meaning}`
          : `No confirmed chart pattern was detected on the ${timeframe} series. ${patterns.baseRate.what}`,
        // Capped at one point against a maximum of one, because the base rate this
        // module measures puts a confirmed shape close to chance on a series of this
        // length. A row worth more than that would let noise carry the scorecard.
        confirmed.length ? 1 : 0,
        0,
        1
      )
    )
  } else {
    rules.push(
      unscorable(
        'Chart patterns',
        `The pattern engine produced nothing for the ${timeframe} series: ${why(patterns, 'the stage did not run')}.`
      )
    )
  }

  return rules
}

/**
 * Breakout rules. Two of them, and the weights are the point.
 *
 * The multi-year breakout is the heaviest single row this report can produce, three
 * points where every other rule caps at two, and the reason is the detector's own
 * conjunction rather than anybody's enthusiasm for the shape. breakouts.js will only
 * call one when an old high stood for years, when price built a base with real depth
 * under it, and when a close cleared the level that the previous bar had not already
 * cleared. That combination fires on a handful of bars in a decade of a series. A row
 * that rare is worth more than a row that fires every other week.
 *
 * The cup stays capped at one point, next to the chart-pattern row and for the same
 * reason: it is a shape with a base rate, and a shape that also appears in noise
 * cannot be allowed to carry a scorecard.
 *
 * Neither row can go negative. Not finding a multi-year breakout is the ordinary
 * state of an ordinary chart, and scoring the absence of a rare event as a negative
 * would push every quiet company below the midpoint for being quiet.
 */
export function breakoutRules(breakouts) {
  const rules = []
  if (failed(breakouts)) return rules

  const my = breakouts.multiYear
  if (my) {
    // Standing, not timeframe. SERIES_STANDING carries the argument: a five-year
    // level read off daily candles consumes five of the six years the feed publishes,
    // so the finding can only sit in the last year of the series and one noisy
    // session sets the level it rests on. Weekly and monthly carry it; daily is
    // reported and scored at a third of the weight.
    const standing = my.series?.standing ?? 'unstated'
    const strong = standing === 'highest' || standing === 'high'
    const match = my.confidence?.normalised ?? 0

    rules.push(
      rule(
        'Multi-year breakout',
        my.found
          ? `The ${my.series.timeframe} close of ${rupees(my.breakout.close)} on ${my.breakout.date} was ${my.breakout.marginPercent}% above the ${my.window.describedAs} of ${rupees(my.priorHigh.price)}, which was set on ${my.priorHigh.date} and stood ${my.priorHigh.stoodForYears} years. The base under it reached ${my.base.depthPercent}% below that high. The detector's own rules scored the shape ${my.confidence.score} of ${my.confidence.best}. Standing of the ${my.series.timeframe} series for a level of this age: ${standing}.`
          : `No ${my.window.years}-year breakout was detected on the ${my.series.timeframe} series. ${my.reason}`,
        !my.found ? 0 : !strong ? 1 : match >= 0.6 ? 3 : 2,
        0,
        3
      )
    )
  }

  const cups = breakouts.cups ?? []
  const confirmed = cups.filter((c) => c.status === 'confirmed')
  if (breakouts.timeframe) {
    rules.push(
      rule(
        'Cup and handle',
        cups.length
          ? `${confirmed.length} of the ${cups.length} cup and handle ${cups.length === 1 ? 'shape' : 'shapes'} detected on the ${breakouts.timeframe} series closed back through the rim line (${cups
              .map((c) => `${c.base.fromDate} to ${c.rightRim.date}, rim ${rupees(c.rimLine.price)}, ${c.status}`)
              .join('; ')}).`
          : `No cup and handle was detected on the ${breakouts.timeframe} series. ${breakouts.notFound?.find((n) => n.kind === 'cup-and-handle')?.reason ?? ''}`.trim(),
        confirmed.length ? 1 : 0,
        0,
        1
      )
    )
  }

  return rules
}

function fundamentalRules(f) {
  const rules = []
  if (!f || f.unavailable) return rules

  const band = (v, detail, label) => {
    const points = v >= 15 ? 2 : v >= 0 ? 1 : v >= -10 ? -1 : -2
    return rule(label, detail, points, -2, 2)
  }

  const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null)

  const revenueYoy = last(f.revenue?.yoy)
  if (revenueYoy?.value != null) {
    rules.push(
      band(
        revenueYoy.value,
        `Revenue from operations in the quarter to ${revenueYoy.periodEnd} was ${crore(revenueYoy.to)}, against ${crore(revenueYoy.from)} in the quarter to ${revenueYoy.against}, a change of ${signed(revenueYoy.value)}%.`,
        'Revenue, year on year'
      )
    )
  }

  const profitYoy = last(f.profit?.yoy)
  if (profitYoy?.value != null) {
    rules.push(
      band(
        profitYoy.value,
        `Profit for the period in the quarter to ${profitYoy.periodEnd} was ${crore(profitYoy.to)}, against ${crore(profitYoy.from)} in the quarter to ${profitYoy.against}, a change of ${signed(profitYoy.value)}%.`,
        'Profit, year on year'
      )
    )
  }

  if (f.margins?.latest?.operating != null && f.margins?.yearAgo?.operating != null) {
    const delta = Number((f.margins.latest.operating - f.margins.yearAgo.operating).toFixed(2))
    rules.push(
      rule(
        'Operating margin against the same quarter a year earlier',
        `Operating margin in the quarter to ${f.margins.latest.periodEnd} was ${f.margins.latest.operating}%, against ${f.margins.yearAgo.operating}% in the quarter to ${f.margins.yearAgo.periodEnd}, a change of ${signed(delta)} percentage points.`,
        delta >= 1 ? 1 : delta <= -1 ? -1 : 0,
        -1,
        1
      )
    )
  }

  if (f.revenue?.cagr?.value != null) {
    const c = f.revenue.cagr
    rules.push(
      rule(
        'Revenue growth across the filing history',
        `Trailing twelve month revenue grew at ${signed(c.value)}% a year between the twelve months to ${c.fromPeriod} and the twelve months to ${c.toPeriod}, a span of ${c.years} ${c.years === 1 ? 'year' : 'years'}.`,
        c.value >= 15 ? 1 : c.value >= 0 ? 0 : -1,
        -1,
        1
      )
    )
  }

  const move = f.shareholding?.latestQuarterMove
  if (typeof f.shareholding?.unavailable === 'string') {
    // Either the company information endpoint did not answer or NSE publishes too few
    // quarters to measure a move across. Both leave the row uncomputable, and the
    // engine's own wording says which, so it is carried rather than paraphrased.
    rules.push(unscorable('Promoter and promoter group shareholding', f.shareholding.unavailable))
  } else if (move != null && f.shareholding?.latest) {
    rules.push(
      rule(
        'Promoter and promoter group shareholding',
        `Promoter and promoter group shareholding was ${f.shareholding.latest.holders['Promoter & Promoter Group']}% at ${f.shareholding.latest.date}, a change of ${signed(move)} percentage points on the previous quarter, against a materiality threshold of ${f.shareholding.materialThresholdPp} points.`,
        move >= f.shareholding.materialThresholdPp ? 1 : move <= -f.shareholding.materialThresholdPp ? -1 : 0,
        -1,
        1
      )
    )
  }

  if (f.coverage) {
    rules.push(
      rule(
        'Filing coverage',
        `${f.coverage.quarters} quarterly filings were read, from ${f.coverage.from} to ${f.coverage.to}, on a ${f.basis} basis.`,
        // Not a statement about the company. It is how much evidence the rows above
        // rest on, and a thin history should visibly weigh less than a full one.
        f.coverage.quarters >= 8 ? 1 : 0,
        0,
        1
      )
    )
  }

  return rules
}

/**
 * The subject against the companies NSE groups with it.
 *
 * Two rows, both of which only move when the subject is at one END of its comparable
 * peers. Being third of five is not a fact worth a point in either direction, and a
 * rule that scored every rank would turn peers.js's table of statistics into the
 * league table that module deliberately refuses to publish.
 *
 * P/E is left unscored on purpose. A lower multiple is cheaper and it is also the
 * market pricing in something the filings have not shown yet, and this report has no
 * way to tell those apart. It is printed in the table, counted in the notes, and left
 * out of the arithmetic.
 */
export function peerRules(peerBlock) {
  if (failed(peerBlock) || !peerBlock.table) return []

  const scored = [
    ['revenueGrowth', 'Revenue growth against the peer group'],
    ['operatingMargin', 'Operating margin against the peer group'],
  ]

  const rules = []
  for (const [key, label] of scored) {
    const counted = peers.compareToPeers(peerBlock.table, key)
    // Dropping the row entirely hid the fact that the comparison never happened, so
    // a report with no peer group scored as though peers had simply been neutral.
    // An unscorable row keeps it in the reader's view and out of the arithmetic.
    if (!counted) {
      rules.push(
        unscorable(
          label,
          peerBlock.tier
            ? `No peer in the group reports this figure for the same period, so there is nothing to compare against.`
            : `No peer group was formed for this company, so there is nothing to compare against. ${
                peerBlock.peerGroup?.unavailable ?? 'The reason is recorded in the peer section.'
              }`
        )
      )
      continue
    }
    rules.push(
      rule(
        label,
        `${counted.below} of the ${counted.comparable} ${counted.comparable === 1 ? 'peer' : 'peers'} with a figure for the same period report a lower one than ${counted.subject}, whose figure is ${counted.value}${counted.unit ? ` ${counted.unit}` : ''}${counted.period ? ` for the period to ${counted.period}` : ''}. ${counted.above} report a higher one.${counted.droppedForPeriod ? ` A further ${counted.droppedForPeriod} report this figure for a different period and are not counted.` : ''}`,
        counted.below === counted.comparable ? 1 : counted.above === counted.comparable ? -1 : 0,
        -1,
        1
      )
    )
  }
  return rules
}

/**
 * Disclosed transactions and announced orders.
 *
 * The order row cannot go negative, because filing no order announcement is the
 * normal condition of most listed companies and is not evidence about any of them.
 * The deal row can, because a disclosed disposal and a disclosed purchase are
 * genuinely opposite facts.
 *
 * The deal row is capped at one point in both directions and that is generous
 * already: activity.js can only read the single trading day NSE publishes, so this
 * row is one session of evidence sitting in a report built on years of it.
 */
export function activityRules(activityBlock) {
  const rules = []
  if (failed(activityBlock)) return rules

  const orders = activityBlock.orders
  if (typeof orders?.unavailable === 'string') {
    // The scored row below reads "no order was announced" off an empty list, and a
    // feed that never answered produces exactly that empty list. Scoring it lets an
    // NSE timeout subtract from the total and move the conclusion layer's label, which
    // is a network fault published as a fact about a company. So the row does not fire,
    // and the reader is told which of the two facts this report has.
    rules.push(unscorable('Orders announced', orders.unavailable))
  } else if (orders?.counts) {
    const c = orders.counts
    rules.push(
      rule(
        'Orders announced',
        c.total
          ? `${c.total} order announcement${c.total === 1 ? '' : 's'} were filed in the window this report covers. ${c.graded} state a value that could be measured against trailing revenue: ${c.high} at or above ${activity.MATERIALITY.highPercent}% of it, ${c.moderate} at or above the ${activity.MATERIALITY.moderatePercent}% disclosure threshold in LODR regulation 30, and ${c.low} below it.`
          : 'No order announcement was filed in the window this report covers. Announced order wins are a floor on order inflow rather than a measure of it, so an empty list is not a statement about the order book.',
        c.high ? 2 : c.moderate ? 1 : 0,
        0,
        2
      )
    )
  }

  const institutional = activityBlock.institutional
  const deals = institutional?.latest ?? []
  // Set by activity.js only when NEITHER deal file was read. An empty `latest` on a day
  // both files were read is a real absence and correctly produces no row at all; an
  // empty one because nothing arrived is a hole, and it says so.
  if (typeof institutional?.disclosuresUnavailable === 'string') {
    rules.push(
      unscorable(
        'Disclosed deals on the latest trading day',
        `Neither NSE deal file could be read, so no disclosure was counted for this company (${institutional.disclosuresUnavailable}).`
      )
    )
  } else if (deals.length) {
    const valueOf = (side) => deals.filter((d) => d.side === side).reduce((sum, d) => sum + d.value, 0)
    const purchased = valueOf('BUY')
    const disposed = valueOf('SELL')
    const net = purchased - disposed
    const larger = Math.max(purchased, disposed)
    // One side has to outweigh the other by half the larger side's value before this
    // row points anywhere. Below that the session was two-sided, which is a fact
    // about liquidity rather than about direction.
    const decisive = larger > 0 && Math.abs(net) / larger >= 0.5
    rules.push(
      rule(
        'Disclosed deals on the latest trading day',
        `NSE disclosed ${deals.length} bulk or block deal${deals.length === 1 ? '' : 's'} in this company on ${activityBlock.institutional.window.tradingDay}: ${crore(purchased)} purchased and ${crore(disposed)} disposed of by value. ${activityBlock.institutional.window.why}`,
        decisive ? (net > 0 ? 1 : -1) : 0,
        -1,
        1
      )
    )
  }

  return rules
}

/**
 * Add the rules up and say what the total describes.
 *
 * Normalising against the min and max of the rules that actually fired, rather than
 * against a fixed ceiling, is what keeps a report with half its inputs missing from
 * scoring in the middle by default. A company with four available rules is measured
 * against what those four rules could have said, and the count travels with the
 * result so the reader can see how thin it is.
 *
 * A row that could not be computed is split out here rather than dropped. It stays
 * out of every number in this block, including rulesFired and the confidence derived
 * from it, because a rule that failed is not evidence and counting it as one would
 * make a thinner report look like a better-supported one. It is returned all the same,
 * under notScored, so the reader can see that the horizon asked for a reading the data
 * could not give. A row worth zero points would have done neither job: it would have
 * pulled the normalised score toward the middle and read as a neutral measurement.
 */
function scorecard(all) {
  const rules = all.filter((r) => !r.unavailable)
  const notScored = all.filter((r) => r.unavailable)

  const score = rules.reduce((sum, r) => sum + r.points, 0)
  const worst = rules.reduce((sum, r) => sum + r.min, 0)
  const best = rules.reduce((sum, r) => sum + r.max, 0)
  const normalised = best === worst ? 0.5 : (score - worst) / (best - worst)
  const hit = BANDS.find((b) => normalised >= b.min) ?? BANDS[BANDS.length - 1]

  return {
    band: hit.band,
    gist: hit.gist,
    score,
    best,
    worst,
    normalised: Number(normalised.toFixed(3)),
    rulesFired: rules.length,
    rules,
    notScored,
    // The count, beside the rows, because the ratio is the thing a reader needs at a
    // glance: eight of eight scored is a different report from eight of fourteen, and
    // the total alone cannot tell them apart.
    rulesNotScored: notScored.length,
    scoredOnPartialEvidence: notScored.length > 0,
    means:
      'Each row was computed from published exchange and filing data by a fixed rule with a fixed range. The total is the sum of the rows and nothing else. It describes what the measurements were, not what to do about them.',
    notScoredMeans:
      'Each row here is a reading this horizon asked for and the available history could not produce. None of them contributed to the total, in either direction, and none of them counted toward the confidence above.',
    confidence: rules.length >= 8 ? 'high' : rules.length >= 4 ? 'medium' : 'low',
  }
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** Indicators for one timeframe. Pure: bars in, figures out. */
function computeTechnical(bars, periods) {
  const last = bars[bars.length - 1]
  return {
    lastClose: last?.close ?? null,
    asOf: last?.date ?? null,
    from: bars[0]?.date ?? null,
    barsAvailable: bars.length,
    ema: periods.ema.map((period) => ({ period, ...ema(bars, period) })),
    rsi: rsi(bars, periods.rsi),
    macd: macd(bars),
    atr: atr(bars, periods.atr),
    averageVolume: averageVolume(bars, periods.volume),
    relativeVolume: relativeVolume(bars, periods.volume),
    deliveryPercent: deliveryPercent(bars),
    // The pattern engine's own pivot lookback, so the swing points printed on the
    // chart and the swing points the pattern list was built from are the same ones.
    structure: marketStructure(bars, { lookback: TOLERANCES.swingLookback }),
  }
}

/**
 * The fundamental engine over one symbol's filings.
 *
 * quarterlySeries does the fetching; everything after it is arithmetic on what came
 * back, and every one of those functions returns { unavailable } rather than a
 * number when the filing history cannot support the comparison.
 *
 * `info` is passed in rather than fetched. The activity section and the news ranking
 * read the same document, and three fetches of it is three chances for one page to
 * print two different promoter percentages.
 */
async function computeFundamental(symbol, info) {
  const quarterly = await deps.quarterlySeries(symbol)

  const series = quarterly.series ?? []
  if (!series.length) {
    return {
      symbol,
      unavailable: `NSE published no readable quarterly filing for ${symbol}. ${quarterly.notes?.join(' ') ?? ''}`.trim(),
      notes: quarterly.notes ?? [],
      source: fundamentals.SOURCES.filings,
    }
  }

  const revenueYoy = fundamentals.yoy(series, 'revenue')
  const marginSeries = fundamentals.margins(series)
  const latestMargin = marginSeries[marginSeries.length - 1]
  // Matched by period end rather than by counting four rows back, so a missing
  // quarter cannot turn a fifteen-month comparison into a year-on-year one.
  const againstPeriod = revenueYoy[revenueYoy.length - 1]?.against
  const yearAgoMargin = againstPeriod ? marginSeries.find((m) => m.periodEnd === againstPeriod) : null

  return {
    symbol,
    basis: quarterly.basis,
    basisReason: quarterly.basisReason,
    coverage: quarterly.coverage,
    quarters: series.map((q) => ({
      periodEnd: q.periodEnd,
      periodStart: q.periodStart ?? null,
      basis: q.basis,
      audited: q.audited,
      revenueCrore: fundamentals.toCrore(q.revenue),
      revenueUnavailable: q.revenueUnavailable ?? null,
      patCrore: fundamentals.toCrore(q.pat),
      pbtCrore: fundamentals.toCrore(q.pbt),
      filedAt: q.filedAt ?? null,
      source: q.source,
    })),
    revenue: {
      yoy: revenueYoy,
      qoq: fundamentals.qoq(series, 'revenue'),
      ttm: fundamentals.ttm(series, 'revenue'),
      cagr: fundamentals.revenueCagr(series),
    },
    profit: {
      yoy: fundamentals.yoy(series, 'pat'),
      ttm: fundamentals.ttm(series, 'pat'),
    },
    margins: { series: marginSeries, latest: latestMargin ?? null, yearAgo: yearAgoMargin ?? null },
    shareholding: info ? fundamentals.shareholdingTrend(info) : { unavailable: 'The NSE company information endpoint did not answer, so no shareholding pattern was read.' },
    calendar: info ? attributeCalendar(fundamentals.corporateCalendar(info)) : null,
    notes: quarterly.notes ?? [],
    gaps: fundamentals.seriesGaps(series),
    source: fundamentals.SOURCES.filings,
  }
}

/**
 * Corporate actions and announcements are the exchange's words, not ours.
 *
 * This matters mechanically, not just as attribution. A corporate action purpose is
 * routinely the literal string "Buy Back of Shares", and an announcement subject can
 * say almost anything; policy.js reads those as a recommendation and would withhold
 * an otherwise clean report. It passes over any node carrying both a `source` and a
 * `headline`, which is exactly what attributed third-party text is, so every row is
 * reshaped into that form.
 */
/**
 * The close series the page draws, decimated to something a 300-pixel-wide drawing
 * can carry, plus the two levels worth drawing on it.
 *
 * Decimated by stride rather than averaged. An average of five closes is a price that
 * never traded, and a chart is not the place this file starts inventing figures. The
 * last bar is always kept, because a line that stops three bars short of the latest
 * close is a line that disagrees with the number printed above it.
 */
function chartFor(bars, timeframe, multiYear) {
  if (!bars?.length) return null

  const stride = Math.max(1, Math.ceil(bars.length / 160))
  const points = bars
    .filter((_, i) => i % stride === 0 || i === bars.length - 1)
    .map((b) => ({ date: b.date, close: b.close }))

  const found = multiYear?.found ? multiYear : null
  return {
    timeframe,
    points,
    stride,
    barsAvailable: bars.length,
    basis:
      stride === 1
        ? `Every ${timeframe} close in the series.`
        : `Every ${stride}th ${timeframe} close, plus the latest bar. No value here is averaged or interpolated; each one is a close that traded.`,
    // A horizontal line at the old high and a mark on the bar that cleared it. Nothing
    // is drawn ahead of the last bar, which is the whole reason there is no projection
    // on this chart and never will be.
    level: found
      ? {
          label: `${found.window.describedAs}, set ${found.priorHigh.date}`,
          price: found.priorHigh.price,
        }
      : null,
    marker: found ? { label: 'close through the level', date: found.breakout.date, price: found.breakout.close } : null,
  }
}

function attributeCalendar(calendar) {
  const attributed = (rows, textKey, dateKey) =>
    rows.map((row) => ({ headline: row[textKey], on: row[dateKey], source: calendar.source }))

  return {
    actions: attributed(calendar.actions, 'purpose', 'exDate'),
    meetings: attributed(calendar.meetings, 'purpose', 'date'),
    announcements: attributed(calendar.announcements, 'subject', 'at'),
    note: 'Filed by the company and published by NSE. Quoted, not restated.',
  }
}

/**
 * Every `unavailable` the engines produced, flattened with the path that produced it.
 *
 * Collected by walking the report rather than by listing them by hand, because a
 * hand-written list goes stale the first time an engine learns a new refusal and the
 * whole point of this block is that the reader can see what was not verified.
 */
function collectUnavailable(node, path = '', out = []) {
  if (!node || typeof node !== 'object') return out
  if (typeof node.unavailable === 'string') {
    // The moving averages are an array, so the path alone reads "ema[1]" and the
    // reader has no way to tell which period could not be computed.
    out.push({ field: node.period ? `${path} (period ${node.period})` : path, why: node.unavailable })
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectUnavailable(child, `${path}[${i}]`, out))
    return out
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.endsWith('Unavailable') && typeof value === 'string') out.push({ field: `${path}.${key.replace(/Unavailable$/, '')}`, why: value })
    else collectUnavailable(value, path ? `${path}.${key}` : key, out)
  }
  return out
}

/**
 * The invariant on dataQuality.verified, enforced rather than trusted.
 *
 * "Verified" is the strongest claim this report makes, and the rule printed under the
 * list promises that anything not in it was not read from a published source. A row
 * with no source is that promise inverted: it names a field as verified while carrying
 * nothing a reader could go and check. Several of the rows above take their source from
 * a block that may not have one, so the invariant is applied once here instead of being
 * re-argued at each of them. A row that fails it is not silently lost: whatever made it
 * sourceless also produced an `unavailable` the walk below collects.
 */
const sourced = (row) => Boolean(row.source?.name)

/**
 * First reason wins.
 *
 * Five modules now contribute a named-gaps list and several of them name the same
 * gap, because the promoter pledge is missing from the filings engine and from the
 * activity engine for the same regulation-31 reason. Printing it twice under two
 * wordings reads as two separate holes in the report.
 */
function dedupeByField(rows) {
  const seen = new Set()
  return rows.filter((row) => !seen.has(row.field) && seen.add(row.field))
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Identification only. No price fetch, no filings, no scoring.
 *
 * It exists so the client can ask "did you mean Indian Bank or Bank of India?"
 * before anything expensive runs, and so that an ambiguous query can never be
 * silently resolved to whichever company scored a hundredth of a point higher.
 */
analyzeRouter.get('/resolve', async (req, res) => {
  const parsed = z.object({ q: z.string().trim().min(1).max(120) }).safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Pass a company name, ticker or ISIN as q.' })

  try {
    const result = await deps.resolve(parsed.data.q)
    res.json({
      query: parsed.data.q,
      status: result.status,
      match: result.match,
      candidates: result.candidates,
      // The client is not allowed to pick for the reader when the resolver would not
      // pick for itself, so the instruction travels with the result.
      action:
        result.status === 'exact'
          ? 'Proceed with the ISIN on the match.'
          : result.status === 'ambiguous'
            ? 'Ask which of these candidates was meant. Do not choose one.'
            : 'Nothing on the NSE equity list matched closely enough to be sure.',
      source: { name: 'NSE equity list', url: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv' },
      disclosure: ANALYZER_DISCLOSURE,
    })
  } catch (err) {
    console.error('[analyze resolve]', err.message)
    res.status(502).json({ error: 'The NSE equity list is unreachable right now, so no company can be identified.' })
  }
})

const analyzeSchema = z.object({
  // Twelve characters, country code then eleven alphanumerics. Free text is refused
  // outright: /resolve is where a name becomes an identifier, and accepting one here
  // would hand this endpoint the ambiguity that endpoint exists to surface.
  isin: z.string().trim().toUpperCase().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/, 'Not an ISIN.'),
  type: z.enum(['fundamental', 'technical', 'both']).default('both'),
  horizon: z.enum(Object.keys(HORIZONS)).default('swing'),
})

analyzeRouter.post('/', async (req, res, next) => {
  const parsed = analyzeSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Send { isin, type, horizon }. Resolve a name to an ISIN at GET /api/analyze/resolve first.',
      detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      horizons: Object.entries(HORIZONS).map(([key, h]) => ({ key, label: h.label, span: h.span, supported: h.supported })),
    })
  }

  try {
    const { status, body } = await buildReport(parsed.data)
    // One call, not a ternary around it: disclosureFor already answers with the default
    // for a body that carries no conclusion, and a second test for the same condition is
    // a second place for the two to disagree.
    res.status(status).json({ ...body, disclosure: disclosureFor(body) })
  } catch (err) {
    next(err)
  }
})

/**
 * One whole report, returned as a value rather than written to a response.
 *
 * This used to be the body of the handler above and it moved for one reason: /batch
 * runs it ten times, and a function that owns `res` can only ever run once. Everything
 * that was a `res.status(n).json(x)` is now a `{ status: n, body: x }`, which is the
 * only change of substance. The refusals, the cache, the stage recorder and the policy
 * gate are all exactly where they were.
 *
 * It throws only for a fault the caller should not paper over. The refusals a reader
 * can act on come back as a status, so one stock refusing an unsupported horizon in a
 * batch of ten reports itself and leaves the other nine alone.
 */
export async function buildReport({ isin, type, horizon }) {
  const spec = HORIZONS[horizon]

  // Intraday is refused, not approximated. The reason is the honest one and it comes
  // from the horizon table itself rather than being restated here, so there is one
  // place to change it if a feed ever becomes available.
  if (!spec.supported) {
    return {
      status: 422,
      body: {
        error: `${spec.label} analysis is not available.`,
        reason: spec.unavailable,
        horizon,
        supported: Object.entries(HORIZONS).filter(([, h]) => h.supported).map(([key, h]) => ({ key, label: h.label, span: h.span })),
      },
    }
  }

  const key = `${isin}:${type}:${horizon}`
  const hit = cached(key)
  if (hit) return { status: 200, body: { ...hit, cached: true } }

  const pipeline = []
  const startedAt = Date.now()
  // The row is pushed when the stage STARTS and filled in when it finishes, so the
  // pipeline reads in the order the stages were asked for. Three of them now run
  // concurrently, and recording on completion would print them in whatever order the
  // feeds happened to answer, which is a different fact from the one this list is for.
  const stage = async (name, fn) => {
    const at = Date.now()
    const entry = { stage: name, status: 'running', ms: 0 }
    pipeline.push(entry)
    try {
      const value = await fn()
      Object.assign(entry, { status: 'ok', ms: Date.now() - at })
      return value
    } catch (err) {
      // A stage that fails does not fail the report. It fails its own block, with the
      // reason attached, and everything downstream reports what it could not use.
      console.error(`[analyze ${name}]`, err.message)
      Object.assign(entry, { status: 'failed', ms: Date.now() - at, why: err.message })
      return { unavailable: `${name} could not complete: ${err.message}` }
    }
  }

  try {
    // 1. Identify. An ISIN that is not on the equity list is not analysable, and
    //    guessing what it might have been is exactly the failure mode this whole
    //    module is built to avoid.
    const { byIsin } = await deps.loadUniverse()
    const identity = byIsin.get(isin)
    if (!identity) {
      return {
        status: 404,
        body: { error: `${isin} is not on the NSE equity list, so nothing can be analysed for it.` },
      }
    }
    pipeline.push({ stage: 'identify', status: 'ok', ms: Date.now() - startedAt })

    const wantsTechnical = type !== 'fundamental'
    const wantsFundamental = type !== 'technical'

    // 2. Collect. One request per timeframe the horizon actually weighs; a timeframe
    //    that fails comes back with its reason rather than taking the report down.
    const timeframes = Object.keys(spec.timeframes)
    const series = wantsTechnical
      ? await stage('collect prices', async () => {
          const rows = await Promise.all(
            timeframes.map(async (tf) => {
              const got = await deps.candles(isin, tf).catch((err) => ({ bars: [], unavailable: `Price source failed: ${err.message}` }))
              return [tf, got]
            })
          )
          return Object.fromEntries(rows)
        })
      : {}

    // 3. Validate. An unadjusted split puts a step in the series that every indicator
    //    downstream reads as a crash, so the discontinuities are found before any
    //    figure is computed and travel with the report.
    const validation = wantsTechnical
      ? await stage('validate', async () =>
          Object.fromEntries(
            timeframes.map((tf) => {
              const got = series[tf]
              const bars = got?.bars ?? []
              return [
                tf,
                {
                  bars: bars.length,
                  from: bars[0]?.date ?? null,
                  to: bars[bars.length - 1]?.date ?? null,
                  source: got?.source ?? null,
                  unavailable: got?.unavailable ?? (bars.length ? undefined : 'The price source returned no bars for this timeframe.'),
                  unexplainedJumps: unexplainedJumps(bars),
                },
              ]
            })
          )
        )
      : null

    // 4 and 5. Compute, then assemble the technical block per timeframe.
    const technical = wantsTechnical
      ? await stage('technical engine', async () =>
          Object.fromEntries(
            timeframes.map((tf) => {
              const bars = series[tf]?.bars ?? []
              if (!bars.length) {
                return [tf, { weight: spec.timeframes[tf], unavailable: series[tf]?.unavailable ?? 'No bars were returned for this timeframe.' }]
              }
              // Periods per timeframe, not per horizon. A period is a count of bars, so
              // one number means a different span on each chart; HORIZONS carries the
              // conversion and the reasoning behind it.
              const periods = spec.periods[tf]
              return [tf, { weight: spec.timeframes[tf], periods, ...computeTechnical(bars, periods) }]
            })
          )
        )
      : null

    // The timeframe the horizon weighs most, among those that actually produced
    // figures. It carries the scorecard; the rest are printed and contribute one
    // agreement row.
    const ranked = timeframes
      .filter((tf) => technical?.[tf] && !technical[tf].unavailable)
      .sort((a, b) => spec.timeframes[b] - spec.timeframes[a])
    const primaryTimeframe = ranked[0] ?? null

    // 6. Pattern engine, on the primary timeframe only. Running it on all three
    //    produces three descriptions of the same chart at different resolutions and
    //    nothing that reconciles them.
    const patterns =
      wantsTechnical && primaryTimeframe
        ? await stage('pattern engine', async () => {
            const bars = series[primaryTimeframe].bars
            const structure = technical[primaryTimeframe].structure
            // Swing indices are positions in the filtered series. They only line up
            // with the raw bars when nothing was filtered out, so anything else falls
            // back to the pattern engine's own pivots rather than reading prices off
            // the wrong bars.
            const aligned = structure && !structure.unavailable && structure.barsUsed === bars.length
            const detected = deps.detectPatterns(bars, {
              swings: aligned ? { lows: structure.lows, highs: structure.highs } : null,
            })
            return {
              timeframe: primaryTimeframe,
              swingsFrom: aligned ? 'indicators.js market structure' : 'computed by the pattern engine',
              ...detected,
              baseRateMeasured: deps.randomWalkBaseline(bars),
            }
          })
        : null

    // 7. Breakout engine. The owner's starred feature, and the one stage that does not
    //    run on the timeframe the horizon picked.
    //
    //    A multi-year level is a statement about YEARS, so it is read off the
    //    highest-standing series that was actually fetched rather than off whichever
    //    one this horizon weighs most. SERIES_STANDING carries the argument in full:
    //    a five-year window on daily candles eats five of the six years the feed
    //    publishes, which leaves only the last year of the series able to contain a
    //    breakout at all, and lets one noisy session set the level the whole finding
    //    rests on. The cup stays on the primary series, because a cup is a shape over
    //    bars and the horizon is what decides which bars the reader asked about.
    const breakouts =
      wantsTechnical && primaryTimeframe
        ? await stage('breakout engine', async () => {
            const bars = series[primaryTimeframe].bars
            const structure = technical[primaryTimeframe].structure
            const aligned = structure && !structure.unavailable && structure.barsUsed === bars.length
            const detected = detectBreakouts(bars, {
              timeframe: primaryTimeframe,
              horizon,
              swings: aligned ? { lows: structure.lows, highs: structure.highs } : null,
            })

            // detectBreakouts already ran a multi-year scan on the primary series, and
            // when the anchor is a different series that scan is thrown away and a
            // second one runs here. Deliberate: the alternative is calling cupAndHandle
            // and multiYearBreakout separately and rewriting breakouts.js's own "why it
            // was not found" prose in this file, and the scan is a few milliseconds
            // against a report that spends seconds on the network.
            const anchor =
              ['monthly', 'weekly', 'daily'].find((tf) => series[tf]?.bars?.length) ?? primaryTimeframe
            const multiYear =
              anchor === primaryTimeframe
                ? detected.findings.find((f) => f.kind === 'multi-year-breakout') ??
                  multiYearBreakout(bars, { timeframe: primaryTimeframe, horizon })
                : multiYearBreakout(series[anchor].bars, { timeframe: anchor, horizon })

            return {
              timeframe: primaryTimeframe,
              multiYear,
              cups: detected.findings.filter((f) => f.kind === 'cup-and-handle'),
              // The multi-year entry is dropped from this list when it is reported
              // above: a report that says "not found" in one block and prints the
              // finding in another is a report nobody can read.
              notFound: detected.notFound.filter((n) => n.kind !== 'multi-year-breakout'),
              swings: detected.swings,
              tolerances: detected.tolerances,
              // Measured only when there is a finding to caveat, and measured on the
              // series the finding came from. Forty synthetic runs of an O(bars x
              // window) scan is real work, and spending it to attach a chance rate to
              // the absence of an event answers a question nobody asked.
              baseRateMeasured: multiYear.found
                ? deps.breakoutBaseline(series[anchor].bars, { timeframe: anchor, horizon })
                : {
                    unavailable:
                      'No multi-year breakout was detected on this series, so no chance rate was measured for one. The figure is measured against a finding, not published as a standing statistic.',
                  },
              baseRate: BREAKOUT_BASE_RATE,
            }
          })
        : null

    // 8. Company information. One document, three consumers: the shareholding trend,
    //    the activity section and the filings the news ranking carries.
    const infoStage = wantsFundamental ? await stage('company info', () => deps.corporateInfo(identity.symbol)) : null
    const info = infoStage?.unavailable ? null : infoStage

    // 9. Fundamental engine.
    const fundamental = wantsFundamental ? await stage('fundamental engine', () => computeFundamental(identity.symbol, info)) : null

    // 10, 11 and 12. Peers, activity and news, concurrently: three independent sets of
    //     feeds, none of which reads the others' output, and running them in sequence
    //     adds most of a minute to a report for nothing. Each still fails on its own.
    //
    //     All three sit under the fundamental side. A technical report reads price and
    //     nothing else, which is what conclusion.js tells the reader a technical report
    //     is when it weighs the evidence against the requested holding period.
    const trailingRevenue = fundamental?.revenue?.ttm?.value ?? null
    const [peerBlock, activityBlock, newsBlock] = wantsFundamental
      ? await Promise.all([
          stage('peer comparison', () =>
            deps.peerComparison({ symbol: identity.symbol, isin: identity.isin, name: identity.name })
          ),
          stage('institutional activity and orders', () =>
            deps.activityReport(identity.symbol, { info, trailingRevenue })
          ),
          stage('news', () =>
            deps.companyNews(
              { symbol: identity.symbol, name: identity.name },
              {
                // The exchange announcements fundamentals.js already fetched, carried
                // rather than re-fetched. A filing is the company's own words under its
                // own symbol, so it ranks first and needs none of the relevance
                // matching a wire headline goes through.
                filings: fundamental?.calendar?.announcements ?? [],
                filingSource: fundamentals.SOURCES.corpInfo,
              }
            )
          ),
        ])
      : [null, null, null]

    // 13. Scorecard.
    const rules = [
      ...(wantsTechnical && primaryTimeframe
        ? technicalRules(
            { timeframe: primaryTimeframe, block: technical[primaryTimeframe] },
            // Every other timeframe the horizon weighs, not only the ones that
            // produced figures. A timeframe that returned nothing is part of what the
            // agreement row was supposed to read, and leaving it out of the list is
            // how the row came to describe two series as though they were three.
            timeframes.filter((tf) => tf !== primaryTimeframe).map((tf) => ({ timeframe: tf, block: technical[tf] })),
            patterns
          )
        : []),
      // Not one timeframe produced bars, so technicalRules never ran and the rows it
      // owns are absent rather than refused. The scorecard would otherwise print a
      // band computed entirely from filings under a report the reader asked for
      // technicals on.
      ...(wantsTechnical && !primaryTimeframe
        ? [
            unscorable(
              'Technical rules',
              `No timeframe this horizon weighs returned usable bars, so none of the rules read off a price series could be computed (${timeframes
                .map((tf) => `${tf}: ${why(technical?.[tf], 'not attempted')}`)
                .join('; ')}).`
            ),
          ]
        : []),
      ...(wantsTechnical ? breakoutRules(breakouts) : []),
      ...(wantsFundamental ? fundamentalRules(fundamental) : []),
      ...(wantsFundamental ? peerRules(peerBlock) : []),
      ...(wantsFundamental ? activityRules(activityBlock) : []),
      // A whole stage that never answered. Each rule family above returns nothing when
      // its block failed, which is correct — a rule must not fire on data that was
      // never fetched — but nothing then says the rows were asked for and missed. The
      // families report a missing FIGURE; these report a missing FEED.
      ...(wantsTechnical && failed(breakouts)
        ? [unscorable('Breakout rules', why(breakouts, 'The breakout engine did not run, so no shape was scanned for.'))]
        : []),
      ...(wantsFundamental && failed(fundamental)
        ? [unscorable('Fundamental rules', why(fundamental, 'The fundamental engine did not run, so no filing was read.'))]
        : []),
      ...(wantsFundamental && (failed(peerBlock) || !peerBlock.table)
        ? [unscorable('Peer group rules', why(peerBlock, 'No peer table was built, so the company was not measured against anything.'))]
        : []),
      ...(wantsFundamental && failed(activityBlock)
        ? [unscorable('Disclosed deals and announced orders', why(activityBlock, 'The activity stage did not run, so no disclosure or announcement was read.'))]
        : []),
    ]
    // Built before the report rather than inline in it, because dataQuality has to
    // reprint the rows it could not score and a value cannot read its own sibling.
    const card = scorecard(rules)
    pipeline.push({ stage: 'scorecard', status: 'ok', ms: Date.now() - startedAt })

    const report = {
      request: { isin, type, horizon, label: spec.label, span: spec.span, timeframeWeights: spec.timeframes },
      identity: {
        symbol: identity.symbol,
        name: identity.name,
        isin: identity.isin,
        series: identity.series,
        listedOn: identity.listedOn,
        faceValue: identity.faceValue,
        source: { name: 'NSE equity list', url: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv' },
      },
      pipeline,
      validation,
      // Ordered the way the page reads it, so a reader looking at the JSON and a
      // reader looking at the page are looking at the same report in the same order.
      breakouts,
      chart: breakouts
        ? chartFor(
            series[breakouts.multiYear?.series?.timeframe ?? breakouts.timeframe]?.bars ?? series[breakouts.timeframe]?.bars,
            breakouts.multiYear?.series?.timeframe ?? breakouts.timeframe,
            breakouts.multiYear
          )
        : null,
      technical,
      patterns,
      fundamental,
      peers: peerBlock,
      activity: activityBlock,
      news: newsBlock
        ? {
            ...newsBlock,
            // Ranked by subject and never scored. There is no sentiment engine in this
            // codebase and adding one would put a judgement inside the numeric path,
            // which is the one thing the scorecard is built to keep out of it. News is
            // evidence a reader weighs; it is not a row that weighs itself.
            scored: false,
            whyNotScored:
              'Headlines are ordered by what they are about, not by whether they read as good or bad. Nothing here assigns a headline a direction, so no news item contributes a point to the scorecard.',
          }
        : null,
      scorecard: card,
      dataQuality: {
        verified: [
          ...(validation
            ? timeframes
                .filter((tf) => !validation[tf]?.unavailable)
                .map((tf) => ({
                  field: `${tf} price series`,
                  detail: `${validation[tf].bars} bars from ${validation[tf].from} to ${validation[tf].to}`,
                  source: validation[tf].source,
                }))
            : []),
          ...(fundamental?.coverage
            ? [
                {
                  field: 'quarterly filings',
                  detail: `${fundamental.coverage.quarters} quarters from ${fundamental.coverage.from} to ${fundamental.coverage.to}, ${fundamental.basis} basis`,
                  source: fundamental.source,
                },
              ]
            : []),
          // `latest` alone is not enough. shareholdingTrend returns the one quarter it
          // has alongside its refusal when NSE publishes fewer than two, and a block
          // that named itself unavailable cannot also be the evidence for a verified
          // reading of the same thing.
          ...(fundamental?.shareholding?.latest && !fundamental.shareholding.unavailable
            ? [
                {
                  field: 'shareholding pattern',
                  detail: `${fundamental.shareholding.series.length} quarters, latest ${fundamental.shareholding.latest.date}`,
                  source: fundamental.shareholding.source,
                },
              ]
            : []),
          ...(breakouts?.multiYear?.series
            ? [
                {
                  field: 'multi-year breakout scan',
                  detail: `${breakouts.multiYear.window.years}-year window on the ${breakouts.multiYear.series.timeframe} series, standing ${breakouts.multiYear.series.standing}`,
                  source: series[breakouts.multiYear.series.timeframe]?.source ?? null,
                },
              ]
            : []),
          ...(peerBlock?.table
            ? [
                {
                  field: 'peer table',
                  detail: peerBlock.tier
                    ? `${peerBlock.table.rows.length - 1} peers on the ${peerBlock.tier} tier, ${peerBlock.table.completeness.sourced} of ${peerBlock.table.completeness.cells} cells sourced`
                    : `No peer group was formed, so only this company's own figures are shown. ${peerBlock.table.completeness.sourced} of ${peerBlock.table.completeness.cells} cells sourced.`,
                  source: peerBlock.source,
                },
              ]
            : []),
          ...(activityBlock?.institutional?.window?.tradingDay
            ? [
                {
                  field: 'bulk and block deal disclosures',
                  detail: `the trading day of ${activityBlock.institutional.window.tradingDay}, which is the only day NSE publishes`,
                  source: activity.SOURCES.bulk,
                },
              ]
            : []),
          ...(newsBlock && !newsBlock.unavailable
            ? [
                {
                  field: 'news and announcements',
                  detail: `${newsBlock.recent.length} items inside ${newsBlock.window.recentDays} days and ${newsBlock.historical.length} older, from ${newsBlock.scanned} scanned`,
                  source: stocknews.SOURCES.feeds,
                },
              ]
            : []),
        ].filter(sourced),
        // peers, activity and news are left out of the walk and contribute their own
        // curated lists instead. Walking them would flatten every empty cell of a
        // five-by-eleven table into its own row and bury the six gaps that matter
        // under sixty that say the same thing about the half-yearly balance sheet.
        unavailable: dedupeByField([
          // The scoring rules this horizon asked for and could not compute, first,
          // because they are the gaps that changed the total. The walk below reports
          // the same shortfalls as engine paths like "technical.monthly.ema[1]", which
          // is where a figure went missing rather than what the report lost by it.
          ...card.notScored.map((r) => ({ field: `scorecard rule: ${r.label}`, why: r.unavailable })),
          ...collectUnavailable({ validation, technical, patterns, breakouts, fundamental }),
          // The named gaps, which are not failures of this build. Each is a figure a
          // paid terminal shows and no free NSE surface publishes.
          //
          // This list is unconditional while the three below are not, and the reason
          // is that it is not only about filings: "Intraday prices" lives in it, and a
          // technical report is the one this gap matters most on. The other three
          // describe sections that were not built, and naming the gaps in a section
          // nobody asked for is noise.
          ...fundamentals.UNAVAILABLE,
          ...(peerBlock ? peers.UNAVAILABLE : []),
          ...(activityBlock ? activity.UNAVAILABLE : []),
          ...(newsBlock ? stocknews.UNAVAILABLE : []),
        ]),
        rule: 'Anything not listed as verified above was not read from a published source and is not reported as a number anywhere in this report.',
      },
      generatedAt: new Date().toISOString(),
      tookMs: Date.now() - startedAt,
      cached: false,
    }

    // 9. Conclusion. Derived from the scorecard that was just built and from the
    //    evidence list beside it, so the call cannot rest on anything the report did
    //    not already print. It returns null when ANALYZER_VERDICT is off, and the key
    //    is then absent rather than null: a report with the label switched off is the
    //    report this route produced before the label existed.
    const concluded = conclude({
      scorecard: report.scorecard,
      horizon,
      type,
      verified: report.dataQuality.verified,
    })
    if (concluded) report.conclusion = concluded

    // The gate. It throws, so a report that failed it cannot be logged-and-returned
    // by a well-meaning caller.
    //
    // The disclosure is attached AFTER the gate rather than before it, and that is
    // not a dodge: ANALYZER_DISCLOSURE says in as many words that no price target and
    // no stop loss is published, and the checker matches the phrase, not the claim
    // being made about it. Gating the promise against itself would withhold every
    // report ever generated. Everything the engines wrote goes through it.
    return { status: 200, body: store(key, assertPublishable(report)) }
  } catch (err) {
    // A policy failure is a bug in the engines, not a bad request, and it must be
    // loud. The reader gets nothing rather than a report with the sentence removed,
    // and nothing is cached, so the next request re-runs the gate instead of serving
    // the withheld report back from memory.
    if (/Report withheld/.test(err.message)) {
      console.error('[analyze policy]', err.message)
      return {
        status: 500,
        body: { error: 'The generated report did not clear the publication check, so it was withheld.' },
      }
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// The watchlist
//
// Three handlers behind requireAuth, each holding one invariant.
//
// Everything they read and write is req.user, which the token in the Authorization
// header put there. No handler takes a user id from a path, a query or a body, so
// there is no parameter here that one account could aim at another account's list.
//
// An ISIN is checked against the NSE equity list before it is stored. Skip that and
// the list is free text, and a dashboard rendering free text as a company is the same
// class of mistake as analysing the wrong company.
// ---------------------------------------------------------------------------

// Newest first. The list is read on the dashboard, where the entry added a minute ago
// is the one somebody came back for.
const byNewest = (a, b) => new Date(b.addedAt ?? 0) - new Date(a.addedAt ?? 0)

// Every handler answers with the whole list. It is at most WATCHLIST_CAP short rows,
// and a client that always receives the new truth cannot drift out of step with it.
const listBody = (user) => ({ watchlist: [...(user.watchlist ?? [])].sort(byNewest), cap: WATCHLIST_CAP })

analyzeRouter.get('/watchlist', requireAuth, (req, res) => {
  res.json(listBody(req.user))
})

analyzeRouter.post('/watchlist', requireAuth, async (req, res) => {
  // The report endpoint's own ISIN rule, taken from its schema rather than restated,
  // so the two cannot drift into accepting different things.
  const parsed = z.object({ isin: analyzeSchema.shape.isin }).safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Send { isin }. Resolve a name to an ISIN at GET /api/analyze/resolve first.',
    })
  }

  const { isin } = parsed.data
  if (!req.user.watchlist) req.user.watchlist = []
  const list = req.user.watchlist

  // Idempotent. A second tap on a control whose first tap is still in flight is the
  // ordinary way this arrives, and it is not an error worth showing anyone.
  if (list.some((entry) => entry.isin === isin)) return res.json(listBody(req.user))

  if (list.length >= WATCHLIST_CAP) {
    return res.status(409).json({
      error: `Your watchlist holds ${WATCHLIST_CAP} companies, which is the limit. Remove one to add another.`,
      ...listBody(req.user),
    })
  }

  let identity
  try {
    const { byIsin } = await deps.loadUniverse()
    identity = byIsin.get(isin)
  } catch (err) {
    // Nothing is written from a guess. If the equity list is unreachable the add fails
    // and says why, rather than storing an identifier nothing has vouched for.
    console.error('[watchlist add]', err.message)
    return res.status(502).json({ error: 'The NSE equity list is unreachable right now, so nothing can be added.' })
  }
  if (!identity) {
    return res.status(404).json({ error: `${isin} is not on the NSE equity list, so it cannot be added.` })
  }

  list.push({ isin, symbol: identity.symbol, name: identity.name, addedAt: new Date() })
  await req.user.save()
  res.status(201).json(listBody(req.user))
})

analyzeRouter.delete('/watchlist/:isin', requireAuth, async (req, res) => {
  const isin = String(req.params.isin ?? '').trim().toUpperCase()
  const list = req.user.watchlist ?? []
  const kept = list.filter((entry) => entry.isin !== isin)

  // Removing what is already gone is the state the caller asked for, so it answers
  // with the list rather than a 404 every client would have to special case.
  if (kept.length !== list.length) {
    req.user.watchlist = kept
    await req.user.save()
  }
  res.json(listBody(req.user))
})

// ---------------------------------------------------------------------------
// Batch, and reading a list off a screenshot
//
// Two endpoints and one rule between them: the image endpoint never starts an
// analysis. It reads, it resolves what it read against the equity list, and it stops.
// A person confirms every row before /batch is called with the ISINs.
//
// That split is not ceremony. OCR misreads "BAJAJ-AUTO" as "BAJAJ-AUT0" and "INFY" as
// "lNFY" often enough that it is the expected case, not the edge case, and the resolver
// happily finds a plausible company for a near miss. Analysing the wrong company is
// the worst thing this feature does; letting a recogniser pick which company is the
// shortest path to it. So the recogniser proposes and a person disposes.
// ---------------------------------------------------------------------------

// Ten. Not a round number picked for looking tidy: one report is up to three candle
// series and a dozen XBRL documents, so ten is thirty candle requests and a hundred and
// twenty filing fetches from one button, against feeds that publish no quota and owe us
// nothing. A reader with a longer watchlist runs it twice.
export const BATCH_CAP = 10

// Three at a time. Sequential makes a batch of ten take a minute; all ten at once lands
// the whole thing on NSE in the same second, which is how a free feed starts answering
// 503 to everybody including the single-report path.
const BATCH_CONCURRENCY = 3

/**
 * Map with a bounded number in flight, preserving input order in the output.
 *
 * Promise.all with a slice-by-slice loop would do, but it runs in lockstep: a batch
 * where one stock is slow leaves the other two workers idle until it finishes. Workers
 * pulling from a shared cursor keep all three busy.
 */
async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * A failure message, checked before it is published.
 *
 * Whatever a failing stock threw is not prose this codebase wrote: it is a message from
 * a fetch, a parser or a driver, and one of those saying "connection reset, will retry"
 * is enough to trip the policy gate on the word "will retry"'s neighbours. A batch must
 * not be taken down by the wording of somebody else's stack trace, and the sentence must
 * not be published unchecked either, so an unpublishable one is replaced and logged.
 */
function publishableError(message, isin) {
  return checkPhrase(message).ok
    ? message
    : `The report for ${isin} could not be built, and the reason it gave cannot be published as written. It is in the server log.`
}

const batchSchema = z.object({
  isins: z.array(analyzeSchema.shape.isin).min(1, 'Send at least one ISIN.').max(BATCH_CAP, `At most ${BATCH_CAP} at a time.`),
  type: analyzeSchema.shape.type,
  horizon: analyzeSchema.shape.horizon,
})

// The general /api/analyze budget in index.js counts requests, and one batch request is
// up to ten reports, so counting it the same way would let a batch spend ten times the
// outbound cost of a single report for a tenth of the budget. Six batches in five
// minutes is at most sixty reports, which is what the single-report path already allows
// over the same window. The two paths cost the feeds roughly the same, by construction.
analyzeRouter.use(
  '/batch',
  rateLimit({
    windowMs: 5 * 60_000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: `Batch analysis is limited to six runs of up to ${BATCH_CAP} companies every five minutes. Try again shortly.` },
  })
)

analyzeRouter.post('/batch', async (req, res, next) => {
  const parsed = batchSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({
      error: `Send { isins, type, horizon } with between one and ${BATCH_CAP} ISINs. Resolve names to ISINs at GET /api/analyze/resolve or POST /api/analyze/extract first.`,
      detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      cap: BATCH_CAP,
      disclosure: ANALYZER_DISCLOSURE,
    })
  }

  const { type, horizon } = parsed.data
  // The same ISIN twice would hit the cache the second time and cost nothing, but it
  // would also print the same company twice in a report somebody is reading down. The
  // count of what was dropped travels back so the client can say why its list shrank.
  const isins = [...new Set(parsed.data.isins)]
  const duplicates = parsed.data.isins.length - isins.length

  const startedAt = Date.now()

  try {
    const results = await mapWithLimit(isins, BATCH_CONCURRENCY, async (isin) => {
      try {
        const { status, body } = await buildReport({ isin, type, horizon })
        if (status === 200) return { isin, status: 'ok', report: body }
        // A refusal this stock earned on its own: an unsupported horizon, an ISIN that
        // is not listed, a report the policy gate withheld. It is reported against the
        // stock, and the other nine carry on.
        return { isin, status: 'failed', httpStatus: status, error: publishableError(body.error, isin), reason: body.reason ?? null }
      } catch (err) {
        // Anything the pipeline did not convert into a refusal: the equity list being
        // unreachable, a driver throwing, a bug. One stock's fault is one stock's row.
        console.error('[analyze batch]', isin, err.message)
        return {
          isin,
          status: 'failed',
          httpStatus: 500,
          error: publishableError(`The report for ${isin} could not be built: ${err.message}`, isin),
          reason: null,
        }
      }
    })

    const failures = results.filter((r) => r.status === 'failed')
    const body = {
      request: { type, horizon, requested: isins.length, duplicatesDropped: duplicates, cap: BATCH_CAP, concurrency: BATCH_CONCURRENCY },
      analysed: results.length - failures.length,
      failed: failures.length,
      results,
      note:
        failures.length === 0
          ? 'Every company in the list produced a report.'
          : `${failures.length} of ${results.length} did not produce a report. Each one says why against its own ISIN, and the rest are unaffected.`,
      tookMs: Date.now() - startedAt,
    }

    // The reports went through the gate one at a time inside buildReport, so re-walking
    // megabytes of them here would be work already done. What has NOT been through it is
    // this envelope and the failure rows, so that is what is checked.
    assertPublishable({ request: body.request, note: body.note, failures })

    // The default disclosure says in as many words that no recommendation is published,
    // and every report in `results` may carry a buy, sell or hold label. One envelope
    // covers all ten, so the line is chosen off the first report that actually carries
    // a conclusion; with none, disclosureFor gives back the default unchanged.
    res.json({ ...body, disclosure: disclosureFor(results.find((r) => r.report?.conclusion?.verdict)?.report) })
  } catch (err) {
    next(err)
  }
})

/**
 * Read company names off an uploaded image. Resolves them. Analyses nothing.
 *
 * Authenticated rather than rate limited, and the choice is worth stating because it
 * cuts against the rest of this router, every other endpoint of which is deliberately
 * anonymous.
 *
 * Three things are true only of this endpoint. It is the one path that accepts
 * arbitrary bytes from a stranger. It is the one path that forwards those bytes to a
 * third party, so abuse here spends somebody else's quota and lands in somebody else's
 * logs. And the recogniser's free tier is a fixed daily allowance shared by everyone
 * using the site, so one script can take the feature away from every real reader for a
 * day. An IP rate limit does not stop that: an IP is free and a day's allowance is not.
 * An account is the cheapest thing that makes abuse attributable and revocable.
 *
 * A limiter sits in front of it anyway, because an authenticated abuser is still an
 * abuser, and because the limit should bind before the recogniser's daily allowance
 * does rather than after.
 */
analyzeRouter.use(
  '/extract',
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Image reading is limited to ten uploads every fifteen minutes. Try again shortly.' },
  })
)

analyzeRouter.post(
  '/extract',
  (req, res, next) => deps.requireAuth(req, res, next),
  async (req, res, next) => {
    // Asked before a byte is read. There is no point buffering five megabytes to
    // discover that nothing on this deployment can read them.
    const recogniser = activeRecogniser()
    if (!recogniser) {
      return res.status(503).json({ ...NOT_CONFIGURED, analysed: false, disclosure: ANALYZER_DISCLOSURE })
    }

    // The tighter of the two caps, so the number quoted back is the one that applied.
    const cap = Math.min(LIMITS.bytes, recogniser.maxBytes ?? LIMITS.bytes)

    let raw
    try {
      raw = await readCappedBody(req, cap)
    } catch (err) {
      if (err.tooLarge) {
        return res.status(413).json({
          error: err.message,
          why: `${recogniser.name} is what reads the image here and it will not accept a file over ${(cap / 1024 / 1024).toFixed(1)} MB. Crop the screenshot to the list itself, or send it in two.`,
          cap,
        })
      }
      return next(err)
    }

    const part = filePartFrom(raw, req.headers['content-type'])
    if (!part.ok) return res.status(400).json({ error: part.why })

    // The declared type is checked and then ignored in favour of the magic bytes, which
    // are the only thing that says what a file actually is. A mismatch is reported
    // because it usually means an honest client renamed something.
    const image = sniffImage(part.bytes)
    if (!image.ok) {
      return res.status(415).json({
        error: 'That file was not read.',
        why: image.why,
        declared: part.declared,
        accepted: ACCEPTED.map((a) => a.label),
      })
    }

    let recognised
    try {
      recognised = await recogniser.read(part.bytes, image.mime)
    } catch (err) {
      console.error('[analyze extract]', recogniser.name, err.message)
      return res.status(502).json({
        error: `${recogniser.name} could not read that image.`,
        // Nothing is invented on this path. A failed read produces no tickers at all,
        // because a guessed one analyses the wrong company.
        why: 'No text came back, and nothing here will guess at a company it did not read. Try a sharper screenshot, or type the names.',
        recogniser: { name: recogniser.name, url: recogniser.url },
      })
    }

    const texts = tickerCandidates(recognised.lines)
    const resolved = await Promise.all(
      texts.map(async (text) => {
        try {
          const result = await deps.resolve(text)
          return { text, status: result.status, match: result.match, candidates: result.candidates }
        } catch (err) {
          console.error('[analyze extract resolve]', text, err.message)
          return { text, status: 'none', match: null, candidates: [], why: 'The NSE equity list was unreachable while this line was being identified.' }
        }
      })
    )

    const counts = {
      exact: resolved.filter((r) => r.status === 'exact').length,
      ambiguous: resolved.filter((r) => r.status === 'ambiguous').length,
      none: resolved.filter((r) => r.status === 'none').length,
    }

    const body = {
      image: { mime: image.mime, format: image.label, bytes: part.bytes.length, width: image.width, height: image.height, filename: part.filename },
      recogniser: { name: recogniser.name, url: recogniser.url },
      linesRead: recognised.lines.length,
      candidateCap: MAX_CANDIDATES,
      counts,
      // Every line is reshaped into the attributed form policy.js passes over, because
      // this text was read off somebody's screenshot rather than written here. A
      // holdings screenshot with a "BUY" column in it is not this site recommending
      // anything, and a report that refused to come back because of one is a bug.
      rows: resolved.map((row) => ({
        read: { headline: row.text, source: { name: `Read from the uploaded image by ${recogniser.name}`, url: recogniser.url } },
        status: row.status,
        match: row.match,
        candidates: row.candidates,
        why: row.why ?? null,
      })),
      analysed: false,
      action:
        'Nothing has been analysed. Confirm each line against the company it resolved to, choose between the candidates where a line was ambiguous, then send the confirmed ISINs to POST /api/analyze/batch.',
      caveat: `Text read off an image is read, not verified. ${counts.none} of ${resolved.length} lines matched nothing on the NSE equity list, and a line that matched one is still a reading of a picture.`,
      batchCap: BATCH_CAP,
    }

    try {
      res.json({ ...assertPublishable(body), disclosure: ANALYZER_DISCLOSURE })
    } catch (err) {
      console.error('[analyze extract policy]', err.message)
      res.status(500).json({ error: 'The extraction result did not clear the publication check, so it was withheld.' })
    }
  }
)
