// A mechanical score. Every rule that fires is returned with its own points, so
// the reader can see exactly what produced the label and disagree with any part
// of it. Nothing here is discretionary and nothing here knows anything about the
// business behind the issue.

const BANDS = [
  { min: 0.8, verdict: 'APPLY', tone: 'green', gist: 'Nearly every measurable signal is positive.' },
  { min: 0.62, verdict: 'CONSIDER', tone: 'lime', gist: 'More positive than negative, with real gaps.' },
  { min: 0.45, verdict: 'RISKY', tone: 'amber', gist: 'Signals pull in both directions.' },
  { min: -1, verdict: 'AVOID', tone: 'red', gist: 'Most measurable signals are negative.' },
]

function rule(label, detail, points, min, max) {
  return { label, detail, points, min, max }
}

export function scoreIssue(issue, gmp, categories = []) {
  const rules = []
  const find = (re) => categories.find((c) => re.test(c.category))
  const qib = find(/qualified institutional/i)
  const bidding = issue.phase !== 'upcoming'

  // Grey market premium. Weighted heavily because the reader asked for it, and
  // wrong for exactly that reason: it is unregulated and frequently revised.
  if (gmp?.percent != null) {
    const p = gmp.percent
    const points = p < 0 ? -3 : p >= 50 ? 3 : p >= 25 ? 2 : p >= 10 ? 1 : 0
    rules.push(
      rule(
        'Grey market premium',
        `${p >= 0 ? '+' : ''}${p}% over the cap price, quoted at Rs ${gmp.premium}`,
        points,
        -3,
        3
      )
    )
  }

  if (qib) {
    const t = qib.times
    const points = t >= 3 ? 2 : t >= 1 ? 1 : bidding && issue.daysLeft > 0 ? -1 : -2
    rules.push(rule('Institutional demand', `QIB portion subscribed ${t.toFixed(2)}x`, points, -2, 2))
  }

  if (gmp?.percent != null && qib && gmp.percent >= 25 && qib.times < 1) {
    rules.push(
      rule(
        'Grey market vs institutions',
        `Grey market at +${gmp.percent}% while the QIB book sits at ${qib.times.toFixed(2)}x`,
        -2,
        -2,
        0
      )
    )
  }

  if (issue.subscribedTimes != null) {
    const t = issue.subscribedTimes
    const points = t >= 20 ? 2 : t >= 5 ? 1 : t >= 1 ? 0 : -2
    rules.push(rule('Overall demand', `Total book subscribed ${t.toFixed(2)}x`, points, -2, 2))
  }

  if (gmp?.hasAnchor != null) {
    rules.push(
      rule(
        'Anchor book',
        gmp.hasAnchor ? 'Anchor investors allotted before the issue opened' : 'No anchor allotment recorded',
        gmp.hasAnchor ? 1 : 0,
        0,
        1
      )
    )
  }

  if (gmp?.pe != null) {
    const points = gmp.pe <= 15 ? 1 : gmp.pe > 40 ? -1 : 0
    rules.push(rule('Valuation', `Post-issue P/E of ${gmp.pe}`, points, -1, 1))
  }

  rules.push(
    rule(
      'Board',
      issue.board === 'SME' ? 'SME board: thin post-listing volume, large lot value' : 'Mainboard listing',
      issue.board === 'SME' ? -1 : 0,
      -1,
      0
    )
  )

  if (issue.issueSizeCrore != null) {
    const small = issue.issueSizeCrore < 300
    rules.push(
      rule(
        'Issue size',
        small ? `Roughly Rs ${issue.issueSizeCrore} cr, so a small free float` : `Roughly Rs ${issue.issueSizeCrore} cr`,
        small ? -1 : 0,
        -1,
        0
      )
    )
  }

  const score = rules.reduce((sum, r) => sum + r.points, 0)
  const worst = rules.reduce((sum, r) => sum + r.min, 0)
  const best = rules.reduce((sum, r) => sum + r.max, 0)
  const normalised = best === worst ? 0.5 : (score - worst) / (best - worst)
  let band = BANDS.find((b) => normalised >= b.min) ?? BANDS[BANDS.length - 1]

  // Before bidding opens there is no book to read, so the score rests almost
  // entirely on grey market chatter. That is not enough to earn the top band.
  let capped = false
  if (issue.phase === 'upcoming' && band.verdict === 'APPLY') {
    band = BANDS.find((b) => b.verdict === 'CONSIDER')
    capped = true
  }

  return {
    verdict: band.verdict,
    capped,
    tone: band.tone,
    gist: band.gist,
    score,
    best,
    worst,
    normalised: Number(normalised.toFixed(3)),
    rules,
    // Upcoming issues have no book yet, so the score rests on fewer inputs.
    confidence: issue.phase === 'upcoming' ? 'low' : rules.length >= 6 ? 'high' : 'medium',
  }
}
