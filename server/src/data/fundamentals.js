// Company fundamentals: the NSE corporate-filings client, and the ratio maths on top
// of what it returns.
//
// Three things about this data were established by probing the live endpoints, and
// all three contradict what the shape of the API suggests. They drive the design:
//
//   1. /api/corporates-financial-results returns filing METADATA, not figures. For
//      RELIANCE it is 130 rows going back to 2005, and not one of them carries a
//      revenue or a profit. The numbers live in the XBRL document each row links to,
//      which means a quarterly series costs one fetch per quarter, not one per
//      company. It is also STALE: the newest row is Q3 FY25 while the company has
//      since filed through Q1 FY27, and the from_date/to_date query parameters that
//      would fix that return an empty array.
//
//   2. /api/top-corp-info is the opposite. Its financial_results section is only five
//      rows deep, but it is current, and unlike the listing it carries actual figures
//      inline. So the two sources are merged: top-corp-info supplies the recent tail,
//      the listing supplies the history behind it.
//
//   3. Only 53 of those 130 filings have an XBRL document at all. Everything before
//      30-Jun-2018 has the literal string "-" where the URL belongs, which resolves
//      to a 404 page. Pre-2018 quarters are therefore known to exist and known to be
//      unreadable, which is a different statement from "no data" and is reported as
//      such.
//
// The `params` field on a filing row is not an object. It is the row's other fields
// concatenated into one string ("01-Oct-202431-Dec-2024Q3UNNCNERELIANCE"), so it is
// ignored: every value in it is already available as its own typed field.

import { checkPhrase } from './policy.js'

const NSE = 'https://www.nseindia.com/api'

// Same browser-ish set routes/ipo.js uses. www.nseindia.com rejects a bare fetch, and
// the Referer has to name a page that would plausibly issue the call.
const NSE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

export const SOURCES = {
  filings: {
    name: 'NSE corporate filings, quarterly financial results',
    url: 'https://www.nseindia.com/companies-listing/corporate-filings-financial-results',
  },
  corpInfo: {
    name: 'NSE company information',
    url: 'https://www.nseindia.com/get-quotes/equity',
  },
  xbrl: {
    name: 'NSE XBRL filing archive',
    url: 'https://nsearchives.nseindia.com/corporate/xbrl/',
  },
}

const FILING_TTL = 12 * 60 * 60 * 1000
// An XBRL document is immutable once filed, so this only has to be short enough that
// a restart is not required to pick up a new quarter.
const XBRL_TTL = 7 * 24 * 60 * 60 * 1000

const cache = new Map()

async function cached(key, ttl, load) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

