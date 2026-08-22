// Grey market premium, pulled from the feed InvestorGain renders its public GMP
// report from. Every figure that leaves this module carries its source and the
// timestamp the source itself published, because GMP has no official source and
// no two publishers agree on it.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const GMP_SOURCE = { name: 'InvestorGain', url: 'https://www.investorgain.com/report/live-ipo-gmp/331/' }

const CACHE_MS = 15 * 60 * 1000
let cache = { at: 0, rows: [] }

function financialYear(date = new Date()) {
  const year = date.getUTCFullYear()
  // Indian financial year runs April to March.
  const start = date.getUTCMonth() >= 3 ? year : year - 1
  return { year: start, label: `${start}-${String(start + 1).slice(2)}` }
}

function strip(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#8377;/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumber(raw) {
  const cleaned = String(raw ?? '').replace(/[^0-9.-]/g, '')
  const value = Number(cleaned)
  return Number.isFinite(value) && cleaned !== '' ? value : null
}

export async function loadGmp() {
  if (Date.now() - cache.at < CACHE_MS && cache.rows.length) return cache.rows

  const { year, label } = financialYear()
  const url = `https://webnodejs.investorgain.com/cloud/v2/report/data-read/331/1/8/${year}/${label}/0/all?search=&v=1`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: GMP_SOURCE.url },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`GMP source responded ${res.status}`)

  const json = await res.json()
  const rows = (json.reportTableData || []).map((row) => {
    const premium = toNumber(row['~max_gmp1'])
    const percent = toNumber(row['~gmp_percent_calc'])
    const priceLabel = strip(row['Price (₹)'])
    const cap = toNumber(priceLabel.split(/\s|to|-/).filter(Boolean).pop())

    return {
      name: row['~ipo_name'] || strip(row.Name),
      category: row['~ipo_category1'] || null,
      status: row['~ipo_status1'] || null,
      premium,
      percent,
      // What the grey market implies the listing price would be. An implication, not a forecast.
      estimatedListing: premium != null && cap != null ? cap + premium : null,
      capPrice: cap,
      lot: toNumber(row.Lot),
      pe: toNumber(row['~P/E']),
      sizeLabel: strip(row['IPO Size']) || null,
      // Each flame is one notch on the source's own subscription-interest rating.
      heat: (strip(row.Rating).match(/🔥/g) || []).length,
      hasAnchor: /✅/.test(strip(row.Anchor)),
      allotmentDate: row['~Srt_BoA_Dt'] || null,
      listingDate: row['~Str_Listing'] || null,
      opens: row['~Srt_Open'] || null,
      closes: row['~Srt_Close'] || null,
      updatedLabel: strip(row['Updated-On']) || null,
      sourceUrl: row['~urlrewrite_folder_name']
        ? `https://www.investorgain.com${row['~urlrewrite_folder_name']}`
        : GMP_SOURCE.url,
    }
  })

  if (rows.length) cache = { at: Date.now(), rows }
  return cache.rows
}

const NOISE = /\b(limited|ltd|private|pvt|india|indian|enterprises|industries|instruments|company|group|the|and)\b/g

function tokens(name = '') {
  return new Set(
    name
      .toLowerCase()
      .replace(NOISE, ' ')
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3)
  )
}

// NSE says "Tempsens Instruments (India) Limited", the GMP feed says "Tempsens
// Instruments (India)". Score on shared distinctive words and take the best.
export function matchGmp(company, rows) {
  const wanted = tokens(company)
  if (!wanted.size) return null

  let best = null
  let bestScore = 0
  for (const row of rows) {
    const have = tokens(row.name)
    if (!have.size) continue
    let shared = 0
    for (const word of wanted) if (have.has(word)) shared++
    const score = shared / Math.max(wanted.size, have.size)
    if (score > bestScore) {
      bestScore = score
      best = row
    }
  }

  // Below half the distinctive words in common it is more likely a different company.
  return bestScore >= 0.5 ? { ...best, matchConfidence: Number(bestScore.toFixed(2)) } : null
}
