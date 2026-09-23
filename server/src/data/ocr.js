// Reading company names off an uploaded screenshot.
//
// There is no local OCR engine in this project and there should not be one. Tesseract
// means a native build or a WASM blob plus forty megabytes of language data, resident,
// on a free Render instance that gets 512 MB and is restarted whenever the host feels
// like it. That is a large permanent cost for a feature that runs a few times a day.
//
// So recognition is a seam with a shipped implementation behind it. The seam is not
// speculative architecture: the shipped recogniser is a third-party HTTP service that
// can change its terms, and the whole point of putting it behind one interface is that
// replacing it is a new object in this file and nothing else.
//
// A recogniser is:
//
//   name        what to credit in the response
//   url         where a reader can go and check what it is
//   maxBytes    its own upload cap, which may be tighter than imageInput.js's
//   configured() whether this deployment can actually use it
//   read(bytes, mime) -> { text, lines }
//
// THE RULE THAT MATTERS MORE THAN ANY OF THIS: when nothing is configured, this module
// says so. It does not fall back to a filename, to a heuristic over the bytes, or to
// anything else that produces a ticker nobody read. Analysing the wrong company is the
// worst failure this product has, and an invented ticker is the shortest path to it.

// The candidate cap. Set by what a holdings screenshot holds rather than by what the
// analyzer can afford, because extraction costs one outbound call no matter how many
// rows come back. The batch endpoint has its own, much tighter cap, and the gap between
// the two is the point: the reader picks.
export const MAX_CANDIDATES = 25

export const NOT_CONFIGURED = {
  error: 'Image reading is not configured on this server.',
  reason:
    'No text recogniser is set up on this deployment, and nothing here will guess at a ticker it did not actually read. A wrong ticker analyses the wrong company, which is worse than no answer.',
  instead: 'Type or paste the names instead. GET /api/analyze/resolve identifies one company per call, and POST /api/analyze/batch analyses a list of ISINs.',
}

/**
 * OCR.space, free tier.
 *
 * Chosen for one reason: it needs no dependency. Native fetch, native FormData, native
 * Blob, all in Node since 18. The free key is rate limited and caps uploads at one
 * megabyte, and both of those facts travel with the recogniser rather than being
 * discovered by a reader whose screenshot was refused.
 *
 * isTable is set because a holdings or watchlist screenshot IS a table, and the engine's
 * table mode is what keeps each row on its own line. Everything downstream assumes one
 * company per line, so this flag is load-bearing rather than a tuning preference.
 */
const OCR_SPACE = {
  name: 'OCR.space',
  url: 'https://ocr.space/ocrapi',
  env: 'OCR_SPACE_API_KEY',
  // The free tier's documented limit. imageInput.js allows five megabytes; the route
  // takes the smaller of the two so the cap quoted to a person is the one that applied.
  maxBytes: 1024 * 1024,
  configured: () => Boolean(process.env.OCR_SPACE_API_KEY),
  async read(bytes, mime) {
    const form = new FormData()
    form.set('file', new Blob([bytes], { type: mime }), `upload.${mime === 'image/png' ? 'png' : 'jpg'}`)
    form.set('language', 'eng')
    form.set('isTable', 'true')
    form.set('scale', 'true')
    // Engine 2 reads screenshot text and mixed case markedly better than the default.
    form.set('OCREngine', '2')

    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: process.env.OCR_SPACE_API_KEY },
      body: form,
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`OCR.space responded ${res.status}`)

    const data = await res.json()
    if (data.IsErroredOnProcessing) {
      const detail = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ') : String(data.ErrorMessage ?? 'no reason given')
      throw new Error(`OCR.space could not read the image: ${detail}`)
    }

    const text = (data.ParsedResults ?? []).map((r) => r.ParsedText ?? '').join('\n')
    return { text, lines: toLines(text) }
  },
}

const recognisers = [OCR_SPACE]

/** Add a recogniser. Exported for the test suite and for whatever replaces OCR.space. */
export function register(recogniser) {
  recognisers.unshift(recogniser)
  return () => {
    const at = recognisers.indexOf(recogniser)
    if (at !== -1) recognisers.splice(at, 1)
  }
}

