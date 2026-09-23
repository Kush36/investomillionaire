// Who transacted, what the company won, and what it announced.
//
// Four things about these sources were established by probing them, and each one
// removes an option that the shape of the data suggests is available. They drive
// every decision below.
//
//   1. nsearchives.nseindia.com/content/equities/bulk.csv and block.csv are OPEN and
//      unauthenticated, but they carry exactly ONE trading day. The file fetched on
//      20 Sep 2026 held 225 rows, all dated 18-SEP-2026, across 43 symbols. Appending
//      ?date= is accepted and ignored: the byte count does not change. Every dated
//      archive path that would give a history 404s, and the endpoint that serves one
//      on the website is www.nseindia.com/api/historical/*, which is permanently
//      closed to us. So "recent deal activity" is one session deep. That is a ceiling,
//      not a bug, and it is reported as one rather than padded out.
//
//   2. The `subject` field in top-corp-info is a CATEGORY, not a headline. Every order
//      announcement reads exactly "Bagging/Receiving of orders/contracts". There is no
//      value in it and never will be. /api/corporate-announcements is separately open,
//      and its `attchmntText` carries the real prose the company filed. It is the only
//      free surface here that can state an order value, so orders are read from it.
//
//   3. from_date/to_date DO work on corporate-announcements, unlike on
//      corporates-financial-results where fundamentals.js found they return an empty
//      array. Bounding the window matters: LT unbounded is 2634 rows and 1.8MB, the
//      same call bounded to this year is 148 rows and 99KB.
//
//   4. Most order announcements state no rupee value at all. A large issuer publishes
//      a classification word instead, "(Large*)" or "(Ultra-Mega*)", whose rupee band
//      is defined in a footnote inside the attached PDF. That band is NOT converted
//      here. The word is quoted as the company wrote it and the value is reported as
//      not stated, because a band read out of a document this code never fetched is a
//      number this code invented.
//
// One structural rule runs through the whole file. policy.js stops walking an object
// the moment it sees both `source` and `headline`, treating it as attributed
// third-party material. That is load-bearing rather than cosmetic: a bulk deal's side
// is the literal string "BUY", and an NSE corporate action reads "Buy Back", and both
// trip the reg 2(1)(wa)(i) pattern on sight. Quoted material therefore always carries
// that pair, and anything this module writes in its own voice is kept OUTSIDE those
// objects so the gate still reads it.

import { parseNseDate, shareholdingTrend, toCrore, SOURCES as FUNDAMENTAL_SOURCES } from './fundamentals.js'
import { checkPhrase } from './policy.js'

const ARCHIVES = 'https://nsearchives.nseindia.com/content/equities'
const NSE = 'https://www.nseindia.com/api'

// Same browser-ish set fundamentals.js uses, for the same reason: a bare fetch is
// rejected, and the Referer has to name a page that would plausibly issue the call.
const NSE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

export const SOURCES = {
  bulk: {
    name: 'NSE bulk deals, daily disclosure',
    url: 'https://www.nseindia.com/report-detail/display-bulk-and-block-deals',
  },
  block: {
    name: 'NSE block deals, daily disclosure',
    url: 'https://www.nseindia.com/report-detail/display-bulk-and-block-deals',
  },
  announcements: {
    name: 'NSE corporate announcements',
    url: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements',
  },
  corpInfo: FUNDAMENTAL_SOURCES.corpInfo,
}

// The deal files are rewritten once per trading day, after the close, and they are
// market-wide rather than per-symbol. So this is cached by FILE, not by symbol: one
// 22KB fetch answers every company anyone asks about for the next hour.
const DEAL_TTL = 60 * 60 * 1000
const ANNOUNCEMENT_TTL = 6 * 60 * 60 * 1000

const cache = new Map()

async function cached(key, ttl, load) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

// ---------------------------------------------------------------------------
// Fetching. Everything below the "no fetching past this line" marker is pure.
// ---------------------------------------------------------------------------

