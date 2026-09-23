// Comparison with similar companies.
//
// The table is the easy half. The hard half is deciding who the peers ARE, and the
// field that looked like the answer is empty: `industry` on every row of
// /api/corporates-financial-results is the literal string "-". Not sparse, not
// sometimes-blank. Fourteen symbols were read across the large-cap universe
// (RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK, MARUTI, SUNPHARMA, CIPLA, ASIANPAINT,
// DMART, TITAN, ONGC, IOC, BPCL) and the set of distinct values it takes is {"-"}.
// fundamentals.js already discards it for that reason. Nothing here is built on it.
//
// What IS open is the index constituent archive on nsearchives, the same host the
// equity list comes from, and it carries two usable classifications:
//
//   ind_niftytotalmarket_list.csv   755 companies, each with NSE's macro-economic
//                                   sector. Broad: "Financial Services" is 121
//                                   companies and holds banks, insurers and asset
//                                   managers together.
//   ind_nifty<sector>list.csv       the sectoral indices, 10 to 20 members each,
//                                   every member in the same line of business.
//
// So peers are chosen in two tiers, and the tiers are never mixed. If the subject
// sits in a sectoral index, its peers come from that index and nowhere else. Only a
// company in no sectoral index falls back to the macro sector, and that fallback is
// labelled in the output as the weaker basis it is, because a macro-sector match on
// its own is exactly the "unrelated companies that share a sector" comparison the
// spec rules out.
//
// The thematic indices are deliberately left out of the sectoral set. Nifty Energy
// holds RELIANCE beside POWERGRID, Nifty MNC holds a cement maker beside a bank.
// They are baskets, not peer groups, and including them would make the tier-1 match
// look authoritative while being wrong.
//
// Size is the second filter, and it runs on a market capitalisation this module
// derives rather than reads, because no free NSE surface publishes one. The quarterly
// XBRL reports PaidUpValueOfEquityShareCapital and FaceValueOfEquityShareCapital, and
// their quotient is the share count. Checked against five companies whose counts are
// independently known: RELIANCE 135320000000/10 = 13.532bn, TCS 3620000000/1 =
// 3.62bn, INFY 20750000000/5 = 4.15bn, MARUTI 1572000000/5 = 314.4m, DMART
// 6507300000/10 = 650.73m. All five match. Times the last daily close, that is a
// market capitalisation with a source and a date on both halves.
//
// That derivation has three failure modes and each is refused rather than published.
// The share count is as at the filing's period end, so a bonus or a split with an
// ex-date after that quarter leaves it stale, and a stale count times a post-bonus
// price halves or doubles the answer; RELIANCE's own 1:1 bonus on 28-Oct-2024 is
// exactly this case. The face value can be wrong in the filing, and it divides, so a
// face value out by a factor of a hundred is a market capitalisation out by a factor
// of a hundred: Adani Total Gas's integrated filing for the quarter to 2026-06-30
// reports 100 for a rupee share and derived Rs 660 crore for a company in the tens of
// thousands of crore. And the guard against the first of those reads a corporate
// action list over the network, so it fails closed: a list that could not be fetched
// proves nothing about what happened since the filing.
//
// Expect the two growth columns to be empty more often than they are full, and do not
// read that as a fault. NSE's period=Quarterly feed is missing quarters for most large
// companies: TCS jumps 2024-12-31 to 2025-06-30, HCLTECH jumps 2024-12-31 to
// 2025-09-30. A growth rate needs the twelve months ending a year before the current
// twelve months, both built from four adjacent quarters, and a hole anywhere in either
// window ends it. The alternative is counting rows instead of dates, which produces a
// number for every company and silently labels a thirty-month change as a year.
//
// ponytail: tier 2 is a macro sector plus a size band, which puts an NBFC next to a
// bank of the same size. The upgrade is NSE's Sector/Industry/Basic-Industry
// classification, which is not published as a free file; a hand-kept sub-industry map
// over the ~750 classified companies would also do it.

import { candles } from './prices.js'
import {
  SOURCES as FUNDAMENTAL_SOURCES,
  listQuarterlyFilings,
  planQuarters,
  corporateInfo,
  quarterlySeries,
  parseXbrl,
  parseNseDate,
  changePercent,
  margins,
  ttm,
  toCrore,
} from './fundamentals.js'
import { checkPhrase } from './policy.js'

const INDICES = 'https://nsearchives.nseindia.com/content/indices'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const SOURCES = {
  classification: {
    name: 'NSE index constituent lists',
    url: 'https://www.nseindia.com/products-services/indices-nifty500-index',
  },
  price: { name: 'Upstox historical candles', url: 'https://upstox.com/developer/api-documentation/' },
  xbrl: FUNDAMENTAL_SOURCES.xbrl,
  filings: FUNDAMENTAL_SOURCES.filings,
  corpInfo: FUNDAMENTAL_SOURCES.corpInfo,
}

// One line of business each. The thematic and multi-sector baskets are absent by
// design; see the header.
const SECTOR_INDICES = [
  { file: 'ind_niftybanklist.csv', label: 'Nifty Bank' },
  { file: 'ind_niftypsubanklist.csv', label: 'Nifty PSU Bank' },
  { file: 'ind_niftyautolist.csv', label: 'Nifty Auto' },
  { file: 'ind_niftyfmcglist.csv', label: 'Nifty FMCG' },
  { file: 'ind_niftyitlist.csv', label: 'Nifty IT' },
  { file: 'ind_niftymedialist.csv', label: 'Nifty Media' },
  { file: 'ind_niftymetallist.csv', label: 'Nifty Metal' },
  { file: 'ind_niftypharmalist.csv', label: 'Nifty Pharma' },
  { file: 'ind_niftyhealthcarelist.csv', label: 'Nifty Healthcare Index' },
  { file: 'ind_niftyrealtylist.csv', label: 'Nifty Realty' },
  { file: 'ind_niftyconsumerdurableslist.csv', label: 'Nifty Consumer Durables' },
  { file: 'ind_niftyoilgaslist.csv', label: 'Nifty Oil & Gas' },
]

