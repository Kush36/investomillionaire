// Price history, the spine of everything technical.
//
// NSE's own per-symbol endpoints are closed: www.nseindia.com/api/quote-equity and
// /api/historical/* answer 403 and 503 to a server, and no header or cookie trick
// beats it because the block is a path rule at the CDN. The archive host is open but
// serves one file per trading day for the whole market, which means backfilling six
// years costs about fifteen hundred requests before a single chart can be drawn.
//
// Upstox publishes daily, weekly and monthly candles from an endpoint that needs no
// key, no account and no OAuth. That is the whole multi-timeframe requirement from
// one call per timeframe, so it is the primary source and the bhavcopy archive stays
// in reserve as the audit trail.
//
// Note the version: v2 rejects a long date range with UDAPI1148, v3 takes a unit and
// an interval and accepts the full history.

const CANDLES = 'https://api.upstox.com/v3/historical-candle'
const INSTRUMENTS = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const INSTRUMENT_TTL = 24 * 60 * 60 * 1000
const CANDLE_TTL = 6 * 60 * 60 * 1000

let instruments = { at: 0, byIsin: new Map() }
const candleCache = new Map()

/** ISIN to Upstox instrument key, from the published instrument master. */
export async function loadInstruments() {
  if (Date.now() - instruments.at < INSTRUMENT_TTL && instruments.byIsin.size) return instruments.byIsin

  const res = await fetch(INSTRUMENTS, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) })
  if (!res.ok) throw new Error(`Upstox instrument master responded ${res.status}`)

  // The file is gzip; fetch decompresses it when the header says so, and Node's
  // DecompressionStream handles it when the header does not.
  let text
  const encoding = res.headers.get('content-encoding') || ''
  if (encoding.includes('gzip')) {
    text = await res.text()
  } else {
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'))
    text = await new Response(stream).text()
  }

  const byIsin = new Map()
  for (const row of JSON.parse(text)) {
    if (row.segment !== 'NSE_EQ' || row.instrument_type !== 'EQ' || !row.isin) continue
    // One ISIN can list more than once; the first EQ row is the ordinary listing.
    if (!byIsin.has(row.isin)) byIsin.set(row.isin, row.instrument_key)
  }
  if (!byIsin.size) throw new Error('Upstox instrument master parsed to zero equities')

  instruments = { at: Date.now(), byIsin }
  return byIsin
}

const UNITS = {
  daily: { unit: 'days', interval: 1, years: 6 },
  weekly: { unit: 'weeks', interval: 1, years: 12 },
  monthly: { unit: 'months', interval: 1, years: 20 },
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

/**
 * OHLCV for one ISIN on one timeframe, oldest bar first.
 *
 * Upstox returns newest first; every indicator here assumes chronological order, so
 * the reversal happens once, at the boundary, rather than in each caller.
 */
export async function candles(isin, timeframe = 'daily', { asOf = new Date() } = {}) {
  const spec = UNITS[timeframe]
  if (!spec) throw new Error(`Unknown timeframe: ${timeframe}`)

  const key = `${isin}:${timeframe}:${isoDate(asOf)}`
  const hit = candleCache.get(key)
  if (hit && Date.now() - hit.at < CANDLE_TTL) return hit.bars

  const instrumentKey = (await loadInstruments()).get(isin)
  if (!instrumentKey) return { bars: [], unavailable: `No Upstox instrument for ISIN ${isin}` }

  const from = new Date(asOf)
  from.setFullYear(from.getFullYear() - spec.years)

  const url = `${CANDLES}/${encodeURIComponent(instrumentKey)}/${spec.unit}/${spec.interval}/${isoDate(asOf)}/${isoDate(from)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { bars: [], unavailable: `Price source responded ${res.status}`, detail: body.slice(0, 160) }
  }

  const json = await res.json()
  const raw = json?.data?.candles ?? []

  const bars = raw
    .map((c) => ({
      date: c[0].slice(0, 10),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }))
    .filter((b) => Number.isFinite(b.close) && b.close > 0)
    .reverse()

  const result = { bars, source: { name: 'Upstox historical candles', url: 'https://upstox.com/developer/api-documentation/' } }
  candleCache.set(key, { at: Date.now(), bars: result })
  return result
}

/**
 * Candles are as-traded and unadjusted, and a split or bonus puts a step in the
 * series that every indicator then reads as a crash. There is no free corporate
 * action feed here, so rather than silently computing on a broken series this
 * flags the discontinuities and lets the report say the series is suspect.
 *
 * Calibrated at 20% on a log return: roughly two flags a day across the whole
 * market, which is small enough to be worth reading. A 10% threshold flags ordinary
 * small-cap movement.
 */
export function unexplainedJumps(bars, threshold = 0.2) {
  const jumps = []
  for (let i = 1; i < bars.length; i++) {
    const move = Math.log(bars[i].close / bars[i - 1].close)
    if (Math.abs(move) > threshold) {
      jumps.push({
        date: bars[i].date,
        from: bars[i - 1].close,
        to: bars[i].close,
        movePercent: Number(((Math.exp(move) - 1) * 100).toFixed(1)),
        // Deliberately not called a split. It may be one, or it may be news.
        note: 'Unexplained gap. Possible corporate action; the series may be unadjusted across this date.',
      })
    }
  }
  return jumps
}