async function archive(file) {
  const res = await fetch(`${ARCHIVES}/${file}`, {
    headers: { 'User-Agent': NSE_HEADERS['User-Agent'], Referer: 'https://www.nseindia.com/' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`NSE archive responded ${res.status} for ${file}`)
  const text = await res.text()
  // A 404 from this host is a styled HTML page served with a 404, but a misrouted
  // path can also return HTML with a 200. Anything that is not a CSV header is not a
  // deal file, and parsing it would silently yield zero deals for every symbol.
  if (!/^\s*Date\s*,\s*Symbol/i.test(text)) throw new Error(`NSE archive returned no CSV for ${file}`)
  return text
}

/**
 * Both deal files for the latest published trading day.
 *
 * Each file is fetched independently so one failing does not cost the other: block
 * deals are rarer and a day with none can legitimately return a near-empty file,
 * while bulk deals are the denser source.
 *
 * A file that could not be read carries NO `deals` key. An empty array would say the
 * exchange disclosed nothing, which is a different fact from the file never arriving,
 * and every consumer downstream reads the presence of that array as "this file was
 * read". That is the distinction the whole module rests on.
 */
export async function dailyDeals() {
  return cached('deals', DEAL_TTL, async () => {
    const [bulk, block] = await Promise.allSettled([archive('bulk.csv'), archive('block.csv')])
    return {
      bulk: bulk.status === 'fulfilled' ? parseDealCsv(bulk.value, 'bulk') : { unavailable: String(bulk.reason?.message ?? bulk.reason) },
      block: block.status === 'fulfilled' ? parseDealCsv(block.value, 'block') : { unavailable: String(block.reason?.message ?? block.reason) },
      fetchedAt: new Date().toISOString(),
    }
  })
}

const pad = (n) => String(n).padStart(2, '0')
const ddmmyyyy = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`

/**
 * Corporate announcements for one symbol over a bounded window, newest first.
 *
 * Twelve months by default. That is long enough to hold a full year of order inflow
 * and every corporate action a reader would call recent, and short enough that the
 * response stays around a hundred kilobytes instead of approaching two megabytes.
 */
export async function announcements(symbol, { months = 12 } = {}) {
  const to = new Date()
  const from = new Date(to)
  from.setMonth(from.getMonth() - months)

  return cached(`ann:${symbol}:${months}`, ANNOUNCEMENT_TTL, async () => {
    const url =
      `${NSE}/corporate-announcements?index=equities&symbol=${encodeURIComponent(symbol)}` +
      `&from_date=${ddmmyyyy(from)}&to_date=${ddmmyyyy(to)}`
    const res = await fetch(url, {
      headers: { ...NSE_HEADERS, Referer: SOURCES.announcements.url },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`NSE responded ${res.status} for corporate announcements`)
    const raw = await res.json()
    const rows = Array.isArray(raw) ? raw : (raw?.data ?? [])
    return rows
      .map((r) => ({
        at: parseNseDate(r.an_dt) ?? parseNseDate(r.sort_date),
        category: (r.desc ?? '').trim(),
        text: decodeEntities(r.attchmntText ?? ''),
        attachment: r.attchmntFile || null,
      }))
      .filter((r) => r.at)
      .sort((a, b) => b.at.localeCompare(a.at))
  })
}

// ---------------------------------------------------------------------------
// Calculations. Data in, data out, no fetching past this line.
// ---------------------------------------------------------------------------

const unavailable = (why) => ({ value: null, unavailable: why })

function sentence(text) {
  // Same contract fundamentals.js holds itself to. This module writes more prose than
  // most, and a wording change that drifts into advice should fail in this module's
  // own tests rather than in a response body.
  const { ok, violations } = checkPhrase(text)
  if (!ok) throw new Error(`activity.js wrote a non-publishable phrase: ${violations.map((v) => v.why).join(', ')}`)
  return text
}

// NSE ships announcement text with numeric entities in it: the rupee sign arrives as
// &#8377; and apostrophes as &#39;. Decoding first means the money scanner below only
// has to know about one spelling of the rupee sign.
export function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// ---------------------------------------------------------------------------
// Bulk and block deals
// ---------------------------------------------------------------------------

const BULK_COLUMNS = 8 // Date, Symbol, Security, Client, Side, Quantity, Price, Remarks
const BLOCK_COLUMNS = 7 // the same without Remarks

// The two disclosure regimes, in one place, because "were both files read?" is asked
// in three modules and a hard-coded 2 is the kind of constant that outlives its reason.
export const DEAL_FILES = ['bulk', 'block']

/**
 * Parse one deal file.
 *
 * The files are unquoted CSV, and every one of the 225 rows observed split into
 * exactly the expected field count. A client or security name containing a comma
 * would therefore split wrong, and there is no quoting to disambiguate it from a real
 * field break. Such a row is dropped and counted rather than guessed at, because a
 * misaligned row puts a company name in the side column and a price in the quantity.
 *
 * ponytail: positional split, upgrade to a real CSV reader if NSE ever starts quoting.
 */
export function parseDealCsv(text, kind) {
  const expected = kind === 'block' ? BLOCK_COLUMNS : BULK_COLUMNS
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const deals = []
  let malformed = 0

  for (const line of lines.slice(1)) {
    const f = line.split(',').map((c) => c.trim())
    if (f.length !== expected) {
      malformed++
      continue
    }
    const [date, symbol, security, client, side, quantity, price] = f
    const tradedOn = parseNseDate(date)
    const qty = Number(quantity.replace(/,/g, ''))
    const rate = Number(price.replace(/,/g, ''))
    if (!tradedOn || !symbol || !Number.isFinite(qty) || !Number.isFinite(rate)) {
      malformed++
      continue
    }
    deals.push({
      kind,
      tradedOn,
      symbol: symbol.toUpperCase(),
      security,
      client,
      // Kept verbatim as NSE publishes it, which is why every object this ends up
      // inside carries source and headline.
      side: side.toUpperCase(),
      quantity: qty,
      price: rate,
      value: Number((qty * rate).toFixed(2)),
      remarks: expected === BULK_COLUMNS && f[7] && f[7] !== '-' ? f[7] : null,
    })
  }

  return {
    deals,
    malformed,
    tradingDay: deals[0]?.tradedOn ?? null,
  }
}

// Names that identify the counterparty as a pooled investment vehicle or an insurer.
// This reads the DISCLOSED NAME and nothing else. NSE publishes no registration
// category alongside a deal, so a match here is a statement about the words in the
// name, and the many proprietary trading firms in these files are correctly left
// unclassified rather than counted as institutions.
const FUND_LIKE = /\b(mutual fund|asset management|investment trust|pension|provident|insurance|assurance|life ?insurance|amc\b|superannuation|sovereign|endowment|portfolio fund)\b/i

export function classifyClient(name) {
  return FUND_LIKE.test(String(name ?? '')) ? 'named-as-fund-or-insurer' : 'not-identified'
}

const inr = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`
const croreText = (rupees) => `Rs ${Number(toCrore(rupees)).toLocaleString('en-IN')} cr`

/**
 * One transaction per row, across both files.
 *
 * A deal large enough to be a block deal is frequently ALSO published in the bulk
 * file. On 18 Sep 2026 two of ENTERO's three disclosures appeared in both, and
 * concatenating the files reported five deals worth Rs 914 cr where the exchange had
 * disclosed three worth roughly half that. The two files are two disclosure regimes
 * over one order book, not two order books.
 *
 * The key is every published field, so the two PRASID UNO trust rows, which differ
 * only by quantity, stay the two separate disclosures they actually are.
 */
export function mergeDisclosures(bulk = [], block = []) {
  const byKey = new Map()
  for (const deal of [...bulk, ...block]) {
    const key = `${deal.tradedOn}|${deal.symbol}|${deal.client}|${deal.side}|${deal.quantity}|${deal.price}`
    const seen = byKey.get(key)
    if (seen) {
      if (!seen.disclosedAs.includes(deal.kind)) seen.disclosedAs.push(deal.kind)
    } else {
      byKey.set(key, { ...deal, disclosedAs: [deal.kind] })
    }
  }
  return [...byKey.values()]
}

/** One deal, in the attributed shape policy.js recognises. */
function attributeDeal(deal) {
  return {
    source: deal.kind === 'block' ? SOURCES.block : SOURCES.bulk,
    // The disclosure line as the exchange published it. Reconstructed from the parsed
    // fields rather than the raw CSV line so the numbers read the way a person writes
    // them, but every value in it came out of the file.
    headline: `${deal.tradedOn}: ${deal.client} ${deal.side} ${deal.quantity.toLocaleString('en-IN')} shares of ${deal.security} at ${inr(deal.price)}`,
    tradedOn: deal.tradedOn,
    client: deal.client,
    side: deal.side,
    quantity: deal.quantity,
    price: deal.price,
    value: deal.value,
    // Which disclosure regime carried it. A deal in both is one transaction.
    disclosedAs: deal.disclosedAs ?? [deal.kind],
    clientReading: classifyClient(deal.client),
    remarks: deal.remarks,
  }
}

// Said once, on every report that carries a deal, because the single most likely
// misreading of this section is that a disclosed transaction predicts the next one.
const DEAL_CAVEAT =
  'A bulk or block deal is an exchange disclosure of one named client transacting on one day. It records what was transacted and at what price. It does not record why, and it carries no implication for the price from here.'

/**
 * Institutional activity: what was disclosed on the latest trading day, what the
 * shareholding pattern has done over several quarters, and what neither can answer.
 *
 * The two halves answer different questions and are deliberately not merged into one
 * number. A deal file is a single session at client-name granularity. A shareholding
 * pattern is a quarter-end census with no names in it. Averaging them would produce a
 * figure that describes neither.
 */
export function institutionalActivity({ deals, info, symbol, unavailable: fetchFailure = null }) {
  const target = String(symbol ?? '').toUpperCase()
  const bulk = (deals?.bulk?.deals ?? []).filter((d) => d.symbol === target)
  const block = (deals?.block?.deals ?? []).filter((d) => d.symbol === target)
  const all = mergeDisclosures(bulk, block)

  // A file that arrived and disclosed nothing has a `deals` array; a file that never
  // arrived has none. Without this the two are one empty list, and the report tells a
  // reader the exchange disclosed nothing when what actually happened is that nobody
  // asked the exchange successfully.
  const filesUnavailable = DEAL_FILES.map((file) =>
    Array.isArray(deals?.[file]?.deals)
      ? null
      : { file, why: deals?.[file]?.unavailable ?? fetchFailure ?? 'The NSE deal file was not read.' }
  ).filter(Boolean)
  const anyRead = filesUnavailable.length < DEAL_FILES.length

  const tradingDay = deals?.bulk?.tradingDay ?? deals?.block?.tradingDay ?? null
  const notes = []

  if (!anyRead) {
    notes.push(
      sentence(
        `Neither NSE deal file could be read, so whether any bulk or block deal was disclosed in ${target} is not known. A file that could not be read is not evidence that nothing was disclosed, and no count is reported from it.`
      )
    )
  } else if (!all.length) {
    notes.push(
      sentence(
        tradingDay
          ? `NSE disclosed no bulk or block deal in ${target} on ${tradingDay}, the latest trading day these files cover. A deal is disclosed only when a single client crosses the exchange threshold, so on most days most companies have none.`
          : `The deal files carried no rows for any company, so the latest trading day they cover is not stated and no deal disclosure is reported for ${target}.`
      )
    )
  } else {
    const purchases = all.filter((d) => d.side === 'BUY')
    const disposals = all.filter((d) => d.side === 'SELL')
    const shares = (rows) => rows.reduce((sum, d) => sum + d.quantity, 0)
    const parts = []
    if (purchases.length) parts.push(`${purchases.length} purchase${purchases.length === 1 ? '' : 's'} totalling ${shares(purchases).toLocaleString('en-IN')} shares`)
    if (disposals.length) parts.push(`${disposals.length} disposal${disposals.length === 1 ? '' : 's'} totalling ${shares(disposals).toLocaleString('en-IN')} shares`)

    notes.push(
      sentence(
        `NSE disclosed ${all.length} deal${all.length === 1 ? '' : 's'} in ${target} on ${tradingDay}: ${parts.join(' and ')}, with a disclosed value of ${croreText(all.reduce((sum, d) => sum + d.value, 0))} in total.`
      )
    )

    const funds = all.filter((d) => classifyClient(d.client) === 'named-as-fund-or-insurer')
    if (funds.length) {
      notes.push(
        sentence(
          `${funds.length} of those counterparties ${funds.length === 1 ? 'is' : 'are'} named in the disclosure as a fund or an insurer. That is a reading of the name NSE published, not a check of the client's registration category, which the deal file does not carry.`
        )
      )
    }
  }

  if (anyRead && filesUnavailable.length) {
    notes.push(
      sentence(
        `The NSE ${filesUnavailable.map((f) => f.file).join(' and ')} deal file could not be read, so a deal disclosed only there is missing from this list.`
      )
    )
  }

  const shareholding = shareholdingTrend(info)

  return {
    symbol: target,
    // The window is the headline constraint on this whole section, so it is stated
    // rather than left for a reader to infer from a single date.
    window: {
      tradingDay,
      covers: 'one trading day',
      why: 'NSE publishes bulk and block deals as a file holding the latest trading day only. No free surface serves a dated history of them.',
    },
    latest: all.map(attributeDeal).sort((a, b) => b.value - a.value),
    // `distinct` is the number of transactions. The other three are row counts in the
    // published files, and they deliberately do not add up to it.
    //
    // Null rather than a row of zeros when no file was read. A zero here is a count of
    // what the exchange disclosed, and counting what was never fetched is the exact
    // move this module exists to refuse.
    counts: anyRead
      ? {
          distinct: all.length,
          bulk: bulk.length,
          block: block.length,
          inBoth: all.filter((d) => d.disclosedAs.length > 1).length,
        }
      : null,
    malformedRows: anyRead ? (deals?.bulk?.malformed ?? 0) + (deals?.block?.malformed ?? 0) : null,
    // Per file, so a partial read is visible as a partial read.
    filesUnavailable,
    // Set only when NOTHING was read. A consumer asking "may I score this?" needs the
    // all-or-nothing answer, and deriving it from the array's length everywhere is how
    // one caller gets the arithmetic wrong.
    disclosuresUnavailable: anyRead ? null : filesUnavailable.map((f) => `${f.file}: ${f.why}`).join('; '),
    // The multi-quarter picture, computed in fundamentals.js and surfaced here rather
    // than recomputed, so the two pages can never disagree about a percentage.
    shareholding,
    fiiDiiSplit: unavailable(
      'NSE publishes public shareholding as a single percentage. The foreign and domestic institutional split sits in the regulation 31 shareholding pattern PDF, which is not exposed as structured data on any free surface.'
    ),
    notes,
    caveat: sentence(DEAL_CAVEAT),
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

// NSE's own announcement categories for an order win. Both spellings are live: the
// long one is current, the short one appears on filings up to about 2022.
const ORDER_CATEGORY = /^(bagging\/receiving of orders\/contracts|bagging orders\/contract|awarding orders\/contract)$/i

// A category alone misses the order wins a company files under Press Release, which
// for some issuers is most of them. The text test is deliberately narrow: it wants a
// winning verb next to an order noun, so a press release ABOUT a customer's order
// book does not qualify.
const ORDER_TEXT = /\b(?:wins?|won|secure[sd]?|bags?|bagged|receive[sd]?|award(?:ed)?|letter of (?:award|intent)|order intake)\b[^.]{0,80}\b(?:order|orders|contract|contracts|project|loa\b)\b|\b(?:order|orders|contract|contracts)\b[^.]{0,40}\b(?:won|secured|bagged|awarded|received)\b/i

const MULTIPLIER = {
  crore: 1e7, crores: 1e7, cr: 1e7,
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5,
  million: 1e6, millions: 1e6, mn: 1e6,
  billion: 1e9, billions: 1e9, bn: 1e9,
}

// Every spelling observed across 5,981 real announcement texts: "Rs. 1,060 Crore",
// "Rs.1329 Crore", "Rs 9,500-crore", "₹ 500 crore", "US$ 107million", "$8.7 bn",
// "USD 700 mn". The unit group is optional so that a bare "Rs. 38" is still captured
// and can then be rejected for having no unit, rather than silently missed.
const MONEY = /(rs\.?|inr|₹|usd|us\s?\$|\$)\s*([\d,]+(?:\.\d+)?)\s*[-–\s]*(crores?|cr\b|lakhs?|lacs?|millions?|mn\b|billions?|bn\b)?/gi

// What follows a figure and proves it is a unit rate rather than an aggregate.
// "Rs. 10 lakh each aggregating to Rs. 1400 crore" is one debenture's face value next
// to the issue total, and reading the first as the total understates it by 14,000x.
const PER_UNIT = /^\s*(?:each\b|apiece\b|per\s+(?:equity\s+)?share|per\s+share|per\s+unit|per\s+debenture)/i

const RUPEE_MARKER = /^(rs|inr|₹)/i

/**
 * Every monetary aggregate stated in a piece of announcement text.
 *
 * Figures with no unit are dropped. "Rs. 1500" in a headline could be crore, could be
 * a share price, and choosing between them is exactly the guess this file exists to
 * refuse. Figures that a following word marks as a rate per share or per unit are
 * dropped for the same reason.
 */
export function statedAmounts(text) {
  const prose = decodeEntities(text)
  const found = []

  for (const m of prose.matchAll(MONEY)) {
    const [whole, marker, digits, unit] = m
    if (!unit) continue
    if (PER_UNIT.test(prose.slice(m.index + whole.length))) continue

    const amount = Number(digits.replace(/,/g, ''))
    const scale = MULTIPLIER[unit.toLowerCase()]
    if (!Number.isFinite(amount) || !scale) continue

    found.push({
      currency: RUPEE_MARKER.test(marker) ? 'INR' : 'foreign',
      // Quoted exactly as it appears, so a reader can find it in the filing.
      asStated: whole.trim(),
      value: amount * scale,
    })
  }

  // The same figure often appears twice in one text, once in a subject line and once
  // in the body. Two mentions of one number is one number.
  const seen = new Set()
  return found.filter((f) => {
    const key = `${f.currency}:${f.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Companies that publish a size band instead of a figure. The band's rupee range is
// defined in a footnote inside the attached PDF, which this code does not read, so
// the word is quoted and never converted.
const CLASSIFICATION = /\(?\b(ultra[- ]?mega|significant|large|major|mega)\b\*/i

/**
 * The order value an announcement states, or the reason there isn't one.
 *
 * Refusing to grade when several figures are present is the whole point rather than a
 * limitation. Real texts contain "loss of Rs 150 crore to Rs 200 crore" (a range),
 * "Rs.937 Crore ... Rs.700 Crore" (two separate order sets in one filing) and a
 * demerger scheme carrying seven unrelated figures. Picking the largest would report
 * a number that is in the document and still answer the wrong question.
 */
export function extractOrderValue(text) {
  const amounts = statedAmounts(text)
  const rupees = amounts.filter((a) => a.currency === 'INR')
  const foreign = amounts.filter((a) => a.currency === 'foreign')
  const band = CLASSIFICATION.exec(decodeEntities(text))
  const classification = band ? band[1] : null

  if (rupees.length === 1) {
    return { value: rupees[0].value, currency: 'INR', asStated: rupees[0].asStated, stated: true, classification }
  }
  if (rupees.length > 1) {
    return {
      ...unavailable(
        `The announcement states ${rupees.length} separate rupee figures (${rupees.map((r) => r.asStated).join(', ')}), and which of them is the order total is not determinable from the text.`
      ),
      allStated: rupees,
      classification,
    }
  }
  if (foreign.length) {
    return {
      ...unavailable(
        `The value is stated in a foreign currency (${foreign.map((f) => f.asStated).join(', ')}). No exchange rate source is available here, so it is not converted to rupees or graded.`
      ),
      allStated: foreign,
      classification,
    }
  }
  return {
    ...unavailable(
      classification
        ? `The announcement states no value. The company classified the order as "${classification}", a size band it defines in its own press release; that band is not converted to a figure here.`
        : 'The announcement states no order value.'
    ),
    classification,
  }
}

/**
 * Materiality thresholds, as a percentage of trailing annual revenue.
 *
 * The moderate threshold is not invented. SEBI's LODR regulation 30, schedule III
 * part A, sets the omnibus materiality test for an event a listed company must
 * disclose at two percent of turnover, so an order below it is one the company would
 * not have had to announce on size alone. The high threshold is this report's own
 * line and is labelled as such wherever it is published.
 */
export const MATERIALITY = { highPercent: 10, moderatePercent: 2 }

export function gradeMateriality(orderValue, trailingRevenue) {
  if (orderValue == null) return unavailable('The announcement states no order value, so it cannot be measured against revenue.')
  if (trailingRevenue == null || !(trailingRevenue > 0)) {
    return unavailable('No trailing twelve-month revenue figure is available for this company, so the order cannot be graded against it.')
  }
  const percent = Number(((orderValue / trailingRevenue) * 100).toFixed(2))
  const grade = percent >= MATERIALITY.highPercent ? 'high' : percent >= MATERIALITY.moderatePercent ? 'moderate' : 'low'
  return { grade, percentOfRevenue: percent, orderValue, trailingRevenue, thresholds: MATERIALITY }
}

/**
 * Recently received orders, graded.
 *
 * `trailingRevenue` is passed in rather than fetched: it is fundamentals.ttm(series,
 * 'revenue').value, and this module does not get to decide which reporting basis that
 * series was built on.
 *
 * `rows` is null when the feed was not read and an array when it was. Those are
 * different facts and the difference is the reason this function has two exits: a feed
 * that failed produces no count at all, because "no order was announced" is a claim
 * about the company and a failed fetch is a claim about the network.
 */
export function orders(rows, { trailingRevenue = null, unavailable: feedUnavailable = null } = {}) {
  const why = feedUnavailable ?? (rows == null ? 'The NSE corporate announcement feed was not read.' : null)
  if (why) {
    return {
      unavailable: why,
      found: [],
      // Not a row of zeros. A zero is a measurement, and nothing was measured.
      counts: null,
      trailingRevenue,
      thresholds: MATERIALITY,
      notes: [
        sentence(
          'The corporate announcement feed could not be read, so this report makes no statement about orders announced in the window. A feed that failed is not evidence that nothing was filed, and nothing here is scored on it.'
        ),
      ],
    }
  }

  const matched = rows.filter((r) => ORDER_CATEGORY.test(r.category) || ORDER_TEXT.test(r.text))

  const found = matched.map((r) => {
    const value = extractOrderValue(r.text)
    const materiality = gradeMateriality(value.value, trailingRevenue)
    return {
      source: SOURCES.announcements,
      // The filing's own words. Everything in this object is the company's statement
      // or a measurement of it, which is why it is attributed as a whole.
      headline: r.text,
      at: r.at,
      category: r.category,
      attachment: r.attachment,
      value,
      materiality,
    }
  })

  const notes = []
  const graded = found.filter((o) => o.materiality.grade)
  const ungraded = found.length - graded.length

  if (!found.length) {
    notes.push(sentence('No order announcement was filed in the window this report covers.'))
  } else {
    notes.push(
      sentence(
        `${found.length} order announcement${found.length === 1 ? '' : 's'} were filed in the window, of which ${graded.length} state a value that could be measured against revenue.`
      )
    )
    if (ungraded) {
      notes.push(
        sentence(
          `${ungraded} state no usable value and are listed ungraded with the reason. An announcement without a figure is not a small order; it is an unmeasured one.`
        )
      )
    }
    if (trailingRevenue == null) {
      notes.push(sentence('No trailing twelve-month revenue was available, so no order in this list could be graded for materiality.'))
    }
  }

  return {
    found: found.sort((a, b) => b.at.localeCompare(a.at)),
    counts: {
      total: found.length,
      graded: graded.length,
      high: graded.filter((o) => o.materiality.grade === 'high').length,
      moderate: graded.filter((o) => o.materiality.grade === 'moderate').length,
      low: graded.filter((o) => o.materiality.grade === 'low').length,
    },
    trailingRevenue,
    thresholds: MATERIALITY,
    notes,
  }
}

// ---------------------------------------------------------------------------
// Corporate events
// ---------------------------------------------------------------------------

/**
 * Event classification, in priority order.
 *
 * The order is not cosmetic. "demerger" contains "merger", so demerger has to be
 * tested first or every demerger in the archive is filed as a merger. Buyback is
 * tested before fund raising for the same class of reason: both are capital events
 * and a buyback filing routinely mentions the securities it will extinguish.
 *
 * `category` matches NSE's own desc field, which is already a classification and is
 * far more reliable than prose. `text` is the fallback for the large number of real
 * events filed under the catch-all categories Press Release and Updates.
 *
 * A rule marked `weak` names a category that is a CONTAINER rather than a
 * classification. "Scheme of Arrangement" is the one that matters: a scheme can be a
 * merger, a demerger, a capital reduction or a plain reorganisation, and the live
 * feed files all of them under that one label. It is therefore tested after the text
 * pass, so a scheme whose own words say demerger is reported as a demerger and a
 * scheme that says nothing is reported as what it is rather than guessed at.
 */
const EVENT_RULES = [
  { type: 'demerger', category: /demerger/i, text: /\bde-?merger\b|\bdemerge[ds]?\b/i },
  { type: 'merger', category: /amalgamation|^merger/i, text: /\bamalgamat(?:ion|ed|ing)\b|\bmerger\b|\bmerged with\b/i },
  // Acquiring and disposing are mirror images, not the same event. Filing a
  // divestment as an acquisition would invert the direction of the only fact in it.
  { type: 'acquisition', category: /^acquisition|update-acquisition/i, text: /\bacquisition of\b|\bacquire[sd]?\b[^.]{0,60}\b(?:stake|equity|shares|business)\b/i },
  { type: 'divestment', category: /sale or disposal|diversification\/disinvestment/i, text: /\bdivest(?:ed|ment|iture)?\b|\bdisposal of\b[^.]{0,60}\b(?:stake|equity|shares|business|subsidiary)\b|\bsold its (?:entire )?(?:stake|shareholding)\b/i },
  { type: 'buyback', category: /buy ?back/i, text: /\bbuy ?back\b/i },
  { type: 'bonus', category: /^bonus|allotment of bonus/i, text: /\bbonus (?:issue|shares)\b|\bbonus in the ratio\b/i },
  { type: 'split', category: /split|sub-?division/i, text: /\b(?:stock|share) split\b|\bsub-?division of (?:equity )?shares\b|\bsplit of (?:equity )?shares\b/i },
  { type: 'dividend', category: /dividend/i, text: /\b(?:final|interim|special) dividend\b|\brecommended a dividend\b|\bdeclared .{0,20}dividend\b/i },
  { type: 'fund-raising', category: /issue of (?:securities|shares|equity|foreign currency)|qualified institutional placement|rights issue|fccb|preferential/i, text: /\bqualified institutional placement\b|\brights issue\b|\bpreferential (?:allotment|issue)\b|\bproposes to issue\b[^.]{0,80}\b(?:debentures|bonds|shares)\b|\bfund rais(?:e|ing)\b/i },
  { type: 'capacity-expansion', category: /^incorporation|joint venture|memorandum of understanding/i, text: /\bcapacity expansion\b|\bexpansion of capacity\b|\bgreenfield\b|\bbrownfield\b|\bnew (?:plant|facility|unit|line)\b|\bcommission(?:ed|ing) of\b[^.]{0,50}\b(?:plant|facility|unit|capacity)\b|\bexpand(?:ing|ed)? (?:its )?capacity\b/i },
  { type: 'management-change', category: /change in (?:director|management|managing director|company secretary|directorship)|^appointment|^resignation|^cessation|^retirement|^re-?appointment|demise|key managerial/i, text: /\b(?:appointed|resigned|stepped down|ceased to be)\b[^.]{0,60}\b(?:director|chairman|managing director|chief executive|cfo|company secretary)\b/i },
  {
    type: 'scheme-of-arrangement',
    weak: true,
    category: /scheme of arrangement|court convened meeting|nclt|other restructuring|corp restructuring/i,
    text: /\bscheme of arrangement\b/i,
  },
]

export function classifyEvent({ category = '', text = '' } = {}) {
  const prose = decodeEntities(text)
  const strong = EVENT_RULES.filter((r) => !r.weak)

  // NSE's own category beats loose prose, so it is tried first. A container category
  // is the exception and waits until the text has had its say.
  for (const rule of strong) {
    if (rule.category.test(category)) return { type: rule.type, matchedOn: 'category' }
  }
  for (const rule of strong) {
    if (rule.text.test(prose)) return { type: rule.type, matchedOn: 'text' }
  }
  for (const rule of EVENT_RULES.filter((r) => r.weak)) {
    if (rule.category.test(category) || rule.text.test(prose)) return { type: rule.type, matchedOn: 'category' }
  }
  return null
}

/**
 * Corporate events, dated and typed, from both surfaces that carry them.
 *
 * `actions` is top-corp-info's corporate_actions list, whose purpose strings are the
 * exchange's own wording for an ex-date event ("Bonus 1:1", "Buy Back"). `rows` is
 * the announcement feed. Both are quoted and attributed; neither is interpreted.
 * There is deliberately no impact field: what a demerger does to a share price is not
 * something this file can measure, so it does not claim to.
 */
export function corporateEvents(rows, info, { unavailable: feedUnavailable = null } = {}) {
  const events = []

  // Same null-versus-empty rule as orders(). The corporate action calendar comes from a
  // different document, so a dead announcement feed leaves a PARTIAL list rather than
  // an empty one, and the note below says which.
  const why = feedUnavailable ?? (rows == null ? 'The NSE corporate announcement feed was not read.' : null)

  for (const r of why ? [] : rows) {
    const hit = classifyEvent(r)
    if (!hit) continue
    events.push({
      source: SOURCES.announcements,
      headline: r.text || r.category,
      at: r.at,
      type: hit.type,
      classifiedOn: hit.matchedOn,
      category: r.category,
      attachment: r.attachment,
    })
  }

  for (const a of info?.corporate_actions?.data ?? []) {
    const exDate = parseNseDate(a.exdate)
    const purpose = String(a.purpose ?? '').trim()
    if (!exDate || !purpose) continue
    const hit = classifyEvent({ category: purpose, text: purpose })
    if (!hit) continue
    events.push({
      source: SOURCES.corpInfo,
      // NSE writes this as "Buy Back", two words, which trips the policy gate on
      // sight. It is safe here only because this object is attributed.
      headline: purpose,
      at: exDate,
      type: hit.type,
      classifiedOn: 'corporate-action',
      exDate,
    })
  }

  const byType = {}
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1

  const classified = sentence(
    `${events.length} corporate events were classified in the window: ${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ')}.`
  )

  const notes = []
  if (why) {
    notes.push(
      sentence(
        "The corporate announcement feed could not be read. Only NSE's corporate action calendar was classified, so this is not a complete list of what was filed in the window."
      )
    )
    if (events.length) notes.push(classified)
  } else if (events.length) {
    notes.push(classified)
  } else {
    notes.push(sentence('No corporate event of a classified type was filed in the window this report covers.'))
  }

  return {
    events: events.sort((a, b) => b.at.localeCompare(a.at)),
    byType,
    announcementsUnavailable: why,
    notes,
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * The whole activity section for one company.
 *
 * Each source is settled independently. Announcements failing should not cost the
 * deal disclosure, and neither should cost the shareholding trend, which comes from
 * data the caller already fetched.
 */
export async function activityReport(symbol, { info = null, trailingRevenue = null, months = 12 } = {}) {
  const [dealsResult, announcementsResult] = await Promise.allSettled([dailyDeals(), announcements(symbol, { months })])

  // Nothing is settled into the shape of a successful empty answer. A rejected fetch
  // becomes null plus a reason, and every function below treats null as "not known"
  // and [] as "read, and it held nothing". Those two used to be the same value here,
  // which is how a network failure came to be published as a fact about a company and
  // then scored as one.
  const deals = dealsResult.status === 'fulfilled' ? dealsResult.value : null
  const dealsUnavailable =
    dealsResult.status === 'rejected'
      ? `The NSE bulk and block deal files could not be read: ${dealsResult.reason?.message ?? dealsResult.reason}`
      : null

  const rows = announcementsResult.status === 'fulfilled' ? announcementsResult.value : null
  const announcementsUnavailable =
    announcementsResult.status === 'rejected'
      ? `The NSE corporate announcement feed could not be read: ${announcementsResult.reason?.message ?? announcementsResult.reason}`
      : null

  const institutional = institutionalActivity({ deals, info, symbol, unavailable: dealsUnavailable })

  const failures = [
    // Taken from the block rather than restated, so a single file failing is listed
    // once and reads the same in both places.
    ...institutional.filesUnavailable.map((f) => `The NSE ${f.file} deal file could not be read: ${f.why}`),
    announcementsUnavailable,
  ].filter(Boolean)

  return {
    symbol: String(symbol).toUpperCase(),
    window: { months, from: rows?.[rows.length - 1]?.at ?? null, to: rows?.[0]?.at ?? null, announcementsUnavailable },
    institutional,
    orders: orders(rows, { trailingRevenue, unavailable: announcementsUnavailable }),
    events: corporateEvents(rows, info, { unavailable: announcementsUnavailable }),
    unavailable: UNAVAILABLE,
    failures,
    fetchedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// What this data cannot answer
// ---------------------------------------------------------------------------

/**
 * Named gaps, with the reason for each, in the same spirit as the list in
 * fundamentals.js. None of these is waiting on a better parser.
 */
export const UNAVAILABLE = [
  {
    field: 'FII and DII buying and selling',
    why: 'The daily FII/DII figure NSE publishes is a market-wide total across all securities. There is no free per-company split, and the institutional breakdown of a single company sits in a regulation 31 PDF that is not exposed as structured data.',
  },
  {
    field: 'Bulk and block deal history',
    why: 'NSE serves these as a file containing the latest trading day only. Requesting an earlier date is accepted and ignored, and no dated archive of them is published free, so activity before the most recent session is not reported.',
  },
  {
    field: 'Order book and total order inflow',
    why: 'An order book total is disclosed in an investor presentation in whatever format the company chooses. Only individually announced order wins are machine-readable, so the orders listed here are a floor on inflow, not a measure of it.',
  },
  {
    field: 'Order value where the company states a size band',
    why: 'Some issuers classify an order as significant, large, major, mega or ultra-mega instead of publishing a figure. The rupee range for each band is defined in a footnote inside the attached PDF and is not converted here.',
  },
  {
    field: 'Order value stated in a foreign currency',
    why: 'No exchange rate source is available to this analyzer, so a contract priced in dollars is reported at its stated value and is not converted to rupees or graded against revenue.',
  },
  {
    field: 'Promoter pledge',
    why: 'Pledged and encumbered shares are disclosed under regulation 31(1) in a separate filing that no free NSE endpoint returns as data.',
  },
]
