// Run with: node --test test/
//
// Fixtures, not the network. Every XBRL snippet below is trimmed from a document
// actually served by nsearchives.nseindia.com, with the element names, the namespace
// prefixes and the context structure left exactly as NSE writes them. That matters
// more than usual here, because the failures this module is exposed to are not logic
// slips, they are the filing format quietly meaning something other than it looks
// like it means.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseXbrl,
  discreteQuarter,
  changePercent,
  yoy,
  qoq,
  margins,
  ttm,
  cagr,
  runs,
  shareholdingSeries,
  shareholdingTrend,
  seriesGaps,
  planQuarters,
  chooseBasis,
  parseNseDate,
  isAdjacentQuarter,
  UNAVAILABLE,
} from '../src/data/fundamentals.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// RELIANCE Q3 FY25, consolidated, from INDAS_117297_1348254_16012025081520.xml.
// The trap is preserved verbatim: OneD is the three-month column and FourD is the
// nine-month cumulative, and BOTH <xbrli:context> blocks declare the same October to
// December period. Only DateOfStartOfReportingPeriod tells them apart.
const BSE_DIALECT = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin">
<xbrli:context id="OneD"><xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2024-10-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="FourD"><xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2024-10-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="OneReportableSegmentRevenue01D"><xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2024-10-01</xbrli:startDate><xbrli:endDate>2024-12-31</xbrli:endDate></xbrli:period><xbrli:scenario><xbrldi:explicitMember dimension="in-bse-fin:ReportableSegmentsAxis">in-bse-fin:OneReportableSegmentRevenue01Member</xbrldi:explicitMember></xbrli:scenario></xbrli:context>
<in-bse-fin:DateOfStartOfReportingPeriod contextRef="OneD">2024-10-01</in-bse-fin:DateOfStartOfReportingPeriod>
<in-bse-fin:DateOfEndOfReportingPeriod contextRef="OneD">2024-12-31</in-bse-fin:DateOfEndOfReportingPeriod>
<in-bse-fin:NatureOfReportStandaloneConsolidated contextRef="OneD">Consolidated</in-bse-fin:NatureOfReportStandaloneConsolidated>
<in-bse-fin:DateOfStartOfReportingPeriod contextRef="FourD">2024-04-01</in-bse-fin:DateOfStartOfReportingPeriod>
<in-bse-fin:DateOfEndOfReportingPeriod contextRef="FourD">2024-12-31</in-bse-fin:DateOfEndOfReportingPeriod>
<in-bse-fin:NatureOfReportStandaloneConsolidated contextRef="FourD">Consolidated</in-bse-fin:NatureOfReportStandaloneConsolidated>
<in-bse-fin:RevenueFromOperations contextRef="OneD" unitRef="INR" decimals="-7">2438650000000.00</in-bse-fin:RevenueFromOperations>
<in-bse-fin:RevenueFromOperations contextRef="FourD" unitRef="INR" decimals="-7">7155630000000.00</in-bse-fin:RevenueFromOperations>
<in-bse-fin:RevenueFromOperations contextRef="OneReportableSegmentRevenue01D" unitRef="INR" decimals="-7">1497830000000.00</in-bse-fin:RevenueFromOperations>
<in-bse-fin:OtherIncome contextRef="OneD" unitRef="INR" decimals="-7">42140000000.00</in-bse-fin:OtherIncome>
<in-bse-fin:Income contextRef="OneD" unitRef="INR" decimals="-7">2480790000000.00</in-bse-fin:Income>
<in-bse-fin:Expenses contextRef="OneD" unitRef="INR" decimals="-7">2194360000000.00</in-bse-fin:Expenses>
<in-bse-fin:DepreciationDepletionAndAmortisationExpense contextRef="OneD" unitRef="INR" decimals="-7">131810000000.00</in-bse-fin:DepreciationDepletionAndAmortisationExpense>
<in-bse-fin:FinanceCosts contextRef="OneD" unitRef="INR" decimals="-7">61790000000.00</in-bse-fin:FinanceCosts>
<in-bse-fin:ProfitBeforeTax contextRef="OneD" unitRef="INR" decimals="-7">286430000000.00</in-bse-fin:ProfitBeforeTax>
<in-bse-fin:TaxExpense contextRef="OneD" unitRef="INR" decimals="-7">68390000000.00</in-bse-fin:TaxExpense>
<in-bse-fin:ProfitLossForPeriod contextRef="OneD" unitRef="INR" decimals="-7">219300000000.00</in-bse-fin:ProfitLossForPeriod>
<in-bse-fin:ProfitLossForPeriod contextRef="FourD" unitRef="INR" decimals="-7">632790000000.00</in-bse-fin:ProfitLossForPeriod>
<in-bse-fin:BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations contextRef="OneD" unitRef="INRPerShare" decimals="INF">13.70</in-bse-fin:BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations>
</xbrli:xbrl>`

// RELIANCE Q1 FY27, standalone, from INTEGRATED_FILING_INDAS_1695739_..._WEB.xml.
// Different vocabulary (in-capmkt), same local element names, no cumulative column
// because in a first quarter the quarter IS the year to date.
const CAPMKT_DIALECT = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:in-capmkt="http://www.nseindia.com/xbrl/capmkt">
<xbrli:context id="OneD"><xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
<in-capmkt:DateOfStartOfReportingPeriod contextRef="OneD">2026-04-01</in-capmkt:DateOfStartOfReportingPeriod>
<in-capmkt:DateOfEndOfReportingPeriod contextRef="OneD">2026-06-30</in-capmkt:DateOfEndOfReportingPeriod>
<in-capmkt:NatureOfReportStandaloneConsolidated contextRef="OneD">Standalone</in-capmkt:NatureOfReportStandaloneConsolidated>
<in-capmkt:RevenueFromOperations contextRef="OneD" unitRef="INR" decimals="-5">1660130000000</in-capmkt:RevenueFromOperations>
<in-capmkt:Income contextRef="OneD" unitRef="INR" decimals="-5">1701210000000</in-capmkt:Income>
<in-capmkt:Expenses contextRef="OneD" unitRef="INR" decimals="-5">1525210000000</in-capmkt:Expenses>
<in-capmkt:ProfitBeforeTax contextRef="OneD" unitRef="INR" decimals="-5">176000000000</in-capmkt:ProfitBeforeTax>
<in-capmkt:ProfitLossForPeriod contextRef="OneD" unitRef="INR" decimals="-5">132720000000</in-capmkt:ProfitLossForPeriod>
</xbrli:xbrl>`

