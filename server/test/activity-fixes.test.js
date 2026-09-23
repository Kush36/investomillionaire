// Run with: node --test test/activity-fixes.test.js
//
// Three audited defects, each one an instance of the same mistake: the report treating
// a fetch that failed as though it were a fact about a company.
//
//   A failed announcements feed settled to the shape of a successful empty one, so the
//     report stated that no order was announced, the scorecard scored that absence, and
//     the conclusion layer read the scorecard. A 503 from NSE moved the label.
//   /batch published buy/sell/hold verdicts under the disclosure that says no
//     recommendation is published.
//   A shareholding block that named itself unavailable was still counted as verified,
//     with no source beside it.
//
// The first case is proved at three levels on purpose, because the bug crossed three:
// the fetch boundary in activity.js, the rule that read it in analyze.js, and the
// conclusion derived from the rule.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {
  activityReport,
  institutionalActivity,
  orders,
  corporateEvents,
  parseDealCsv,
  DEAL_FILES,
} from '../src/data/activity.js'
import { analyzeRouter, deps, buildReport, activityRules } from '../src/routes/analyze.js'
import { ANALYZER_DISCLOSURE } from '../src/data/policy.js'

// ---------------------------------------------------------------------------
// The network, replaced
// ---------------------------------------------------------------------------

const BULK_CSV = `Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price,Remarks
18-SEP-2026,RELIANCE,Reliance Industries Limited,HDFC MUTUAL FUND,BUY,900000,1410.00,-`

const BLOCK_CSV = `Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price
18-SEP-2026,RELIANCE,Reliance Industries Limited,PRASID UNOFAMILY TRUST,SELL,100000,1408.00`

const ORDER_ROW = {
  an_dt: '12-Sep-2025',
  desc: 'Bagging/Receiving of orders/contracts',
  attchmntText: 'Reliance Industries Limited has informed the Exchange regarding a press release titled "RIL Wins Orders Valued Rs. 1,060 Crore".',
  attchmntFile: null,
}

// Flipped per test. The deal archives always answer, because activity.js caches them
// under one process-wide key and a test that made them fail would fix that failure in
// place for every test after it; the deal-file failure is proved on the pure function
// instead.
let announcementsAnswer = { ok: true, rows: [ORDER_ROW] }

const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const u = String(url)
  // The test's own express server still needs the real thing.
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, init)
  if (u.includes('bulk.csv')) return { ok: true, status: 200, text: async () => BULK_CSV }
  if (u.includes('block.csv')) return { ok: true, status: 200, text: async () => BLOCK_CSV }
  if (u.includes('corporate-announcements')) {
    if (!announcementsAnswer.ok) return { ok: false, status: 503, text: async () => 'Service Unavailable' }
    return { ok: true, status: 200, json: async () => announcementsAnswer.rows }
  }
  throw new Error(`The test made an unexpected outbound call: ${u}`)
}

// ---------------------------------------------------------------------------
// Report fixtures. Fundamental-only, so no candle series is needed.
// ---------------------------------------------------------------------------

const CRORE = 1e7
const QUARTER_ENDS = ['2023-12-31', '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30']
const FILING_SOURCE = { name: 'NSE XBRL filing archive', url: 'https://nsearchives.nseindia.com/corporate/xbrl/' }

const quarterlyFixture = (symbol) => ({
  symbol,
  basis: 'consolidated',
  basisReason: 'Consolidated covers the group, and the filing history is complete on that basis.',
  series: QUARTER_ENDS.map((periodEnd, i) => {
    const revenue = (200000 + i * 9000) * CRORE
    return {
      periodEnd,
      basis: 'consolidated',
      unit: 'INR',
      revenue,
      expenses: revenue * 0.84,
      pbt: revenue * 0.11,
      tax: revenue * 0.028,
      pat: revenue * 0.082,
      audited: 'unaudited',
      filedAt: periodEnd,
      source: FILING_SOURCE,
    }
  }),
  coverage: { from: QUARTER_ENDS[0], to: QUARTER_ENDS.at(-1), quarters: QUARTER_ENDS.length },
  notes: [],
})

