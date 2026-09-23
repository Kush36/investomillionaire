// Latest news for one company.
//
// routes/news.js already runs the RSS pipeline: seven Indian market desks, no key, no
// quota, deduped on the headline. Its feed list, its cleaning and its dedup live here
// now and that route imports them, because two copies of a feed list are two feed
// lists that disagree inside a month.
//
// What is new here is relevance, and relevance is the whole module. Attaching another
// company's news to a report is the same class of error as analysing the wrong
// company, so the matching rules are the ones universe.js arrived at, applied to
// prose instead of to a name column:
//
//   1. The registered name, a caller-supplied alias, or the NSE symbol, matched as a
//      PHRASE on word boundaries. Order is part of the identity: "Bank of India" and
//      "Indian Bank" are built from the same two words and are different banks.
//   2. Failing that, a DISTINCTIVE token of the name. A token is distinctive when it
//      is neither a group name that a dozen listed companies share ("Tata", "Bajaj",
//      "Reliance") nor a sector word ("Bank", "Steel", "Motors"). "Titan" names a
//      company. "Tata" names a family of them.
//   3. Everything else scores zero. A headline that cannot be tied to one company is
//      attached to none, and the report says it found nothing rather than guessing.
//
// Where the name was found counts too. A story is about the company in its headline;
// its body lists every mover in the index, so a body-only match is scaled down and
// only the full name survives the floor.
//
// The score is returned, not applied. How much evidence is enough is the caller's
// decision, which is also why a single-token match is flagged weak rather than
// quietly promoted to the same standing as a full name.
//
// Ranking is the spec's own priority, not recency: a filing outranks a wire story
// that happens to be an hour newer. Recent and historical are split so a year of
// context cannot crowd out what happened this week.

import Parser from 'rss-parser'

// RSS beats every free JSON news API here: no key, no daily quota, and these are the
// desks that actually cover Indian markets. Moneycontrol is deliberately absent: its
// RSS endpoints answer 403 to non-browser clients.
export const FEEDS = [
  { source: 'Economic Times', category: 'Markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { source: 'Economic Times', category: 'Stocks', url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' },
  { source: 'Economic Times', category: 'IPO', url: 'https://economictimes.indiatimes.com/markets/ipos/fpos/rssfeeds/14655708.cms' },
  { source: 'Livemint', category: 'Markets', url: 'https://www.livemint.com/rss/markets' },
  { source: 'Livemint', category: 'Money', url: 'https://www.livemint.com/rss/money' },
  { source: 'Business Standard', category: 'Markets', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { source: 'BusinessLine', category: 'Markets', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
]

export const SOURCES = {
  feeds: { name: 'Indian market news desks, RSS', url: 'https://economictimes.indiatimes.com/markets' },
  announcements: {
    name: 'NSE corporate announcements',
    url: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
  },
}

const parser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'InvestoMillionaire/1.0 (education)' },
})

const CACHE_MS = 10 * 60 * 1000
// One pull serves both the market page and every company report inside the window, so
// the depth is fixed rather than per-caller: a shallower request must not evict the
// deeper cache a company report needs.
const PER_FEED = 20

let feedCache = { at: 0, items: [] }
let lastPull = { at: 0, read: 0, failed: [] }

