import { Router } from 'express'
import Parser from 'rss-parser'
import { loadGmp, matchGmp, GMP_SOURCE } from '../data/gmp.js'
import { scoreIssue } from '../data/verdict.js'

export const ipoRouter = Router()

// NSE publishes this openly. No key, no quota, and it is the same data the
// exchange shows on its own site, which makes it the only source here worth trusting.
const NSE = 'https://www.nseindia.com/api'
const NSE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo',
}

// Commentary and grey-market chatter. Linked, never restated as our own view.
const COVERAGE_FEEDS = [
  { source: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/ipos/fpos/rssfeeds/14655708.cms' },
  { source: 'IPO Watch', url: 'https://ipowatch.in/feed/' },
  { source: 'Livemint', url: 'https://www.livemint.com/rss/markets' },
]

const parser = new Parser({ timeout: 9000, headers: { 'User-Agent': NSE_HEADERS['User-Agent'] } })

const CACHE_MS = 10 * 60 * 1000
let cache = { at: 0, issues: [], coverage: [], gmp: [] }

async function nse(path) {
  const res = await fetch(`${NSE}${path}`, { headers: NSE_HEADERS, signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`NSE responded ${res.status}`)
  return res.json()
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

// NSE sends "21-Aug-2026". Date.parse handles it inconsistently across runtimes.
function parseDate(raw) {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec((raw || '').trim())
  if (!match) return null
  const [, day, mon, year] = match
  if (!(mon in MONTHS)) return null
  return new Date(Date.UTC(Number(year), MONTHS[mon], Number(day), 4, 0, 0)).toISOString()
}

// "Rs.750 to Rs.788" and the single-price variant "Rs.100"
function parseBand(raw) {
  const numbers = (raw || '').match(/\d+(?:\.\d+)?/g)
  if (!numbers?.length) return { min: null, max: null, label: raw || 'To be announced' }
  const min = Number(numbers[0])
  const max = Number(numbers[numbers.length - 1])
  return { min, max, label: min === max ? `Rs ${min}` : `Rs ${min} to Rs ${max}` }
}

function daysBetween(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000)
}

function normalise(raw) {
  const opens = parseDate(raw.issueStartDate)
  const closes = parseDate(raw.issueEndDate)
  const band = parseBand(raw.issuePrice)
  const shares = Number(raw.issueSize) || null
  const now = Date.now()

  let phase = 'upcoming'
  if (opens && closes) {
    if (now > new Date(closes).getTime() + 86400000) phase = 'closed'
    else if (now >= new Date(opens).getTime()) phase = 'open'
  }

  return {
    symbol: raw.symbol,
    company: raw.companyName,
    series: raw.series,
    board: raw.series === 'SME' ? 'SME' : 'Mainboard',
    band,
    shares,
    // Shares on offer x the top of the band. An indication of size, not the final figure.
    issueSizeCrore: shares && band.max ? Math.round((shares * band.max) / 1e7) : null,
    opens,
    closes,
    phase,
    daysLeft: closes ? daysBetween(now, closes) : null,
    subscribedTimes: raw.noOfTime ? Number(raw.noOfTime) : null,
    nseStatus: raw.status,
  }
}

async function loadIssues() {
  const [current, upcoming] = await Promise.allSettled([
    nse('/ipo-current-issue'),
    nse('/all-upcoming-issues?category=ipo'),
  ])

  const rows = []
  if (current.status === 'fulfilled' && Array.isArray(current.value)) rows.push(...current.value)
  if (upcoming.status === 'fulfilled' && Array.isArray(upcoming.value)) rows.push(...upcoming.value)

  const bySymbol = new Map()
  for (const row of rows) {
    if (!row?.symbol) continue
    const item = normalise(row)
    const existing = bySymbol.get(item.symbol)
    // The current-issue feed carries subscription numbers, the upcoming feed does not.
    if (!existing || (item.subscribedTimes != null && existing.subscribedTimes == null)) {
      bySymbol.set(item.symbol, { ...existing, ...item })
    }
  }

  const order = { open: 0, upcoming: 1, closed: 2 }
  return [...bySymbol.values()].sort(
    (a, b) => order[a.phase] - order[b.phase] || new Date(a.closes || 0) - new Date(b.closes || 0)
  )
}

function clean(html = '') {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

async function loadCoverage() {
  const results = await Promise.allSettled(
    COVERAGE_FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url)
      return (parsed.items || []).slice(0, 40).map((item) => {
        const title = clean(item.title || '')
        return {
          title,
          link: item.link,
          source: feed.source,
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
          // Flagged, not parsed. We link to the post rather than restate a number
          // that has no official source behind it.
          mentionsGmp: /\bgmp\b|grey market/i.test(title),
          isReview: /\breview\b|should you|analyst|brokerage|subscribe/i.test(title),
        }
      })
    })
  )
  return results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
}