// Four quarters is a trend. One quarter is not, and shareholdingTrend says so while
// still handing back the single quarter it read, which is the shape defect three rides
// in on.
const shareholdingFixture = (quarters) => ({
  shareholdings_patterns: {
    data: Object.fromEntries(
      [
        ['31-Dec-2024', ' 50.31'],
        ['31-Mar-2025', ' 50.28'],
        ['30-Jun-2025', ' 50.13'],
        ['30-Sep-2025', ' 49.91'],
      ]
        .slice(-quarters)
        .map(([date, pct]) => [date, [{ 'Promoter & Promoter Group': pct }, { Public: ' 49.69' }]])
    ),
  },
  corporate_actions: { data: [{ exdate: '12-Sep-2025', purpose: 'Buy Back of Shares' }] },
  borad_meeting: { data: [] },
  latest_announcements: { data: [] },
})

const LISTED = new Map()
const listed = (isin, symbol) => {
  const identity = { symbol, name: `${symbol} Limited`, series: 'EQ', isin, listedOn: '29-NOV-1995', faceValue: 10 }
  LISTED.set(isin, identity)
  return identity
}

/**
 * The report pipeline with every seam but the activity one replaced.
 *
 * activityReport is deliberately the REAL function over the stubbed fetch above: the
 * defect lives in how it settles a rejected promise, and a hand-built fixture of its
 * output would be a test of the fixture.
 */
function stubDeps({ shareholdingQuarters = 4 } = {}) {
  deps.loadUniverse = async () => ({ byIsin: LISTED })
  deps.corporateInfo = async () => shareholdingFixture(shareholdingQuarters)
  deps.quarterlySeries = async (symbol) => quarterlyFixture(symbol)
  deps.activityReport = activityReport
  // Two feeds this file is not about. They fail loudly so their rows are absent for a
  // stated reason rather than quietly fabricated.
  deps.peerComparison = async () => {
    throw new Error('No peer list in this test.')
  }
  deps.companyNews = async () => {
    throw new Error('No news feed in this test.')
  }
}

const reportFor = async (isin, symbol) => {
  listed(isin, symbol)
  const { status, body } = await buildReport({ isin, type: 'fundamental', horizon: 'swing' })
  assert.equal(status, 200, JSON.stringify(body).slice(0, 300))
  return body
}

const ruleNamed = (report, label) => report.scorecard.rules.find((r) => r.label === label)
const notScoredNamed = (report, label) => report.scorecard.notScored.find((r) => r.label === label)

// ---------------------------------------------------------------------------
// 1. A failed feed is not a fact
// ---------------------------------------------------------------------------

test('orders refuses to report a count when the announcement feed was not read', () => {
  // null is "not read". [] is "read, and nothing was filed". Collapsing the two is the
  // root cause of the whole defect.
  const unread = orders(null, { trailingRevenue: 1e12 })
  assert.equal(typeof unread.unavailable, 'string')
  assert.equal(unread.counts, null, 'a count was published for a feed that was never read')
  assert.equal(unread.notes.some((n) => /no order announcement was filed/i.test(n)), false)
  assert.ok(unread.notes.some((n) => /not evidence that nothing was filed/i.test(n)))

  const read = orders([], { trailingRevenue: 1e12 })
  assert.equal(read.unavailable, undefined)
  assert.equal(read.counts.total, 0)
  assert.ok(read.notes.some((n) => /no order announcement was filed/i.test(n)))
})

test('corporateEvents keeps the corporate action calendar and says the feed is missing', () => {
  const info = shareholdingFixture(4)
  const unread = corporateEvents(null, info)
  assert.equal(typeof unread.announcementsUnavailable, 'string')
  // The buyback came from the corporate action document, which WAS read, so it is still
  // published. The list is partial, not empty, and the note says which.
  assert.equal(unread.events.length, 1)
  assert.equal(unread.notes.some((n) => /no corporate event of a classified type was filed/i.test(n)), false)
  assert.ok(unread.notes.some((n) => /not a complete list/i.test(n)))

  const read = corporateEvents([], info)
  assert.equal(read.announcementsUnavailable, null)
})