// Shape copied from /api/top-corp-info?symbol=RELIANCE. The percentages really do
// arrive as space-padded strings inside one single-key object each.
const CORP_INFO = {
  shareholdings_patterns: {
    data: {
      '30-Jun-2025': [{ 'Promoter & Promoter Group': '  50.07' }, { Public: '  49.93' }, { Total: ' 100.00' }],
      '30-Sep-2025': [{ 'Promoter & Promoter Group': '  50.01' }, { Public: '  49.99' }, { Total: ' 100.00' }],
      '31-Dec-2025': [{ 'Promoter & Promoter Group': '  50.01' }, { Public: '  49.99' }, { Total: ' 100.00' }],
      '31-Mar-2026': [{ 'Promoter & Promoter Group': '  50.00' }, { Public: '  50.00' }, { Total: ' 100.00' }],
      '30-Jun-2026': [{ 'Promoter & Promoter Group': '  50.48' }, { Public: '  49.52' }, { Total: ' 100.00' }],
    },
  },
  financial_results: {
    data: [
      {
        to_date: '30 Jun 2026',
        income: '17012100',
        audited: 'Un-Audited',
        consolidated: 'Non-Consolidated',
        reDilEPS: '9.81',
        reProLossBefTax: '1760000',
        proLossAftTax: '1327200',
        re_broadcast_timestamp: '17-Jul-2026 19:49',
        xbrl_attachment: 'https://nsearchives.nseindia.com/corporate/xbrl/INTEGRATED_FILING_INDAS_1695739.xml',
      },
    ],
  },
}