export function clean(html = '') {
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

const at = (item) => {
  const t = Date.parse(item?.publishedAt ?? '')
  return Number.isFinite(t) ? t : null
}

/** Which feeds answered on the last pull, so a thin report can say why it is thin. */
export function feedStatus() {
  return { ...lastPull, failed: lastPull.failed.map((f) => ({ ...f })) }
}

/**
 * Every feed, normalised, deduped, newest first.
 *
 * A feed that fails is recorded rather than thrown, because six desks answering is a
 * usable market view and the seventh is named in feedStatus() instead of taking the
 * page down with it. The cache is only replaced on a non-empty pull: a total outage
 * leaves the last good items in place rather than blanking the page.
 */
export async function fetchFeedItems() {
  if (feedCache.items.length && Date.now() - feedCache.at < CACHE_MS) return feedCache.items

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url)
      return (parsed.items || []).slice(0, PER_FEED).map((item) => ({
        id: item.guid || item.link,
        headline: clean(item.title || ''),
        summary: clean(item.contentSnippet || item.content || '').slice(0, 400),
        link: item.link || null,
        image: firstImage(item),
        publisher: feed.source,
        feedCategory: feed.category,
        // Never substituted with "now". A missing date is a missing date, and the
        // freshness of an item is exactly the thing a reader is judging.
        publishedAt: item.isoDate || item.pubDate || null,
      }))
    })
  )

  const failed = results
    .map((r, i) => (r.status === 'rejected' ? { source: FEEDS[i].source, url: FEEDS[i].url, why: String(r.reason?.message ?? r.reason) } : null))
    .filter(Boolean)

  const seen = new Set()
  const items = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((a) => {
      if (!a.headline || !a.link) return false
      const key = a.headline.toLowerCase().slice(0, 70)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (at(b) ?? 0) - (at(a) ?? 0))

  lastPull = { at: Date.now(), read: FEEDS.length - failed.length, failed }
  if (items.length) feedCache = { at: Date.now(), items }
  return items
}

// ---------------------------------------------------------------------------
// Is this headline about this company?
// ---------------------------------------------------------------------------

// Legal form. Dropped from the end of a name only, so "Reliance Industries Limited"
// and "Reliance Industries" are the same phrase.
const LEGAL = new Set(['ltd', 'limited', 'plc', 'pvt', 'private', 'inc', 'llp'])

// Words that carry no identity on their own but stay inside the phrase, because a
// phrase with holes in it is how "Bank of India" starts matching "Indian Bank".
const STOPWORDS = new Set(['the', 'of', 'and', 'co', 'corp', 'corporation', 'company'])

/**
 * Words shared across many listed companies.
 *
 * Two kinds: group names, where the word identifies a promoter family rather than an
 * issuer, and sector words, where it identifies a business rather than a company.
 * Both are consulted only to REJECT evidence, never to create it, so adding a word
 * here can cost a match and can never cause a wrong one. When in doubt, add it.
 */
const SHARED = new Set([
  // Group and promoter names, each attached to several listed issuers.
  'tata', 'birla', 'aditya', 'adani', 'bajaj', 'mahindra', 'godrej', 'jindal', 'reliance',
  'hinduja', 'torrent', 'apollo', 'sun', 'jsw', 'bharat', 'hindustan', 'hdfc', 'icici',
  'sbi', 'kotak', 'axis', 'lt', 'murugappa', 'shree', 'shri', 'sri', 'jk', 'kalyani',
  // Sector, form and filler words.
  'india', 'indian', 'national', 'bank', 'banks', 'banking', 'motors', 'motor', 'steel',
  'power', 'energy', 'finance', 'financial', 'services', 'service', 'industries',
  'industrial', 'enterprises', 'infrastructure', 'infra', 'cement', 'cements',
  'chemicals', 'chemical', 'textiles', 'technologies', 'technology', 'tech', 'telecom',
  'life', 'insurance', 'general', 'housing', 'auto', 'automobiles', 'electric',
  'electricals', 'electronics', 'mills', 'paper', 'sugar', 'oil', 'oils', 'gas',
  'petroleum', 'pharma', 'pharmaceutical', 'pharmaceuticals', 'labs', 'laboratories',
  'healthcare', 'hospitals', 'foods', 'food', 'agro', 'minerals', 'metals', 'mining',
  'port', 'ports', 'shipping', 'airlines', 'hotels', 'resorts', 'retail', 'holdings',
  'ventures', 'projects', 'construction', 'constructions', 'developers', 'realty',
  'estate', 'estates', 'exports', 'international', 'global', 'products', 'solutions',
  'systems', 'engineering', 'capital', 'securities', 'investments', 'investment',
  'trust', 'fund', 'first', 'new', 'group', 'works', 'resources', 'consumer',
  'commercial', 'development', 'trading', 'agencies', 'associates', 'brothers', 'sons',
  // Places. A state or a city in a company name is shared with every other company
  // named after it and with the ordinary news of that place: "State Bank of India"
  // was matched to a Punjab dearness-allowance story on the word "state" alone.
  'state', 'union', 'central', 'city', 'urban', 'rural', 'north', 'south', 'east',
  'west', 'northern', 'southern', 'eastern', 'western', 'punjab', 'bombay', 'mumbai',
  'delhi', 'madras', 'chennai', 'kolkata', 'bengal', 'gujarat', 'karnataka', 'kerala',
  'andhra', 'telangana', 'rajasthan', 'maharashtra', 'odisha', 'assam', 'bihar',
  'mysore', 'hyderabad', 'bangalore', 'pune', 'jaipur', 'nagpur', 'baroda',
])

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const tokens = (value) =>
  String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

