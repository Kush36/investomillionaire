// Run with: node --test test/
//
// Fixtures, not the network. Every announcement string below is a real attchmntText
// served by /api/corporate-announcements, and every CSV block is the real header and
// row shape served by nsearchives.nseindia.com, both left exactly as NSE writes them.
// That is deliberate: the failures this module is exposed to are not arithmetic, they
// are a filing stating a per-share dividend where an order value is expected, or an
// exchange writing a side as the bare word "BUY" into a report that is forbidden to
// contain it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDealCsv,
  classifyClient,
  institutionalActivity,
  mergeDisclosures,
  statedAmounts,
  extractOrderValue,
  gradeMateriality,
  orders,
  classifyEvent,
  corporateEvents,
  decodeEntities,
  MATERIALITY,
  UNAVAILABLE,
} from '../src/data/activity.js'
import { assertPublishable, checkPhrase } from '../src/data/policy.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Verbatim from bulk.csv, 18-SEP-2026. HDFC MUTUAL FUND is carried over from
// block.csv the same day, because a fund-named counterparty is the case the client
// classifier exists for.
const BULK_CSV = `Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price,Remarks
18-SEP-2026,AHCL,Anlon Healthcare Limited,NK SECURITIES RESEARCH PRIVATE LIMITED,BUY,5160805,23.52,-
18-SEP-2026,AHCL,Anlon Healthcare Limited,JUNOMONETA FINSOL PRIVATE LIMITED,BUY,12827931,23.56,-
18-SEP-2026,AHCL,Anlon Healthcare Limited,HRTI PRIVATE LIMITED,SELL,10127829,23.53,-
18-SEP-2026,ENTERO,Entero Healthcare Solu L,HDFC MUTUAL FUND,BUY,1390000,1695.00,-`

// Also verbatim, same day. The first ENTERO row here is the SAME transaction as the
// last row of the bulk file above: a block deal large enough also lands in the bulk
// file. That overlap is real and is reproduced on purpose.
const BLOCK_CSV = `Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price
18-SEP-2026,TMCV,Tata Motors Limited,BOFA SECURITIES EUROPE SA,BUY,706512,438.00
18-SEP-2026,TMCV,Tata Motors Limited,BANK OF AMERICA NATIONAL ASSOCIATION,SELL,706512,438.00
18-SEP-2026,ENTERO,Entero Healthcare Solu L,HDFC MUTUAL FUND,BUY,1390000,1695.00
18-SEP-2026,ENTERO,Entero Healthcare Solu L,PRASID UNOFAMILY TRUST,SELL,168180,1695.00`

// An order stating exactly one rupee figure. This is the common shape.
const ORDER_WITH_VALUE =
  'Larsen & Toubro Limited has informed the Exchange regarding a press release dated January 03, 2019, titled "L&T Construction Wins Orders Valued Rs. 1,060 Crore".'

// The boilerplate the exchange writes when a company files under the order category
// and adds nothing. 49 of L&T's 70 order filings read exactly like this.
const ORDER_NO_VALUE = 'Larsen & Toubro Limited has informed the Exchange about Bagging/Receiving of orders/contracts'

// A size band in place of a figure. The rupee range for "Ultra-Mega" lives in a
// footnote in the attached PDF, which this code never fetches.
const ORDER_BANDED =
  'Larsen & Toubro Limited has informed the Exchange about L&T wins (Ultra-Mega*) Order for Hydrocarbon Onshore Business'

// Two separate order sets announced in one filing.
const ORDER_TWO_VALUES =
  'Larsen & Toubro Limited has informed the Exchange regarding a two press releases dated November 17, 2008, titled "L&T Bags Rs.937 Crore EPC Orders in the Middle East" and "L&T wins Rs.700 Crore order"'

// A routine filing. Not an order, and the figure in it is a per-share rate.
const DIVIDEND =
  'Larsen & Toubro Limited has informed the Exchange that Board of Directors at its meeting held on May 05, 2026, recommended Final Dividend of Rs. 38 per equity share.'

// Trailing twelve-month revenue, in rupees, roughly L&T's scale. Rs 1,060 crore is
// 0.39% of it, which is low; the same order against a Rs 5,000 cr company is high.
const LT_REVENUE = 2_700_000_000_000

