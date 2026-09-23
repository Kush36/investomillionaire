// Run with: node --test test/
//
// Fixtures, not the network. The CSV text below is copied byte for byte from
// nsearchives.nseindia.com/content/indices, and the classification fixture keeps the
// one property that makes peer selection hard: two companies in the same NSE macro
// sector that are three orders of magnitude apart in size.
//
// Two of these tests exist because the failure they catch is silent. A peer table
// that quietly turns a missing ratio into 0 still renders, still adds up, and reads
// as a company with no debt and no earnings multiple. A peer set that quietly keeps a
// microcap in a large cap's table still renders too.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseIndexCsv,
  buildClassification,
  peerCandidates,
  selectPeers,
  sharesOutstanding,
  trailingDividend,
  metricsOf,
  peerTable,
  describeTable,
  METRICS,
  SIZE_BAND,
  UNAVAILABLE,
} from '../src/data/peers.js'
import { parseXbrl } from '../src/data/fundamentals.js'
import { assertPublishable, checkPhrase } from '../src/data/policy.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Verbatim from ind_niftytotalmarket_list.csv and ind_niftyitlist.csv.
const UNIVERSE_CSV = `Company Name,Industry,Symbol,Series,ISIN Code
Tata Consultancy Services Ltd.,Information Technology,TCS,EQ,INE467B01029
Infosys Ltd.,Information Technology,INFY,EQ,INE009A01021
Tiny Software Ltd.,Information Technology,TINYSOFT,EQ,INE000T01011
HDFC Bank Ltd.,Financial Services,HDFCBANK,EQ,INE040A01034
Bajaj Holdings & Investment Ltd.,Financial Services,BAJAJHLDNG,EQ,INE118A01012
Britannia Industries Ltd.,Fast Moving Consumer Goods,BRITANNIA,EQ,INE216A01030`

const IT_INDEX_CSV = `Company Name,Industry,Symbol,Series,ISIN Code
Tata Consultancy Services Ltd.,Information Technology,TCS,EQ,INE467B01029
Infosys Ltd.,Information Technology,INFY,EQ,INE009A01021`

const CLASSIFICATION = buildClassification(parseIndexCsv(UNIVERSE_CSV), [
  { label: 'Nifty IT', file: 'ind_niftyitlist.csv', members: parseIndexCsv(IT_INDEX_CSV) },
])

