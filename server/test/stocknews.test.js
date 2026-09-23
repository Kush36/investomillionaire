// Run with: node --test test/
//
// This file is mostly about news the engine must REFUSE to attach. Every pairing
// below is a real collision on the NSE list: two banks built from the same two words,
// two companies under the same promoter, a group name that belongs to thirty issuers.
// Attaching one company's headline to another's report is the same error as analysing
// the wrong company, so each refusal is tested next to the match it must not break.
//
// Nothing here fetches. rankForCompany is pure, so the headlines are constructed and
// the expected outcome is a property of the rules rather than of what the desks
// happened to publish this morning.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relevance, rankForCompany, categorise, RELEVANCE_FLOOR, RECENT_DAYS } from '../src/data/stocknews.js'
import { assertPublishable } from '../src/data/policy.js'

const NOW = Date.UTC(2026, 8, 20)

const item = (headline, { days = 1, summary = '', publisher = 'Economic Times' } = {}) => ({
  id: headline,
  headline,
  summary,
  link: `https://example.test/${encodeURIComponent(headline)}`,
  image: null,
  publisher,
  feedCategory: 'Markets',
  publishedAt: new Date(NOW - days * 86400000).toISOString(),
})

const BANK_OF_INDIA = { name: 'Bank of India', symbol: 'BANKINDIA' }
const INDIAN_BANK = { name: 'Indian Bank', symbol: 'INDIANB' }
const TATA_MOTORS = { name: 'Tata Motors Limited', symbol: 'TATAMOTORS' }
const TATA_STEEL = { name: 'Tata Steel Limited', symbol: 'TATASTEEL' }
const RELIANCE = { name: 'Reliance Industries Limited', symbol: 'RELIANCE', aliases: ['RIL'] }

const headlines = (report) => [...report.recent, ...report.historical].map((i) => i.headline)

/* ------------------------------------------------------ the name collisions ---- */

test('an Indian Bank headline is not attached to Bank of India', () => {
  const news = 'Indian Bank reports 12% rise in Q1 net profit'

  assert.equal(relevance(BANK_OF_INDIA, news).score, 0)
  // And the pairing has to hold in both directions, or the rule is an accident of
  // which company happened to be asked about first.
  assert.equal(relevance(INDIAN_BANK, 'Bank of India board clears fund raising plan').score, 0)

  // Not vacuous: each bank does match its own news, at full strength.
  assert.equal(relevance(INDIAN_BANK, news).score, 1)
  assert.equal(relevance(BANK_OF_INDIA, 'Bank of India board clears fund raising plan').score, 1)

  const report = rankForCompany([item(news)], BANK_OF_INDIA, { now: NOW })
  assert.equal(report.matchedFromFeeds, 0)
  assert.equal(report.recent.length, 0)
  assert.match(report.unavailable, /named this company/)
})

test('a Tata Motors headline is not attached to Tata Steel', () => {
  const news = 'Tata Motors launches new electric variant, targets fleet buyers'

  assert.equal(relevance(TATA_STEEL, news).score, 0)
  assert.equal(relevance(TATA_MOTORS, news).score, 1)

  const forSteel = rankForCompany([item(news)], TATA_STEEL, { now: NOW })
  const forMotors = rankForCompany([item(news)], TATA_MOTORS, { now: NOW })
  assert.deepEqual(headlines(forSteel), [])
  assert.deepEqual(headlines(forMotors), [news])
})

test('a name that is the tail of a longer name is not that company', () => {
  // The rule this test exists for was found on a live pull: the central bank turns up
  // in market copy several times a day, and "Reserve Bank of India" ends in the name
  // of a listed bank. So does State Bank of India, which is a different listed bank.
  assert.equal(relevance(BANK_OF_INDIA, 'Rupee steadies as the Reserve Bank of India steps in').score, 0)
  assert.equal(relevance(BANK_OF_INDIA, 'State Bank of India raises deposit rates').score, 0)
  assert.equal(relevance(BANK_OF_INDIA, 'Bank of India raises deposit rates').score, 1)
  // A word in front of the name is only fatal when it reads as part of it. Ordinary
  // sentence words do not.
  assert.equal(relevance(BANK_OF_INDIA, 'Deposit rates at Bank of India go up').score, 1)
  // And the same story usually names the company again without a word in front of it.
  assert.equal(
    relevance(BANK_OF_INDIA, 'Why Bank of India rose. Bank of India raised deposit rates.').score,
    1
  )
})

