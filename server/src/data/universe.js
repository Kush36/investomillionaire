// The listed universe, and the resolver that turns what a person typed into one
// company.
//
// This is deliberately NOT built on the fuzzy matcher in gmp.js. That one scores on
// shared distinctive words, which is fine for reconciling two spellings of the same
// IPO but wrong here: "Indian Bank" and "Bank of India" share every word after the
// noise list is removed, so it returns the wrong company at maximum confidence. It
// also drops tokens of three characters or fewer, which loses TCS, ITC and LT.
//
// Analysing the wrong company is the worst thing this feature can do, so the rules
// here are: exact identifiers win outright, nothing below a floor is a match, and
// two plausible candidates stop the pipeline and ask rather than picking one.

const EQUITY_LIST = 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv'
const CACHE_MS = 24 * 60 * 60 * 1000

let cache = { at: 0, rows: [], bySymbol: new Map(), byIsin: new Map() }

// nsearchives is a plain file host with no bot protection, unlike www.nseindia.com,
// whose /api/quote-equity and /api/historical paths answer 403 to everything.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/)
  const cols = header.split(',').map((c) => c.trim())
  return lines.map((line) => {
    const cells = line.split(',').map((c) => c.trim())
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']))
  })
}

export async function loadUniverse() {
  if (Date.now() - cache.at < CACHE_MS && cache.rows.length) return cache

  const res = await fetch(EQUITY_LIST, {
    headers: { 'User-Agent': UA, Referer: 'https://www.nseindia.com/' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`NSE equity list responded ${res.status}`)

  const rows = parseCsv(await res.text())
    .map((r) => ({
      symbol: r.SYMBOL,
      name: r['NAME OF COMPANY'],
      series: r.SERIES,
      isin: r['ISIN NUMBER'],
      listedOn: r['DATE OF LISTING'] || null,
      faceValue: Number(r['FACE VALUE']) || null,
    }))
    // EQ is ordinary equity. BE is trade-for-trade surveillance, SM and ST are the
    // SME boards; they are real listings but they are not what someone searching
    // "Reliance" means, so they rank below EQ rather than being dropped.
    .filter((r) => r.symbol && r.isin)

  if (!rows.length) throw new Error('NSE equity list parsed to zero rows')

  cache = {
    at: Date.now(),
    rows,
    bySymbol: new Map(rows.map((r) => [r.symbol.toUpperCase(), r])),
    byIsin: new Map(rows.map((r) => [r.isin.toUpperCase(), r])),
  }
  return cache
}

// Words that carry no identifying information. Kept deliberately short: every word
// removed here is a word that can no longer tell two companies apart.
const NOISE = new Set(['ltd', 'limited', 'the', 'and', 'co', 'corp', 'corporation', 'company'])

function words(value) {
  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !NOISE.has(w))
}

// Ordered-token similarity. Unlike a set intersection this separates "Indian Bank"
// from "Bank of India", because the order of the words is part of the identity.
function similarity(queryWords, targetWords) {
  if (!queryWords.length || !targetWords.length) return 0

  let matched = 0
  let inOrder = 0
  let cursor = -1
  for (const word of queryWords) {
    const at = targetWords.indexOf(word)
    if (at === -1) continue
    matched++
    if (at > cursor) {
      inOrder++
      cursor = at
    }
  }
  if (!matched) return 0

  const coverage = matched / queryWords.length
  const precision = matched / targetWords.length
  const order = inOrder / matched
  // Coverage matters most (did we account for what they typed), then how much of the
  // target is left unexplained, then whether the words appear in the order given.
  return coverage * 0.5 + precision * 0.25 + order * 0.25
}

const SERIES_RANK = { EQ: 0, BE: 1, BZ: 2, SM: 3, ST: 4 }

/**
 * Resolve free text to listed companies.
 *
 * Returns { status, match, candidates }. status is one of:
 *   'exact'     one identifier matched outright, safe to proceed
 *   'ambiguous' more than one plausible company, the caller must ask
 *   'none'      nothing cleared the floor, the caller must say so
 *
 * The caller must never auto-pick from an ambiguous result. That is the whole
 * reason this returns a list instead of a winner.
 */
export async function resolve(query, { limit = 6 } = {}) {
  const { rows, bySymbol, byIsin } = await loadUniverse()
  const raw = String(query ?? '').trim()
  if (!raw) return { status: 'none', match: null, candidates: [] }

  const upper = raw.toUpperCase()

  // An ISIN is unambiguous by construction, so it wins before anything else runs.
  const isinHit = byIsin.get(upper)
  if (isinHit) return { status: 'exact', match: { ...isinHit, confidence: 1, via: 'isin' }, candidates: [] }

  // An exact ticker is what a person who knows the ticker typed.
  const symbolHit = bySymbol.get(upper)
  if (symbolHit) return { status: 'exact', match: { ...symbolHit, confidence: 1, via: 'symbol' }, candidates: [] }

  // People write tickers the way they say them. "L&T" is LT, "M&M" is M&M's own
  // symbol, "BAJAJ AUTO" is BAJAJ-AUTO. Stripping punctuation and spaces catches
  // these without a hand-maintained alias list, which would go stale.
  const squashed = upper.replace(/[^A-Z0-9]/g, '')
  if (squashed && squashed !== upper) {
    const squashHit = bySymbol.get(squashed)
    if (squashHit) return { status: 'exact', match: { ...squashHit, confidence: 1, via: 'symbol' }, candidates: [] }
  }

  const queryWords = words(raw)
  if (!queryWords.length) return { status: 'none', match: null, candidates: [] }

  const scored = rows
    .map((row) => {
      const nameScore = similarity(queryWords, words(row.name))
      // A full company name usually contains its own ticker as a word; give that a
      // modest lift rather than letting it dominate.
      const symbolBonus = words(row.symbol).some((w) => queryWords.includes(w)) ? 0.1 : 0
      return { row, score: Math.min(1, nameScore + symbolBonus) }
    })
    .filter((s) => s.score >= 0.55)
    .sort((a, b) => b.score - a.score || (SERIES_RANK[a.row.series] ?? 9) - (SERIES_RANK[b.row.series] ?? 9))

  if (!scored.length) return { status: 'none', match: null, candidates: [] }

  const candidates = scored.slice(0, limit).map((s) => ({ ...s.row, confidence: Number(s.score.toFixed(3)) }))
  const [best, runnerUp] = candidates

  // A clear winner needs either a perfect name match that nothing else ties, or a
  // high score with daylight behind it. Without the gap test, "Indian Bank" returns
  // Bank of India with total certainty; without the perfect-match rule, typing a
  // company's exact name still stops to ask, which is safety theatre.
  const perfect = best.confidence === 1 && (!runnerUp || runnerUp.confidence < 1)
  const clear = best.confidence >= 0.9 && (!runnerUp || best.confidence - runnerUp.confidence >= 0.15)
  const decisive = perfect || clear

  if (decisive) return { status: 'exact', match: { ...best, via: 'name' }, candidates: candidates.slice(1) }
  return { status: 'ambiguous', match: null, candidates }
}
