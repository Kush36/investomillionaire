// Run with: node --test test/analyze-rules.test.js
//
// The five scoring rules the analyzer grew when breakouts, peers and activity were
// folded into the report. These are pure: a block in, rows out, no network and no
// express. test/analyze.test.js already proves the rows reach a live report; what
// this file pins down is the weights themselves, because a weight is the one thing in
// a scorecard that is a judgement rather than a measurement and it should not be able
// to drift without a test saying so.
//
// Three claims, one case each:
//   a multi-year breakout outweighs everything else and only on a series that can
//   carry the finding, a chart shape stays capped whatever it scores, and a block
//   that names its own gaps is not a block that failed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { breakoutRules, peerRules, activityRules } from '../src/routes/analyze.js'
import { assertPublishable } from '../src/data/policy.js'

/* ------------------------------------------------------------- fixtures --- */

const found = (timeframe, standing, normalised) => ({
  timeframe,
  multiYear: {
    kind: 'multi-year-breakout',
    found: true,
    status: 'confirmed',
    series: { timeframe, standing, why: 'Stated by the detector.' },
    window: { years: 5, describedAs: '5-year high' },
    priorHigh: { price: 200.8, date: '2016-09-30', stoodForYears: 4.35 },
    base: { depthPercent: 31.2, fromDate: '2016-09-30', toDate: '2021-01-31' },
    breakout: { date: '2021-02-28', close: 202.6, marginPercent: 0.9 },
    confidence: { score: 8, best: 11, normalised },
  },
  cups: [],
  notFound: [{ kind: 'cup-and-handle', reason: 'Only 1 confirmed swing high in this series, and a cup needs two rims.' }],
})

const cup = (status) => ({
  kind: 'cup-and-handle',
  status,
  rightRim: { index: 90, date: '2025-06-30', price: 410 },
  rimLine: { price: 412 },
  base: { fromDate: '2024-09-30', toDate: '2025-06-30' },
  confidence: { score: 13, best: 14, normalised: 0.93 },
})

const peerCell = (value) => ({ value, asOf: '2025-09-30' })
const peerTable = (mine, ...theirs) => ({
  table: {
    rows: [
      { symbol: 'SUBJ', metrics: { revenueGrowth: peerCell(mine), operatingMargin: { value: null, unavailable: 'No readable quarter.' } } },
      ...theirs.map((v, i) => ({ symbol: `PEER${i}`, metrics: { revenueGrowth: peerCell(v), operatingMargin: { value: null, unavailable: 'No readable quarter.' } } })),
    ],
  },
})

const deal = (side, value) => ({
  source: { name: 'NSE bulk deals, daily disclosure', url: 'https://www.nseindia.com/report-detail/display-bulk-and-block-deals' },
  headline: `2025-09-18: A client ${side} shares`,
  side,
  value,
})

const withDeals = (...deals) => ({
  institutional: { window: { tradingDay: '2025-09-18', why: 'NSE publishes the latest trading day only.' }, latest: deals },
  orders: { counts: { total: 0, graded: 0, high: 0, moderate: 0, low: 0 } },
  // The shape a real activityReport always returns: a LIST of named gaps, on a call
  // that succeeded.
  unavailable: [{ field: 'Promoter pledge', why: 'Disclosed under regulation 31(1) in a filing no free endpoint returns as data.' }],
})

const points = (rules, label) => rules.find((r) => r.label === label)?.points

/* ---------------------------------------------------------------- tests --- */

test('the multi-year breakout is weighted by the series it was found on, not by the fact of it', () => {
  // The same breakout, same match quality, three different series. SERIES_STANDING is
  // the argument: a five-year window on daily candles consumes five of the six years
  // the feed publishes, so the level can be set by one noisy session.
  assert.equal(points(breakoutRules(found('monthly', 'highest', 0.75)), 'Multi-year breakout'), 3)
  assert.equal(points(breakoutRules(found('weekly', 'high', 0.75)), 'Multi-year breakout'), 3)
  assert.equal(points(breakoutRules(found('daily', 'lowest', 0.75)), 'Multi-year breakout'), 1)

  // A weak match on a good series is worth less than a strong one on the same series.
  assert.equal(points(breakoutRules(found('monthly', 'highest', 0.4)), 'Multi-year breakout'), 2)
})

test('not finding a breakout is worth nothing, never a penalty', () => {
  const quiet = {
    timeframe: 'weekly',
    multiYear: {
      kind: 'multi-year-breakout',
      found: false,
      series: { timeframe: 'weekly', standing: 'high', why: 'Stated by the detector.' },
      window: { years: 5 },
      reason: 'No close in this weekly series exceeded the highest high of the preceding 5 years by more than 0.5%.',
    },
    cups: [],
    notFound: [],
  }
  const rules = breakoutRules(quiet)
  const row = rules.find((r) => r.label === 'Multi-year breakout')

  assert.equal(row.points, 0)
  // The floor is the claim. A rare event is evidence when it happens and silence when
  // it does not, and scoring silence negative would put every ordinary chart below the
  // midpoint for being ordinary.
  assert.equal(row.min, 0)
  assert.equal(row.max, 3)
  assert.match(row.detail, /No close in this weekly series/)
})

