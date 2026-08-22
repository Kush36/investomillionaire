import { Router } from 'express'
import crypto from 'node:crypto'
import Parser from 'rss-parser'
import { z } from 'zod'
import { Pick } from '../models/Pick.js'
import { detectBroker, detectRating, detectTarget } from '../data/brokers.js'

export const recoRouter = Router()

// Calls published by brokerage desks, reported by financial media. Every card
// links back to the story and names the desk. None of these is our own view.
const FEEDS = [
  { source: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/stocks/recos/rssfeeds/2146843.cms' },
  { source: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' },
  { source: 'Livemint', url: 'https://www.livemint.com/rss/markets' },
  { source: 'BusinessLine', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
]

const parser = new Parser({ timeout: 9000, headers: { 'User-Agent': 'InvestoMillionaire/1.0 (education)' } })

const CACHE_MS = 15 * 60 * 1000
let cache = { at: 0, calls: [] }

function clean(html = '') {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

async function loadCalls() {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url)
      return (parsed.items || []).slice(0, 40).map((item) => {
        const title = clean(item.title || '')
        const summary = clean(item.contentSnippet || item.content || '').slice(0, 300)
        const haystack = `${title} ${summary}`
        return {
          id: item.guid || item.link,
          title,
          summary,
          link: item.link,
          source: feed.source,
          broker: detectBroker(haystack),
          rating: detectRating(title) || detectRating(summary),
          target: detectTarget(haystack),
          // A rating or a target makes it an actual call. Everything else is
          // the desk commenting on the market.
          kind: detectRating(title) || detectRating(summary) || detectTarget(haystack) ? 'call' : 'view',
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
        }
      })
    })
  )

  const seen = new Set()
  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    // Only keep items where a named desk is actually attached to the view.
    .filter((c) => c.broker && c.link)
    .filter((c) => {
      const key = c.title.toLowerCase().slice(0, 70)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

async function refresh() {
  if (Date.now() - cache.at < CACHE_MS && cache.calls.length) return cache.calls
  const calls = await loadCalls()
  if (calls.length) cache = { at: Date.now(), calls }
  return cache.calls
}

function requireAdmin(req, res, next) {
  const supplied = req.headers['x-admin-token']
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return res.status(503).json({ error: 'Admin access is not configured.' })
  if (typeof supplied !== 'string' || supplied.length !== expected.length) {
    return res.status(404).json({ error: 'Not found.' })
  }
  if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(404).json({ error: 'Not found.' })
  }
  next()
}

recoRouter.get('/', async (req, res) => {
  try {
    const [calls, picks] = await Promise.all([
      refresh().catch((err) => {
        console.error('[reco]', err.message)
        return []
      }),
      Pick.find({ active: true }).sort({ createdAt: -1 }).limit(60).lean(),
    ])

    const broker = req.query.broker
    const rating = req.query.rating
    let filtered = calls
    if (broker && broker !== 'All') filtered = filtered.filter((c) => c.broker === broker)
    if (rating && rating !== 'All') filtered = filtered.filter((c) => c.rating === rating)
    if (req.query.kind && req.query.kind !== 'All') filtered = filtered.filter((c) => c.kind === req.query.kind)

    res.json({
      calls: filtered.slice(0, 60),
      brokers: ['All', ...[...new Set(calls.map((c) => c.broker))].sort()],
      counts: { calls: calls.filter((c) => c.kind === 'call').length, views: calls.filter((c) => c.kind === 'view').length },
      picks: picks.map((p) => ({
        id: p._id,
        symbol: p.symbol,
        company: p.company,
        stance: p.stance,
        thesis: p.thesis,
        risk: p.risk,
        sector: p.sector,
        addedPrice: p.addedPrice,
        sourceUrl: p.sourceUrl,
        addedAt: p.createdAt,
      })),
      fetchedAt: new Date(cache.at).toISOString(),
    })
  } catch (err) {
    console.error('[reco]', err.message)
    res.status(502).json({ error: 'Could not load broker coverage right now.', calls: [], picks: [] })
  }
})

const pickSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  company: z.string().trim().min(2).max(120),
  stance: z.enum(['watching', 'studying', 'avoiding']).optional(),
  // A thesis is mandatory. A bare ticker with no reasoning is a tip, and this
  // site does not publish tips.
  thesis: z.string().trim().min(30).max(1200),
  risk: z.string().trim().max(600).optional(),
  sector: z.string().trim().max(60).optional(),
  addedPrice: z.number().positive().optional(),
  sourceUrl: z.string().url().max(400).optional(),
})

recoRouter.post('/picks', requireAdmin, async (req, res) => {
  const parsed = pickSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Check the fields. A thesis of at least 30 characters is required.' })
  }
  const pick = await Pick.create(parsed.data)
  res.status(201).json({ pick })
})

recoRouter.patch('/picks/:id', requireAdmin, async (req, res) => {
  const parsed = pickSchema.partial().extend({ active: z.boolean().optional() }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update.' })
  const pick = await Pick.findByIdAndUpdate(req.params.id, parsed.data, { new: true })
  if (!pick) return res.status(404).json({ error: 'No such entry.' })
  res.json({ pick })
})

recoRouter.delete('/picks/:id', requireAdmin, async (req, res) => {
  const pick = await Pick.findByIdAndDelete(req.params.id)
  if (!pick) return res.status(404).json({ error: 'No such entry.' })
  res.json({ ok: true })
})
