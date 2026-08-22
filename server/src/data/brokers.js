// Research desks whose calls actually get reported in Indian market coverage.
// Longest names first so "ICICI Securities" wins over a bare "ICICI".
export const BROKERS = [
  'Motilal Oswal', 'ICICI Securities', 'ICICI Direct', 'Kotak Institutional', 'Kotak Securities',
  'HDFC Securities', 'Axis Securities', 'Axis Capital', 'JM Financial', 'Emkay Global', 'Emkay',
  'Nuvama Institutional', 'Nuvama', 'Anand Rathi', 'Sharekhan', 'Angel One', 'Prabhudas Lilladher',
  'Geojit', 'Centrum Broking', 'Centrum', 'IIFL Securities', 'IIFL', 'Elara Capital', 'Elara',
  'Antique Stock Broking', 'Systematix', 'Ventura Securities', 'Ventura', 'Choice Broking',
  'SBI Securities', 'Yes Securities', 'Dolat Capital', 'B&K Securities', 'Phillip Capital',
  'Jefferies', 'Morgan Stanley', 'Goldman Sachs', 'JPMorgan', 'JP Morgan', 'Citi', 'CLSA',
  'Macquarie', 'Nomura', 'UBS', 'Bernstein', 'HSBC', 'BofA', 'Bank of America', 'Investec',
  'Ambit Capital', 'Ambit', 'Edelweiss', 'Sharekhan by BNP', 'Religare Broking', 'Religare',
  'Mirae Asset', 'Bajaj Broking', 'LKP Securities', 'LKP', 'Arihant Capital', 'Marwadi',
]

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Word boundaries matter more than they look. A plain substring match found
// "UBS" inside "subscribe" and would find "Citi" inside "city".
const MATCHERS = [...BROKERS]
  .sort((a, b) => b.length - a.length)
  .map((name) => ({ name, re: new RegExp(`(?:^|[^A-Za-z])${escape(name)}(?![A-Za-z])`, 'i') }))

export function detectBroker(text = '') {
  for (const { name, re } of MATCHERS) {
    if (re.test(text)) return name
  }
  return null
}

const RATINGS = [
  { label: 'BUY', re: /\b(buy|accumulate|add|outperform|overweight)\b/i },
  { label: 'SELL', re: /\b(sell|reduce|underperform|underweight)\b/i },
  { label: 'HOLD', re: /\b(hold|neutral|equal ?weight)\b/i },
]

export function detectRating(text = '') {
  for (const r of RATINGS) if (r.re.test(text)) return r.label
  return null
}

// "target price of Rs 1,450" / "target of ₹1450" / "TP Rs 1450"
export function detectTarget(text = '') {
  const match =
    /(?:target(?:\s+price)?\s*(?:of|to|at|:)?)\s*(?:Rs\.?|₹|INR)?\s*([\d,]+(?:\.\d+)?)/i.exec(text) ||
    /\bTP\s*(?:of|:)?\s*(?:Rs\.?|₹|INR)?\s*([\d,]+(?:\.\d+)?)/i.exec(text) ||
    /(?:Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s*target/i.exec(text)
  if (!match) return null
  const value = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}