const quarter = (periodEnd, over) => ({ periodEnd, periodStart: null, basis: 'consolidated', unit: 'INR', ...over })

// ---------------------------------------------------------------------------
// The three cases the brief named
// ---------------------------------------------------------------------------

test('a percentage change from a negative base is refused, with the reason', () => {
  const result = changePercent(500, -1000)
  assert.equal(result.value, null)
  assert.match(result.unavailable, /negative/i)

  // The arithmetic that is being refused would have returned -150%, which reads as a
  // collapse when the company in fact swung from a loss into a profit.
  assert.ok(!('from' in result), 'a refused change must not carry a computed pair')
})

test('a three-quarter decline is detected as a run', () => {
  const points = [
    { date: '2024-09-30', value: 62.4 },
    { date: '2024-12-31', value: 61.1 },
    { date: '2025-03-31', value: 59.8 },
    { date: '2025-06-30', value: 58.2 },
  ]
  const [run] = runs(points)
  assert.equal(run.direction, 'fell')
  assert.equal(run.quarters, 3)
  assert.equal(run.from, '2024-09-30')
  assert.equal(run.to, '2025-06-30')
  assert.equal(run.change, -4.2)
})

test('a one-quarter wobble is not a run', () => {
  const points = [
    { date: '2024-09-30', value: 62.4 },
    { date: '2024-12-31', value: 61.1 }, // one real drop
    { date: '2025-03-31', value: 61.15 }, // noise
    { date: '2025-06-30', value: 61.1 }, // noise
  ]
  assert.deepEqual(runs(points), [])
})

// ---------------------------------------------------------------------------
// Run detection, the ways it could lie
// ---------------------------------------------------------------------------

test('a run needs every step to be material, not just the total', () => {
  // -1.5 in one quarter then two hundredths twice. The total is a clear decline, but
  // calling it a three-quarter decline would be false.
  const points = [
    { date: '2024-09-30', value: 62.4 },
    { date: '2024-12-31', value: 60.9 },
    { date: '2025-03-31', value: 60.88 },
    { date: '2025-06-30', value: 60.86 },
  ]
  assert.deepEqual(runs(points), [])
})

test('a missing quarter breaks a run rather than being counted through', () => {
  // The same four falling readings twice over. In the second, NSE published every
  // quarter; in the first it skipped December, so only two of the three steps are
  // between adjacent quarters and "three consecutive quarters" would be a false
  // claim. Counting rows instead of checking the dates would report both as a run.
  const values = [62.4, 61.1, 59.8, 58.2]
  const gapped = ['2024-09-30', '2025-03-31', '2025-06-30', '2025-09-30'].map((date, i) => ({ date, value: values[i] }))
  const complete = ['2024-12-31', '2025-03-31', '2025-06-30', '2025-09-30'].map((date, i) => ({ date, value: values[i] }))

  assert.deepEqual(runs(gapped), [], 'a skipped quarter must not be counted through')

  const [run] = runs(complete)
  assert.equal(run.quarters, 3)
  assert.equal(run.change, -4.2)
})

test('a direction change ends a run', () => {
  const points = [
    { date: '2024-06-30', value: 62.4 },
    { date: '2024-09-30', value: 61.0 },
    { date: '2024-12-31', value: 59.6 },
    { date: '2025-03-31', value: 58.2 },
    { date: '2025-06-30', value: 60.0 },
  ]
  const found = runs(points)
  assert.equal(found.length, 1)
  assert.equal(found[0].direction, 'fell')
  assert.equal(found[0].quarters, 3)
})

// ---------------------------------------------------------------------------
// The XBRL format traps
// ---------------------------------------------------------------------------