const UNIVERSE_FILE = 'ind_niftytotalmarket_list.csv'

const CLASSIFICATION_TTL = 24 * 60 * 60 * 1000
const XBRL_TTL = 7 * 24 * 60 * 60 * 1000

// A peer is only worth fetching a full filing history for once it has cleared the
// size band, so candidates are priced first and read second. These two numbers are
// the whole cost model: CANDIDATE_CAP cheap snapshots, then PEER_LIMIT expensive
// ones.
const CANDIDATE_CAP = 15
const PEER_LIMIT = 5

/**
 * How far from the subject's market capitalisation a company may sit and still be
 * compared to it.
 *
 * A quarter to four times, so roughly a decade of market capitalisation end to end.
 * Wide enough that a large cap keeps its genuine rivals, narrow enough that a Rs
 * 2,000 crore company never appears beside a Rs 20 lakh crore one. Ratios rather
 * than SEBI's rank bands because a rank needs the full ranked market and a ratio
 * needs only the two companies being compared.
 */
export const SIZE_BAND = 4

const unavailable = (why) => ({ value: null, unavailable: why })

/**
 * A fetch that failed, carried as a value.
 *
 * `.catch(() => null)` throws away the one thing the consumer needs: a null says
 * "there is nothing here", and a network error says "nobody looked". Read as the
 * first, a failed corporate-actions fetch becomes a company that declared no bonus
 * and paid no dividend, and both of those get published as fact. Every network read
 * in this module returns either the document or one of these, so no consumer can
 * default its way past the difference.
 */
const unreadable = (what, err) => ({ unreadable: `${what} could not be read (${err.message}).` })
const attempt = (what, load) => load().catch((err) => unreadable(what, err))
const infoOf = (symbol) => attempt(`NSE’s corporate information document for ${symbol}`, () => corporateInfo(symbol))

/**
 * The corporate actions in a top-corp-info document, or the reason there are none to
 * read. Never an empty list standing in for either.
 *
 * Both callers below are guards of a kind, and both of them are wrong in the same way
 * if handed an empty list they cannot tell apart from an unread one.
 */
export function corporateActions(info) {
  if (info?.unreadable) return { unseen: info.unreadable }
  if (!info) return { unseen: 'NSE’s corporate information document was not read, so this company’s corporate action history is unknown.' }
  const data = info.corporate_actions?.data
  if (!Array.isArray(data)) {
    return { unseen: 'NSE’s corporate information document carries no corporate actions list, so this company’s corporate action history is unknown.' }
  }
  return { actions: data }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const cache = new Map()

async function cached(key, ttl, load) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const value = await load()
  cache.set(key, { at: Date.now(), value })
  return value
}

async function indexCsv(file) {
  const res = await fetch(`${INDICES}/${file}`, {
    headers: { 'User-Agent': UA, Referer: 'https://www.nseindia.com/' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`NSE index list ${file} responded ${res.status}`)
  return res.text()
}

/**
 * Parse a constituent list.
 *
 * Every one of these files has the same five columns. A company name can contain a
 * comma ("Aditya Birla Fashion and Retail Ltd." does not, but "Gujarat Fluorochemicals
 * Ltd." style names with a suffix do appear), so the row is split from the RIGHT:
 * the last four fields are fixed and the name is whatever is left in front of them.
 */
export function parseIndexCsv(text) {
  const lines = String(text ?? '').trim().split(/\r?\n/)
  const rows = []
  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    if (cells.length < 5) continue
    // Only the four fixed fields are trimmed. The name is rejoined from what is left
    // untouched, or a company whose name contains a comma loses the space after it.
    const [isin, series, symbol, industry] = [cells.pop(), cells.pop(), cells.pop(), cells.pop()].map((c) => c.trim())
    const name = cells.join(',').trim()
    if (!symbol || !isin) continue
    rows.push({ name, industry: industry || null, symbol, series, isin })
  }
  return rows
}

/**
 * The classified universe and every sectoral group, keyed by ISIN.
 *
 * A missing sectoral file is not fatal. NSE renames these occasionally (the private
 * bank and chemicals lists 404 under the names their index pages use), and losing one
 * group should cost that group's members their tier-1 match, not cost every company
 * on the site its peer table.
 */
export async function loadClassification() {
  return cached('classification', CLASSIFICATION_TTL, async () => {
    const universe = parseIndexCsv(await indexCsv(UNIVERSE_FILE))

    const groups = []
    const missing = []
    await Promise.all(
      SECTOR_INDICES.map(async ({ file, label }) => {
        try {
          const members = parseIndexCsv(await indexCsv(file))
          if (members.length) groups.push({ label, file, members })
        } catch (err) {
          missing.push({ label, why: err.message })
        }
      })
    )

    return buildClassification(universe, groups, missing)
  })
}

/** Pure: index the parsed lists so a lookup by ISIN is one map hit. */
export function buildClassification(universe, groups, missing = []) {
  const byIsin = new Map()
  for (const row of universe) byIsin.set(row.isin, { ...row, groups: [] })

  for (const group of groups) {
    for (const member of group.members) {
      // A sectoral index member outside the total-market list still needs a record,
      // or it disappears from its own sector.
      if (!byIsin.has(member.isin)) byIsin.set(member.isin, { ...member, groups: [] })
      byIsin.get(member.isin).groups.push(group.label)
    }
  }

  const byIndustry = new Map()
  for (const row of byIsin.values()) {
    if (!row.industry) continue
    if (!byIndustry.has(row.industry)) byIndustry.set(row.industry, [])
    byIndustry.get(row.industry).push(row)
  }

  const byGroup = new Map(groups.map((g) => [g.label, g.members.map((m) => byIsin.get(m.isin))]))

  return {
    byIsin,
    byIndustry,
    byGroup,
    missingGroups: missing,
    coverage: byIsin.size,
    source: SOURCES.classification,
  }
}

const xbrlText = (url) =>
  cached(`xbrl:${url}`, XBRL_TTL, async () => {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.nseindia.com/' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`XBRL archive responded ${res.status}`)
    return res.text()
  })

async function inBatches(items, size, work) {
  const out = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(work))))
  }
  return out
}