/** The first recogniser this deployment can actually use, or null. */
export function activeRecogniser() {
  return recognisers.find((r) => r.configured()) ?? null
}

const toLines = (text) =>
  String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

// Column headings and running totals off broker apps and NSE's own tables. Every word
// here is a word that can no longer be read as a company, so the list stays literal:
// it holds headings and aggregates, never anything that could be a name. "TOTAL" is on
// it because it heads a column in every holdings view; no NSE listing resolves from that
// word alone, so the cost of dropping it is nil and the cost of keeping it is a row that
// resolves to nothing and looks like a bug.
const HEADINGS = new Set(
  [
    'symbol', 'name', 'company', 'scrip', 'stock', 'instrument', 'security',
    'ltp', 'last', 'lastprice', 'price', 'cmp', 'close', 'prevclose', 'open', 'high', 'low',
    'chng', 'change', 'chg', 'chng%', '%chng', '%change', 'daychange', 'dayschange', 'net', 'netchg',
    'volume', 'vol', 'qty', 'quantity', 'shares', 'units', 'holding', 'holdings',
    'avg', 'avgcost', 'avgprice', 'buyavg', 'cost', 'invested', 'investedvalue', 'investment',
    'current', 'currentvalue', 'mktvalue', 'marketvalue', 'value', 'total', 'grandtotal', 'subtotal',
    'pnl', 'p&l', 'p/l', 'profit', 'loss', 'gain', 'returns', 'return', 'unrealised', 'realised',
    'portfolio', 'watchlist', 'positions', 'orders', 'summary', 'today', 'day', 'daysp&l',
    'nse', 'bse', 'eq', 'exchange', 'sector', 'industry', 'weight', 'marketcap', 'mcap',
    'bid', 'ask', 'buy', 'sell',
  ].map((h) => h.replace(/[^a-z0-9&/%]/g, ''))
)

const isHeading = (token) => HEADINGS.has(token.toLowerCase().replace(/[^a-z0-9&/%]/g, ''))

// A price, a quantity, a percentage or a signed change. Where one of these starts, the
// name has ended and the table's numbers have begun.
const NUMERIC = /^[+\-−]?[₹$€£]?[\d,]+(?:\.\d+)?%?$/

/**
 * Turn recognised lines into things worth asking universe.js about.
 *
 * Deliberately generous about what it keeps and deliberately useless at deciding what
 * anything IS. Every string this returns goes through resolve() and then in front of a
 * person before a single figure is computed, so a false positive here costs one row the
 * reader ignores, while a false negative costs a holding that silently went missing from
 * their report. The asymmetry sets the rules.
 *
 * Pure: lines in, strings out, no network, no universe lookup.
 */
export function tickerCandidates(lines, { max = MAX_CANDIDATES } = {}) {
  const seen = new Set()
  const out = []

  for (const line of toLines(Array.isArray(lines) ? lines.join('\n') : lines)) {
    const tokens = []
    for (const token of line.split(/\s+/)) {
      // The row's figures start here. A broker app puts the name first and the numbers
      // after it, so everything from this token on is the table, not the company.
      if (NUMERIC.test(token)) break
      const cleaned = token.replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&.]+$/gu, '')
      if (!cleaned) continue
      if (!/\p{L}/u.test(cleaned)) break
      tokens.push(cleaned)
      // A company name is not seven words long. Past this the line is prose, and prose
      // resolves to nothing while costing a lookup.
      if (tokens.length >= 6) break
    }
    if (!tokens.length) continue

    // Dropped only when EVERY token is a heading, which is what a header row and a
    // totals row both look like. Dropping headings token by token instead would quietly
    // shorten Value Industries to Industries, and a truncated name resolves to a
    // different company rather than to nothing.
    if (tokens.every(isHeading)) continue

    const text = tokens.join(' ')
    const letters = (text.match(/\p{L}/gu) ?? []).length
    if (letters < 2 || text.length > 60) continue

    const key = text.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= max) break
  }

  return out
}
