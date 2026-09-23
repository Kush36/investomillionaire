// Run with: node --test test/analyze-page.test.js
//
// The analyzer page cannot be rendered here, so the two decisions it used to get
// wrong were pulled out of the JSX and into client/src/lib/report.js, which is plain
// JS and runs under node --test like anything else. Both decisions are about the same
// promise: the page may not claim more than the report does.
//
// The report is the fixture on purpose. Each case builds the shape routes/analyze.js
// actually emits, including the exact sentence its stage() writes when a fetch dies,
// so a change to that seam fails here rather than silently reclassifying every live
// outage as a permanent gap on the page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitOutages, splitByRelevance, matchStanding } from '../../client/src/lib/report.js'
import { rankForCompany } from '../src/data/stocknews.js'
import { UNAVAILABLE as FUNDAMENTAL_GAPS } from '../src/data/fundamentals.js'

// ---------------------------------------------------------------------------
// A gap and an outage are different facts
// ---------------------------------------------------------------------------

// What routes/analyze.js stage() returns and records when a stage throws. Written out
// rather than imported because the page has no access to that module: if the two ever
// disagree, this is where it shows.
const outage = (stage, why, ms = 8000) => ({
  row: { field: stage === 'news' ? 'news' : stage.split(' ')[0], why: `${stage} could not complete: ${why}` },
  entry: { stage, status: 'failed', ms, why },
})

test('a feed that timed out is not listed as a figure no free source publishes', () => {
  const died = outage('fundamental engine', 'fetch failed: ETIMEDOUT nseindia.com')

  const { structural, outages } = splitOutages(
    [...FUNDAMENTAL_GAPS, died.row],
    [{ stage: 'daily prices', status: 'ok', ms: 120 }, died.entry]
  )

  assert.equal(outages.length, 1, 'the live failure was not separated from the permanent gaps')
  assert.equal(outages[0].stage, 'fundamental engine')
  assert.equal(outages[0].error, 'fetch failed: ETIMEDOUT nseindia.com')
  assert.equal(outages[0].ms, 8000)

  // The named gaps the auditor called structural stay structural, and the outage is
  // not among them: those are the two halves of the claim the page prints.
  assert.ok(structural.some((row) => /FII and DII/.test(row.field)))
  assert.ok(structural.some((row) => /Promoter pledge/.test(row.field)))
  assert.ok(structural.some((row) => /Balance sheet/.test(row.field)))
  assert.equal(structural.length, FUNDAMENTAL_GAPS.length)
  assert.ok(!structural.some((row) => /could not complete/.test(row.why)))
})

test('a stage that succeeded cannot turn a gap into an outage', () => {
  const { structural, outages } = splitOutages(FUNDAMENTAL_GAPS, [
    { stage: 'fundamental engine', status: 'ok', ms: 400 },
    { stage: 'news', status: 'ok', ms: 90 },
  ])

  assert.deepEqual(outages, [])
  assert.equal(structural.length, FUNDAMENTAL_GAPS.length)
})

test('an unavailable row the pipeline does not account for is reported as a gap, not a failure', () => {
  // Erring towards the gap is the safe direction: the page never invents an outage
  // that no stage recorded, and never blames a run for something it did not do.
  const { structural, outages } = splitOutages(
    [{ field: 'technical.daily.rsi', why: 'RSI(14) needs 15 bars and 9 were available.' }],
    [{ stage: 'daily prices', status: 'ok', ms: 30 }]
  )

  assert.deepEqual(outages, [])
  assert.equal(structural.length, 1)
})

test('two stages failing are named one by one rather than merged into a count', () => {
  const news = outage('news', 'socket hang up', 8001)
  const peers = outage('peer comparison', 'NSE returned 503', 2400)

  const { outages } = splitOutages([news.row, peers.row], [news.entry, peers.entry])

  assert.deepEqual(
    outages.map((o) => [o.stage, o.error]),
    [
      ['news', 'socket hang up'],
      ['peer comparison', 'NSE returned 503'],
    ]
  )
})