// ---------------------------------------------------------------------------
// Deal files
// ---------------------------------------------------------------------------

test('parseDealCsv reads the exchange deal file and keeps the side verbatim', () => {
  const { deals, malformed, tradingDay } = parseDealCsv(BULK_CSV, 'bulk')
  assert.equal(deals.length, 4)
  assert.equal(malformed, 0)
  assert.equal(tradingDay, '2026-09-18')

  const first = deals[0]
  assert.equal(first.symbol, 'AHCL')
  assert.equal(first.side, 'BUY')
  assert.equal(first.quantity, 5160805)
  assert.equal(first.price, 23.52)
  // Value is quantity times price and nothing else. No rounding to crore here: the
  // conversion happens once, at display.
  assert.equal(first.value, Number((5160805 * 23.52).toFixed(2)))
  // NSE writes "-" for an absent remark; that is not a remark.
  assert.equal(first.remarks, null)
})

test('parseDealCsv counts a misaligned row instead of guessing at it', () => {
  // A client name containing a comma splits into nine fields with no quoting to say
  // so. Accepting it would put "LIMITED" in the side column.
  const broken = `${BULK_CSV}\n18-SEP-2026,AHCL,Anlon Healthcare Limited,SOME FUND, LIMITED,BUY,100,23.50,-`
  const { deals, malformed } = parseDealCsv(broken, 'bulk')
  assert.equal(deals.length, 4)
  assert.equal(malformed, 1)
})

test('parseDealCsv handles the block file, which has no Remarks column', () => {
  const { deals, malformed } = parseDealCsv(BLOCK_CSV, 'block')
  assert.equal(malformed, 0)
  assert.equal(deals.length, 4)
  assert.equal(deals[0].kind, 'block')
  assert.equal(deals[1].side, 'SELL')
  // Seven columns, so there is no Remarks field to mistake for one.
  assert.equal(deals[0].remarks, null)
})

test('classifyClient reads the disclosed name and does not promote a prop desk', () => {
  assert.equal(classifyClient('HDFC MUTUAL FUND'), 'named-as-fund-or-insurer')
  assert.equal(classifyClient('SBI LIFE INSURANCE COMPANY LIMITED'), 'named-as-fund-or-insurer')
  // Proprietary trading firms dominate these files and are not institutions in the
  // sense a reader means by the word.
  assert.equal(classifyClient('NK SECURITIES RESEARCH PRIVATE LIMITED'), 'not-identified')
  assert.equal(classifyClient('HRTI PRIVATE LIMITED'), 'not-identified')
})

// ---------------------------------------------------------------------------
// Institutional activity
// ---------------------------------------------------------------------------

const DEALS = { bulk: parseDealCsv(BULK_CSV, 'bulk'), block: parseDealCsv(BLOCK_CSV, 'block') }

test('institutionalActivity attributes every deal so the raw side clears the gate', () => {
  const out = institutionalActivity({ deals: DEALS, info: null, symbol: 'AHCL' })
  assert.equal(out.latest.length, 3)
  for (const deal of out.latest) {
    // policy.js only skips an object carrying BOTH keys. Without them the literal
    // "BUY" in `side` and in the headline is a reg 2(1)(wa)(i) violation.
    assert.ok(deal.source && deal.headline, 'a quoted deal must carry source and headline')
  }
  // The engine's own sentences sit outside those objects, so the gate still reads
  // them, and the whole section has to survive it.
  assert.doesNotThrow(() => assertPublishable(out))
})

test('institutionalActivity says nothing happened rather than implying nothing exists', () => {
  const out = institutionalActivity({ deals: DEALS, info: null, symbol: 'RELIANCE' })
  assert.equal(out.latest.length, 0)
  assert.match(out.notes[0], /disclosed no bulk or block deal in RELIANCE on 2026-09-18/)
  // The one-day ceiling is stated on the object, not left to be inferred from a date.
  assert.equal(out.window.covers, 'one trading day')
  assert.match(out.window.why, /latest trading day only|no free surface/i)
  assert.doesNotThrow(() => assertPublishable(out))
})