test('the nine-month cumulative column is not mistaken for the quarter', () => {
  // Both contexts declare October to December. Reading the <xbrli:context> period
  // would pick either one and, at roughly 3x, silently treble the quarter's revenue.
  const q = discreteQuarter(parseXbrl(BSE_DIALECT))
  assert.equal(q.periodStart, '2024-10-01')
  assert.equal(q.periodEnd, '2024-12-31')
  assert.equal(q.revenue, 2438650000000)
  assert.notEqual(q.revenue, 7155630000000)
  assert.equal(q.pat, 219300000000)
})

test('segment columns are not mistaken for the company', () => {
  const q = discreteQuarter(parseXbrl(BSE_DIALECT))
  assert.notEqual(q.revenue, 1497830000000, 'that figure is one reportable segment')
})

test('both NSE element vocabularies parse to the same shape', () => {
  const old = discreteQuarter(parseXbrl(BSE_DIALECT))
  const recent = discreteQuarter(parseXbrl(CAPMKT_DIALECT))

  assert.equal(old.basis, 'consolidated')
  assert.equal(recent.basis, 'standalone')
  assert.equal(recent.periodEnd, '2026-06-30')
  assert.equal(recent.revenue, 1660130000000)
  // Absent in a standalone filing, because there is no minority interest to split out.
  assert.equal(recent.patOwners, null)
})

test('a fact that is absent reads as null, never as zero', () => {
  const q = discreteQuarter(parseXbrl(CAPMKT_DIALECT))
  assert.equal(q.depreciation, null)
  assert.equal(q.financeCost, null)
})

// ---------------------------------------------------------------------------
// Derived series
// ---------------------------------------------------------------------------

const SEASONAL = [
  quarter('2023-12-31', { revenue: 1000, pat: 100 }),
  quarter('2024-03-31', { revenue: 1400, pat: 150 }),
  quarter('2024-06-30', { revenue: 900, pat: 80 }),
  quarter('2024-09-30', { revenue: 950, pat: 90 }),
  quarter('2024-12-31', { revenue: 1200, pat: -50 }), // the loss quarter
  quarter('2025-03-31', { revenue: 1500, pat: 40 }),
  quarter('2025-06-30', { revenue: 1100, pat: 95 }),
  quarter('2025-09-30', { revenue: 1150, pat: 105 }),
  quarter('2025-12-31', { revenue: 1450, pat: 60 }), // recovered, against a negative base
]

test('year on year compares a quarter to the same quarter, not to the last one', () => {
  const rows = yoy(SEASONAL, 'revenue')
  const dec24 = rows.find((r) => r.periodEnd === '2024-12-31')
  assert.equal(dec24.against, '2023-12-31')
  assert.equal(dec24.value, 20)

  // No prior year on file for the earliest quarters, and that is said rather than
  // left as a silent zero.
  assert.equal(rows[0].value, null)
  assert.match(rows[0].unavailable, /one year earlier/i)
})

test('year on year profit growth is refused where last year was a loss', () => {
  // December 2024 lost 50; December 2025 earned 60. The arithmetic would publish
  // -220%, which reads as a collapse and describes a recovery.
  const rows = yoy(SEASONAL, 'pat')
  const dec25 = rows.find((r) => r.periodEnd === '2025-12-31')
  assert.equal(dec25.against, '2024-12-31')
  assert.equal(dec25.value, null)
  assert.match(dec25.unavailable, /negative/i)

  // A positive base in the same series still computes, so the guard is not blanket.
  assert.equal(rows.find((r) => r.periodEnd === '2024-12-31').value, -150)
})

test('quarter on quarter is labelled as unadjusted for seasonality', () => {
  const row = qoq(SEASONAL, 'revenue').find((r) => r.periodEnd === '2025-03-31')
  assert.equal(row.against, '2024-12-31')
  assert.equal(row.value, 25)
  assert.match(row.note, /seasonality/i)
})

test('trailing twelve months refuses a window with a gap in it', () => {
  const gapped = [
    quarter('2023-12-31', { revenue: 1000 }),
    quarter('2024-03-31', { revenue: 1400 }),
    // June missing
    quarter('2024-09-30', { revenue: 950 }),
    quarter('2024-12-31', { revenue: 1200 }),
  ]
  const result = ttm(gapped, 'revenue')
  assert.equal(result.value, null)
  assert.match(result.unavailable, /skips a quarter/i)

  // The same four rows would otherwise sum to a plausible-looking "year".
  assert.equal(ttm(SEASONAL.slice(0, 4), 'revenue').value, 4250)
})