function nameTokens(name) {
  const list = tokens(name)
  while (list.length > 1 && LEGAL.has(list[list.length - 1])) list.pop()
  return list
}

const isDistinctive = (token) => token.length >= 3 && !STOPWORDS.has(token) && !SHARED.has(token)

// Word boundaries matter more than they look, the same way they do in brokers.js: a
// substring match finds "ITC" inside "switch". The gap between tokens is capped at
// three characters so an ampersand or a comma joins them but half a sentence cannot.
function phraseRe(list, flags = 'i') {
  return new RegExp(`(?:^|[^a-z0-9])(${list.map(escape).join('[^a-z0-9]{1,3}')})(?![a-z0-9])`, flags)
}

// A capitalised word butted against the left edge of a name is part of the name.
// This is not a nicety: "Bank of India" sits inside "State Bank of India", which is a
// different listed company, and inside "Reserve Bank of India", which is the central
// bank. Both appear in these feeds constantly, and the live pull that this rule was
// written for attached an RBI story to Bank of India at full confidence.
const CARRIES_ON_LEFT = /[A-Z][A-Za-z]*\s$/

/**
 * Does this phrase appear as a name of its own?
 *
 * The left guard runs only when the phrase OPENS on a shared word, because that is
 * the shape a longer name can swallow: "Bank of ...", "Tata ...", "Reliance ...". A
 * name starting on a word of its own ("Infosys", "Cummins") cannot be the tail of
 * another company's name, so it matches after any word.
 *
 * Every occurrence is tried, not just the first. A story that opens "Why Tata Motors
 * fell" usually names the company again further down without a word in front of it.
 */
function phraseHit(list, text) {
  if (!list.length) return false
  const guarded = SHARED.has(list[0]) || STOPWORDS.has(list[0])
  const re = phraseRe(list, 'gi')
  for (let m; (m = re.exec(text)); ) {
    if (!guarded) return true
    const start = m.index + m[0].length - m[1].length
    if (!CARRIES_ON_LEFT.test(text.slice(0, start))) return true
  }
  return false
}

/** Evidence floor at which a caller may treat an item as being about the company. */
export const RELEVANCE_FLOOR = 0.5

// What a match in the body rather than the headline is worth. Set so that a full
// name in the body still clears the floor and nothing weaker does.
const BODY_ONLY = 0.6

/**
 * Score how strongly a piece of text names one company.
 *
 * Returns { score, basis, matched } and, on a single-token match, weak: true.
 *
 *   1.00  the full name, an alias, or the symbol, as a phrase
 *   0.80  a leading run of the name that contains a distinctive word, which is how a
 *         registered name longer than the press name still resolves
 *   0.50  one distinctive word of the name, alone. Enough to show, not enough to
 *         assert, because a distinctive word can still be shared by an unlisted or
 *         foreign company the feeds also cover
 *   0.00  nothing
 *
 * The symbol is skipped when it is itself a shared word. RELIANCE is a valid NSE
 * symbol and "Reliance" is a group name, so accepting the symbol case-insensitively
 * would file every Reliance Power headline under Reliance Industries. Aliases exist
 * for the cases this costs: pass ['RIL'] or ['L&T'] and they match at full strength.
 */