test('institutionalActivity tells an unread deal file from a day with no disclosure', () => {
  const bothRead = { bulk: parseDealCsv(BULK_CSV, 'bulk'), block: parseDealCsv(BLOCK_CSV, 'block') }
  const quiet = institutionalActivity({ deals: bothRead, info: null, symbol: 'INFY' })
  assert.equal(quiet.disclosuresUnavailable, null)
  assert.equal(quiet.counts.distinct, 0, 'a real zero is still a zero')
  assert.ok(quiet.notes.some((n) => /disclosed no bulk or block deal in INFY/.test(n)))

  const neitherRead = institutionalActivity({
    deals: { bulk: { unavailable: 'NSE archive responded 503 for bulk.csv' }, block: { unavailable: 'NSE archive responded 503 for block.csv' } },
    info: null,
    symbol: 'INFY',
  })
  assert.equal(typeof neitherRead.disclosuresUnavailable, 'string')
  assert.equal(neitherRead.counts, null, 'a count of zero was published from files that were never read')
  assert.equal(neitherRead.malformedRows, null)
  assert.equal(neitherRead.filesUnavailable.length, DEAL_FILES.length)
  assert.equal(neitherRead.notes.some((n) => /disclosed no bulk or block deal/.test(n)), false)

  // One of two. The list is real and incomplete, and the note says so rather than
  // presenting a half-read session as a whole one.
  const halfRead = institutionalActivity({
    deals: { bulk: parseDealCsv(BULK_CSV, 'bulk'), block: { unavailable: 'NSE archive responded 503 for block.csv' } },
    info: null,
    symbol: 'RELIANCE',
  })
  assert.equal(halfRead.disclosuresUnavailable, null)
  assert.equal(halfRead.counts.distinct, 1)
  assert.ok(halfRead.notes.some((n) => /block deal file could not be read/.test(n)))
})

test('activityReport carries the failure through instead of settling it to an empty result', async () => {
  announcementsAnswer = { ok: false }
  const report = await activityReport('RELIANCE', { trailingRevenue: 1e12 })

  assert.equal(typeof report.orders.unavailable, 'string')
  assert.equal(report.orders.counts, null)
  assert.equal(typeof report.events.announcementsUnavailable, 'string')
  assert.equal(typeof report.window.announcementsUnavailable, 'string')
  assert.ok(report.failures.some((f) => /corporate announcement feed could not be read/i.test(f)))

  // The sentence the audit found: a network failure published as a statement about the
  // company. It must not appear anywhere in the block.
  assert.equal(/no order announcement was filed/i.test(JSON.stringify(report)), false)

  // The deal files answered, so that half of the block is a real reading.
  assert.equal(report.institutional.disclosuresUnavailable, null)
  assert.equal(report.institutional.counts.distinct, 2)
})

test('a failed announcements feed produces no scored row, so it cannot move the total', () => {
  const block = (ordersBlock) => ({
    institutional: { window: { tradingDay: '2026-09-18', why: 'NSE publishes the latest trading day only.' }, latest: [] },
    orders: ordersBlock,
    unavailable: [{ field: 'Promoter pledge', why: 'Disclosed under regulation 31(1) in a filing no free endpoint returns as data.' }],
  })
  const arithmetic = (rules) =>
    rules
      .filter((r) => typeof r.points === 'number')
      .reduce((acc, r) => ({ score: acc.score + r.points, best: acc.best + r.max, worst: acc.worst + r.min }), { score: 0, best: 0, worst: 0 })

  // Read, and nothing was filed. A real reading, correctly scored at zero out of two.
  const read = activityRules(block(orders([], { trailingRevenue: 1e12 })))
  assert.deepEqual(arithmetic(read), { score: 0, best: 2, worst: 0 })

  // Not read. Contributes nothing in either direction, and says why.
  const unread = activityRules(block(orders(null, { trailingRevenue: 1e12 })))
  assert.deepEqual(arithmetic(unread), { score: 0, best: 0, worst: 0 }, 'a feed that failed still moved the scorecard')
  const row = unread.find((r) => r.label === 'Orders announced')
  assert.equal(row.points, undefined)
  assert.equal(typeof row.unavailable, 'string')

  // Neither deal file read: same rule, same treatment.
  const noDeals = activityRules({
    ...block(orders([], { trailingRevenue: 1e12 })),
    institutional: { window: { tradingDay: null }, latest: [], disclosuresUnavailable: 'bulk: 503; block: 503' },
  })
  assert.equal(typeof noDeals.find((r) => r.label === 'Disclosed deals on the latest trading day').unavailable, 'string')
})