test('a hole in the series is named rather than closed over', () => {
  // This is the real RELIANCE case: the filing list stops at December 2024 and
  // top-corp-info reaches back only to June 2025, so March 2025 belongs to neither.
  const seamed = [
    quarter('2024-09-30', { revenue: 134054 }),
    quarter('2024-12-31', { revenue: 128260 }),
    quarter('2025-06-30', { revenue: 121369 }),
    quarter('2025-09-30', { revenue: 130610 }),
  ]
  assert.deepEqual(seriesGaps(seamed), [{ after: '2024-12-31', before: '2025-06-30' }])
  assert.deepEqual(seriesGaps(SEASONAL.slice(0, 3)), [])
})

test('a growth rate is refused when either end is not positive', () => {
  assert.equal(cagr(-100, 500, 3).value, null)
  assert.match(cagr(-100, 500, 3).unavailable, /starting value/i)
  assert.equal(cagr(100, -500, 3).value, null)
  assert.equal(cagr(100, 500, 0).value, null)
  assert.equal(cagr(100, 200, 1).value, 100)
})

test('operating margin is refused when a component of the add-back is missing', () => {
  const [full, partial] = margins([
    quarter('2024-12-31', { revenue: 1000, expenses: 800, depreciation: 50, financeCost: 30, pat: 150 }),
    quarter('2025-03-31', { revenue: 1000, expenses: 800, depreciation: null, financeCost: 30, pat: 150 }),
  ])

  assert.equal(full.operating, 28) // 1000 - 800 + 50 + 30
  assert.equal(full.net, 15)

  assert.equal(partial.operating, null)
  assert.match(partial.operatingUnavailable, /depreciation/)
  // A missing add-back must not take the net margin down with it.
  assert.equal(partial.net, 15)
})

test('a quarter sourced from the summary feed reports no revenue rather than using total income', () => {
  const [row] = margins([
    quarter('2026-06-30', {
      revenue: null,
      revenueUnavailable: 'The NSE summary feed reports total income only.',
      totalIncome: 1701210000000,
      pat: 132720000000,
    }),
  ])
  assert.equal(row.operating, null)
  assert.equal(row.net, null)
  assert.match(row.unavailable, /total income only/i)
})

// ---------------------------------------------------------------------------
// Shareholding
// ---------------------------------------------------------------------------

test('space-padded shareholding strings parse, oldest quarter first', () => {
  const series = shareholdingSeries(CORP_INFO)
  assert.equal(series.length, 5)
  assert.equal(series[0].date, '2025-06-30')
  assert.equal(series[4].date, '2026-06-30')
  assert.equal(series[0].holders['Promoter & Promoter Group'], 50.07)
  assert.equal(series[4].holders.Public, 49.52)
})

test('RELIANCE drift is reported as noise, and the one real move is not called a trend', () => {
  const trend = shareholdingTrend(CORP_INFO)
  // -0.06, 0, -0.01 then +0.48. Nothing consecutive clears the threshold.
  assert.deepEqual(trend.promoterRuns, [])
  assert.equal(trend.latestQuarterMove, 0.48)
  assert.equal(trend.latest.date, '2026-06-30')
})

test('a real promoter decline produces a publishable sentence', () => {
  const declining = {
    shareholdings_patterns: {
      data: {
        '30-Jun-2025': [{ 'Promoter & Promoter Group': ' 62.40' }],
        '30-Sep-2025': [{ 'Promoter & Promoter Group': ' 61.10' }],
        '31-Dec-2025': [{ 'Promoter & Promoter Group': ' 59.80' }],
        '31-Mar-2026': [{ 'Promoter & Promoter Group': ' 58.20' }],
      },
    },
  }
  const trend = shareholdingTrend(declining)
  assert.equal(trend.promoterRuns.length, 1)
  assert.equal(trend.promoterRuns[0].quarters, 3)
  // shareholdingTrend runs its own prose through policy.js and throws on a
  // violation, so reaching this line is itself the assertion that it is publishable.
  assert.match(trend.notes[0], /fell in each of 3 consecutive quarters/)
  assert.match(trend.notes[0], /62.4% at 2025-06-30 to 58.2% at 2026-03-31/)
})