export function relevance(company = {}, text = '') {
  const hay = String(text ?? '')
  const name = nameTokens(company.name)

  if (phraseHit(name, hay)) return { score: 1, basis: 'name', matched: name.join(' ') }

  for (const alias of company.aliases ?? []) {
    if (phraseHit(tokens(alias), hay)) return { score: 1, basis: 'alias', matched: alias }
  }

  const symbol = String(company.symbol ?? '').trim()
  if (symbol.length >= 2 && !SHARED.has(symbol.toLowerCase())) {
    // A short ticker is a word in ordinary prose ("LT", "IT"), so below four
    // characters it has to appear in the exchange's own casing to count.
    const re = new RegExp(`(?:^|[^A-Za-z0-9])${escape(symbol)}(?![A-Za-z0-9])`, symbol.length >= 4 ? 'i' : '')
    if (re.test(hay)) return { score: 1, basis: 'symbol', matched: symbol }
  }

  // Shorter and shorter leading runs. Once a run holds nothing distinctive, no
  // shorter one can either, so the loop stops rather than walking down to a bare
  // sector word.
  for (let take = name.length - 1; take >= 2; take--) {
    const run = name.slice(0, take)
    if (!run.some(isDistinctive)) break
    if (phraseHit(run, hay)) return { score: 0.8, basis: 'name-prefix', matched: run.join(' ') }
  }

  for (const token of name.filter(isDistinctive)) {
    if (phraseHit([token], hay)) return { score: 0.5, basis: 'token', matched: token, weak: true }
  }

  return { score: 0, basis: 'none', matched: null }
}

// ---------------------------------------------------------------------------
// What kind of news is it?
// ---------------------------------------------------------------------------

/**
 * The spec's priority order, first match wins.
 *
 * Rank, not recency, is the primary sort. A regulatory action is ranked above a
 * results story even when the words overlap, which is why the list is ordered and
 * scanned rather than scored.
 */
export const PRIORITY = [
  {
    category: 'exchange-filing',
    rank: 1,
    why: 'Filed by the company with the exchange, or announced under regulation 30.',
    re: /\b(regulation 30|intimation|disclosure under|board meeting|outcome of (?:the )?board|files? with (?:the )?(?:exchanges?|nse|bse)|informs? (?:the )?exchanges?|exchange filing|postal ballot|investor presentation|analyst meet)\b/i,
  },
  {
    category: 'regulatory',
    rank: 2,
    why: 'A regulator, tribunal or court acted on the company.',
    re: /\b(sebi|rbi|irdai|trai|cci|nclt|nclat|supreme court|high court|tribunal|income tax|gst|show ?cause|penalt(?:y|ies)|fined|probe|investigation|summons|licen[cs]e|clearance|regulatory approval)\b/i,
  },
  {
    category: 'results',
    rank: 3,
    why: 'Reported financial results for a period.',
    re: /\b(q[1-4]|quarter(?:ly)?|half[- ]year|fy\d{2}|results?|earnings|net profit|revenue|topline|ebitda|margins?|pat|standalone|consolidated)\b/i,
  },
  {
    category: 'order-inflow',
    rank: 4,
    why: 'An order, contract or award the company disclosed.',
    re: /\b(orders?|contracts?|bags|wins|awarded|letter of (?:award|acceptance)|loa|work order|tender|mou|agreement worth|deal worth)\b/i,
  },
  {
    category: 'management',
    rank: 5,
    why: 'Management changed, or management spoke about the business.',
    re: /\b(ceo|cfo|coo|managing director|whole[- ]time director|chairman|chairperson|appoints?|appointed|appointment|resign(?:s|ed|ation)?|steps? down|succeeds|guidance|outlook|interview|commentary)\b/i,
  },
  {
    category: 'institutional',
    rank: 6,
    why: 'Institutional or promoter ownership changed hands.',
    re: /\b(fii|dii|fpi|foreign (?:portfolio|institutional) investors?|mutual funds?|block deal|bulk deal|stake|shareholding|promoters?|pledge|lic|institutional investors?|open market)\b/i,
  },
  {
    category: 'corporate-action',
    rank: 7,
    why: 'A distribution, a capital change or a scheme of arrangement.',
    re: /\b(dividend|bonus issue|stock split|buyback|rights issue|record date|ex[- ]date|merger|demerger|amalgamation|acquisition|acquires|open offer|delisting|qip|fund ?rais(?:e|ing)|preferential (?:issue|allotment))\b/i,
  },
  {
    category: 'industry',
    rank: 8,
    why: 'A development in the industry the company operates in.',
    re: /\b(sector|industry|peers|rivals|demand|output|production|capacity|exports?|imports?|tariffs?|duty|subsidy|raw material)\b/i,
  },
  {
    category: 'general',
    rank: 9,
    why: 'Coverage naming the company that falls in no category above.',
    re: null,
  },
]