// ---------------------------------------------------------------------------
// Peer selection. Pure from here to the end of the section.
// ---------------------------------------------------------------------------

/**
 * Who this company could be compared to, before anything is known about size.
 *
 * Returns { tier, basis, candidates, unavailable }. Tier 1 is co-membership of a
 * sectoral index and tier 2 is the macro sector; the two never appear in one list,
 * because a real rival and a company that merely shares a sector are not the same
 * kind of evidence and averaging them hides which one you are looking at.
 */
export function peerCandidates(subject, classification, { cap = CANDIDATE_CAP } = {}) {
  const self = classification.byIsin.get(subject.isin)
  if (!self) {
    return {
      tier: null,
      candidates: [],
      unavailable: `${subject.symbol} is not in any NSE index constituent list, so NSE publishes no sector for it and no peer group can be assembled without guessing one.`,
    }
  }

  const notSelf = (row) => row && row.isin !== subject.isin

  if (self.groups.length) {
    const seen = new Set()
    const candidates = []
    for (const label of self.groups) {
      for (const member of classification.byGroup.get(label) ?? []) {
        if (!notSelf(member) || seen.has(member.isin)) continue
        seen.add(member.isin)
        candidates.push({ ...member, via: label })
      }
    }
    return {
      tier: 'sector-index',
      basis: `Members of ${self.groups.join(' and ')}, which NSE constructs from companies in one line of business.`,
      industry: self.industry,
      candidates: candidates.slice(0, cap),
      total: candidates.length,
    }
  }

  const sector = (classification.byIndustry.get(self.industry) ?? []).filter(notSelf)
  if (!sector.length) {
    return {
      tier: null,
      candidates: [],
      unavailable: `${subject.symbol} is in no NSE sectoral index, and NSE's macro sector for it (${self.industry ?? 'unclassified'}) contains no other listed company.`,
    }
  }

  return {
    tier: 'macro-sector',
    basis: `NSE's macro-economic sector "${self.industry}", which contains ${sector.length + 1} listed companies across more than one line of business. A weaker match than a sectoral index, and read as such.`,
    industry: self.industry,
    candidates: sector.map((row) => ({ ...row, via: self.industry })).slice(0, cap),
    total: sector.length,
  }
}

/**
 * Cut the candidate list down to companies of a comparable size.
 *
 * Everything rejected is returned with the reason it was rejected, because the list
 * of who was NOT compared is part of the comparison. A candidate whose market
 * capitalisation could not be derived is rejected too: an unbanded peer is a peer
 * nobody can show belongs in the table, and the alternative is including it on the
 * hope that it fits.
 */
export function selectPeers(subject, candidates, { limit = PEER_LIMIT, band = SIZE_BAND, tier = null } = {}) {
  const anchor = subject.marketCap?.value

  if (anchor == null || !(anchor > 0)) {
    const detail = subject.marketCap?.unavailable ?? 'No market capitalisation could be derived for the subject company.'

    // With no anchor there is nothing to band against, and what is left is whatever
    // the classification alone says. Inside a sectoral index that is still a real
    // statement: ten companies in one line of business. Inside a macro sector it is
    // not, and taking the first few of a 122-company sector puts a Rs 10,000 crore
    // housing financier beside a Rs 5 lakh crore lender in alphabetical order, which
    // is the comparison this module exists to refuse.
    if (tier !== 'sector-index') {
      return {
        peers: [],
        excluded: [],
        sizeBandApplied: false,
        why: `${detail} Without it these companies can only be matched on a shared macro-economic sector, which is not on its own a reason to compare them.`,
      }
    }

    return {
      peers: candidates.slice(0, limit),
      excluded: [],
      truncated: Math.max(0, candidates.length - limit),
      sizeBandApplied: false,
      why: `${detail} The companies below are compared on sectoral index membership alone, so they share a line of business but have not been matched on size.`,
    }
  }

  const kept = []
  const excluded = []

  for (const candidate of candidates) {
    const cap = candidate.marketCap?.value
    if (cap == null || !(cap > 0)) {
      excluded.push({
        ...candidate,
        why:
          candidate.marketCap?.unavailable ??
          'No market capitalisation could be derived, so this company could not be shown to be of comparable size.',
      })
      continue
    }
    const ratio = cap / anchor
    if (ratio > band || ratio < 1 / band) {
      excluded.push({
        ...candidate,
        ratio: Number(ratio.toFixed(3)),
        why: `Market capitalisation of ${croreText(cap)} against ${croreText(anchor)}, a factor of ${formatRatio(ratio)}, outside the ${band}x band this table compares within.`,
      })
      continue
    }
    kept.push({ ...candidate, ratio: Number(ratio.toFixed(3)) })
  }

  // Closest in size first, so a truncated table keeps the most comparable companies
  // rather than the alphabetically luckiest.
  kept.sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)))

  for (const over of kept.slice(limit)) {
    excluded.push({ ...over, why: `Inside the size band, but beyond the ${limit} closest in size to the subject.` })
  }

  return { peers: kept.slice(0, limit), excluded, sizeBandApplied: true, band }
}

const croreText = (rupees) => `Rs ${Number(toCrore(rupees)).toLocaleString('en-IN')} cr`
const formatRatio = (ratio) => (ratio >= 1 ? `${ratio.toFixed(1)}x` : `1/${(1 / ratio).toFixed(1)}x`)

// ---------------------------------------------------------------------------
// The metrics
// ---------------------------------------------------------------------------

/**
 * Every column the spec names, and where each one comes from.
 *
 * `basis` is the honest half. 'quarterly-pl' means the quarterly XBRL this site can
 * read carries the inputs. 'balance-sheet' means it does not: Indian companies file
 * the balance sheet half-yearly under reg 33(3)(f), the quarterly result is the
 * profit and loss statement alone, and there is no free structured source for the
 * rest. Those columns are rendered unavailable for every company in the table,
 * including the subject, and no sector figure is substituted for them.
 */
