import { Router } from 'express'
import { fetchFeedItems } from '../data/stocknews.js'

export const newsRouter = Router()

// The feed list, the fetch and the dedup moved to data/stocknews.js, which the
// company-level news engine also reads. Two copies of a feed list are two feed lists
// that disagree inside a month. What stays here is what only this page does: the
// India filter, the mood read and the shape the client renders.

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

async function pullFeeds() {
  const items = await fetchFeedItems()
  return items
    .filter((a) => isIndianMarketStory({ title: a.headline, summary: a.summary }))
    .map((a) => ({
      id: a.id,
      title: a.headline,
      summary: a.summary.slice(0, 260),
      link: a.link,
      image: a.image,
      source: a.publisher,
      category: a.feedCategory,
      mood: readMood(a.headline),
      readMinutes: Math.max(1, Math.round(a.summary.split(' ').length / 200)),
      // An item the feed dated badly used to be stamped with the time of the fetch,
      // which is a fabricated freshness on the one field a reader judges news by.
      publishedAt: a.publishedAt,
    }))
    .filter((a) => a.publishedAt)
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