test('an unread announcements feed does not change the buy, sell or hold label', async () => {
  stubDeps()

  announcementsAnswer = { ok: true, rows: [] }
  const readNothing = await reportFor('INE100A01011', 'EMPTYFEED')

  announcementsAnswer = { ok: false }
  const readNeither = await reportFor('INE200A01012', 'DEADFEED')

  // The feed that answered with nothing is evidence: the row fires, scores zero, and
  // widens the range the total is measured against.
  assert.equal(ruleNamed(readNothing, 'Orders announced').points, 0)
  assert.equal(notScoredNamed(readNothing, 'Orders announced'), undefined)

  // The feed that did not answer is not evidence. No row, no points, no range.
  assert.equal(ruleNamed(readNeither, 'Orders announced'), undefined)
  assert.equal(typeof notScoredNamed(readNeither, 'Orders announced').unavailable, 'string')
  assert.ok(readNeither.scorecard.rulesNotScored >= 1)
  assert.equal(readNeither.scorecard.scoredOnPartialEvidence, true)

  // What the audit actually measured: the label. Dropping the zero-point row raises the
  // normalised total, and the report must not claim the company announced nothing.
  assert.equal(readNeither.scorecard.best, readNothing.scorecard.best - 2)
  assert.ok(readNeither.scorecard.normalised > readNothing.scorecard.normalised)
  assert.equal(/no order announcement was filed/i.test(JSON.stringify(readNeither)), false)

  // And the gap is named where a reader looks for gaps.
  assert.ok(readNeither.dataQuality.unavailable.some((u) => /Orders announced/.test(u.field)))
})

// ---------------------------------------------------------------------------
// 2. The batch disclosure
// ---------------------------------------------------------------------------

const app = express()
app.use(express.json())
app.use('/api/analyze', analyzeRouter)
const server = app.listen(0)
const { port } = server.address()
test.after(() => server.close())

test('/batch carries the disclosure that matches what it published', async () => {
  stubDeps()
  announcementsAnswer = { ok: true, rows: [ORDER_ROW] }
  listed('INE300A01013', 'BATCHONE')

  const res = await realFetch(`http://127.0.0.1:${port}/api/analyze/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isins: ['INE300A01013'], type: 'fundamental', horizon: 'swing' }),
  })
  const body = await res.json()
  assert.equal(res.status, 200, JSON.stringify(body).slice(0, 300))

  const verdict = body.results[0]?.report?.conclusion?.verdict
  assert.ok(verdict, `the batch produced no conclusion to disclose against: ${JSON.stringify(body).slice(0, 300)}`)

  // The envelope published a buy, sell or hold label, so it may not also carry the line
  // that says no recommendation is published.
  assert.notEqual(body.disclosure.notWhat, ANALYZER_DISCLOSURE.notWhat)
  assert.match(body.disclosure.notWhat, /buy, sell or hold label/)
  assert.match(body.disclosure.consideration, /research services for consideration/)
})

test('a batch that published no verdict keeps the stronger default disclosure', async () => {
  stubDeps()
  // Nothing on the equity list, so every row fails and no report is published.
  const res = await realFetch(`http://127.0.0.1:${port}/api/analyze/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isins: ['INE999Z01019'], type: 'fundamental', horizon: 'swing' }),
  })
  const body = await res.json()
  assert.equal(body.analysed, 0)
  assert.deepEqual(body.disclosure, ANALYZER_DISCLOSURE)
})

// ---------------------------------------------------------------------------
// 3. Verified means sourced
// ---------------------------------------------------------------------------

test('a shareholding trend that is unavailable is not counted as verified', async () => {
  stubDeps({ shareholdingQuarters: 1 })
  announcementsAnswer = { ok: true, rows: [ORDER_ROW] }
  const report = await reportFor('INE400A01014', 'ONEQUARTER')

  // NSE published exactly one quarter, so shareholdingTrend refuses the trend while
  // still handing back the quarter it read. That is not a verified reading.
  assert.equal(typeof report.fundamental.shareholding.unavailable, 'string')
  assert.equal(report.dataQuality.verified.some((v) => v.field === 'shareholding pattern'), false)
  assert.ok(report.dataQuality.unavailable.some((u) => /shareholding/i.test(u.field)))

  // The invariant behind the rule printed under the list: every verified row names a
  // value and a source a reader can go and check.
  for (const row of report.dataQuality.verified) {
    assert.ok(row.source?.name, `${row.field} is listed as verified with no source`)
    assert.ok(row.detail?.length > 0, `${row.field} is listed as verified with no value`)
  }

  // And the rule that needed it did not quietly vanish.
  assert.equal(typeof notScoredNamed(report, 'Promoter and promoter group shareholding').unavailable, 'string')
})

test('a real shareholding trend is still verified, with its source', async () => {
  stubDeps({ shareholdingQuarters: 4 })
  announcementsAnswer = { ok: true, rows: [ORDER_ROW] }
  const report = await reportFor('INE500A01015', 'FOURQUARTER')

  const row = report.dataQuality.verified.find((v) => v.field === 'shareholding pattern')
  assert.ok(row, 'a sourced shareholding trend was dropped from verified')
  assert.equal(row.source.name, 'NSE company information')
})