export const METRICS = [
  { key: 'marketCap', label: 'Market capitalisation', unit: 'Rs crore', basis: 'derived' },
  { key: 'revenueGrowth', label: 'Revenue growth', unit: '% year on year', basis: 'quarterly-pl' },
  { key: 'profitGrowth', label: 'Profit growth', unit: '% year on year', basis: 'quarterly-pl' },
  { key: 'pe', label: 'P/E', unit: 'x trailing earnings', basis: 'quarterly-pl' },
  { key: 'pb', label: 'P/B', unit: 'x book value', basis: 'balance-sheet' },
  { key: 'evEbitda', label: 'EV/EBITDA', unit: 'x', basis: 'balance-sheet' },
  { key: 'roe', label: 'ROE', unit: '%', basis: 'balance-sheet' },
  { key: 'roce', label: 'ROCE', unit: '%', basis: 'balance-sheet' },
  { key: 'debtToEquity', label: 'Debt to equity', unit: 'x', basis: 'balance-sheet' },
  { key: 'operatingMargin', label: 'Operating margin', unit: '%', basis: 'quarterly-pl' },
  { key: 'dividendYield', label: 'Dividend yield', unit: '%', basis: 'corporate-actions' },
]

// One reason per column rather than one shared sentence, because "the balance sheet
// is half-yearly" does not tell a reader which input was missing.
const BALANCE_SHEET_REASONS = {
  pb: 'Book value per share needs shareholders’ equity, which sits in the balance sheet. Indian companies file that half-yearly under regulation 33(3)(f) and the quarterly XBRL this report reads carries the profit and loss statement only.',
  evEbitda:
    'EBITDA is computable from the quarterly filing, but enterprise value is not: it needs borrowings and cash, both of which are balance sheet items filed half-yearly. The ratio is withheld rather than computed on equity value alone, which would be a different ratio wearing this one’s name.',
  roe: 'Return on equity needs shareholders’ equity from the balance sheet, which is filed half-yearly and is absent from the quarterly XBRL.',
  roce: 'Return on capital employed needs equity plus borrowings, both balance sheet items filed half-yearly and absent from the quarterly XBRL.',
  debtToEquity:
    'Needs borrowings and equity from the half-yearly balance sheet. The quarterly XBRL does define a DebtEquityRatio element, but it is filed by few companies and reads 0.00 for RELIANCE, whose standalone debt is not zero, so it is a placeholder rather than a figure.',
}

const CAPITAL_CHANGE = /bonus|split|consolidation of shares|demerger|rights/i
const DIVIDEND = /dividend/i
// "Dividend - Rs 6 Per Share", and the compound form NSE writes as
// "Interim Dividend Rs 11 Per Share/ Special Dividend Rs 46 Per Share".
const PER_SHARE = /rs\.?\s*([\d,]+(?:\.\d+)?)\s*per\s*share/gi

/**
 * Every denomination NSE-listed equity is actually issued in.
 *
 * The share count is paid-up capital over face value, so a face value wrong by a
 * factor is a market capitalisation wrong by the same factor, and nothing downstream
 * can see it: the product of two plausible numbers is a plausible number. Adani Total
 * Gas's integrated filing for the quarter to 2026-06-30 reports 100 against a share
 * that is a rupee share, which derives a hundredth of the count and published a
 * market capitalisation of Rs 660 crore for a company in the tens of thousands of
 * crore. A figure that far outside its own sector index is a parse failure wearing a
 * small company's clothes.
 *
 * A company whose face value is genuinely something else loses this figure and is
 * told why. That is the direction to be wrong in.
 */
const FACE_VALUES = [1, 2, 5, 10]

/**
 * The share count behind a market capitalisation, and the date it was true on.
 *
 * Read from any context in the filing. Paid-up capital and face value are properties
 * of the company rather than of a reporting period, so every context in one document
 * repeats the same pair, and taking the first avoids depending on which context name
 * the filing's vocabulary happens to use.
 */