test('a bare group name identifies no company in the group', () => {
  const news = 'Tata group weighs a fresh round of capital allocation across units'
  for (const company of [TATA_MOTORS, TATA_STEEL]) {
    assert.equal(relevance(company, news).score, 0, `${company.symbol} matched a bare group name`)
  }
})

test('a shared group name is refused even when it is also the symbol', () => {
  // RELIANCE is a valid NSE symbol and "Reliance" names four listed companies. Taking
  // the symbol case-insensitively would file this under Reliance Industries.
  assert.equal(relevance(RELIANCE, 'Reliance Power bags 1,000 MW transmission order').score, 0)
  assert.equal(relevance(RELIANCE, 'Reliance Industries posts higher Q1 revenue').score, 1)
  // Which is what the alias is for.
  assert.equal(relevance(RELIANCE, 'RIL to invest in new energy capacity').basis, 'alias')
})

/* ---------------------------------------------------------- weaker evidence ---- */

test('a registered name longer than the press name still resolves, one rung lower', () => {
  const tcs = { name: 'Tata Consultancy Services Limited', symbol: 'TCS' }
  const hit = relevance(tcs, 'Tata Consultancy wins a multi-year deal in Europe')
  assert.equal(hit.score, 0.8)
  assert.equal(hit.basis, 'name-prefix')
})

test('a single distinctive word matches but is flagged weak', () => {
  // "Cummins" is distinctive and "India" is not, so the press name resolves on one
  // word. It is deliberately not full strength: the US parent trades under the same
  // word and these feeds carry it.
  const cummins = { name: 'Cummins India Limited', symbol: 'CUMMINSIND' }
  const hit = relevance(cummins, 'Cummins posts a higher order inflow for the quarter')
  assert.equal(hit.score, 0.5)
  assert.equal(hit.weak, true)
  // It clears the floor, so the caller sees it and can say how it was matched.
  assert.ok(hit.score >= RELEVANCE_FLOOR)
  assert.equal(relevance(cummins, 'Cummins India posts a higher order inflow').score, 1)
})

test('a symbol that is a word in its own right still matches on the symbol', () => {
  const titan = { name: 'Titan Company Limited', symbol: 'TITAN' }
  const hit = relevance(titan, 'Titan posts 20% growth in jewellery revenue')
  assert.equal(hit.score, 1)
  assert.equal(hit.basis, 'symbol')
})

test('word boundaries, not substrings', () => {
  const itc = { name: 'ITC Limited', symbol: 'ITC' }
  assert.equal(relevance(itc, 'Traders switch to defensives as volatility rises').score, 0)
  assert.equal(relevance(itc, 'ITC hotels demerger record date announced').score, 1)
})

test('a company named only in the body of another company\u2019s story ranks lower', () => {
  const listicle = item('Tata Chemicals may be the biggest beneficiary of the Tata Sons IPO', {
    summary: 'Tata Motors and Tata Steel also gained over the week.',
  })
  const report = rankForCompany([listicle], TATA_MOTORS, { now: NOW })
  const [only] = report.recent
  assert.equal(only.relevance.where, 'body')
  assert.equal(only.relevance.score, 0.6)
  assert.equal(only.relevance.weak, true)

  // The headline of its own story is worth full strength.
  const own = rankForCompany([item('Tata Motors gains on strong volumes')], TATA_MOTORS, { now: NOW })
  assert.equal(own.recent[0].relevance.where, 'headline')
  assert.equal(own.recent[0].relevance.score, 1)
})

test('a state in a company name is not evidence about the company', () => {
  // A live pull attached a Punjab dearness-allowance story to State Bank of India on
  // the word "state", which is in the name of half the public sector.
  const sbi = { name: 'State Bank of India', symbol: 'SBIN', aliases: ['SBI'] }
  const news = item('Punjab announces an 8% dearness allowance hike', { summary: 'State employees get the raise from October.' })
  assert.equal(rankForCompany([news], sbi, { now: NOW }).matchedFromFeeds, 0)
  assert.equal(relevance(sbi, 'State Bank of India raises deposit rates').score, 1)
})

