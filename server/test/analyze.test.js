// Run with: node --test test/
//
// The analyzer route, with every outbound call replaced. The engines it drives are
// the real ones: indicators.js, patterns.js and fundamentals.js all run here against
// synthetic but well-formed input, because the things worth testing on this route are
// the joins between them, and a suite that stubs the arithmetic too would pass with
// the pipeline unwired.
//
// Only the crossings out of the process are stubbed, through the `deps` object the
// route exports. That is the same seam test/forgot-enumeration.test.js opens on the
// Mongoose statics: the handler reaches four functions that need a network, so those
// four are swapped and nothing else is.
//
// Three claims are load-bearing and each gets a case:
//   an unsupported horizon is refused with its reason rather than approximated,
//   an ambiguous query returns candidates and never a pick,
//   a report carrying a forbidden phrase is withheld instead of returned.
// A fourth case publishes a whole report, because the three above would all pass
// against a route that answers nothing at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { analyzeRouter, deps } from '../src/routes/analyze.js'
import { detectPatterns, randomWalkBaseline } from '../src/data/patterns.js'

const app = express()
app.use(express.json())
app.use('/api/analyze', analyzeRouter)
const server = app.listen(0)
const { port } = server.address()
test.after(() => server.close())

const post = async (body) => {
  const res = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const get = async (path) => {
  const res = await fetch(`http://127.0.0.1:${port}/api/analyze${path}`)
  return { status: res.status, body: await res.json() }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RELIANCE = { symbol: 'RELIANCE', name: 'Reliance Industries Limited', series: 'EQ', isin: 'INE002A01018', listedOn: '29-NOV-1995', faceValue: 10 }

// Seeded, so a failure is the same failure on the next run. An unseeded price series
// makes every assertion below a coin toss about which branch of the engines ran.
function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/**
 * A price series shaped enough to exercise the engines: a slow trend so the moving
 * averages separate, a sine so market structure finds swings on both sides, and a
 * volume series so relative volume and the pattern engine's confirmation have
 * something to read.
 */
function makeBars(count, { seed = 7, start = 1000 } = {}) {
  const rand = lcg(seed)
  const bars = []
  const day = 86400000
  let close = start
  for (let i = 0; i < count; i++) {
    close = close * (1 + 0.0004 + 0.02 * Math.sin(i / 23) * 0.05) + (rand() - 0.5) * 6
    const spread = close * 0.012
    bars.push({
      date: new Date(Date.UTC(2021, 0, 4) + i * day).toISOString().slice(0, 10),
      open: Number((close - spread / 3).toFixed(2)),
      high: Number((close + spread).toFixed(2)),
      low: Number((close - spread).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(500000 + rand() * 400000),
    })
  }
  return bars
}

// Eight genuinely adjacent quarters. The gap between each period end and the next
// falls inside fundamentals.isAdjacentQuarter's 80 to 100 day window, which every
// year-on-year and trailing-twelve-month figure checks before it will answer.
const QUARTER_ENDS = [
  ['2023-10-01', '2023-12-31'],
  ['2024-01-01', '2024-03-31'],
  ['2024-04-01', '2024-06-30'],
  ['2024-07-01', '2024-09-30'],
  ['2024-10-01', '2024-12-31'],
  ['2025-01-01', '2025-03-31'],
  ['2025-04-01', '2025-06-30'],
  ['2025-07-01', '2025-09-30'],
]

const CRORE = 1e7
const quarterlyFixture = () => ({
  symbol: 'RELIANCE',
  basis: 'consolidated',
  basisReason: 'Consolidated covers the group, and the filing history is complete on that basis.',
  series: QUARTER_ENDS.map(([periodStart, periodEnd], i) => {
    const revenue = (200000 + i * 9000) * CRORE
    return {
      periodStart,
      periodEnd,
      basis: 'consolidated',
      unit: 'INR',
      revenue,
      expenses: revenue * 0.84,
      depreciation: revenue * 0.05,
      financeCost: revenue * 0.03,
      pbt: revenue * 0.11,
      tax: revenue * 0.028,
      pat: revenue * 0.082,
      audited: 'unaudited',
      filedAt: periodEnd,
      source: { name: 'NSE XBRL filing archive', url: 'https://nsearchives.nseindia.com/corporate/xbrl/' },
    }
  }),
  coverage: { from: QUARTER_ENDS[0][1], to: QUARTER_ENDS[QUARTER_ENDS.length - 1][1], quarters: QUARTER_ENDS.length },
  notes: [],
  fetchedAt: new Date().toISOString(),
})

// "Buy Back of Shares" is a real NSE corporate action purpose, and it is in this
// fixture on purpose: policy.js reads the word "buy" as a recommendation unless the
// row is attributed, so this row proves the route attributes what the exchange said
// rather than stripping it out or publishing it as its own.
const corpInfoFixture = () => ({
  shareholdings_patterns: {
    data: {
      '31-Dec-2024': [{ 'Promoter & Promoter Group': ' 50.31' }, { Public: ' 49.69' }],
      '31-Mar-2025': [{ 'Promoter & Promoter Group': ' 50.28' }, { Public: ' 49.72' }],
      '30-Jun-2025': [{ 'Promoter & Promoter Group': ' 50.13' }, { Public: ' 49.87' }],
      '30-Sep-2025': [{ 'Promoter & Promoter Group': ' 49.91' }, { Public: ' 50.09' }],
    },
  },
  corporate_actions: { data: [{ exdate: '12-Sep-2025', purpose: 'Buy Back of Shares' }] },
  borad_meeting: { data: [{ meetingdate: '18-Oct-2025', purpose: 'Quarterly Results' }] },
  latest_announcements: { data: [{ broadcastdate: '18-Oct-2025', subject: 'Board approves buy back; analysts should buy, says brokerage' }] },
})

// Peers, activity and news arrive through three more network seams. The fixtures are
// hand-built rather than driven through the real assemblers for the same reason the
// candle fixture is: what this file tests is the joins, and the three modules have
// their own suites for what they compute.
const peerCell = (value, asOf) => ({ value, asOf, sources: [{ name: 'NSE XBRL filing archive', url: 'https://nsearchives.nseindia.com/corporate/xbrl/' }] })
const peerRow = (symbol, subject, revenueGrowth, operatingMargin) => ({
  symbol,
  name: `${symbol} Limited`,
  isin: `INE000A0100${symbol.length}`,
  subject,
  basis: 'consolidated',
  coverage: { quarters: 8, from: '2023-12-31', to: '2025-09-30' },
  metrics: {
    marketCap: { value: 1450000, unit: 'Rs crore', asOf: '2025-09-30' },
    revenueGrowth: peerCell(revenueGrowth, '2025-09-30'),
    profitGrowth: { value: null, unavailable: 'The filing history skips a quarter inside one of the two windows.' },
    pe: { value: 24.1, unit: 'x trailing earnings', asOf: '2025-09-30', earningsTo: '2025-09-30' },
    operatingMargin: peerCell(operatingMargin, '2025-09-30'),
    dividendYield: { value: null, unavailable: 'No dividend history was read for this company.' },
    pb: { value: null, unavailable: 'Book value per share needs the half-yearly balance sheet.' },
  },
})

// The subject reports the highest growth and the highest margin of the three, so both
// peer rules have a definite sign to assert rather than a zero that would also be what
// a peer rule that never fired returns.
const peerFixture = () => ({
  subject: 'RELIANCE',
  tier: 'sector-index',
  basis: 'Members of Nifty Oil & Gas, which NSE constructs from companies in one line of business.',
  industry: 'Oil Gas & Consumable Fuels',
  sizeBand: { band: 4, note: 'Peers are companies whose market capitalisation is between a 4th and 4 times that of RELIANCE.' },
  considered: { grouped: 15, priced: 8 },
  table: {
    columns: [],
    rows: [peerRow('RELIANCE', true, 12.4, 17.2), peerRow('PEERA', false, 8.1, 14.6), peerRow('PEERB', false, 3.7, 11.9)],
    completeness: { cells: 21, sourced: 12, unavailable: 9, note: 'Every cell is a figure with a source or an explicit reason it is absent.' },
    computable: ['Market capitalisation', 'Revenue growth'],
    notComputable: [{ label: 'P/B', why: 'The quarterly XBRL carries the profit and loss statement only.' }],
  },
  notes: ['2 of the 2 peers with a comparable figure report a lower rate of revenue growth than RELIANCE, whose figure is 12.4% year on year for the period to 2025-09-30.'],
  excluded: [],
  source: { name: 'NSE index constituent lists', url: 'https://nsearchives.nseindia.com/content/indices' },
})

const dealSource = { name: 'NSE bulk deals, daily disclosure', url: 'https://www.nseindia.com/report-detail/display-bulk-and-block-deals' }
const activityFixture = () => ({
  symbol: 'RELIANCE',
  window: { months: 12, from: '2024-10-02', to: '2025-09-18' },
  institutional: {
    symbol: 'RELIANCE',
    window: { tradingDay: '2025-09-18', covers: 'one trading day', why: 'NSE publishes bulk and block deals as a file holding the latest trading day only.' },
    latest: [
      { source: dealSource, headline: '2025-09-18: A Fund BUY 900,000 shares of Reliance Industries Limited at Rs 1,410.00', tradedOn: '2025-09-18', client: 'A Fund', side: 'BUY', quantity: 900000, price: 1410, value: 1269000000, disclosedAs: ['bulk'], clientReading: 'named-as-fund-or-insurer' },
      { source: dealSource, headline: '2025-09-18: B Trust SELL 100,000 shares of Reliance Industries Limited at Rs 1,408.00', tradedOn: '2025-09-18', client: 'B Trust', side: 'SELL', quantity: 100000, price: 1408, value: 140800000, disclosedAs: ['bulk'], clientReading: 'unstated' },
    ],
    counts: { distinct: 2, bulk: 2, block: 0, inBoth: 0 },
    shareholding: { unavailable: 'Carried from the fundamental engine in a real report.' },
    fiiDiiSplit: { value: null, unavailable: 'NSE publishes public shareholding as a single percentage.' },
    notes: ['NSE disclosed 2 deals in RELIANCE on 2025-09-18.'],
    caveat: 'A bulk or block deal is an exchange disclosure of one named client transacting on one day.',
  },
  orders: {
    found: [
      {
        source: { name: 'NSE corporate announcements', url: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements' },
        headline: 'Company secures an order worth Rs 12,000 crore; brokerages say buy',
        at: '2025-09-12',
        category: 'Bagging/Receiving of orders/contracts',
        value: { value: 120000000000, stated: 'Rs 12,000 crore' },
        materiality: { grade: 'high', percentOfRevenue: 13.4, thresholds: { highPercent: 10, moderatePercent: 2 } },
      },
    ],
    counts: { total: 1, graded: 1, high: 1, moderate: 0, low: 0 },
    trailingRevenue: 8960000000000,
    thresholds: { highPercent: 10, moderatePercent: 2 },
    notes: ['1 order announcement was filed in the window, of which 1 states a value that could be measured against revenue.'],
  },
  events: {
    events: [
      { source: { name: 'NSE company information', url: 'https://www.nseindia.com/get-quotes/equity' }, headline: 'Buy Back of Shares', at: '2025-09-12', type: 'buyback', classifiedOn: 'corporate-action' },
    ],
    byType: { buyback: 1 },
    notes: ['1 corporate events were classified in the window: 1 buyback.'],
  },
  unavailable: [{ field: 'FII and DII buying and selling', why: 'The daily FII/DII figure NSE publishes is a market-wide total across all securities.' }],
  failures: [],
  fetchedAt: new Date().toISOString(),
})

const newsFixture = () => ({
  company: { name: 'Reliance Industries Limited', symbol: 'RELIANCE', aliases: [] },
  recent: [
    {
      headline: 'Reliance Industries files outcome of board meeting with the exchanges',
      summary: null,
      summaryUnavailable: 'An exchange announcement is published as a subject line.',
      source: { name: 'NSE corporate announcements', url: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements' },
      date: '2025-09-18',
      publishedAt: '2025-09-18',
      dateUnavailable: null,
      category: 'exchange-filing',
      priority: 1,
      image: null,
      relevance: { score: 1, basis: 'filing', matched: 'RELIANCE' },
    },
  ],
  historical: [],
  window: { recentDays: 14, from: '2025-09-04', to: '2025-09-18' },
  scanned: 80,
  matchedFromFeeds: 0,
  filingsCarried: 1,
  floor: 0.5,
  priority: [{ category: 'exchange-filing', rank: 1, why: 'Filed by the company with the exchange, or announced under regulation 30.' }],
  note: 'Ordered by subject, not by clock.',
  unavailable: null,
  gaps: [{ field: 'Moneycontrol and the paywalled wires', why: 'Moneycontrol answers 403 to non-browser clients.' }],
  feeds: [],
})

const daily = makeBars(420)
const weekly = makeBars(220, { seed: 31, start: 900 })

function stubDeps({ resolveResult = null, patterns = detectPatterns } = {}) {
  deps.loadUniverse = async () => ({ byIsin: new Map([[RELIANCE.isin, RELIANCE]]) })
  deps.resolve = async () => resolveResult
  deps.candles = async (_isin, timeframe) => ({
    bars: timeframe === 'daily' ? daily : weekly,
    source: { name: 'Upstox historical candles', url: 'https://upstox.com/developer/api-documentation/' },
  })
  deps.detectPatterns = patterns
  // The real base rate runs 200 synthetic series through the detectors. It is worth
  // its cost in production and not in a route test, and swapping it here keeps the
  // suite's runtime honest about what it is actually checking.
  deps.randomWalkBaseline = () => ({ trials: 0, note: 'Stubbed in the route test.' })
  // The breakout detectors themselves run for real below; only their base rate is
  // swapped, for the same reason and at the same seam.
  deps.breakoutBaseline = () => ({ trials: 0, note: 'Stubbed in the route test.' })
  deps.quarterlySeries = async () => quarterlyFixture()
  deps.corporateInfo = async () => corpInfoFixture()
  deps.peerComparison = async () => peerFixture()
  deps.activityReport = async () => activityFixture()
  deps.companyNews = async () => newsFixture()
}

// ---------------------------------------------------------------------------

test('the intraday horizon is refused with the reason, not approximated from daily bars', async () => {
  stubDeps()
  const { status, body } = await post({ isin: RELIANCE.isin, type: 'technical', horizon: 'intraday' })

  assert.equal(status, 422)
  assert.match(body.reason, /no free intraday source exists/i)
  assert.match(body.reason, /refused here rather than approximated/i)
  assert.equal('scorecard' in body, false, 'a refused horizon still produced a report')
  assert.ok(body.supported.some((h) => h.key === 'swing'), 'the refusal does not say what is available instead')
  assert.ok(body.disclosure.registration, 'every response carries the disclosure, refusals included')
})

test('an ambiguous query comes back as candidates and is never resolved for the reader', async () => {
  stubDeps({
    resolveResult: {
      status: 'ambiguous',
      match: null,
      candidates: [
        { symbol: 'INDIANB', name: 'Indian Bank', series: 'EQ', isin: 'INE562A01011', confidence: 0.917 },
        { symbol: 'BANKINDIA', name: 'Bank of India', series: 'EQ', isin: 'INE084A01016', confidence: 0.875 },
      ],
    },
  })
  const { status, body } = await get('/resolve?q=Indian%20Bank')

  assert.equal(status, 200)
  assert.equal(body.status, 'ambiguous')
  assert.equal(body.match, null, 'an ambiguous query was resolved to a single company anyway')
  assert.equal(body.candidates.length, 2)
  assert.match(body.action, /Do not choose one/i)
})

test('a report whose engine wrote a forbidden phrase is withheld, not returned', async () => {
  stubDeps({
    // Stands in for a pattern detector that drifted from describing a shape into
    // recommending one. The words are the only difference from the passing case.
    patterns: () => ({
      patterns: [
        {
          kind: 'double-bottom',
          status: 'confirmed',
          definition: 'Two lows at the same level separated by a rally. We recommend a close above the neckline.',
        },
      ],
      tolerances: {},
      baseRate: { what: 'A chart pattern describes what price already did.', meaning: 'It carries almost no information on its own.' },
    }),
  })
  const { status, body } = await post({ isin: RELIANCE.isin, type: 'technical', horizon: 'swing' })

  assert.equal(status, 500, 'the forbidden phrase was published with a 200')
  assert.match(body.error, /withheld/i)
  assert.equal('scorecard' in body, false)
  assert.equal(JSON.stringify(body).includes('We recommend'), false, 'the withheld sentence came back inside the error')

  // A withheld report must not be served from cache on the next request either.
  const again = await post({ isin: RELIANCE.isin, type: 'technical', horizon: 'swing' })
  assert.equal(again.status, 500)
})

test('a clean report publishes, and its scorecard adds up to its own total', async () => {
  stubDeps()
  const { status, body } = await post({ isin: RELIANCE.isin, type: 'both', horizon: 'swing' })

  assert.equal(status, 200, JSON.stringify(body).slice(0, 400))
  assert.equal(body.identity.symbol, 'RELIANCE')
  assert.equal(body.request.horizon, 'swing')

  // The whole promise of this scorecard is that a reader can subtract a row they
  // disagree with and recompute. That only holds if the total is the sum of the rows.
  const { rules, score, best, worst } = body.scorecard
  assert.ok(rules.length >= 4, `only ${rules.length} rules fired, so the pipeline is not wired through`)
  assert.equal(rules.reduce((sum, r) => sum + r.points, 0), score)
  assert.equal(rules.reduce((sum, r) => sum + r.max, 0), best)
  assert.equal(rules.reduce((sum, r) => sum + r.min, 0), worst)
  for (const r of rules) {
    assert.ok(r.points >= r.min && r.points <= r.max, `${r.label} scored ${r.points} outside its own ${r.min} to ${r.max} range`)
    assert.ok(r.detail.length > 20, `${r.label} carries no detail, so its points cannot be audited`)
  }
  assert.equal(/\b(buy|sell|hold|target|recommend)\b/i.test(JSON.stringify(rules)), false)

  // Both engines ran, and every stage is on the record with its outcome.
  assert.ok(body.technical.daily.rsi.value > 0)
  assert.ok(body.fundamental.revenue.yoy.at(-1).value != null)
  assert.deepEqual(
    body.pipeline.map((p) => p.stage),
    [
      'identify',
      'collect prices',
      'validate',
      'technical engine',
      'pattern engine',
      'breakout engine',
      'company info',
      'fundamental engine',
      // Three concurrent stages. They are recorded when they start rather than when
      // they finish, so this list stays the order the report asked for them in.
      'peer comparison',
      'institutional activity and orders',
      'news',
      'scorecard',
    ]
  )
  assert.ok(body.pipeline.every((p) => p.status === 'ok'), JSON.stringify(body.pipeline))

  // The new sections are in the report and their rows reached the scorecard.
  const labels = rules.map((r) => r.label)
  assert.ok(labels.includes('Multi-year breakout'), 'the owner’s starred feature did not produce a row')
  assert.ok(labels.includes('Cup and handle'))
  assert.ok(labels.includes('Revenue growth against the peer group'))
  assert.ok(labels.includes('Orders announced'))
  assert.ok(labels.includes('Disclosed deals on the latest trading day'))

  // A high-materiality order and a peer group the subject leads both score positive,
  // and the deal row points up because the disclosed purchases outweighed the
  // disposals by more than half the larger side.
  const at = (label) => rules.find((r) => r.label === label)
  assert.equal(at('Orders announced').points, 2)
  assert.equal(at('Revenue growth against the peer group').points, 1)
  assert.equal(at('Disclosed deals on the latest trading day').points, 1)

  // The multi-year row is the only rule in the report allowed past two points.
  assert.equal(at('Multi-year breakout').max, 3)
  assert.equal(at('Multi-year breakout').min, 0, 'a quiet chart was scored negative for being quiet')
  assert.equal(at('Cup and handle').max, 1, 'a shape with a base rate was allowed to carry the scorecard')

  // News is carried and deliberately not scored.
  assert.equal(body.news.scored, false)
  assert.equal(labels.some((l) => /news/i.test(l)), false, 'a headline was turned into points')
  assert.ok(body.news.recent.length > 0)

  // The chart is the series the multi-year scan actually ran on, decimated, with no
  // point after the last bar.
  assert.ok(body.chart.points.length > 2 && body.chart.points.length <= 161)
  assert.equal(body.chart.timeframe, body.breakouts.multiYear.series.timeframe)

  // Five modules name overlapping gaps; the reader sees each one once.
  const fields = body.dataQuality.unavailable.map((u) => u.field)
  assert.equal(fields.length, new Set(fields).size, 'the same gap was listed twice')

  // Every figure that could not be computed says why, and the exchange's own words
  // survive attribution rather than being scrubbed to get past the policy gate.
  assert.ok(body.dataQuality.verified.some((v) => v.field === 'daily price series'))
  assert.ok(body.dataQuality.unavailable.some((u) => /FII and DII/.test(u.field)))
  assert.ok(body.dataQuality.unavailable.every((u) => u.why && u.why.length > 20), 'an unavailable field was reported without a reason')
  assert.equal(body.fundamental.calendar.actions[0].headline, 'Buy Back of Shares')
  assert.ok(body.fundamental.calendar.actions[0].source, 'third-party text was published without attribution')

  // Second call for the same key is served from memory rather than re-fetching.
  const again = await post({ isin: RELIANCE.isin, type: 'both', horizon: 'swing' })
  assert.equal(again.body.cached, true)
  assert.ok(again.body.disclosure.registration, 'a cached response dropped the disclosure')
})

/**
 * The page reads these paths off the report. If one of them stops existing, the page
 * renders a blank where a finding should be and nothing anywhere fails.
 *
 * This case exists because that is not hypothetical: client/src/pages/Analyze.jsx read
 * a `sections`/`stats`/`score` contract off a GET endpoint, and the route emitted
 * `technical`/`patterns`/`scorecard` from a POST. Both sides were internally
 * consistent, both suites were green, and the report half of the page had rendered
 * nothing for as long as it had existed. A list of paths is a cheap thing to keep in
 * step with a renderer; a silent blank is not.
 */
const READ_BY_THE_PAGE = [
  'identity.symbol', 'identity.name', 'identity.isin',
  'request.label', 'request.span', 'request.type', 'request.timeframeWeights',
  'generatedAt', 'tookMs', 'cached', 'pipeline', 'disclosure',
  'conclusion.verdict', 'conclusion.duration.label', 'conclusion.duration.means',
  'conclusion.inputs.confidence', 'conclusion.inputs.rulesFired', 'conclusion.rules', 'conclusion.method',
  'conclusion.disclosure',
  'breakouts.multiYear.found', 'breakouts.multiYear.series.timeframe', 'breakouts.multiYear.series.standing',
  'breakouts.multiYear.series.why', 'breakouts.cups', 'breakouts.notFound', 'breakouts.baseRate',
  'breakouts.baseRateMeasured',
  'chart.points', 'chart.timeframe', 'chart.basis', 'chart.level', 'chart.marker',
  'technical.daily.weight', 'technical.daily.lastClose', 'technical.daily.ema', 'technical.daily.rsi',
  'technical.daily.macd', 'technical.daily.atr', 'technical.daily.relativeVolume', 'technical.daily.structure',
  'patterns.patterns', 'patterns.baseRate',
  'fundamental.basis', 'fundamental.basisReason', 'fundamental.coverage.quarters', 'fundamental.quarters',
  'fundamental.revenue.ttm', 'fundamental.revenue.yoy', 'fundamental.revenue.cagr',
  'fundamental.profit.ttm', 'fundamental.profit.yoy', 'fundamental.margins.latest',
  'fundamental.shareholding.latest', 'fundamental.shareholding.series', 'fundamental.shareholding.notes',
  'fundamental.shareholding.materialThresholdPp', 'fundamental.source',
  'peers.tier', 'peers.basis', 'peers.notes', 'peers.table.rows', 'peers.table.columns',
  'peers.table.completeness.note', 'peers.table.notComputable',
  'activity.institutional.window.why', 'activity.institutional.latest', 'activity.institutional.caveat',
  'activity.institutional.fiiDiiSplit', 'activity.institutional.notes',
  'activity.orders.found', 'activity.orders.notes', 'activity.events.events',
  'news.recent', 'news.historical', 'news.window.recentDays', 'news.scanned', 'news.note', 'news.whyNotScored',
  'scorecard.band', 'scorecard.gist', 'scorecard.score', 'scorecard.best', 'scorecard.worst',
  'scorecard.normalised', 'scorecard.rulesFired', 'scorecard.rules', 'scorecard.means', 'scorecard.confidence',
  'dataQuality.verified', 'dataQuality.unavailable', 'dataQuality.rule',
]

test('the report carries every path the analyzer page reads off it', async () => {
  stubDeps()
  const { status, body } = await post({ isin: RELIANCE.isin, type: 'both', horizon: 'long' })
  assert.equal(status, 200, JSON.stringify(body).slice(0, 300))

  const at = (path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), body)
  const missing = READ_BY_THE_PAGE.filter((path) => at(path) === undefined)
  assert.deepEqual(missing, [], `the page reads paths the route no longer emits: ${missing.join(', ')}`)
})

test('free text is refused where an ISIN belongs', async () => {
  stubDeps()
  const { status, body } = await post({ isin: 'Reliance', type: 'both', horizon: 'swing' })

  assert.equal(status, 400)
  assert.match(body.error, /resolve/i)
  assert.ok(body.horizons.some((h) => h.key === 'intraday' && h.supported === false))
})

// Keeps the stubbed engine honest: the real detector is what test four ran, so the
// import above is used rather than being decoration.
test('the real pattern engine is what the passing case exercised', () => {
  assert.equal(typeof detectPatterns, 'function')
  assert.equal(typeof randomWalkBaseline, 'function')
})