export function sharesOutstanding(parsed) {
  const first = (tag) => {
    for (const raw of parsed.facts.get(tag)?.values() ?? []) {
      const n = Number(raw)
      if (Number.isFinite(n) && n !== 0) return n
    }
    return null
  }

  const paidUp = first('PaidUpValueOfEquityShareCapital')
  const faceValue = first('FaceValueOfEquityShareCapital')

  if (paidUp == null) return unavailable('The filing reports no paid-up equity share capital, so the share count cannot be derived.')
  if (faceValue == null || faceValue <= 0) {
    return unavailable('The filing reports no face value for the equity share capital, so the share count cannot be derived.')
  }
  if (!FACE_VALUES.includes(faceValue)) {
    return unavailable(
      `The filing reports a face value of Rs ${faceValue} for the equity share capital, which is not a denomination NSE-listed equity is issued in (Rs ${FACE_VALUES.join(', Rs ')}). Dividing the paid-up capital by it would derive a share count, and a market capitalisation, wrong by whatever factor the filing is out by, so both are refused.`
    )
  }
  return { value: paidUp / faceValue, paidUpCapital: paidUp, faceValue }
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Whether anything changed the share count between the filing and today.
 *
 * Fails closed, and the reason is the whole point of the guard: its job is to show
 * that no bonus, split, rights issue or demerger sits in that window, and a list it
 * could not read shows nothing. Passing on an unread list publishes "NSE records no
 * such action" on the strength of a fetch that failed, which is the one sentence this
 * report must never write.
 */
export function capitalChangeSince(info, periodEnd, asOf = today()) {
  const { actions, unseen } = corporateActions(info)
  if (unseen) {
    return unavailable(
      `${unseen} A share count as at ${periodEnd} is only current while nothing has changed it since, and that cannot be shown without the corporate action history, so no market capitalisation is published.`
    )
  }

  const since = actions
    .map((a) => ({ exDate: parseNseDate(a.exdate), capitalChange: CAPITAL_CHANGE.test(a.purpose ?? '') }))
    .filter((a) => a.exDate && a.capitalChange && a.exDate > periodEnd && a.exDate <= asOf)

  if (since.length) {
    return unavailable(
      `The share count is as at ${periodEnd}, and NSE records a capital-changing corporate action with an ex-date of ${since[0].exDate} since then, so multiplying that count by today’s price would not give this company’s market capitalisation.`
    )
  }
  return { ok: true, checked: actions.length, asOf }
}

/**
 * Market capitalisation for one company.
 *
 * Two fetches and a multiplication, and the whole of the care is in the date between
 * them: the share count is as at the filing's period end and the price is today's, so
 * anything that changed the share count in between makes the product meaningless. A
 * bonus, a split, a rights issue or a demerger with an ex-date in that window refuses
 * the figure outright.
 */
export async function marketCapOf({ symbol, isin }) {
  const [filings, info] = await Promise.all([
    attempt(`NSE’s quarterly filing list for ${symbol}`, () => listQuarterlyFilings(symbol)),
    infoOf(symbol),
  ])

  // The merged plan, not the filing list. NSE's filing list is roughly eighteen
  // months stale (it stops at 2024-12-31 for BAJFINANCE, PIDILITIND and TCS alike)
  // while top-corp-info carries the recent tail, and a share count read from the
  // stale half is a share count that predates most of the last two years of bonuses
  // and splits. Reading the newest filing either source knows about takes
  // BAJFINANCE's count from 2024-12-31 to 2026-06-30, which puts its June 2025 split
  // and bonus behind the filing instead of in front of it.
  const newest = planQuarters(Array.isArray(filings) ? filings : [], info?.unreadable ? null : info).find((f) => f.xbrl)
  if (!newest) {
    // "NSE lists no filing" is a statement about NSE. It is only this report's to make
    // when both sources answered; where one of them did not, what happened is that
    // nobody looked, and that is the sentence the reader gets.
    const blocked = [filings?.unreadable, info?.unreadable].filter(Boolean)
    return unavailable(
      blocked.length
        ? `${blocked.join(' ')} No quarterly filing could be listed for ${symbol}, and whether NSE publishes one is not known.`
        : `NSE lists no quarterly filing with a readable XBRL document for ${symbol}, so the share count cannot be derived.`
    )
  }

  let shares
  try {
    shares = sharesOutstanding(parseXbrl(await xbrlText(newest.xbrl)))
  } catch (err) {
    return unavailable(`The XBRL document for the quarter to ${newest.periodEnd} could not be read (${err.message}).`)
  }
  if (shares.value == null) return unavailable(`${shares.unavailable} Filing for the quarter to ${newest.periodEnd}.`)

  const stale = capitalChangeSince(info, newest.periodEnd)
  if (stale.unavailable) return stale

  const priced = await candles(isin, 'daily')
  const last = priced.bars?.[priced.bars.length - 1]
  if (!last) return unavailable(priced.unavailable ?? `No daily price history was returned for ${symbol}.`)

  return {
    value: shares.value * last.close,
    shares: shares.value,
    close: last.close,
    asOf: last.date,
    sharesAsOf: newest.periodEnd,
    faceValue: shares.faceValue,
    paidUpCapital: shares.paidUpCapital,
    sources: [SOURCES.xbrl, SOURCES.price],
    sourceUrl: newest.xbrl,
    note: `Derived: paid-up equity capital of ${croreText(shares.paidUpCapital)} at a face value of Rs ${shares.faceValue} is ${Math.round(shares.value).toLocaleString('en-IN')} shares, at a close of Rs ${last.close} on ${last.date}.`,
  }
}

/**
 * Dividends declared with an ex-date in the trailing year, per share.
 *
 * Summed from the corporate action purpose string, which is the only place NSE puts
 * the amount. A bonus or a split inside the same window changes what "per share"
 * means partway through it, and adding a pre-bonus rupee to a post-bonus rupee
 * overstates the yield by whatever the ratio was, so the window refuses instead.
 */
export function trailingDividend(info, asOf) {
  const { actions, unseen } = corporateActions(info)
  const from = new Date(Date.parse(asOf) - 365 * 86400000).toISOString().slice(0, 10)

  // Zero is a measured fact: a list that was read and carries no dividend ex-date in
  // the window. An unread list measures nothing, and publishing zero for it states
  // that this company declared no dividend, which is a claim the report does not have.
  if (unseen) {
    return unavailable(
      `${unseen} A dividend of zero between ${from} and ${asOf} would state that none was declared, which is not what an unread corporate action history says.`
    )
  }

  const inWindow = actions
    .map((a) => ({ exDate: parseNseDate(a.exdate), purpose: String(a.purpose ?? '') }))
    .filter((a) => a.exDate && a.exDate > from && a.exDate <= asOf)

  if (inWindow.some((a) => CAPITAL_CHANGE.test(a.purpose))) {
    return unavailable(
      `A bonus, split, rights or demerger ex-date falls between ${from} and ${asOf}, so the per-share dividends declared inside that year are not on one share base and cannot be added together.`
    )
  }

  const dividends = inWindow.filter((a) => DIVIDEND.test(a.purpose))
  if (!dividends.length) {
    return { value: 0, from, to: asOf, count: 0, note: `NSE records no dividend ex-date between ${from} and ${asOf}.` }
  }

  let total = 0
  let parsed = 0
  for (const action of dividends) {
    for (const [, amount] of action.purpose.matchAll(PER_SHARE)) {
      total += Number(amount.replace(/,/g, ''))
      parsed++
    }
  }

  if (!parsed) {
    return unavailable(
      `NSE records ${dividends.length} dividend ex-${dividends.length === 1 ? 'date' : 'dates'} between ${from} and ${asOf}, but states no per-share amount in a form this report can read.`
    )
  }

  return { value: Number(total.toFixed(4)), from, to: asOf, count: parsed, source: SOURCES.corpInfo }
}

/**
 * Everything the table needs about one company, in one object.
 *
 * Eight quarters rather than twelve: the table asks for growth on trailing twelve
 * months against the twelve months before it, which is exactly eight quarters, and
 * every additional quarter is another XBRL fetch multiplied by every peer.
 */
export async function snapshot({ symbol, isin, name }, { quarters = 8 } = {}) {
  const [cap, quarterly, info] = await Promise.all([
    marketCapOf({ symbol, isin }).catch((err) => unavailable(`Market capitalisation could not be derived: ${err.message}`)),
    quarterlySeries(symbol, { quarters }).catch((err) => ({ series: [], notes: [`Filing history unavailable: ${err.message}`] })),
    infoOf(symbol),
  ])

  return {
    symbol,
    isin,
    name,
    marketCap: cap,
    basis: quarterly.basis ?? null,
    basisReason: quarterly.basisReason ?? null,
    coverage: quarterly.coverage ?? null,
    series: quarterly.series ?? [],
    notes: quarterly.notes ?? [],
    dividend: cap.asOf ? trailingDividend(info, cap.asOf) : unavailable('No price date was established, so no dividend window could be measured.'),
  }
}

const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000)

