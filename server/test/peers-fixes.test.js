// Run with: node --test test/peers-fixes.test.js
//
// Four defects, one promise. Every test here fails on a number that was published as
// fact and was not one: a market capitalisation a hundred times out, a stale-share-
// count guard that passed because it was handed nothing to check, a dividend of zero
// that meant "the fetch failed", and a valuation section deleted because the company
// had no comparable peer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sharesOutstanding,
  capitalChangeSince,
  corporateActions,
  trailingDividend,
  peerComparison,
  buildClassification,
  parseIndexCsv,
  deps,
} from '../src/data/peers.js'
import { parseXbrl } from '../src/data/fundamentals.js'
import { assertPublishable } from '../src/data/policy.js'

const CRORE = 1e7

const xbrl = (paidUp, faceValue) =>
  `<xbrli:xbrl xmlns:in-capmkt="http://www.nseindia.com/xbrl/capmkt">
<in-capmkt:PaidUpValueOfEquityShareCapital contextRef="OneI" unitRef="INR">${paidUp}</in-capmkt:PaidUpValueOfEquityShareCapital>
${faceValue == null ? '' : `<in-capmkt:FaceValueOfEquityShareCapital contextRef="OneI" unitRef="INR">${faceValue}</in-capmkt:FaceValueOfEquityShareCapital>`}
</xbrli:xbrl>`

// ---------------------------------------------------------------------------
// 1. The face value that made a Rs 66,000 crore company look like a Rs 660 crore one
// ---------------------------------------------------------------------------

test('a face value no NSE-listed share is issued at refuses the share count instead of dividing by it', () => {
  // Adani Total Gas, integrated filing for the quarter to 2026-06-30: paid-up capital
  // of a rupee share, face value reported as 100. Dividing by it derives 1.1 crore
  // shares instead of 110 crore, and the market capitalisation published from that
  // was Rs 660 crore for a Nifty Oil & Gas member worth tens of thousands of crore.
  const shares = sharesOutstanding(parseXbrl(xbrl('1099831876.00', 100)))

  assert.equal(shares.value, null)
  assert.match(shares.unavailable, /face value of Rs 100/i)
  assert.match(shares.unavailable, /denomination/i)
})

test('the denominations NSE-listed equity is actually issued in still derive a count', () => {
  // The refusal has to be narrow, or it deletes the column for every company.
  for (const [faceValue, expected] of [[1, 1_099_831_876], [2, 549_915_938], [5, 219_966_375.2], [10, 109_983_187.6]]) {
    const shares = sharesOutstanding(parseXbrl(xbrl('1099831876.00', faceValue)))
    assert.equal(shares.value, expected, `face value of Rs ${faceValue}`)
  }
})

// ---------------------------------------------------------------------------
// 2. A guard that cannot see its input
// ---------------------------------------------------------------------------

test('a corporate-actions fetch that failed fails the bonus guard closed', () => {
  const failed = { unreadable: 'NSE’s corporate information document for RELIANCE could not be read (fetch failed).' }

  const guard = capitalChangeSince(failed, '2024-09-30', '2026-09-20')

  assert.equal(guard.ok, undefined, 'a guard handed nothing must not report that it checked')
  assert.equal(guard.value, null)
  assert.match(guard.unavailable, /could not be read/i)
  assert.match(guard.unavailable, /no market capitalisation is published/i)
})

test('a null corporate information document fails the bonus guard closed too', () => {
  // The old shape of this bug: `.catch(() => null)` upstream, `?? []` here, and an
  // empty list satisfies every filter in the guard.
  const guard = capitalChangeSince(null, '2024-09-30', '2026-09-20')
  assert.equal(guard.ok, undefined)
  assert.match(guard.unavailable, /corporate action history is unknown/i)
})

test('a corporate actions list that was read and holds no capital change passes the guard', () => {
  const guard = capitalChangeSince({ corporate_actions: { data: [] } }, '2024-09-30', '2026-09-20')
  assert.equal(guard.ok, true)
  assert.equal(guard.checked, 0)
})

test('a bonus after the filing still refuses the market capitalisation', () => {
  // RELIANCE's 1:1 on 28-Oct-2024, against a share count as at 2024-09-30.
  const guard = capitalChangeSince(
    { corporate_actions: { data: [{ exdate: '28-Oct-2024', purpose: 'Bonus 1:1' }] } },
    '2024-09-30',
    '2026-09-20'
  )
  assert.equal(guard.value, null)
  assert.match(guard.unavailable, /2024-10-28/)
})

test('an unread document and an empty one are different answers from one reader', () => {
  assert.ok(corporateActions({ unreadable: 'boom' }).unseen)
  assert.ok(corporateActions(null).unseen)
  assert.ok(corporateActions({}).unseen, 'a document with no corporate actions list was not read either')
  assert.deepEqual(corporateActions({ corporate_actions: { data: [] } }).actions, [])
})

// ---------------------------------------------------------------------------
// 3. Zero is a measurement, not a fallback
// ---------------------------------------------------------------------------

test('a corporate-actions fetch that failed makes the dividend unavailable, never zero', () => {
  const failed = { unreadable: 'NSE’s corporate information document for TCS could not be read (HTTP 503).' }

  const result = trailingDividend(failed, '2026-09-01')

  assert.equal(result.value, null, 'zero here states that the company declared no dividend')
  assert.match(result.unavailable, /could not be read/i)
  assert.match(result.unavailable, /would state that none was declared/i)
})

test('a corporate information document that was never read makes the dividend unavailable', () => {
  const result = trailingDividend(null, '2026-09-01')
  assert.equal(result.value, null)
  assert.match(result.unavailable, /unknown/i)
})