async function nse(path, referer) {
  const res = await fetch(`${NSE}${path}`, {
    headers: { ...NSE_HEADERS, Referer: referer },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`NSE responded ${res.status} for ${path}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

// NSE writes the same date three ways across these endpoints: "31-Dec-2024" in the
// filing list, "30 Jun 2026" in top-corp-info, "2024-12-31" inside the XBRL.
export function parseNseDate(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const dmy = /^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{4})/.exec(text)
  if (!dmy) return null
  const month = MONTHS[dmy[2].toLowerCase()]
  if (month == null) return null
  return `${dmy[3]}-${String(month + 1).padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000)
}

/**
 * Are these two quarter-end dates adjacent quarters?
 *
 * This matters for any claim containing the word "consecutive". NSE drops a
 * shareholding quarter from time to time, and three declining readings with a
 * missing quarter between two of them is not a three-quarter decline. 80 to 100 days
 * covers every real quarter length (89 to 92) with room for a filing dated a few days
 * either side of the period end.
 */
export function isAdjacentQuarter(earlierIso, laterIso) {
  const gap = daysBetween(earlierIso, laterIso)
  return gap >= 80 && gap <= 100
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/** Every quarterly filing NSE lists for a symbol, newest first. Metadata only. */
export async function listQuarterlyFilings(symbol) {
  return cached(`filings:${symbol}`, FILING_TTL, async () => {
    const raw = await nse(
      `/corporates-financial-results?index=equities&symbol=${encodeURIComponent(symbol)}&period=Quarterly`,
      'https://www.nseindia.com/companies-listing/corporate-filings-financial-results'
    )
    const rows = Array.isArray(raw) ? raw : (raw?.data ?? [])
    return rows
      .map((r) => ({
        periodEnd: parseNseDate(r.toDate),
        periodStart: parseNseDate(r.fromDate),
        // The listing spells it "Non-Consolidated"; the XBRL spells the same thing
        // "Standalone". One vocabulary from here on.
        basis: /^consolidated$/i.test(r.consolidated ?? '') ? 'consolidated' : 'standalone',
        audited: /^audited$/i.test(r.audited ?? '') ? 'audited' : 'unaudited',
        financialYear: r.financialYear || null,
        isin: r.isin || null,
        // NSE sends "-" rather than null for this field on its own equity listings.
        industry: r.industry && r.industry !== '-' ? r.industry : null,
        filedAt: parseNseDate(r.filingDate) || parseNseDate(r.broadCastDate),
        // A URL ending in "/-" is the sentinel for "no XBRL document was filed".
        xbrl: r.xbrl && !r.xbrl.endsWith('/-') ? r.xbrl : null,
        via: 'filing-list',
      }))
      .filter((r) => r.periodEnd)
      .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
  })
}

/** Announcements, corporate actions, shareholding and the recent results tail. */
export async function corporateInfo(symbol) {
  return cached(`corp:${symbol}`, FILING_TTL, () =>
    nse(
      `/top-corp-info?symbol=${encodeURIComponent(symbol)}&market=equities`,
      `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`
    )
  )
}

async function fetchXbrl(url) {
  return cached(`xbrl:${url}`, XBRL_TTL, async () => {
    // nsearchives is a plain file host, but it still wants a Referer.
    const res = await fetch(url, {
      headers: { 'User-Agent': NSE_HEADERS['User-Agent'], Referer: 'https://www.nseindia.com/' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`XBRL archive responded ${res.status}`)
    return res.text()
  })
}

// ---------------------------------------------------------------------------
// XBRL parsing. Pure: takes document text, returns data.
// ---------------------------------------------------------------------------

// NSE has published these in two element vocabularies. Filings up to about 2024 use
// the in-bse-fin prefix; the integrated filings that replaced them in 2025 use
// in-capmkt. The local names are identical in both, so everything here matches on the
// local name and throws the prefix away.
const FACT = /<[A-Za-z0-9-]+:([A-Za-z0-9]+)\s+contextRef="([^"]+)"[^>]*>([^<]*)</g

// What the quarterly result actually reports. Order is the order a P&L reads in.
const LINES = {
  revenue: 'RevenueFromOperations',
  otherIncome: 'OtherIncome',
  totalIncome: 'Income',
  expenses: 'Expenses',
  depreciation: 'DepreciationDepletionAndAmortisationExpense',
  employeeCost: 'EmployeeBenefitExpense',
  financeCost: 'FinanceCosts',
  exceptional: 'ExceptionalItemsBeforeTax',
  pbt: 'ProfitBeforeTax',
  tax: 'TaxExpense',
  pat: 'ProfitLossForPeriod',
  patOwners: 'ProfitOrLossAttributableToOwnersOfParent',
  eps: 'BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations',
}

/**
 * Pull every fact out of an NSE XBRL result document, grouped by context.
 *
 * The one trap worth knowing: the <xbrli:context> period is not reliable. In a Q3
 * filing both the quarter context and the nine-month cumulative context declare the
 * SAME start and end date, so reading the context alone makes a nine-month revenue
 * look like a quarter and roughly triples it. The document separately reports
 * DateOfStartOfReportingPeriod and DateOfEndOfReportingPeriod per context, and those
 * two ARE correct and distinct. They are the period of record here.
 */
export function parseXbrl(text) {
  const facts = new Map()
  for (const [, name, contextRef, value] of String(text ?? '').matchAll(FACT)) {
    if (!facts.has(name)) facts.set(name, new Map())
    // A context can repeat a fact; first occurrence wins, which is the primary
    // statement rather than a later note restating it.
    if (!facts.get(name).has(contextRef)) facts.get(name).set(contextRef, value.trim())
  }

  const number = (name, ctx) => {
    const raw = facts.get(name)?.get(ctx)
    if (raw == null || raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  const starts = facts.get('DateOfStartOfReportingPeriod') ?? new Map()
  const ends = facts.get('DateOfEndOfReportingPeriod') ?? new Map()
  const natures = facts.get('NatureOfReportStandaloneConsolidated') ?? new Map()

  const periods = []
  for (const [contextRef, start] of starts) {
    const from = parseNseDate(start)
    const to = parseNseDate(ends.get(contextRef))
    if (!from || !to) continue
    periods.push({
      contextRef,
      from,
      to,
      days: daysBetween(from, to),
      basis: /consolidated/i.test(natures.get(contextRef) ?? '') ? 'consolidated' : 'standalone',
    })
  }

  return { facts, periods, number }
}

/**
 * The discrete quarter out of one filing, with the cumulative column discarded.
 *
 * Selection is by duration rather than by context name, because the context names
 * differ between the two vocabularies while a quarter is a quarter in both. 60 to 100
 * days admits a real quarter and excludes the six-, nine- and twelve-month columns
 * that sit beside it in the same document.
 */
export function discreteQuarter(parsed) {
  const quarter = parsed.periods
    .filter((p) => p.days >= 60 && p.days <= 100)
    .sort((a, b) => b.to.localeCompare(a.to))[0]
  if (!quarter) return null

  const values = {}
  for (const [key, tag] of Object.entries(LINES)) values[key] = parsed.number(tag, quarter.contextRef)

  return {
    periodStart: quarter.from,
    periodEnd: quarter.to,
    basis: quarter.basis,
    // XBRL reports rupees outright. Everything downstream stays in rupees and only
    // converts for display, so no rounding creeps into a ratio.
    unit: 'INR',
    ...values,
  }
}

// top-corp-info reports in rupees lakh. That is not documented anywhere; it was
// established by dividing its 30-Jun-2026 income (17012100) by the same quarter's
// XBRL Income fact (1701210000000), which is exactly 1e5.
const LAKH = 1e5
const CRORE = 1e7

export const toCrore = (rupees) => (rupees == null ? null : Number((rupees / CRORE).toFixed(2)))

function recentResults(info) {
  const rows = info?.financial_results?.data ?? []
  return rows
    .map((r) => {
      const periodEnd = parseNseDate(r.to_date)
      if (!periodEnd) return null
      return {
        periodEnd,
        periodStart: parseNseDate(r.from_date),
        basis: /^consolidated$/i.test(r.consolidated ?? '') ? 'consolidated' : 'standalone',
        audited: /^audited$/i.test(r.audited ?? '') ? 'audited' : 'unaudited',
        filedAt: parseNseDate(r.re_broadcast_timestamp),
        xbrl: r.xbrl_attachment || null,
        // Headline figures only. There is no revenue line here: `income` is revenue
        // plus other income, so it cannot stand in for one.
        headline: {
          totalIncome: r.income == null ? null : Number(r.income) * LAKH,
          pbt: r.reProLossBefTax == null ? null : Number(r.reProLossBefTax) * LAKH,
          pat: r.proLossAftTax == null ? null : Number(r.proLossAftTax) * LAKH,
          eps: r.reDilEPS == null ? null : Number(r.reDilEPS),
        },
        via: 'top-corp-info',
      }
    })
    .filter(Boolean)
}

/**
 * Merge both metadata sources into one candidate list of quarters, newest first.
 *
 * Neither source alone spans the range: the listing stops 18 months short of today,
 * top-corp-info only reaches back five quarters. Where both describe the same quarter
 * on the same basis, top-corp-info wins, because it is the one that is current.
 */
export function planQuarters(filings, info) {
  const byKey = new Map()
  for (const row of [...filings, ...recentResults(info)]) {
    const key = `${row.periodEnd}:${row.basis}`
    byKey.set(key, { ...byKey.get(key), ...row })
  }
  return [...byKey.values()].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
}

/**
 * Which reporting basis to build the series on.
 *
 * Consolidated is the truer picture of a group, but for many companies NSE's free
 * surfaces carry standalone far more recently, and a consolidated series that ends 18
 * months ago is worse than a current standalone one. Whichever is chosen, the caller
 * is told which and why, because the two are not comparable and a reader who assumes
 * the wrong one misreads every margin on the page.
 */
export function chooseBasis(plan) {
  const newest = (basis) => plan.find((q) => q.basis === basis && q.xbrl)?.periodEnd ?? null
  const consolidated = newest('consolidated')
  const standalone = newest('standalone')

  if (consolidated && standalone && standalone > consolidated) {
    return {
      basis: 'standalone',
      why: `Standalone results are filed through ${standalone}; the most recent consolidated filing with a readable document ends ${consolidated}.`,
    }
  }
  if (consolidated) return { basis: 'consolidated', why: 'Consolidated results are available and current.' }
  if (standalone) return { basis: 'standalone', why: 'This company files no consolidated quarterly result on NSE.' }
  return { basis: null, why: 'No quarterly filing with a readable XBRL document was found.' }
}

async function inBatches(items, size, work) {
  const out = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(work))))
  }
  return out
}

/**
 * The quarterly series for one symbol, oldest quarter first.
 *
 * Fetching is bounded by `quarters` because each quarter is its own HTTP request
 * against an archive that has no bulk endpoint. Twelve covers three YoY comparisons
 * and a three-year CAGR, which is what the report actually consumes.
 */
export async function quarterlySeries(symbol, { quarters = 12, basis: wanted = null } = {}) {
  const [filings, info] = await Promise.all([listQuarterlyFilings(symbol), corporateInfo(symbol).catch(() => null)])
  const plan = planQuarters(filings, info)
  const chosen = wanted ? { basis: wanted, why: 'Basis requested by the caller.' } : chooseBasis(plan)

  const notes = []
  const withoutDocument = plan.filter((q) => q.basis === chosen.basis && !q.xbrl)
  if (withoutDocument.length) {
    const oldest = withoutDocument[withoutDocument.length - 1].periodEnd
    const newest = withoutDocument[0].periodEnd
    notes.push(
      `${withoutDocument.length} quarters between ${oldest} and ${newest} are listed by NSE with no XBRL document attached, so their figures could not be read.`
    )
  }

  const wanted_ = plan.filter((q) => q.basis === chosen.basis && (q.xbrl || q.headline)).slice(0, quarters)

  const rows = await inBatches(wanted_, 4, async (q) => {
    if (q.xbrl) {
      try {
        const quarter = discreteQuarter(parseXbrl(await fetchXbrl(q.xbrl)))
        if (quarter) {
          return {
            ...quarter,
            audited: q.audited,
            filedAt: q.filedAt,
            source: SOURCES.xbrl,
            sourceUrl: q.xbrl,
          }
        }
      } catch {
        // Fall through to the headline figures rather than dropping the quarter:
        // a quarter with profit but no revenue is still worth more than a hole.
      }
    }
    if (!q.headline) return null
    return {
      periodStart: q.periodStart,
      periodEnd: q.periodEnd,
      basis: q.basis,
      unit: 'INR',
      // Named explicitly so a margin calculation downstream sees null and reports
      // the margin as unavailable rather than inventing a denominator.
      revenue: null,
      revenueUnavailable: 'The NSE summary feed reports total income only; it publishes no revenue-from-operations line.',
      ...q.headline,
      audited: q.audited,
      filedAt: q.filedAt,
      source: SOURCES.corpInfo,
    }
  })

  const series = rows.filter(Boolean).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))

  // A hole inside the series is worth more warning than a short series is. The two
  // sources meet somewhere around 18 months back, and a quarter can fall through the
  // seam: the filing list has stopped and top-corp-info has not yet reached back that
  // far. Every year-on-year comparison that straddles the hole then reports as
  // unavailable, and without this note the page looks broken rather than honest.
  for (const gap of seriesGaps(series)) {
    notes.push(`No quarterly filing was available between ${gap.after} and ${gap.before}, so comparisons spanning that gap are not reported.`)
  }

  return {
    symbol,
    basis: chosen.basis,
    basisReason: chosen.why,
    series,
    coverage: series.length
      ? { from: series[0].periodEnd, to: series[series.length - 1].periodEnd, quarters: series.length }
      : null,
    notes,
    fetchedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Calculations. Data in, data out, no fetching past this line.
// ---------------------------------------------------------------------------

const unavailable = (why) => ({ value: null, unavailable: why })

/** Places where the series skips a quarter, oldest first. */
export function seriesGaps(series) {
  const gaps = []
  for (let i = 1; i < series.length; i++) {
    if (!isAdjacentQuarter(series[i - 1].periodEnd, series[i].periodEnd)) {
      gaps.push({ after: series[i - 1].periodEnd, before: series[i].periodEnd })
    }
  }
  return gaps
}

/**
 * Percentage change, with the cases that make a percentage lie.
 *
 * A percentage change measures growth relative to a base, which requires the base to
 * be a positive quantity. From a loss of 10 crore to a loss of 5 crore is an
 * improvement, and the arithmetic calls it -50%. From a loss of 10 to a profit of 5
 * it says -150%. Both readings are worse than useless, so neither is published; the
 * two absolute figures are, and they say the same thing without the trap.
 */
export function changePercent(current, base) {
  if (current == null || base == null) return unavailable('One of the two periods has no reported figure.')
  if (!Number.isFinite(current) || !Number.isFinite(base)) return unavailable('A reported figure was not numeric.')
  if (base === 0) return unavailable('The earlier period is zero, so a percentage change is undefined.')
  if (base < 0) {
    return unavailable(
      'The earlier period is negative, so a percentage change carries no meaning. The two absolute figures are reported instead.'
    )
  }
  return { value: Number((((current - base) / base) * 100).toFixed(2)), from: base, to: current }
}

/** Find the quarter whose period end is `back` quarters before `index`. */
function priorQuarter(series, index, back) {
  const target = series[index - back]
  if (!target) return null
  // Guard the gap as well as the count. If NSE is missing a quarter, series[i-4] is
  // five quarters back and comparing it to this quarter is not a YoY comparison.
  const months = Math.round(daysBetween(target.periodEnd, series[index].periodEnd) / 30.44)
  return months >= back * 3 - 1 && months <= back * 3 + 1 ? target : null
}

/**
 * Year-on-year change per quarter, comparing each quarter to the same quarter a year
 * earlier. Same-quarter comparison is the only honest one for a seasonal business:
 * an air conditioner maker's March against its December says nothing.
 */
export function yoy(series, key = 'revenue') {
  return series.map((q, i) => {
    const base = priorQuarter(series, i, 4)
    return {
      periodEnd: q.periodEnd,
      ...(base
        ? { ...changePercent(q[key], base[key]), against: base.periodEnd }
        : unavailable('The same quarter one year earlier is not in the available filing history.')),
    }
  })
}

/** Quarter-on-quarter change. Unadjusted for seasonality, and labelled as such. */
export function qoq(series, key = 'revenue') {
  return series.map((q, i) => {
    const base = priorQuarter(series, i, 1)
    return {
      periodEnd: q.periodEnd,
      ...(base
        ? { ...changePercent(q[key], base[key]), against: base.periodEnd }
        : unavailable('The preceding quarter is not in the available filing history.')),
      note: 'Sequential change, not adjusted for seasonality.',
    }
  })
}

/**
 * Margins per quarter.
 *
 * Denominated on revenue from operations rather than total income, because other
 * income is where one-off items land and a margin that moves because a company sold a
 * building is not a margin that describes the business.
 */
export function margins(series) {
  const pct = (num, den) => Number(((num / den) * 100).toFixed(2))

  return series.map((q) => {
    const row = { periodEnd: q.periodEnd, operating: null, net: null }

    if (q.revenue == null || q.revenue <= 0) {
      row.unavailable =
        q.revenueUnavailable ??
        'No revenue-from-operations figure was reported for this quarter, so no margin can be computed.'
      return row
    }

    if (q.pat != null) row.net = pct(q.pat, q.revenue)

    // No Indian filing reports EBITDA as a tag, so it is rebuilt from the total
    // expense line by adding back the two non-operating charges inside it. Every
    // component has to be present: treating a missing depreciation as zero would
    // understate the add-back and quietly report a margin several points too low,
    // which is worse than reporting nothing.
    const missing = ['expenses', 'depreciation', 'financeCost'].filter((k) => q[k] == null)
    if (missing.length) {
      row.operatingUnavailable = `Operating margin needs the total expense, depreciation and finance cost lines; this filing does not report ${missing.join(', ')}.`
      return row
    }

    row.operating = pct(q.revenue - q.expenses + q.depreciation + q.financeCost, q.revenue)
    row.note = 'Operating margin is earnings before interest, tax, depreciation and amortisation, over revenue from operations.'
    return row
  })
}

/**
 * Trailing twelve months, which is the only way to compare a business to itself
 * without seasonality in the way.
 *
 * Requires four genuinely adjacent quarters. Summing whatever four rows happen to be
 * last would silently produce a fifteen-month "year" when a filing is missing.
 */
export function ttm(series, key = 'revenue', endIndex = series.length - 1) {
  const window = series.slice(Math.max(0, endIndex - 3), endIndex + 1)
  if (window.length < 4) return unavailable('Fewer than four quarters are available.')
  for (let i = 1; i < window.length; i++) {
    if (!isAdjacentQuarter(window[i - 1].periodEnd, window[i].periodEnd)) {
      return unavailable(`The filing history skips a quarter between ${window[i - 1].periodEnd} and ${window[i].periodEnd}.`)
    }
  }
  if (window.some((q) => q[key] == null)) return unavailable('At least one quarter in the window has no reported figure.')
  return {
    value: window.reduce((sum, q) => sum + q[key], 0),
    from: window[0].periodStart ?? window[0].periodEnd,
    to: window[3].periodEnd,
  }
}

/**
 * Compound annual growth rate between two positive values.
 *
 * Undefined when either end is not positive: a root of a negative ratio is not a real
 * number, and a company that swung from a loss to a profit has no growth RATE, it has
 * a sign change, which is a different fact and reported as one.
 */
export function cagr(from, to, years) {
  if (from == null || to == null) return unavailable('One of the two endpoints has no reported figure.')
  if (!(years > 0)) return unavailable('The two endpoints do not span a positive length of time.')
  if (from <= 0) return unavailable('The starting value is not positive, so a growth rate is undefined.')
  if (to <= 0) return unavailable('The ending value is not positive, so a growth rate is undefined.')
  return { value: Number(((Math.pow(to / from, 1 / years) - 1) * 100).toFixed(2)), from, to, years: Number(years.toFixed(2)) }
}

/** CAGR across the series, measured on TTM at both ends so seasonality cancels. */
export function revenueCagr(series, key = 'revenue') {
  const start = ttm(series, key, 3)
  const end = ttm(series, key, series.length - 1)
  if (start.value == null) return { ...start, unavailable: `Start of the window: ${start.unavailable}` }
  if (end.value == null) return { ...end, unavailable: `End of the window: ${end.unavailable}` }
  const years = daysBetween(start.to, end.to) / 365.25
  return { ...cagr(start.value, end.value, years), fromPeriod: start.to, toPeriod: end.to, basis: 'trailing twelve months' }
}

// A quarter-on-quarter move smaller than this is reporting noise, not a decision by
// anybody. Shareholding is published to two decimals, and ESOP allotments and
// buyback rounding routinely shift a percentage by two or three hundredths. Creeping
// acquisition and pledge-driven selling move it by tenths.
export const MATERIAL_MOVE_PP = 0.1

/**
 * Runs of consecutive same-direction moves in a series of dated readings.
 *
 * Every step in a run must clear `threshold` on its own. A run that qualified on its
 * total would let one large quarter drag two flat ones along behind it and call the
 * result a three-quarter trend, which is the exact claim this is here to avoid making
 * falsely. Readings that are not adjacent quarters break a run outright.
 *
 * `points` is [{ date, value }], oldest first.
 */
export function runs(points, { threshold = MATERIAL_MOVE_PP, minRun = 3 } = {}) {
  const found = []
  let current = null

  const close = () => {
    if (current && current.quarters >= minRun) found.push(current)
    current = null
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const here = points[i]
    const delta = here.value - prev.value
    const direction = delta > 0 ? 'rose' : 'fell'

    if (Math.abs(delta) < threshold || !isAdjacentQuarter(prev.date, here.date)) {
      close()
      continue
    }
    if (current && current.direction === direction && current.to === prev.date) {
      current = { ...current, to: here.date, endValue: here.value, quarters: current.quarters + 1 }
    } else {
      close()
      current = { direction, from: prev.date, to: here.date, startValue: prev.value, endValue: here.value, quarters: 1 }
    }
  }
  close()

  return found.map((r) => ({ ...r, change: Number((r.endValue - r.startValue).toFixed(2)) }))
}

/** Quarter-dated shareholding percentages, oldest first. */
export function shareholdingSeries(info) {
  const raw = info?.shareholdings_patterns?.data
  if (!raw || typeof raw !== 'object') return []

  return Object.entries(raw)
    .map(([quarter, entries]) => {
      const date = parseNseDate(quarter)
      if (!date) return null
      // NSE ships each category as its own single-key object, with the value as a
      // space-padded string: [{ "Promoter & Promoter Group": "  50.07" }, ...].
      const holders = {}
      for (const entry of entries ?? []) {
        for (const [label, value] of Object.entries(entry ?? {})) {
          const n = Number(String(value).trim())
          if (Number.isFinite(n)) holders[label] = n
        }
      }
      return { date, holders }
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
}

const PROMOTER = 'Promoter & Promoter Group'

function sentence(text) {
  // The engine authored this string, so it is subject to policy.js. Throwing here
  // rather than returning a flag means a wording change that drifts into advice
  // fails in this module's own tests instead of in a response body.
  const { ok, violations } = checkPhrase(text)
  if (!ok) throw new Error(`fundamentals.js wrote a non-publishable phrase: ${violations.map((v) => v.why).join(', ')}`)
  return text
}

/**
 * Promoter shareholding, its trend, and the run detection that turns a table into a
 * statement someone will actually read.
 */
export function shareholdingTrend(info) {
  const series = shareholdingSeries(info)
  if (series.length < 2) {
    return {
      series,
      latest: series[0] ?? null,
      promoterRuns: [],
      notes: [],
      unavailable: 'NSE publishes fewer than two shareholding quarters for this company, so no trend can be measured.',
    }
  }

  const points = series.filter((s) => s.holders[PROMOTER] != null).map((s) => ({ date: s.date, value: s.holders[PROMOTER] }))
  const promoterRuns = runs(points)

  const notes = promoterRuns.map((r) =>
    sentence(
      `Promoter and promoter group shareholding ${r.direction} in each of ${r.quarters} consecutive quarters, from ${r.startValue}% at ${r.from} to ${r.endValue}% at ${r.to}, a change of ${r.change > 0 ? '+' : ''}${r.change} percentage points.`
    )
  )

  const latest = series[series.length - 1]
  const previous = series[series.length - 2]
  const move = latest.holders[PROMOTER] != null && previous.holders[PROMOTER] != null
    ? Number((latest.holders[PROMOTER] - previous.holders[PROMOTER]).toFixed(2))
    : null

  if (move != null && Math.abs(move) < MATERIAL_MOVE_PP) {
    notes.push(
      sentence(
        move === 0
          ? `Promoter and promoter group shareholding was unchanged at ${latest.holders[PROMOTER]}% in the quarter to ${latest.date}.`
          : `Promoter and promoter group shareholding moved ${Math.abs(move)} percentage points in the quarter to ${latest.date}, below the ${MATERIAL_MOVE_PP} point threshold this report treats as a structural change.`
      )
    )
  }

  return {
    series,
    latest,
    latestQuarterMove: move,
    materialThresholdPp: MATERIAL_MOVE_PP,
    promoterRuns,
    notes,
    source: SOURCES.corpInfo,
  }
}

/** Corporate actions and board meetings, dated and sorted, straight from NSE. */
export function corporateCalendar(info) {
  const actions = (info?.corporate_actions?.data ?? [])
    .map((a) => ({ exDate: parseNseDate(a.exdate), purpose: a.purpose }))
    .filter((a) => a.exDate)
    .sort((a, b) => b.exDate.localeCompare(a.exDate))

  const meetings = (info?.borad_meeting?.data ?? [])
    .map((m) => ({ date: parseNseDate(m.meetingdate), purpose: m.purpose }))
    .filter((m) => m.date)
    .sort((a, b) => b.date.localeCompare(a.date))

  const announcements = (info?.latest_announcements?.data ?? [])
    .map((a) => ({ at: parseNseDate(a.broadcastdate), subject: a.subject }))
    .filter((a) => a.at)
    .sort((a, b) => b.at.localeCompare(a.at))

  return { actions, meetings, announcements, source: SOURCES.corpInfo }
}

// ---------------------------------------------------------------------------
// What this data cannot answer
// ---------------------------------------------------------------------------

/**
 * Named gaps, with the reason for each.
 *
 * These are not omissions to be filled in later by a better parser. Each one is a
 * number that exists, that a paid terminal would show, and that no free NSE surface
 * publishes. Listing them is the point: a reader who can see what the report could
 * not verify can judge the rest of it, and a reader who cannot has to take the whole
 * page on faith.
 */
export const UNAVAILABLE = [
  {
    field: 'FII and DII shareholding split',
    why: 'NSE publishes the public shareholding as a single percentage. The institutional breakdown sits in the quarterly shareholding pattern PDF filed under regulation 31, which is not exposed as structured data.',
  },
  {
    field: 'Promoter pledge',
    why: 'Pledged and encumbered shares are disclosed under regulation 31(1) in a separate filing. No free NSE endpoint returns it as data.',
  },
  {
    field: 'Cash flow statement',
    why: 'Indian companies file a cash flow statement half-yearly, not quarterly, and the quarterly XBRL this report reads contains no cash flow section.',
  },
  {
    field: 'Order book and order inflow',
    why: 'Disclosed in a press release or investor presentation where a company chooses to, in no fixed format. There is nothing machine-readable to parse.',
  },
  {
    field: 'Balance sheet, debt and net worth',
    why: 'Full balance sheet items are filed half-yearly under regulation 33(3)(f). The quarterly result carries the profit and loss statement only.',
  },
  {
    field: 'Intraday prices',
    why: 'No free source publishes intraday candles for NSE equities. The shortest interval available here is one day.',
  },
  {
    field: 'Quarters before 30 June 2018',
    why: 'NSE lists the filings but attaches no XBRL document to them, so the figures are not machine-readable. The filings themselves are known to exist.',
  },
]