/**
 * The trailing twelve months that ended exactly one year before this one.
 *
 * Anchored on the date, never on a row count. Counting four rows back through the
 * series lands on whatever row happens to be there, and NSE's quarterly feed is
 * missing quarters: HCLTECH's history jumps 2024-12-31 straight to 2025-09-30, so the
 * row four back from the twelve months to 2026-06-30 is the twelve months to
 * 2024-12-31. Comparing those two and printing the result as a year-on-year rate
 * measures thirty months and labels it twelve, which is a fabricated number with real
 * arithmetic behind it. 350 to 380 days admits a year of quarter ends and nothing
 * else.
 */
export function priorYearTtm(series, key, endIndex) {
  const end = series[endIndex]?.periodEnd
  if (!end) return unavailable('The series has no quarter at that position.')

  const index = series.findIndex((q) => {
    const gap = daysBetween(q.periodEnd, end)
    return gap >= 350 && gap <= 380
  })
  if (index === -1) {
    return unavailable(
      `The filing history contains no quarter ending twelve months before ${end}, so the comparable earlier year cannot be built and no growth rate is published.`
    )
  }
  return ttm(series, key, index)
}

/**
 * The metric cells for one company. Pure: a snapshot in, a row out.
 *
 * Every branch that cannot produce a number produces a reason instead. There is no
 * path through this function that returns a zero, a sector figure or a value borrowed
 * from another row, which is the one property the whole table rests on.
 */
export function metricsOf(snap) {
  const series = snap.series ?? []
  const cells = {}

  cells.marketCap = snap.marketCap?.value == null
    ? unavailable(snap.marketCap?.unavailable ?? 'No market capitalisation was derived.')
    : {
        value: Number(toCrore(snap.marketCap.value)),
        unit: 'Rs crore',
        asOf: snap.marketCap.asOf,
        sources: snap.marketCap.sources,
        note: snap.marketCap.note,
      }

  const growth = (key, label) => {
    if (!series.length) return unavailable(`No quarterly filing was read, so ${label} cannot be measured.`)
    const current = ttm(series, key, series.length - 1)
    if (current.value == null) return unavailable(`Trailing twelve months of ${label}: ${current.unavailable}`)
    const prior = priorYearTtm(series, key, series.length - 1)
    if (prior.value == null) return unavailable(`The twelve months ending a year before ${current.to}: ${prior.unavailable}`)
    const change = changePercent(current.value, prior.value)
    if (change.value == null) return unavailable(change.unavailable)
    return {
      value: change.value,
      unit: '% year on year',
      asOf: current.to,
      against: prior.to,
      basis: `the twelve months to ${current.to} against the twelve months to ${prior.to}`,
      sources: [SOURCES.xbrl],
    }
  }

  cells.revenueGrowth = growth('revenue', 'revenue from operations')
  cells.profitGrowth = growth('pat', 'profit for the period')

  const earnings = ttm(series, 'pat', series.length - 1)
  if (snap.marketCap?.value == null) {
    cells.pe = unavailable(`A price to earnings ratio needs a market capitalisation. ${snap.marketCap?.unavailable ?? ''}`.trim())
  } else if (earnings.value == null) {
    cells.pe = unavailable(`A price to earnings ratio needs trailing twelve month profit. ${earnings.unavailable}`)
  } else if (earnings.value <= 0) {
    cells.pe = unavailable('Trailing twelve month profit is not positive, so a price to earnings ratio carries no meaning and none is published.')
  } else {
    cells.pe = {
      value: Number((snap.marketCap.value / earnings.value).toFixed(2)),
      unit: 'x trailing earnings',
      asOf: snap.marketCap.asOf,
      earningsTo: earnings.to,
      sources: [SOURCES.xbrl, SOURCES.price],
    }
  }

  const latestMargin = margins(series)[series.length - 1]
  cells.operatingMargin = latestMargin?.operating == null
    ? unavailable(latestMargin?.operatingUnavailable ?? latestMargin?.unavailable ?? 'No quarter with a readable profit and loss statement was available.')
    : {
        value: latestMargin.operating,
        unit: '%',
        asOf: latestMargin.periodEnd,
        basis: 'earnings before interest, tax, depreciation and amortisation, over revenue from operations, for the latest reported quarter',
        sources: [SOURCES.xbrl],
      }

  const dividend = snap.dividend
  if (dividend?.value == null) {
    cells.dividendYield = unavailable(dividend?.unavailable ?? 'No dividend history was read.')
  } else if (snap.marketCap?.close == null) {
    cells.dividendYield = unavailable('A dividend yield needs a share price, and none was established.')
  } else {
    cells.dividendYield = {
      value: Number(((dividend.value / snap.marketCap.close) * 100).toFixed(2)),
      unit: '%',
      asOf: snap.marketCap.asOf,
      perShare: dividend.value,
      window: `${dividend.from} to ${dividend.to}`,
      sources: [SOURCES.corpInfo, SOURCES.price],
    }
  }

  for (const [key, why] of Object.entries(BALANCE_SHEET_REASONS)) cells[key] = unavailable(why)

  return cells
}

/**
 * The table, subject first.
 *
 * Subject first rather than sorted, and no column is ranked. A sort on any one metric
 * turns a table of statistics into a league, and a league says one of these companies
 * is the good one, which is a judgement this report does not make.
 */