test('a list that was read and carries no dividend in the window is still zero', () => {
  // The fix must not turn a measured nil into an unavailable one: this company was
  // looked up, and it declared nothing inside the year.
  const result = trailingDividend({ corporate_actions: { data: [{ exdate: '01-Jan-2020', purpose: 'Dividend - Rs 4 Per Share' }] } }, '2026-09-01')
  assert.equal(result.value, 0)
  assert.equal(result.unavailable, undefined)
})

// ---------------------------------------------------------------------------
// 4. The subject's own valuation, which never depended on finding peers
// ---------------------------------------------------------------------------

const UNIVERSE_CSV = `Company Name,Industry,Symbol,Series,ISIN Code
Reliance Industries Ltd.,Oil Gas & Consumable Fuels,RELIANCE,EQ,INE002A01018
Tiny Refiner Ltd.,Oil Gas & Consumable Fuels,TINYOIL,EQ,INE000T01021`

const OILGAS_CSV = `Company Name,Industry,Symbol,Series,ISIN Code
Reliance Industries Ltd.,Oil Gas & Consumable Fuels,RELIANCE,EQ,INE002A01018
Tiny Refiner Ltd.,Oil Gas & Consumable Fuels,TINYOIL,EQ,INE000T01021`

const CLASSIFICATION = buildClassification(parseIndexCsv(UNIVERSE_CSV), [
  { label: 'Nifty Oil & Gas', file: 'ind_niftyoilgaslist.csv', members: parseIndexCsv(OILGAS_CSV) },
])

const RELIANCE = { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', isin: 'INE002A01018' }

const QUARTERS = [
  '2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31',
  '2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31',
]

const seriesFor = (revenue, pat) =>
  QUARTERS.map((periodEnd, i) => ({
    periodEnd,
    periodStart: QUARTERS[i - 1] ?? '2024-01-01',
    basis: 'consolidated',
    unit: 'INR',
    revenue,
    pat,
    pbt: pat * 1.3,
    expenses: revenue * 0.78,
    depreciation: revenue * 0.03,
    financeCost: revenue * 0.01,
  }))

const capOf = (symbol) =>
  symbol === 'RELIANCE'
    ? { value: 2_000_000 * CRORE, close: 1478, asOf: '2026-09-18', shares: 13.53e9, sources: [], note: 'Derived.' }
    : { value: 2_000 * CRORE, close: 96, asOf: '2026-09-18', shares: 2.08e8, sources: [], note: 'Derived.' }

/** The network, replaced. Restored by the caller, or every later test inherits it. */
function stubNetwork({ classification = CLASSIFICATION } = {}) {
  const original = { ...deps }
  deps.loadClassification = async () => classification
  deps.marketCapOf = async ({ symbol }) => capOf(symbol)
  deps.snapshot = async ({ symbol, isin, name }) => ({
    symbol,
    isin,
    name,
    basis: 'consolidated',
    coverage: { from: QUARTERS[0], to: QUARTERS[7], quarters: 8 },
    marketCap: capOf(symbol),
    series: seriesFor(25_000 * CRORE, 2_000 * CRORE),
    notes: [],
    dividend: { value: 11, from: '2025-09-18', to: '2026-09-18', count: 2 },
  })
  return () => Object.assign(deps, original)
}

test('a company with no comparable peer still publishes its own valuation', async (t) => {
  t.after(stubNetwork())

  // Every company NSE groups with RELIANCE is three orders of magnitude smaller, so
  // the size band keeps nobody. That is a fact about the sector. It was costing the
  // report RELIANCE's own market capitalisation, P/E and dividend yield, which are
  // the first three figures the valuation section shows.
  const block = await peerComparison(RELIANCE)

  assert.equal(block.unavailable, undefined, 'the section produced the subject row, so it is not unavailable')
  const subjectRow = block.table.rows.find((r) => r.subject)
  assert.ok(subjectRow, 'the subject must be in the table whether or not anyone else is')
  assert.equal(subjectRow.metrics.marketCap.value, 2_000_000)
  assert.equal(subjectRow.metrics.pe.value, 250)
  assert.ok(subjectRow.metrics.dividendYield.value > 0)

  assert.equal(block.table.rows.length, 1, 'no peer cleared the band, so no peer row is invented')
  assert.match(block.peerGroup.unavailable, /comparable size/i)
  assert.ok(block.notes.includes(block.peerGroup.unavailable), 'the reader is told why the table has one row')
  assert.ok(block.excluded.some((e) => e.symbol === 'TINYOIL'))

  assertPublishable({ peers: block })
})

test('a company in no constituent list still publishes its own valuation', async (t) => {
  t.after(stubNetwork())

  // The other early return: no classification, so no peer group, and the same
  // deletion of the subject's own figures.
  const block = await peerComparison({ symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', isin: 'INE999Z01099' })

  assert.equal(block.unavailable, undefined)
  assert.equal(block.table.rows.length, 1)
  assert.equal(block.table.rows[0].metrics.marketCap.value, 2_000_000)
  assert.match(block.peerGroup.unavailable, /no sector/i)
})

test('an index list that could not be fetched says so, and the valuation survives it', async (t) => {
  t.after(stubNetwork())
  deps.loadClassification = async () => {
    throw new Error('NSE index list responded 403')
  }

  const block = await peerComparison(RELIANCE)

  assert.equal(block.unavailable, undefined)
  assert.equal(block.table.rows[0].metrics.marketCap.value, 2_000_000)
  // A failed fetch is not evidence that NSE classifies no peer for this company.
  assert.match(block.peerGroup.unavailable, /could not be read/i)
  assert.match(block.peerGroup.unavailable, /403/)
})