// ---------------------------------------------------------------------------
// A weak match is not the company's own filing
// ---------------------------------------------------------------------------

const NOW = Date.UTC(2026, 8, 20)

const feedItem = (headline, { summary = '', days = 1 } = {}) => ({
  id: headline,
  headline,
  summary,
  link: `https://example.test/${encodeURIComponent(headline)}`,
  image: null,
  publisher: 'Economic Times',
  feedCategory: 'Markets',
  publishedAt: new Date(NOW - days * 86400000).toISOString(),
})

test('a single-token match is held apart from the company’s own exchange filing', () => {
  // The listed company is Cummins India. "Cummins" alone is its American parent,
  // which these desks cover and which is not this issuer. stocknews.js scores that at
  // the floor and flags it weak, which is the whole reason the score is returned
  // instead of applied, and the page used to throw the flag away.
  const ranked = rankForCompany(
    [
      feedItem('Cummins India informs exchanges of board meeting'),
      feedItem('Cummins recalls engines across North America'),
    ],
    { name: 'Cummins India Limited', symbol: 'CUMMINSIND' },
    { now: NOW, filings: [{ subject: 'Outcome of board meeting', at: '2026-09-19' }] }
  )

  const { asserted, unasserted } = splitByRelevance(ranked.recent)

  assert.ok(asserted.length >= 2, 'the filing and the named story did not survive as full matches')
  assert.ok(
    asserted.some((row) => row.standing.label === 'filed by the company'),
    'the exchange filing lost its standing'
  )
  assert.equal(unasserted.length, 1, 'the single-token story was not held apart')
  assert.match(unasserted[0].item.headline, /North America/)
  assert.match(unasserted[0].standing.detail, /may be about a different company/)

  // The separation is the point: nothing that could be another company's story sits
  // in the same run as an item the company filed itself.
  assert.ok(asserted.every((row) => row.standing.standing === 'full'))
  assert.ok(unasserted.every((row) => row.standing.standing !== 'full'))
})

test('a body-only mention says it was found in the summary, not the headline', () => {
  const ranked = rankForCompany(
    [feedItem('Sensex closes higher as metal stocks rally', { summary: 'Gains came from Tata Steel and Infosys.' })],
    { name: 'Infosys Limited', symbol: 'INFY' },
    { now: NOW }
  )

  const { asserted, unasserted } = splitByRelevance(ranked.recent)

  assert.equal(asserted.length, 0, 'an index wrap was given the standing of a company story')
  assert.equal(unasserted.length, 1)
  assert.equal(unasserted[0].standing.label, 'named in the summary only')
  assert.match(unasserted[0].standing.detail, /summary rather than the headline/)
})

test('the engine’s own order survives inside each group', () => {
  // Ranking is the spec's priority, not recency. Splitting by standing must not
  // quietly re-sort what is left.
  const ranked = rankForCompany(
    [
      feedItem('Cummins India wins order worth Rs 400 crore', { days: 5 }),
      feedItem('Cummins India informs exchanges of board meeting', { days: 6 }),
    ],
    { name: 'Cummins India Limited', symbol: 'CUMMINSIND' },
    { now: NOW }
  )

  const { asserted } = splitByRelevance(ranked.recent)
  assert.deepEqual(
    asserted.map((row) => row.item.headline),
    ranked.recent.map((item) => item.headline)
  )
})

test('an item with no relevance block is called unscored rather than strong or weak', () => {
  // Neither "this is about the company" nor "this is a weak match" is a claim the
  // page is entitled to make about a score nobody recorded.
  const standing = matchStanding({ headline: 'Something happened' })

  assert.equal(standing.standing, 'unscored')
  assert.match(standing.detail, /no relevance score/)
  assert.deepEqual(splitByRelevance([{ headline: 'Something happened' }]).asserted, [])
})