export function peerTable(subjectSnap, peerSnaps) {
  const rows = [subjectSnap, ...peerSnaps].map((snap, i) => ({
    symbol: snap.symbol,
    name: snap.name,
    isin: snap.isin,
    subject: i === 0,
    basis: snap.basis,
    coverage: snap.coverage,
    metrics: metricsOf(snap),
  }))

  const cells = rows.length * METRICS.length
  const sourced = rows.reduce((n, row) => n + METRICS.filter((m) => row.metrics[m.key]?.value != null).length, 0)

  return {
    columns: METRICS,
    rows,
    completeness: {
      cells,
      sourced,
      unavailable: cells - sourced,
      note: 'Every cell is a figure with a source or an explicit reason it is absent. No cell is estimated, interpolated or filled from a sector figure.',
    },
    // A column is computable only if some row actually carried a figure. The growth
    // columns are the reason: NSE's quarterly feed skips quarters for most large
    // companies, so a year-on-year rate is frequently uncomputable for every row, and
    // advertising it as available makes an empty column read as a rendering bug.
    computable: METRICS.filter((m) => m.basis !== 'balance-sheet')
      .filter((m) => rows.some((r) => r.metrics?.[m.key]?.value != null))
      .map((m) => m.label),
    notComputable: METRICS.filter((m) => m.basis === 'balance-sheet').map((m) => ({ label: m.label, why: BALANCE_SHEET_REASONS[m.key] })),
  }
}

// ---------------------------------------------------------------------------
// Commentary. Counting only.
// ---------------------------------------------------------------------------

function sentence(text) {
  const { ok, violations } = checkPhrase(text)
  if (!ok) throw new Error(`peers.js wrote a non-publishable phrase: ${violations.map((v) => v.why).join(', ')}`)
  return text
}

// Higher is not better and lower is not worse; these words only name the direction
// of a comparison that the reader draws their own conclusion from.
// `align` names the cell field that has to match the subject's before a peer counts.
// Two companies do not file on the same day, and a margin for the quarter to June
// against a margin for the quarter to March is not a comparison, it is two facts
// printed next to each other. The rows still show both; only the counting sentence
// insists they line up.
const DESCRIBE = [
  { key: 'pe', lower: 'a lower ratio of market capitalisation to trailing twelve month profit', align: 'earningsTo' },
  { key: 'revenueGrowth', lower: 'a lower rate of revenue growth', align: 'asOf' },
  { key: 'profitGrowth', lower: 'a lower rate of profit growth', align: 'asOf' },
  { key: 'operatingMargin', lower: 'a lower operating margin', align: 'asOf' },
  { key: 'dividendYield', lower: 'a lower dividend yield', align: null },
]

/**
 * One column of the table, counted against the subject. Returns null when there is
 * nothing countable, which is not the same as a count of zero.
 *
 * Exported because the analyzer's scorecard needs the same counts the sentences below
 * are written from, and two implementations of the alignment rule are two rules that
 * drift. Counts only: `below` and `above` name directions, never a better and a worse.
 */
export function compareToPeers(table, key) {
  const [subject, ...peers] = table?.rows ?? []
  const spec = DESCRIBE.find((d) => d.key === key)
  const mine = subject?.metrics?.[key]
  if (!spec || !peers.length || mine?.value == null) return null

  const computable = peers.filter((p) => p.metrics[key]?.value != null)
  const comparable = spec.align ? computable.filter((p) => p.metrics[key][spec.align] === mine[spec.align]) : computable
  if (!comparable.length) return null

  return {
    key,
    subject: subject.symbol,
    value: mine.value,
    unit: unitSuffix(key).trim(),
    period: spec.align ? (mine[spec.align] ?? null) : null,
    comparable: comparable.length,
    below: comparable.filter((p) => p.metrics[key].value < mine.value).length,
    above: comparable.filter((p) => p.metrics[key].value > mine.value).length,
    droppedForPeriod: computable.length - comparable.length,
  }
}

/**
 * Sentences that count, and nothing else.
 *
 * "Three of the five peers report a lower multiple" is arithmetic over the table
 * above it and a reader can check it by eye. "The stock is cheap relative to peers"
 * is the same arithmetic with a conclusion stapled on, and the conclusion is the part
 * this site is not allowed to publish and would not want to.
 */
export function describeTable(table) {
  const [subject, ...peers] = table.rows
  if (!subject || !peers.length) return []

  const notes = []
  for (const { key, lower, align } of DESCRIBE) {
    const counted = compareToPeers(table, key)
    if (!counted) continue

    const { below, comparable, droppedForPeriod: dropped, value } = counted
    notes.push(
      sentence(
        `${below} of the ${comparable} ${comparable === 1 ? 'peer' : 'peers'} with a comparable figure ${below === 1 ? 'reports' : 'report'} ${lower} than ${subject.symbol}, whose figure is ${value}${unitSuffix(key)}${
          align ? ` for the period to ${counted.period}` : ''
        }.${dropped ? ` A further ${dropped} ${dropped === 1 ? 'peer reports this figure' : 'peers report this figure'} for a different period, so ${dropped === 1 ? 'it is' : 'they are'} not counted here.` : ''}`
      )
    )
  }

  const { sourced, cells } = table.completeness
  notes.push(
    sentence(
      `${sourced} of the ${cells} cells in this table carry a sourced figure. The other ${cells - sourced} are marked unavailable, each with the reason the figure could not be verified.`
    )
  )

  return notes
}

const unitSuffix = (key) => {
  const unit = METRICS.find((m) => m.key === key)?.unit ?? ''
  return unit.startsWith('%') ? '%' : unit.startsWith('x') ? unit : ` ${unit}`
}

// ---------------------------------------------------------------------------
// The whole thing
// ---------------------------------------------------------------------------

// The network seam, so the two passes below can be exercised without NSE. Same shape
// and same reason as the deps object in routes/analyze.js: one object, called through
// everywhere, rebound in tests.
export const deps = { loadClassification, marketCapOf, snapshot }

/**
 * Why no peer table was published, in the reader's terms. Null when there is one.
 */