// "Augmont Enterprises Limited" needs to match a headline saying "Augmont".
function companyTokens(company) {
  return company
    .toLowerCase()
    .replace(/\b(limited|ltd|private|pvt|india|enterprises|industries|instruments|company|and|the)\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
}

function coverageFor(company, coverage) {
  const tokens = companyTokens(company)
  if (!tokens.length) return []
  return coverage
    .filter((item) => {
      const title = item.title.toLowerCase()
      return tokens.some((token) => title.includes(token))
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 6)
}

async function refresh() {
  if (Date.now() - cache.at < CACHE_MS && cache.issues.length) return cache
  const [issues, coverage, gmp] = await Promise.all([
    loadIssues(),
    loadCoverage().catch(() => []),
    loadGmp().catch((err) => {
      console.error('[gmp]', err.message)
      return []
    }),
  ])
  if (issues.length) cache = { at: Date.now(), issues, coverage, gmp }
  return cache
}

ipoRouter.get('/', async (_req, res) => {
  try {
    const { issues, coverage, gmp, at } = await refresh()
    res.json({
      gmpSource: GMP_SOURCE,
      issues: issues.map((issue) => {
        const match = matchGmp(issue.company, gmp)
        const enriched = {
          ...issue,
          lot: match?.lot ?? null,
          pe: match?.pe ?? null,
          allotmentDate: match?.allotmentDate ?? null,
          listingDate: match?.listingDate ?? null,
          gmp: match
            ? {
                premium: match.premium,
                percent: match.percent,
                estimatedListing: match.estimatedListing,
                updatedLabel: match.updatedLabel,
                matchConfidence: match.matchConfidence,
                sourceUrl: match.sourceUrl,
              }
            : null,
        }
        return {
          ...enriched,
          coverageCount: coverageFor(issue.company, coverage).length,
          verdict: scoreIssue(enriched, match, []),
        }
      }),
      counts: {
        open: issues.filter((i) => i.phase === 'open').length,
        upcoming: issues.filter((i) => i.phase === 'upcoming').length,
        closed: issues.filter((i) => i.phase === 'closed').length,
      },
      fetchedAt: new Date(at).toISOString(),
    })
  } catch (err) {
    console.error('[ipo]', err.message)
    res.status(502).json({ error: 'The NSE issue feed is unreachable right now.', issues: [] })
  }
})

ipoRouter.get('/:symbol', async (req, res) => {
  try {
    const { issues, coverage, gmp } = await refresh()
    const issue = issues.find((i) => i.symbol === req.params.symbol.toUpperCase())
    if (!issue) return res.status(404).json({ error: 'No open or upcoming issue with that symbol.' })

    let categories = []
    if (issue.phase !== 'upcoming') {
      try {
        const detail = await nse(`/ipo-active-category?symbol=${encodeURIComponent(issue.symbol)}`)
        categories = (detail.dataList || [])
          .filter((row) => row.srNo && /^\d+$/.test(String(row.srNo)) && Number(row.noOfTotalMeant) > 0)
          .map((row) => ({
            category: row.category,
            offered: Number(row.noOfShareOffered) || null,
            bid: Number(row.noOfSharesBid) || null,
            times: Number(row.noOfTotalMeant),
          }))
      } catch {
        categories = []
      }
    }

    const match = matchGmp(issue.company, gmp)
    const enriched = {
      ...issue,
      lot: match?.lot ?? null,
      pe: match?.pe ?? null,
      allotmentDate: match?.allotmentDate ?? null,
      listingDate: match?.listingDate ?? null,
      gmp: match
        ? {
            premium: match.premium,
            percent: match.percent,
            estimatedListing: match.estimatedListing,
            capPrice: match.capPrice,
            updatedLabel: match.updatedLabel,
            matchConfidence: match.matchConfidence,
            sourceUrl: match.sourceUrl,
          }
        : null,
    }
    res.json({
      issue: enriched,
      categories,
      coverage: coverageFor(issue.company, coverage),
      verdict: scoreIssue(enriched, match, categories),
      gmpSource: GMP_SOURCE,
    })
  } catch (err) {
    console.error('[ipo detail]', err.message)
    res.status(502).json({ error: 'Could not load that issue right now.' })
  }
})