const TCS = { symbol: 'TCS', name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029' }
const BAJAJHLDNG = { symbol: 'BAJAJHLDNG', name: 'Bajaj Holdings & Investment Ltd.', isin: 'INE118A01012' }

const CRORE = 1e7

// Eight quarter ends that are genuinely adjacent, so ttm() accepts both windows.
const QUARTERS = [
  '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31',
  '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31',
]

/**
 * A filing series in the shape fundamentals.quarterlySeries returns.
 *
 * Every line the margin calculation needs is present, because a fixture missing one
 * of them would make every margin in the table unavailable for a reason that has
 * nothing to do with what the test is checking.
 */
function series({ revenue, pat }) {
  return QUARTERS.map((periodEnd, i) => ({
    periodEnd,
    periodStart: QUARTERS[i - 1] ?? '2024-01-01',
    basis: 'consolidated',
    unit: 'INR',
    revenue: revenue[i],
    pat: pat[i],
    pbt: pat[i] == null ? null : pat[i] * 1.3,
    expenses: revenue[i] == null ? null : revenue[i] * 0.78,
    depreciation: revenue[i] == null ? null : revenue[i] * 0.03,
    financeCost: revenue[i] == null ? null : revenue[i] * 0.01,
  }))
}

const flat = (value) => QUARTERS.map(() => value)

function snap(overrides = {}) {
  return {
    symbol: 'SUBJ',
    name: 'Subject Ltd.',
    isin: 'INE000A01001',
    basis: 'consolidated',
    coverage: { from: QUARTERS[0], to: QUARTERS[7], quarters: 8 },
    marketCap: { value: 500000 * CRORE, close: 1000, asOf: '2026-02-20', shares: 5e9 },
    series: series({ revenue: flat(10000 * CRORE), pat: flat(1000 * CRORE) }),
    dividend: { value: 20, from: '2025-02-20', to: '2026-02-20', count: 2 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test('a company name containing a comma does not shift the other four columns', () => {
  const rows = parseIndexCsv(
    'Company Name,Industry,Symbol,Series,ISIN Code\n' +
      'Kirloskar Oil Engines, Ltd.,Capital Goods,KIRLOSENG,EQ,INE146L01010'
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].symbol, 'KIRLOSENG')
  assert.equal(rows[0].isin, 'INE146L01010')
  assert.equal(rows[0].industry, 'Capital Goods')
  assert.equal(rows[0].name, 'Kirloskar Oil Engines, Ltd.')
})

test('a sectoral index member is compared inside its index, not across its macro sector', () => {
  const pool = peerCandidates(TCS, CLASSIFICATION)
  assert.equal(pool.tier, 'sector-index')
  assert.deepEqual(pool.candidates.map((c) => c.symbol), ['INFY'])
  // TINYSOFT shares the macro sector but is in no sectoral index, so it must not
  // leak into a tier-1 list. Mixing the two tiers is what makes an unrelated company
  // look like a verified rival.
  assert.ok(!pool.candidates.some((c) => c.symbol === 'TINYSOFT'))
  assert.ok(!pool.candidates.some((c) => c.isin === TCS.isin))
})

test('a company in no sectoral index falls back to the macro sector and says the match is weaker', () => {
  const pool = peerCandidates(BAJAJHLDNG, CLASSIFICATION)
  assert.equal(pool.tier, 'macro-sector')
  assert.deepEqual(pool.candidates.map((c) => c.symbol), ['HDFCBANK'])
  assert.match(pool.basis, /weaker match/i)
  assert.match(pool.basis, /more than one line of business/i)
})

test('a company outside the published constituent lists gets no invented peer group', () => {
  const pool = peerCandidates({ symbol: 'UNLISTEDCO', isin: 'INE999Z01099' }, CLASSIFICATION)
  assert.equal(pool.tier, null)
  assert.deepEqual(pool.candidates, [])
  assert.match(pool.unavailable, /no sector/i)
})

// ---------------------------------------------------------------------------
// Size banding
// ---------------------------------------------------------------------------

test('peer selection excludes a same-sector company of wildly different size', () => {
  const subject = { symbol: 'TCS', marketCap: { value: 1200000 * CRORE } }
  const candidates = [
    { symbol: 'INFY', name: 'Infosys Ltd.', marketCap: { value: 640000 * CRORE } },
    { symbol: 'TINYSOFT', name: 'Tiny Software Ltd.', marketCap: { value: 900 * CRORE } },
  ]

  const { peers, excluded, sizeBandApplied } = selectPeers(subject, candidates)

  assert.equal(sizeBandApplied, true)
  assert.deepEqual(peers.map((p) => p.symbol), ['INFY'])

  const dropped = excluded.find((e) => e.symbol === 'TINYSOFT')
  assert.ok(dropped, 'the microcap must appear in the excluded list, not vanish from the report')
  assert.match(dropped.why, /market capitalisation/i)
  assert.match(dropped.why, new RegExp(`${SIZE_BAND}x band`))
})

test('a candidate whose size could not be derived is excluded with that reason, not assumed to fit', () => {
  const subject = { symbol: 'TCS', marketCap: { value: 1200000 * CRORE } }
  const candidates = [{ symbol: 'NOCAP', marketCap: { value: null, unavailable: 'The filing reports no face value.' } }]

  const { peers, excluded } = selectPeers(subject, candidates)

  assert.deepEqual(peers, [])
  assert.equal(excluded.length, 1)
  assert.match(excluded[0].why, /no face value/i)
})

test('with no size to band on, sectoral index membership still carries a table', () => {
  const subject = { symbol: 'TCS', marketCap: { value: null, unavailable: 'No daily price history was returned.' } }
  const { peers, sizeBandApplied, why } = selectPeers(subject, [{ symbol: 'INFY', marketCap: { value: 1 } }], {
    tier: 'sector-index',
  })

  assert.equal(sizeBandApplied, false)
  assert.equal(peers.length, 1)
  assert.match(why, /price history/i)
  assert.match(why, /not been matched on size/i)
})

test('with no size to band on, a shared macro sector alone publishes nothing', () => {
  // The path BAJFINANCE takes: its own share count is stale across a 2025 capital
  // action, and its sector holds 122 companies. Returning the first few of those in
  // the order NSE writes the file is an alphabetical peer set, not a peer set.
  const subject = { symbol: 'BAJFINANCE', marketCap: { value: null, unavailable: 'The share count is as at 2024-12-31.' } }
  const candidates = [
    { symbol: 'AADHARHFC', marketCap: { value: 19882 * CRORE } },
    { symbol: 'AAVAS', marketCap: { value: 10166 * CRORE } },
  ]

  const { peers, sizeBandApplied, why } = selectPeers(subject, candidates, { tier: 'macro-sector' })

  assert.deepEqual(peers, [])
  assert.equal(sizeBandApplied, false)
  assert.match(why, /macro-economic sector, which is not on its own a reason to compare them/i)
})

test('a caller that forgets the tier gets the refusing branch, not the permissive one', () => {
  const subject = { symbol: 'X', marketCap: { value: null, unavailable: 'none' } }
  assert.deepEqual(selectPeers(subject, [{ symbol: 'Y', marketCap: { value: 1 } }]).peers, [])
})

test('inside the band, the closest in size survive truncation', () => {
  const subject = { symbol: 'A', marketCap: { value: 100000 * CRORE } }
  const candidates = [
    { symbol: 'FAR', marketCap: { value: 380000 * CRORE } },
    { symbol: 'NEAR', marketCap: { value: 105000 * CRORE } },
    { symbol: 'MID', marketCap: { value: 200000 * CRORE } },
  ]

  const { peers } = selectPeers(subject, candidates, { limit: 2 })
  assert.deepEqual(peers.map((p) => p.symbol), ['NEAR', 'MID'])
})

// ---------------------------------------------------------------------------
// Market capitalisation inputs
// ---------------------------------------------------------------------------

test('the share count is the paid-up capital over the face value, from any context', () => {
  // RELIANCE Q3 FY25, standalone, trimmed from INDAS_117298_1348254_16012025082021.xml.
  const doc = `<xbrli:xbrl xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin">
<in-bse-fin:PaidUpValueOfEquityShareCapital contextRef="OneI" unitRef="INR">135320000000.00</in-bse-fin:PaidUpValueOfEquityShareCapital>
<in-bse-fin:FaceValueOfEquityShareCapital contextRef="OneI" unitRef="INR">10</in-bse-fin:FaceValueOfEquityShareCapital>
</xbrli:xbrl>`

  const shares = sharesOutstanding(parseXbrl(doc))
  assert.equal(shares.value, 13_532_000_000)
  assert.equal(shares.faceValue, 10)
})

test('a filing with no face value refuses the share count rather than assuming Rs 10', () => {
  const doc = `<xbrli:xbrl xmlns:in-capmkt="http://www.nseindia.com/xbrl/capmkt">
<in-capmkt:PaidUpValueOfEquityShareCapital contextRef="OneI" unitRef="INR">3620000000.00</in-capmkt:PaidUpValueOfEquityShareCapital>
</xbrli:xbrl>`

  const shares = sharesOutstanding(parseXbrl(doc))
  assert.equal(shares.value, null)
  assert.match(shares.unavailable, /face value/i)
})

// ---------------------------------------------------------------------------
// Dividends
// ---------------------------------------------------------------------------

const info = (actions) => ({ corporate_actions: { data: actions } })

test('trailing dividends are summed per share, including the compound purpose string', () => {
  const result = trailingDividend(
    info([
      { exdate: '15-Jul-2026', purpose: 'Interim Dividend - Rs 12 Per Share' },
      { exdate: '16-Jan-2026', purpose: 'Interim Dividend Rs 11 Per Share/ Special Dividend Rs 46 Per Share' },
      { exdate: '04-Jun-2024', purpose: 'Dividend - Rs 28 Per Share' },
    ]),
    '2026-08-01'
  )

  assert.equal(result.value, 69)
  assert.equal(result.count, 3)
})

test('a bonus inside the window refuses the yield rather than adding two share bases together', () => {
  const result = trailingDividend(
    info([
      { exdate: '14-Aug-2026', purpose: 'Dividend - Rs 5.5 Per Share' },
      { exdate: '28-Oct-2025', purpose: 'Bonus 1:1' },
      { exdate: '19-Aug-2025', purpose: 'Dividend - Rs 10 Per Share' },
    ]),
    '2026-09-01'
  )

  assert.equal(result.value, null)
  assert.match(result.unavailable, /bonus/i)
})

test('no dividend in the window is zero, which is a measured fact, not a missing one', () => {
  const result = trailingDividend(info([{ exdate: '01-Jan-2020', purpose: 'Dividend - Rs 4 Per Share' }]), '2026-09-01')
  assert.equal(result.value, 0)
  assert.equal(result.unavailable, undefined)
})

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

test('an unavailable metric stays null and carries its reason', () => {
  // One quarter with no reported profit breaks both trailing twelve month windows.
  const broken = snap({
    symbol: 'BROKEN',
    series: series({ revenue: flat(10000 * CRORE), pat: [null, ...flat(1000 * CRORE).slice(1)] }),
  })

  const cells = metricsOf(broken)

  assert.equal(cells.profitGrowth.value, null)
  assert.notEqual(cells.profitGrowth.value, 0)
  assert.ok(cells.profitGrowth.unavailable.length > 10)
  // Revenue is intact in the same fixture, so the refusal is about the missing line
  // and not about the series being unusable.
  assert.equal(typeof cells.revenueGrowth.value, 'number')
})

test('a growth rate is refused across a missing quarter, not measured over a longer span', () => {
  // HCLTECH's real history, which jumps 2024-12-31 straight to 2025-09-30. Counting
  // four rows back from the twelve months to 2026-06-30 lands on the twelve months to
  // 2024-12-31, and calling that change year-on-year measures thirty months.
  const ends = [
    '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31',
    '2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30',
  ]
  const gapped = snap({
    symbol: 'GAPPED',
    series: ends.map((periodEnd, i) => ({
      periodEnd,
      periodStart: ends[i - 1] ?? '2024-01-01',
      basis: 'standalone',
      revenue: (10000 + i * 500) * CRORE,
      pat: (1000 + i * 50) * CRORE,
      expenses: (10000 + i * 500) * CRORE * 0.78,
      depreciation: (10000 + i * 500) * CRORE * 0.03,
      financeCost: (10000 + i * 500) * CRORE * 0.01,
    })),
  })

  const cells = metricsOf(gapped)

  assert.equal(cells.revenueGrowth.value, null)
  assert.match(cells.revenueGrowth.unavailable, /twelve months|skips a quarter/i)
  assert.equal(cells.profitGrowth.value, null)
  // The trailing multiple only needs the latest window, which is intact, so the
  // refusal above is about the earlier year and not about the series being unusable.
  assert.equal(typeof cells.pe.value, 'number')
})

test('a growth rate compares the twelve months ending exactly a year earlier', () => {
  const cells = metricsOf(
    snap({ series: series({ revenue: [100, 100, 100, 100, 110, 110, 110, 110].map((v) => v * CRORE), pat: flat(100 * CRORE) }) })
  )

  assert.equal(cells.revenueGrowth.asOf, '2025-12-31')
  assert.equal(cells.revenueGrowth.against, '2024-12-31')
  assert.equal(cells.revenueGrowth.value, 10)
})

test('an unavailable cell is never filled from the other rows in the table', () => {
  const subject = snap({ symbol: 'SUBJ' })
  const healthy = [
    snap({ symbol: 'PEERA', marketCap: { value: 400000 * CRORE, close: 800, asOf: '2026-02-20' } }),
    snap({ symbol: 'PEERB', marketCap: { value: 600000 * CRORE, close: 1200, asOf: '2026-02-20' } }),
  ]
  const lossMaking = snap({
    symbol: 'PEERC',
    series: series({ revenue: flat(10000 * CRORE), pat: flat(-200 * CRORE) }),
  })

  const table = peerTable(subject, [...healthy, lossMaking])
  const row = table.rows.find((r) => r.symbol === 'PEERC')
  const others = table.rows.filter((r) => r.symbol !== 'PEERC').map((r) => r.metrics.pe.value)
  const average = others.reduce((a, b) => a + b, 0) / others.length

  assert.equal(row.metrics.pe.value, null)
  assert.notEqual(row.metrics.pe.value, 0)
  assert.notEqual(row.metrics.pe.value, average)
  assert.match(row.metrics.pe.unavailable, /not positive/i)
  // The peers that could be computed are unaffected by the one that could not.
  assert.ok(others.every((v) => typeof v === 'number' && v > 0))
})

test('every balance sheet column is unavailable for every company, with the half-yearly reason', () => {
  const table = peerTable(snap(), [snap({ symbol: 'PEERA' })])
  const balanceSheet = METRICS.filter((m) => m.basis === 'balance-sheet').map((m) => m.key)

  assert.deepEqual(balanceSheet, ['pb', 'evEbitda', 'roe', 'roce', 'debtToEquity'])
  for (const row of table.rows) {
    for (const key of balanceSheet) {
      assert.equal(row.metrics[key].value, null, `${row.symbol}.${key} must not carry a figure`)
      assert.match(row.metrics[key].unavailable, /balance sheet|half-yearly/i)
    }
  }
  assert.equal(table.notComputable.length, balanceSheet.length)
  assert.ok(table.computable.includes('Operating margin'))
})

test('the completeness count matches the cells that actually carry a figure', () => {
  const table = peerTable(snap(), [snap({ symbol: 'PEERA' })])
  const counted = table.rows.reduce(
    (n, row) => n + METRICS.filter((m) => row.metrics[m.key].value != null).length,
    0
  )

  assert.equal(table.completeness.sourced, counted)
  assert.equal(table.completeness.cells, table.rows.length * METRICS.length)
  assert.equal(table.completeness.unavailable, table.completeness.cells - counted)
})

test('the subject stays first and no column is ranked', () => {
  const table = peerTable(snap({ symbol: 'SUBJ' }), [
    snap({ symbol: 'BIGGER', marketCap: { value: 900000 * CRORE, close: 1000, asOf: '2026-02-20' } }),
    snap({ symbol: 'SMALLER', marketCap: { value: 200000 * CRORE, close: 1000, asOf: '2026-02-20' } }),
  ])

  assert.equal(table.rows[0].symbol, 'SUBJ')
  assert.equal(table.rows[0].subject, true)
  assert.deepEqual(table.rows.slice(1).map((r) => r.symbol), ['BIGGER', 'SMALLER'])
})

// ---------------------------------------------------------------------------
// Commentary
// ---------------------------------------------------------------------------

test('commentary counts peers and excludes the ones whose figure is unavailable', () => {
  const subject = snap({ symbol: 'SUBJ', marketCap: { value: 500000 * CRORE, close: 1000, asOf: '2026-02-20' } })
  const cheaper = snap({ symbol: 'LOWER', marketCap: { value: 200000 * CRORE, close: 1000, asOf: '2026-02-20' } })
  const dearer = snap({ symbol: 'HIGHER', marketCap: { value: 900000 * CRORE, close: 1000, asOf: '2026-02-20' } })
  const noEarnings = snap({ symbol: 'LOSS', series: series({ revenue: flat(10000 * CRORE), pat: flat(-1 * CRORE) }) })

  const table = peerTable(subject, [cheaper, dearer, noEarnings])
  const notes = describeTable(table)
  const peLine = notes.find((n) => /trailing twelve month profit/.test(n))

  // Three peers, one without a computable ratio, so the denominator is two.
  assert.match(peLine, /^1 of the 2 peers/)
  assert.ok(notes.some((n) => /cells in this table carry a sourced figure/.test(n)))
})

test('nothing the module writes is a recommendation, and the whole table is publishable', () => {
  const table = peerTable(snap({ symbol: 'SUBJ' }), [snap({ symbol: 'PEERA' })])

  for (const note of describeTable(table)) {
    assert.ok(checkPhrase(note).ok, `describeTable wrote: ${note}`)
  }
  for (const entry of UNAVAILABLE) {
    assert.ok(checkPhrase(entry.why).ok, `UNAVAILABLE wrote: ${entry.why}`)
  }
  assert.doesNotThrow(() => assertPublishable({ table, notes: describeTable(table), gaps: UNAVAILABLE }))
})