test('a deal published in both files is one transaction, not two', () => {
  // Found live: concatenating the files reported five ENTERO deals worth Rs 914 cr
  // where the exchange had disclosed three. Two disclosure regimes, one order book.
  const out = institutionalActivity({ deals: DEALS, info: null, symbol: 'ENTERO' })
  assert.equal(out.counts.distinct, 2)
  assert.equal(out.counts.bulk, 1)
  assert.equal(out.counts.block, 2)
  assert.equal(out.counts.inBoth, 1)

  const hdfc = out.latest.find((d) => d.client === 'HDFC MUTUAL FUND')
  assert.deepEqual(hdfc.disclosedAs, ['bulk', 'block'])
  // The disclosed value is counted once.
  assert.equal(out.latest.reduce((sum, d) => sum + d.value, 0), 1390000 * 1695 + 168180 * 1695)
  assert.match(out.notes[0], /NSE disclosed 2 deals in ENTERO/)
})

test('mergeDisclosures keeps two genuinely distinct rows apart', () => {
  // The two PRASID UNO trust rows differ only by quantity and are two real
  // disclosures. Deduping on the client name alone would swallow one.
  const bulk = parseDealCsv(BULK_CSV, 'bulk').deals
  const block = parseDealCsv(BLOCK_CSV, 'block').deals
  const merged = mergeDisclosures(bulk, block)
  assert.equal(merged.filter((d) => d.symbol === 'TMCV').length, 2)
  assert.equal(merged.length, bulk.length + block.length - 1)
})