function noPeerGroup(subject, pool, chosen) {
  if (chosen.peers.length) return null
  if (pool.unavailable) return pool.unavailable
  if (!pool.candidates.length) return `NSE groups no other listed company with ${subject.symbol}, so there is nobody to compare it to.`
  if (chosen.sizeBandApplied) {
    const n = pool.candidates.length
    return `Of the ${n} ${n === 1 ? 'company' : 'companies'} NSE groups with ${subject.symbol}, none could be shown to be of comparable size, so no like-for-like table is published. The figures below are ${subject.symbol}'s own.`
  }
  return `No peer table is published for ${subject.symbol}. ${chosen.why}`
}

/**
 * The peer section for one company.
 *
 * Two passes over the network on purpose. The first prices every candidate, which is
 * one filing list, one XBRL document and one candle series each, and is what the size
 * band needs. Only what survives the band pays for the second pass, which is eight
 * quarters of filings per company. Choosing peers first and pricing them afterwards
 * would mean picking them in whatever order NSE happens to write the constituent
 * file, which is alphabetical.
 *
 * The subject's own row is not part of that bargain. Its market capitalisation, P/E,
 * margin and dividend yield are read from its own filings and its own price, and they
 * are the first thing the page shows. Returning early because nobody comparable was
 * found deleted all of them, for RELIANCE among others: an empty peer group is a fact
 * about the sector, never a reason to withhold the company's own figures. The table
 * is always built, and where there is no peer group the reason rides beside it.
 */
export async function peerComparison(subject, { limit = PEER_LIMIT, cap = CANDIDATE_CAP, band = SIZE_BAND } = {}) {
  const classification = await attempt('NSE’s index constituent lists', () => deps.loadClassification())
  const pool = classification.unreadable
    ? { tier: null, candidates: [], unavailable: `${classification.unreadable} Without them NSE publishes no sector for ${subject.symbol} here, and no peer group can be assembled without guessing one.` }
    : peerCandidates(subject, classification, { cap })

  const priced = await inBatches([subject, ...pool.candidates], 4, async (company) => ({
    ...company,
    marketCap: await deps.marketCapOf(company).catch((err) => unavailable(`Market capitalisation could not be derived: ${err.message}`)),
  }))

  const [subjectPriced, ...candidatesPriced] = priced
  const chosen = pool.unavailable
    ? { peers: [], excluded: [], sizeBandApplied: false, why: pool.unavailable }
    : selectPeers(subjectPriced, candidatesPriced, { limit, band, tier: pool.tier })

  const snaps = await inBatches([subjectPriced, ...chosen.peers], 3, (company) => deps.snapshot(company))
  const [subjectSnap, ...peerSnaps] = snaps
  const table = peerTable(subjectSnap, peerSnaps)
  const peerless = noPeerGroup(subject, pool, chosen)

  return {
    subject: subject.symbol,
    tier: pool.tier,
    basis: pool.basis ?? null,
    industry: pool.industry ?? null,
    // Absent peers, named as such. Not the block-level `unavailable`, which says the
    // whole section produced nothing, and the subject's own row is not nothing.
    peerGroup: peerless ? { unavailable: peerless } : null,
    sizeBand: chosen.sizeBandApplied
      ? { band, note: `Peers are companies whose market capitalisation is between a ${band}th and ${band} times that of ${subject.symbol}.` }
      : { applied: false, why: chosen.why ?? peerless },
    // Two numbers, because they differ and the difference matters: NSE groups this
    // many companies with the subject, and only this many were actually priced and
    // tested against the size band.
    considered: { grouped: pool.total ?? 0, priced: pool.candidates.length },
    table,
    // The reason leads the notes, because on a table of one row it is the sentence
    // that explains what the reader is looking at.
    notes: [...(peerless ? [peerless] : []), ...describeTable(table)],
    excluded: chosen.excluded.map((c) => ({ symbol: c.symbol, name: c.name, why: c.why })),
    classificationGapsFor: classification.missingGroups ?? [],
    source: SOURCES.classification,
    fetchedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// What this table cannot answer
// ---------------------------------------------------------------------------

export const UNAVAILABLE = [
  {
    field: 'Peer book value, return on equity, return on capital employed, debt to equity and EV/EBITDA',
    why: 'All five need the balance sheet, which Indian companies file half-yearly under regulation 33(3)(f). The quarterly XBRL carries the profit and loss statement only, so these columns are empty for every company in the table rather than estimated for any of them.',
  },
  {
    field: 'Sub-industry peer groups',
    why: 'NSE publishes a macro-economic sector and its sectoral index membership, and nothing between them. A company in no sectoral index is compared within its macro sector, which can contain more than one line of business, and the table says so.',
  },
  {
    field: 'Companies outside the Nifty Total Market constituents',
    why: 'NSE classifies roughly 750 companies in its published constituent lists. A listed company outside them has no free published sector, and no peer group is invented for it.',
  },
  {
    field: 'Revenue and profit growth where the filing history skips a quarter',
    why: 'A year-on-year rate compares the twelve months to the latest quarter against the twelve months ending a year earlier, and each of those needs four adjacent filings. NSE’s quarterly feed is missing quarters for most large companies, and where a hole falls inside either window the rate is withheld rather than measured across a longer span and labelled a year.',
  },
  {
    field: 'Market capitalisation across a recent bonus, split, rights issue or demerger',
    why: 'The share count is derived from the paid-up capital in the latest quarterly filing. Where a capital-changing corporate action has an ex-date after that quarter, the count is stale and the market capitalisation is withheld instead of being published wrong.',
  },
  {
    field: 'Market capitalisation where the filing states a face value outside Rs 1, 2, 5 and 10',
    why: 'The share count is the paid-up capital divided by the face value, so a face value out by a factor produces a market capitalisation out by the same factor and nothing downstream can see it. Those four denominations are what NSE-listed equity is issued in, and a filing that states anything else loses the figure rather than having it derived from a number that did not survive the document.',
  },
  {
    field: 'Market capitalisation and dividend yield where the corporate action history could not be fetched',
    why: 'Both rest on NSE’s corporate actions list: one to show no bonus or split has made the share count stale, the other to add up what was declared. A fetch that failed is not a company that declared nothing, so both are marked unavailable with the failure named, rather than passing the guard and reporting a yield of zero.',
  },
]