test('a chart shape stays capped at one point however well it matched', () => {
  const block = { ...found('monthly', 'highest', 0.9), cups: [cup('confirmed'), cup('confirmed')] }
  const row = breakoutRules(block).find((r) => r.label === 'Cup and handle')

  // Both cups are confirmed and both scored 13 of 14 against the detector's own rules,
  // and the row is still worth one point, because the cap is about the base rate of
  // the shape rather than the quality of this instance of it.
  assert.equal(row.points, 1)
  assert.equal(row.max, 1)
  assert.ok(breakoutRules(found('monthly', 'highest', 0.9)).find((r) => r.label === 'Cup and handle').points === 0)
})

test('a peer row only points when the subject is at an end of its comparable peers', () => {
  const label = 'Revenue growth against the peer group'
  assert.equal(points(peerRules(peerTable(20, 8, 12, 3)), label), 1, 'ahead of every peer scored nothing')
  assert.equal(points(peerRules(peerTable(2, 8, 12, 3)), label), -1, 'behind every peer scored nothing')
  // Third of four. A rank in the middle is not a fact worth a point in either
  // direction, and scoring it would turn the table into the league peers.js refuses
  // to publish.
  assert.equal(points(peerRules(peerTable(9, 8, 12, 3)), label), 0)
})

test('a two-sided session of disclosed deals points nowhere', () => {
  const label = 'Disclosed deals on the latest trading day'
  assert.equal(points(activityRules(withDeals(deal('BUY', 1e9), deal('SELL', 1e8))), label), 1)
  assert.equal(points(activityRules(withDeals(deal('SELL', 1e9), deal('BUY', 1e8))), label), -1)
  // Within half of the larger side, so the day was liquidity rather than direction.
  assert.equal(points(activityRules(withDeals(deal('BUY', 1e9), deal('SELL', 8e8))), label), 0)
  // No disclosure at all is no row, not a zero row: NSE discloses a deal only when one
  // client crosses the threshold, so most companies have none on most days.
  assert.equal(points(activityRules(withDeals()), label), undefined)
})

test('a block that names its own gaps is not a block that failed', () => {
  // activityReport returns `unavailable` as an ARRAY of named gaps on every successful
  // call. A stage that threw returns it as a STRING. Reading the key for truthiness
  // drops a healthy section's rows out of the scorecard in silence, which is the bug
  // this distinction exists to prevent.
  assert.equal(activityRules(withDeals(deal('BUY', 1e9))).length, 2)
  assert.equal(activityRules({ unavailable: 'institutional activity and orders could not complete: NSE responded 503' }).length, 0)
  assert.equal(peerRules({ unavailable: 'RELIANCE is not in any NSE index constituent list.' }).length, 0)
  assert.equal(breakoutRules({ unavailable: 'breakout engine could not complete: no bars' }).length, 0)
})

test('every row these rules write clears the publication gate', () => {
  const rows = [
    ...breakoutRules({ ...found('monthly', 'highest', 0.8), cups: [cup('unconfirmed')] }),
    ...peerRules(peerTable(20, 8, 12)),
    ...activityRules({
      ...withDeals(deal('BUY', 1e9)),
      orders: { counts: { total: 3, graded: 2, high: 1, moderate: 1, low: 0 } },
    }),
  ]

  assert.ok(rows.length >= 5)
  assert.doesNotThrow(() => assertPublishable({ rules: rows }))

  for (const row of rows) {
    // A row is either scored or unscorable, never both. An unscorable row exists so
    // a reader can see that a rule was configured and could not run; it carries a
    // reason and deliberately carries no points, so range-checking it is wrong.
    if (row.unavailable) {
      assert.equal(row.points, undefined, `${row.label} is unscorable but carries points`)
      assert.ok(row.unavailable.length > 20, `${row.label} is unscorable without saying why`)
      continue
    }
    assert.ok(row.points >= row.min && row.points <= row.max, `${row.label} scored outside its own range`)
    assert.ok(row.detail.length > 40, `${row.label} carries no auditable detail`)
  }
})

test('a rule that cannot run is kept as unscorable rather than dropped', () => {
  // Dropping it made a report with no peer group score as though the peer
  // comparison had come back neutral, which is a different claim.
  const rows = peerRules({ tier: null, peerGroup: { unavailable: 'No constituent list covers this company.' }, table: peerTable(20, 8, 12).table })
  const unscorable = rows.filter((r) => r.unavailable)

  assert.ok(rows.length > 0, 'the rules vanished instead of reporting that they could not run')
  assert.ok(unscorable.length > 0, 'no row records that the comparison never happened')
  for (const row of unscorable) assert.equal(row.points, undefined)
})