test('one shareholding quarter is not enough to claim a trend', () => {
  const trend = shareholdingTrend({ shareholdings_patterns: { data: { '30-Jun-2026': [{ 'Promoter & Promoter Group': ' 50.00' }] } } })
  assert.deepEqual(trend.promoterRuns, [])
  assert.match(trend.unavailable, /fewer than two/i)
})

// ---------------------------------------------------------------------------
// Source merging
// ---------------------------------------------------------------------------

test('the current summary feed overrides the stale filing list for the same quarter', () => {
  // The listing genuinely lags: for RELIANCE it stops at Q3 FY25 while the company
  // has filed through Q1 FY27.
  const filings = [
    { periodEnd: '2024-12-31', basis: 'standalone', audited: 'unaudited', xbrl: 'https://old', via: 'filing-list' },
  ]
  const plan = planQuarters(filings, CORP_INFO)
  assert.equal(plan[0].periodEnd, '2026-06-30', 'newest first')
  assert.equal(plan.length, 2)
  assert.equal(plan[0].headline.pat, 1327200 * 1e5, 'the summary feed reports rupees lakh')
})

test('the basis falls back to standalone when consolidated filings have run dry, and says why', () => {
  const plan = [
    { periodEnd: '2026-06-30', basis: 'standalone', xbrl: 'https://a' },
    { periodEnd: '2024-12-31', basis: 'consolidated', xbrl: 'https://b' },
  ]
  const chosen = chooseBasis(plan)
  assert.equal(chosen.basis, 'standalone')
  assert.match(chosen.why, /2024-12-31/)

  assert.equal(chooseBasis([]).basis, null)
})

test('a filing listed with no XBRL document is not treated as a readable quarter', () => {
  // NSE writes the literal string "-" where the URL belongs on every pre-2018 filing.
  const plan = [{ periodEnd: '2010-12-31', basis: 'standalone', xbrl: null }]
  assert.equal(chooseBasis(plan).basis, null)
})

// ---------------------------------------------------------------------------
// Dates and disclosure
// ---------------------------------------------------------------------------

test('all three NSE date spellings parse to one format', () => {
  assert.equal(parseNseDate('31-Dec-2024'), '2024-12-31')
  assert.equal(parseNseDate('30 Jun 2026'), '2026-06-30')
  assert.equal(parseNseDate('2024-12-31'), '2024-12-31')
  assert.equal(parseNseDate('17-Jul-2026 19:49'), '2026-07-17')
  assert.equal(parseNseDate('-'), null)
  assert.equal(parseNseDate(null), null)
})

test('adjacency admits a real quarter and rejects a skipped one', () => {
  assert.ok(isAdjacentQuarter('2024-12-31', '2025-03-31')) // 90 days
  assert.ok(isAdjacentQuarter('2025-03-31', '2025-06-30')) // 91 days
  assert.ok(!isAdjacentQuarter('2024-09-30', '2025-03-31')) // two quarters
})

test('every unavailable field names a reason', () => {
  assert.ok(UNAVAILABLE.length >= 6)
  for (const entry of UNAVAILABLE) {
    assert.ok(entry.field, 'each gap is named')
    assert.ok(entry.why && entry.why.length > 40, `${entry.field} must explain WHY, not just that it is missing`)
  }
  const fields = UNAVAILABLE.map((u) => u.field).join(' | ')
  for (const required of ['FII', 'pledge', 'Cash flow', 'Order book', 'Intraday']) {
    assert.match(fields, new RegExp(required, 'i'))
  }
})