test('institutionalActivity flags a fund-named counterparty as a reading of the name', () => {
  const out = institutionalActivity({ deals: DEALS, info: null, symbol: 'ENTERO' })
  const note = out.notes.join(' ')
  assert.match(note, /named in the disclosure as a fund or an insurer/)
  // The claim is bounded on purpose: NSE publishes no registration category.
  assert.match(note, /not a check of the client's registration category/)
})

test('institutionalActivity keeps the FII and DII split unavailable with its reason', () => {
  const out = institutionalActivity({ deals: DEALS, info: null, symbol: 'AHCL' })
  assert.equal(out.institutional, undefined)
  assert.equal(out.fiiDiiSplit.value, null)
  assert.match(out.fiiDiiSplit.unavailable, /regulation 31|single percentage/i)
})

test('institutionalActivity never claims a deal predicts a price', () => {
  const out = institutionalActivity({ deals: DEALS, info: null, symbol: 'ENTERO' })
  assert.match(out.caveat, /carries no implication for the price/)
  assert.ok(checkPhrase(out.caveat).ok)
})

// ---------------------------------------------------------------------------
// Order values
// ---------------------------------------------------------------------------

test('statedAmounts reads every spelling of a figure NSE actually publishes', () => {
  const cases = [
    ['Orders Valued Rs. 1,060 Crore', 1060e7],
    ['Wins Orders Valued Rs.1329 Crore', 1329e7],
    ['Rs 9,500-crore DIAL project', 9500e7],
    ['ESG Bonds worth &#8377; 500 crore on NSE', 500e7],
    ['donate &#8377;150 Crore to the PM-CARES Fund', 150e7],
  ]
  for (const [text, expected] of cases) {
    const [first] = statedAmounts(text)
    assert.equal(first?.value, expected, text)
    assert.equal(first.currency, 'INR')
  }
})

test('statedAmounts drops a figure with no unit and a figure that is a unit rate', () => {
  // "Rs. 38" could be crore, could be rupees. Choosing is guessing.
  assert.deepEqual(statedAmounts('Final Dividend of Rs. 38 per equity share.'), [])
  // The face value of one debenture next to the total of the issue. Reading the
  // first as the total understates it by a factor of fourteen thousand.
  const amounts = statedAmounts('Debentures of Rs. 10 lakh each aggregating to Rs. 1400 crore')
  assert.equal(amounts.length, 1)
  assert.equal(amounts[0].value, 1400e7)
})

test('statedAmounts separates a foreign currency from rupees', () => {
  const [usd] = statedAmounts('L&T concludes transition of USD 150 million loan')
  assert.equal(usd.currency, 'foreign')
  assert.equal(usd.value, 150e6)
  assert.equal(statedAmounts('US$ 107million Sustainability Linked Loan')[0].value, 107e6)
})

test('extractOrderValue reads the single stated figure', () => {
  const value = extractOrderValue(ORDER_WITH_VALUE)
  assert.equal(value.stated, true)
  assert.equal(value.value, 1060e7)
  assert.equal(value.currency, 'INR')
  // Quoted as printed, so a reader can find it in the filing.
  assert.equal(value.asStated, 'Rs. 1,060 Crore')
})

test('extractOrderValue refuses to pick between several stated figures', () => {
  const value = extractOrderValue(ORDER_TWO_VALUES)
  assert.equal(value.value, null)
  assert.match(value.unavailable, /2 separate rupee figures/)
  assert.match(value.unavailable, /not determinable from the text/)
  // Both are still published, so the reader sees what the filing said.
  assert.deepEqual(value.allStated.map((a) => a.value), [937e7, 700e7])
})

test('extractOrderValue quotes a size band and refuses to convert it', () => {
  const value = extractOrderValue(ORDER_BANDED)
  assert.equal(value.value, null)
  assert.equal(value.classification, 'Ultra-Mega')
  assert.match(value.unavailable, /size band it defines in its own press release/)
  assert.match(value.unavailable, /not converted to a figure here/)
})

test('extractOrderValue will not convert a foreign currency without a rate source', () => {
  const value = extractOrderValue('L&T Secures contract worth USD 700 mn')
  assert.equal(value.value, null)
  assert.match(value.unavailable, /No exchange rate source is available/)
})

// ---------------------------------------------------------------------------
// Materiality
// ---------------------------------------------------------------------------

test('gradeMateriality grades against revenue on the published thresholds', () => {
  const revenue = 100_000e7 // Rs 100,000 cr
  assert.equal(gradeMateriality(15_000e7, revenue).grade, 'high') // 15%
  assert.equal(gradeMateriality(10_000e7, revenue).grade, 'high') // exactly the line
  assert.equal(gradeMateriality(5_000e7, revenue).grade, 'moderate') // 5%
  assert.equal(gradeMateriality(2_000e7, revenue).grade, 'moderate') // exactly the line
  assert.equal(gradeMateriality(500e7, revenue).grade, 'low') // 0.5%
  assert.equal(gradeMateriality(5_000e7, revenue).percentOfRevenue, 5)
  // The thresholds travel with the grade, because one of the two is this report's
  // own line rather than a regulatory one.
  assert.equal(gradeMateriality(5_000e7, revenue).thresholds, MATERIALITY)
})

test('gradeMateriality refuses when either side of the ratio is missing', () => {
  assert.match(gradeMateriality(null, 100e7).unavailable, /states no order value/)
  assert.match(gradeMateriality(100e7, null).unavailable, /No trailing twelve-month revenue/)
  // A zero or negative denominator is not a small denominator.
  assert.match(gradeMateriality(100e7, 0).unavailable, /No trailing twelve-month revenue/)
})

// ---------------------------------------------------------------------------
// Orders end to end
// ---------------------------------------------------------------------------

const ROWS = [
  { at: '2026-01-03', category: 'Press Release', text: ORDER_WITH_VALUE, attachment: null },
  { at: '2026-02-09', category: 'Bagging/Receiving of orders/contracts', text: ORDER_NO_VALUE, attachment: null },
  { at: '2026-03-09', category: 'Bagging/Receiving of orders/contracts', text: ORDER_BANDED, attachment: null },
  { at: '2026-05-05', category: 'Dividend', text: DIVIDEND, attachment: null },
]

test('an order announcement is graded against revenue', () => {
  // Same order, two companies. The grade is a statement about the company, not about
  // the order, which is the entire reason it is expressed as a ratio.
  const big = orders(ROWS, { trailingRevenue: LT_REVENUE }).found.find((o) => o.value.value === 1060e7)
  assert.equal(big.materiality.grade, 'low')
  assert.equal(big.materiality.percentOfRevenue, 0.39)

  const small = orders(ROWS, { trailingRevenue: 5_000e7 }).found.find((o) => o.value.value === 1060e7)
  assert.equal(small.materiality.grade, 'high')
  assert.equal(small.materiality.percentOfRevenue, 21.2)
})

test('an order with no stated value is marked so rather than graded', () => {
  const out = orders(ROWS, { trailingRevenue: LT_REVENUE })
  const bare = out.found.find((o) => o.headline === ORDER_NO_VALUE)
  assert.equal(bare.value.value, null)
  assert.match(bare.value.unavailable, /states no order value/)
  assert.equal(bare.materiality.grade, undefined)
  assert.match(bare.materiality.unavailable, /cannot be measured against revenue/)

  const banded = out.found.find((o) => o.headline === ORDER_BANDED)
  assert.equal(banded.materiality.grade, undefined)
  assert.equal(banded.value.classification, 'Ultra-Mega')

  // An unmeasured order must not be counted as a small one.
  assert.equal(out.counts.total, 3)
  assert.equal(out.counts.graded, 1)
  assert.equal(out.counts.low, 1)
  assert.match(out.notes.join(' '), /not a small order; it is an unmeasured one/)
})

test('a routine announcement is not graded high, or picked up as an order at all', () => {
  const out = orders(ROWS, { trailingRevenue: LT_REVENUE })
  // The dividend states "Rs. 38", carries no order language, and must not appear.
  assert.equal(out.found.some((o) => o.headline === DIVIDEND), false)
  assert.equal(out.counts.high, 0)

  // Nor should any other routine filing that merely mentions money.
  const routine = [
    { at: '2026-04-01', category: 'Credit Rating', text: 'Larsen & Toubro Limited has informed the Exchange about Credit Rating', attachment: null },
    { at: '2026-04-02', category: 'Allotment of Securities', text: 'allotment of 28,903 shares pursuant to ESOP/ESPS at its meeting held on September 15, 2026', attachment: null },
    { at: '2026-04-03', category: 'Analysts/Institutional Investor Meet/Con. Call Updates', text: 'has informed the Exchange about Schedule of meet', attachment: null },
  ]
  const none = orders(routine, { trailingRevenue: LT_REVENUE })
  assert.equal(none.counts.total, 0)
  assert.equal(none.counts.high, 0)
  assert.match(none.notes[0], /No order announcement was filed/)
})

test('orders survives the policy gate with its quoted filings intact', () => {
  const out = orders(ROWS, { trailingRevenue: LT_REVENUE })
  assert.doesNotThrow(() => assertPublishable(out))
  for (const o of out.found) assert.ok(o.source && o.headline)
})

test('orders says why nothing could be graded when revenue is missing', () => {
  const out = orders(ROWS, { trailingRevenue: null })
  assert.equal(out.counts.graded, 0)
  assert.match(out.notes.join(' '), /no order in this list could be graded for materiality/)
})

// ---------------------------------------------------------------------------
// Corporate events
// ---------------------------------------------------------------------------

test('classifyEvent tests demerger before merger', () => {
  // "demerger" contains "merger". Without the ordering every demerger in the archive
  // files as a merger.
  assert.equal(classifyEvent({ category: 'Demerger', text: '' }).type, 'demerger')
  assert.equal(classifyEvent({ category: 'Scheme of Arrangement for demerger', text: '' }).type, 'demerger')
  assert.equal(classifyEvent({ category: 'Amalgamation/Merger', text: '' }).type, 'merger')
})

test('classifyEvent maps the categories NSE actually publishes', () => {
  const cases = [
    ['Acquisition', 'acquisition'],
    ['Buyback', 'buyback'],
    ['Buy Back', 'buyback'],
    ['Bonus', 'bonus'],
    ['Dividend', 'dividend'],
    ['Interim Dividend', 'dividend'],
    ['Rights Issue', 'fund-raising'],
    ['Qualified Institutional Placement', 'fund-raising'],
    ['Change in Director(s)', 'management-change'],
    ['Resignation of Director', 'management-change'],
  ]
  for (const [category, type] of cases) {
    assert.equal(classifyEvent({ category, text: '' })?.type, type, category)
  }
  // Noise stays unclassified rather than being forced into a bucket.
  assert.equal(classifyEvent({ category: 'Loss of Share Certificates', text: '' }), null)
  assert.equal(classifyEvent({ category: 'Trading Window', text: '' }), null)
})

test('classifyEvent does not read a Scheme of Arrangement as a merger', () => {
  // The live LT feed files mergers, demergers and plain reorganisations under this
  // one label. Calling them all mergers invents the half of the fact that matters.
  assert.equal(classifyEvent({ category: 'Scheme of Arrangement', text: 'has informed the Exchange about Scheme of Arrangement' }).type, 'scheme-of-arrangement')
  // The container yields the moment the filing's own words are specific.
  assert.equal(classifyEvent({ category: 'Scheme of Arrangement', text: 'Scheme of Arrangement for demerger of the financial services undertaking' }).type, 'demerger')
  assert.equal(classifyEvent({ category: 'Scheme of Arrangement', text: 'Amalgamation/Merger of L&T Power Development Limited' }).type, 'merger')
})

test('classifyEvent does not file a divestment as an acquisition', () => {
  // A sale and a purchase are mirror images; conflating them inverts the direction
  // of the only fact the announcement carries.
  assert.equal(classifyEvent({ category: 'Sale or disposal', text: '' }).type, 'divestment')
  assert.equal(classifyEvent({ category: 'Updates', text: 'Divestment of Nabha Power Limited' }).type, 'divestment')
  assert.equal(classifyEvent({ category: 'Acquisition', text: '' }).type, 'acquisition')
})

test('classifyEvent falls back to the text for events filed under a catch-all', () => {
  const hit = classifyEvent({
    category: 'Updates',
    text: 'Please find attached a media release by Reliance Retail Limited, titled Reliance Retail Acquires Anomaly, Accelerating Expansion of Its Beauty Portfolio. Acquisition of 100% equity stake in Southern Health Foods Private Limited',
  })
  assert.equal(hit.type, 'acquisition')
  assert.equal(hit.matchedOn, 'text')

  const expansion = classifyEvent({ category: 'Press Release', text: 'the Board approved a capacity expansion at the Jamnagar facility' })
  assert.equal(expansion.type, 'capacity-expansion')
})

test('corporateEvents attributes both surfaces and states no impact', () => {
  const info = {
    corporate_actions: {
      data: [
        // NSE's own wording. "Buy Back" as two words trips the policy gate on sight,
        // which is exactly why this object has to be attributed.
        { exdate: '12-Sep-2023', purpose: 'Buy Back' },
        { exdate: '28-Oct-2024', purpose: 'Bonus 1:1' },
        { exdate: '20-Jul-2023', purpose: 'Demerger' },
        { exdate: '05-Jun-2026', purpose: 'Dividend - Rs 6 Per Share' },
      ],
    },
  }
  const out = corporateEvents([{ at: '2026-05-07', category: 'Acquisition', text: 'Update on acquisition of 100% equity stake of Kandla GHA Transmission Limited', attachment: null }], info)

  assert.deepEqual(out.byType, { acquisition: 1, buyback: 1, bonus: 1, demerger: 1, dividend: 1 })
  // Newest first, across both surfaces at once: the June ex-date outranks the May
  // announcement, which is the point of merging them into one dated list.
  assert.deepEqual(out.events.map((e) => e.at), ['2026-06-05', '2026-05-07', '2024-10-28', '2023-09-12', '2023-07-20'])
  for (const e of out.events) {
    assert.ok(e.source && e.headline, 'a quoted event must carry source and headline')
    // Nothing here claims to know what an event does to a price.
    assert.equal(e.impact, undefined)
  }
  assert.doesNotThrow(() => assertPublishable(out))
})

test('a report containing "Buy Back" is only publishable because it is attributed', () => {
  // The guard on the guard. If policy.js ever stops skipping attributed objects, or
  // this module stops setting both keys, this test is what notices.
  assert.equal(checkPhrase('Buy Back').ok, false)
  assert.throws(() => assertPublishable({ events: [{ headline: 'Buy Back' }] }))
  assert.doesNotThrow(() => assertPublishable({ events: [{ source: { name: 'NSE' }, headline: 'Buy Back' }] }))
})

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

test('every named gap carries a reason', () => {
  assert.ok(UNAVAILABLE.length >= 5)
  for (const gap of UNAVAILABLE) {
    assert.ok(gap.field && gap.why.length > 40, `${gap.field} needs a reason, not a label`)
  }
  // The two the owner is most likely to go looking for.
  assert.ok(UNAVAILABLE.some((g) => /FII and DII/.test(g.field)))
  assert.ok(UNAVAILABLE.some((g) => /Bulk and block deal history/.test(g.field)))
})

test('decodeEntities turns the rupee sign NSE ships into one this code can read', () => {
  assert.equal(decodeEntities('&#8377; 500 crore'), '₹ 500 crore')
  assert.equal(decodeEntities('L&amp;T'), 'L&T')
})
