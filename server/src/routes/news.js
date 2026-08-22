import { Router } from 'express'
import Parser from 'rss-parser'

export const newsRouter = Router()

// RSS beats every free JSON news API here: no key, no daily quota, and these are
// the desks that actually cover Indian markets. Moneycontrol is deliberately absent:
// its RSS endpoints answer 403 to non-browser clients.
const FEEDS = [
  { source: 'Economic Times', category: 'Markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { source: 'Economic Times', category: 'Stocks', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' },
  { source: 'Economic Times', category: 'IPO', url: 'https://economictimes.indiatimes.com/markets/ipos/fpos/rssfeeds/14655708.cms' },
  { source: 'Livemint', category: 'Markets', url: 'https://www.livemint.com/rss/markets' },
  { source: 'Livemint', category: 'Money', url: 'https://www.livemint.com/rss/money' },
  { source: 'Business Standard', category: 'Markets', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { source: 'BusinessLine', category: 'Markets', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
]

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'InvestoMillionaire/1.0 (education)' },
})

const CACHE_MS = 10 * 60 * 1000
let cache = { at: 0, items: [] }

// These feeds are Indian market desks, but they still carry plenty of foreign
// wire copy. A story earns its place only if it actually touches this market.
const INDIA_MARKERS = /\b(nifty|sensex|nse|bse|sebi|rbi|india|indian|rupee|crore|lakh|dalal street|mumbai|fpi|fii|dii|nifty50|bank nifty|gst|demat|ipo|sme|psu|adani|reliance|tata|infosys|hdfc|icici|sbi|bajaj|maruti|wipro|itc|ongc|ntpc|larsen|kotak|axis bank|jio|zomato|paytm|nykaa|mahindra|hindustan)\b|₹|\bRs\.?\s?\d/i

// Wire copy about other markets that mentions India only in passing.
const FOREIGN_ONLY = /\b(wall street|nasdaq|s&p 500|dow jones|nikkei|hang seng|ftse|federal reserve|jackson hole|ecb|bank of japan|treasury yields)\b/i

function isIndianMarketStory(article) {
  const hay = `${article.title} ${article.summary}`
  if (!INDIA_MARKERS.test(hay)) return false
  // Mentioning India once inside a story that is really about another market
  // is not enough, unless an Indian index or regulator is named outright.
  if (FOREIGN_ONLY.test(hay) && !/\b(nifty|sensex|sebi|rbi|dalal street|nse|bse)\b/i.test(hay)) return false
  return true
}

const BULLISH = ['surge', 'rally', 'gain', 'jump', 'soar', 'record high', 'profit', 'upgrade', 'beat', 'rise', 'boost', 'bull']
const BEARISH = ['fall', 'slump', 'crash', 'plunge', 'loss', 'downgrade', 'decline', 'drop', 'sell-off', 'selloff', 'bear', 'cut']

function readMood(title) {
  const t = title.toLowerCase()
  const up = BULLISH.filter((w) => t.includes(w)).length
  const down = BEARISH.filter((w) => t.includes(w)).length
  if (up > down) return 'bullish'
  if (down > up) return 'bearish'
  return 'neutral'
}

function clean(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstImage(item) {
  if (item.enclosure?.url) return item.enclosure.url
  const raw = item['content:encoded'] || item.content || ''
  return raw.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || null
}

async function pullFeeds() {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url)
      return (parsed.items || []).slice(0, 15).map((item) => {
        const summary = clean(item.contentSnippet || item.content || '')
        return {
          id: item.guid || item.link,
          title: clean(item.title || 'Untitled'),
          summary: summary.slice(0, 260),
          link: item.link,
          image: firstImage(item),
          source: feed.source,
          category: feed.category,
          mood: readMood(item.title || ''),
          readMinutes: Math.max(1, Math.round(summary.split(' ').length / 200)),
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
        }
      })
    })
  )

  const seen = new Set()
  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((a) => {
      const key = a.title.toLowerCase().slice(0, 70)
      if (!a.link || seen.has(key)) return false
      if (!isIndianMarketStory(a)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

newsRouter.get('/', async (req, res) => {
  try {
    if (Date.now() - cache.at > CACHE_MS || cache.items.length === 0) {
      const items = await pullFeeds()
      if (items.length) cache = { at: Date.now(), items }
    }
    const { category, mood, q } = req.query
    let items = cache.items
    if (category && category !== 'All') items = items.filter((a) => a.category === category)
    if (mood && mood !== 'All') items = items.filter((a) => a.mood === mood)
    if (q) {
      const needle = String(q).toLowerCase()
      items = items.filter((a) => a.title.toLowerCase().includes(needle) || a.summary.toLowerCase().includes(needle))
    }
    res.json({
      items: items.slice(0, 60),
      categories: ['All', ...new Set(cache.items.map((a) => a.category))],
      fetchedAt: new Date(cache.at).toISOString(),
      stale: Date.now() - cache.at > CACHE_MS,
    })
  } catch (err) {
    console.error('[news]', err.message)
    res.status(502).json({ error: 'News feeds are unreachable right now.', items: [] })
  }
})