/* ----------------------------------------------------------------- ranking ---- */

test('priority ordering puts a filing above a general story', () => {
  const report = rankForCompany(
    [
      item('Tata Motors named among most searched stocks this week', { days: 0 }),
      item('Tata Motors informs exchanges of an outcome of board meeting', { days: 3 }),
    ],
    TATA_MOTORS,
    { now: NOW }
  )

  assert.equal(report.recent[0].category, 'exchange-filing')
  assert.equal(report.recent[1].category, 'general')
  // The general story is three days newer, so recency alone would have inverted this.
  assert.ok(Date.parse(report.recent[1].publishedAt) > Date.parse(report.recent[0].publishedAt))
})

test('an exchange announcement passed in outranks everything from the feeds', () => {
  const report = rankForCompany([item('Tata Motors Q1 net profit rises 8%', { days: 0 })], TATA_MOTORS, {
    now: NOW,
    filings: [{ subject: 'Disclosure under Regulation 30: receipt of a work order', at: '2026-09-12' }],
  })

  assert.equal(report.recent[0].priority, 1)
  assert.equal(report.recent[0].relevance.basis, 'filing')
  assert.equal(report.recent[1].category, 'results')
  assert.equal(report.filingsCarried, 1)
})

test('categories follow the spec order, not the order the words appear', () => {
  // Both a regulator and an order are named; the regulator ranks higher.
  assert.equal(categorise('SEBI penalty on the company over an order routing lapse').category, 'regulatory')
  assert.equal(categorise('Company bags a work order worth Rs 900 crore').category, 'order-inflow')
  assert.equal(categorise('Board approves a dividend of Rs 6 per share').category, 'corporate-action')
  assert.equal(categorise('Shares in focus in trade today').category, 'general')
})

/* ------------------------------------------------------ recent vs historical ---- */

test('old news is context, not news, and an undated item is never called recent', () => {
  const stale = item('Tata Motors informs exchanges of a plant expansion', { days: RECENT_DAYS + 10 })
  const undated = { ...item('Tata Motors adds capacity at Pune'), publishedAt: null }

  const report = rankForCompany([item('Tata Motors Q1 revenue rises', { days: 2 }), stale, undated], TATA_MOTORS, {
    now: NOW,
  })

  assert.deepEqual(report.recent.map((i) => i.category), ['results'])
  assert.equal(report.historical.length, 2)
  const carried = report.historical.find((i) => i.date === null)
  assert.match(carried.dateUnavailable, /no usable date/)
})

test('a summary is the feed’s, and its absence is stated rather than filled', () => {
  const withText = item('Tata Motors Q1 revenue rises', { summary: 'The company reported higher volumes.' })
  const report = rankForCompany([withText, item('Tata Motors adds a shift at Sanand', { days: 2 })], TATA_MOTORS, {
    now: NOW,
  })

  const [first, second] = report.recent
  assert.equal(first.summary, 'The company reported higher volumes.')
  assert.equal(second.summary, null)
  assert.match(second.summaryUnavailable, /no description/)
})

/* ------------------------------------------------------------------ policy ---- */

test('a report of third-party headlines is publishable, including the words we may not write', () => {
  const report = rankForCompany(
    [
      item('Brokerages raise buy calls on Tata Motors after Q1', { days: 1 }),
      item('Tata Motors board approves buyback of shares', { days: 4 }),
    ],
    TATA_MOTORS,
    { now: NOW }
  )

  // Quoted and attributed, so the gate passes over them. The engine's own prose in
  // the same object is what it actually checks.
  assert.doesNotThrow(() => assertPublishable(report))
  assert.equal(report.recent.length, 2)
})

test('the empty report is publishable too, and says why it is empty', () => {
  const report = rankForCompany([], TATA_STEEL, { now: NOW })
  assert.doesNotThrow(() => assertPublishable(report))
  assert.ok(report.gaps.length >= 4)
})