export function categorise(text = '') {
  return PRIORITY.find((p) => !p.re || p.re.test(String(text ?? ''))) ?? PRIORITY[PRIORITY.length - 1]
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const DAY = 86400000

/** Anything older than this is context, not news. */
export const RECENT_DAYS = 14

/**
 * Named gaps, with the reason for each. Same contract as fundamentals.UNAVAILABLE:
 * these are not omissions waiting on a better parser, they are things no free source
 * publishes, and a reader who can see them can judge the rest of the page.
 */
export const UNAVAILABLE = [
  {
    field: 'Moneycontrol and the paywalled wires',
    why: 'Moneycontrol answers 403 to non-browser clients, and Bloomberg, Reuters and the terminal wires are licensed products. Nothing behind a paywall is read here.',
  },
  {
    field: 'News older than the feed window',
    why: 'An RSS feed carries the publisher’s current window, a few days at most, and no free archive endpoint exists. An empty result means nothing appeared in that window, not that nothing happened.',
  },
  {
    field: 'Full coverage of small and mid caps',
    why: 'These are market desks, not a company wire. A company outside the index can go weeks without a headline on any of them, so absence here is not evidence of quiet.',
  },
  {
    field: 'What an item means for the share price',
    why: 'Reading a consequence into a headline is the analyst opinion this engine does not publish. Items are categorised by subject and quoted from the publisher.',
  },
]

/**
 * Where the company was named, and what that is worth.
 *
 * A story is about the company in its headline. Its body routinely names a dozen
 * others: an index wrap lists every mover, a group story lists every subsidiary.
 * Scaling a body-only match keeps the full name in a listicle above the floor while
 * dropping the weaker kinds of evidence below it, which is the intended ladder: a
 * passing mention counts only when it is unmistakably this company.
 */
function bestHit(company, raw) {
  const inHeadline = relevance(company, raw.headline)
  if (inHeadline.score > 0) return { ...inHeadline, where: 'headline' }

  const inBody = relevance(company, raw.summary ?? '')
  if (inBody.score === 0) return { ...inBody, where: 'none' }
  return { ...inBody, score: Number((inBody.score * BODY_ONLY).toFixed(2)), where: 'body', weak: true }
}

function toItem(raw, hit) {
  const when = at(raw)
  const { category, rank } = categorise(`${raw.headline} ${raw.summary ?? ''}`)
  return {
    headline: raw.headline,
    // Drawn from the feed, never composed. A description the publisher did not write
    // is a description this engine invented.
    summary: raw.summary || null,
    summaryUnavailable: raw.summary ? null : 'The feed carried this headline with no description.',
    source: { name: raw.publisher, url: raw.link },
    date: when === null ? null : new Date(when).toISOString().slice(0, 10),
    publishedAt: raw.publishedAt ?? null,
    dateUnavailable: when === null ? 'The feed published no usable date, so the age of this item is unknown.' : null,
    category,
    priority: rank,
    image: raw.image ?? null,
    relevance: hit,
  }
}

// An exchange announcement is filed BY the company under its own symbol, so identity
// is certain and the relevance rules above do not apply to it. Re-fetching these here
// would be a second client for an endpoint fundamentals.js already owns, so they are
// passed in.
function fromFilings(rows, source, company) {
  return rows
    .map((row) => ({
      headline: clean(String(row.subject ?? row.headline ?? '')),
      date: row.at ?? row.on ?? row.date ?? null,
    }))
    .filter((row) => row.headline)
    .map((row) => ({
      headline: row.headline,
      summary: null,
      summaryUnavailable: 'An exchange announcement is published as a subject line. The document behind it is a PDF.',
      source,
      date: row.date,
      publishedAt: row.date,
      dateUnavailable: row.date ? null : 'NSE published no usable date for this announcement.',
      category: 'exchange-filing',
      priority: 1,
      image: null,
      relevance: { score: 1, basis: 'filing', matched: company.symbol ?? company.name ?? null },
    }))
}

/**
 * Pure ranking: feed items in, one company's news out. No fetching, so the matching
 * rules are testable against constructed headlines rather than against whatever the
 * desks happened to publish this morning.
 */
export function rankForCompany(items = [], company = {}, {
  now = Date.now(),
  floor = RELEVANCE_FLOOR,
  filings = [],
  filingSource = SOURCES.announcements,
  recentDays = RECENT_DAYS,
  limit = 12,
} = {}) {
  const matched = []
  for (const raw of items) {
    const hit = bestHit(company, raw)
    if (hit.score >= floor) matched.push(toItem(raw, hit))
  }

  const filed = fromFilings(filings, filingSource, company)
  const cutoff = now - recentDays * DAY

  const recent = []
  const historical = []
  for (const item of [...filed, ...matched]) {
    const when = at(item)
    // An item with no date cannot be called recent. It goes to context, dated
    // unavailable, rather than being assumed fresh.
    ;(when !== null && when >= cutoff ? recent : historical).push(item)
  }

  const order = (a, b) => a.priority - b.priority || (at(b) ?? -Infinity) - (at(a) ?? -Infinity)

  return {
    company: { name: company.name ?? null, symbol: company.symbol ?? null, aliases: company.aliases ?? [] },
    recent: recent.sort(order).slice(0, limit),
    historical: historical.sort(order).slice(0, limit),
    window: {
      recentDays,
      from: new Date(cutoff).toISOString().slice(0, 10),
      to: new Date(now).toISOString().slice(0, 10),
    },
    scanned: items.length,
    matchedFromFeeds: matched.length,
    filingsCarried: filed.length,
    floor,
    priority: PRIORITY.map(({ category, rank, why }) => ({ category, rank, why })),
    note: 'Ordered by subject, not by clock: exchange filings first, then regulatory events, results, orders, management commentary, institutional activity, corporate actions, industry developments, and general coverage last. Every item is quoted from its publisher with the date it carried.',
    unavailable:
      matched.length + filed.length === 0
        ? 'No item in the window named this company. These are market-wide desks with a short window, so a company outside the index can go a long time without appearing on them.'
        : null,
    gaps: UNAVAILABLE,
  }
}

/** Fetch, then rank. The only function here that touches the network. */
export async function companyNews(company, options = {}) {
  const items = await fetchFeedItems().catch(() => [])
  return { ...rankForCompany(items, company, options), feeds: feedStatus() }
}
