// What the analyzer is allowed to say.
//
// SEBI amended the Research Analyst regulations on 16 December 2024. Registration
// now triggers on CONSIDERATION: a person who, for consideration, is engaged in the
// business of providing "research services". This site takes no money, runs no ads
// and carries no affiliate links, so the analyzer sits outside that trigger. Two
// consequences follow, and both are load-bearing:
//
//   1. The moment any analyzer page is paywalled, ad-supported or carries a broker
//      referral, this feature needs an RA registration. That is a business decision
//      with an engineering blast radius, not a growth experiment.
//
//   2. Reg 2(1)(wa) defines "research services" as an explicit list, which reads as
//      a blocklist: buy/sell/hold, price target, stop loss, model portfolio, trading
//      calls, opinions on public offers. The list below is that list.
//
// Separately, Reg 2(1)(w) expressly carves OUT "statistical summaries of financial
// data of the companies" from the definition of a research report. That carve-out is
// the lane the whole fundamentals engine lives in: a revenue series, a margin trend,
// a shareholding table and a ratio history are statistics, not advice.
//
// The distinction is never the methodology. It is the verb. "RSI is 71, above the
// conventional 70 threshold" is a statistic. "RSI signals overbought, consider
// booking profits" is advice. Same indicator, same number, different regulation.

// Verbs that describe what happened. Everything the analyzer writes uses these.
export const REPORTING_VERBS = [
  'is', 'was', 'are', 'were', 'stands at', 'closed', 'opened', 'crossed', 'rose',
  'fell', 'declined', 'increased', 'decreased', 'measured', 'detected', 'recorded',
  'reported', 'filed', 'held', 'traded', 'remained', 'reached', 'completed',
]

// Phrases that turn a statistic into a recommendation. Each entry names the clause
// of reg 2(1)(wa) it belongs to, so a future reader can check the reasoning rather
// than trusting the list.
//
// The first entry is held separately because it is the only one the consideration
// test can lift. See CONCLUSION_EXEMPTION below.
const RECOMMENDATION = { re: /\b(buy|sell|hold|accumulate|reduce|book (?:profits?|losses?))\b/i, clause: '2(1)(wa)(i)', why: 'a buy, sell or hold recommendation' }

const FORBIDDEN = [
  RECOMMENDATION,
  { re: /\b(target price|price target|target zone|fair value estimate)\b/i, clause: '2(1)(wa)(iv)', why: 'a price target' },
  { re: /\b(stop ?loss|invalidation level|exit level)\b/i, clause: '2(1)(wa)(iv)', why: 'a stop loss' },
  { re: /\b(model portfolio|recommended portfolio|allocation advice)\b/i, clause: '2(1)(wa)(ii)', why: 'a model portfolio' },
  { re: /\b(trading call|intraday call|positional call|entry point)\b/i, clause: '2(1)(wa)(iii)', why: 'a trading call' },
  { re: /\b(should (?:buy|sell|invest|exit|enter)|we recommend|our recommendation|advise|advisable)\b/i, clause: '2(1)(wa)(i)', why: 'advice' },
  { re: /\b(overbought|oversold|bullish signal|bearish signal|strong buy|must[- ]buy)\b/i, clause: '2(1)(wa)(i)', why: 'an interpretive signal presented as a conclusion' },
  { re: /\b(will (?:rise|fall|go up|go down|reach)|expected to (?:rise|fall|reach)|poised (?:to|for))\b/i, clause: '2(1)(wa)(i)', why: 'a price forecast' },
  { re: /\b(guaranteed|assured returns?|risk[- ]free|multibagger|sure ?shot)\b/i, clause: 'general', why: 'a returns claim' },
]

// The one narrow exemption, and the reason it is narrow.
//
// A node carrying `policyExemption: CONCLUSION_EXEMPTION` has the buy/sell/hold clause
// lifted over it and its children. That clause, alone in the list above, is triggered
// by CONSIDERATION rather than by content: reg 3(1) as amended on 16 December 2024
// bites on providing research services for consideration, and this site charges
// nothing for any of it. conclusion.js is the only module that sets the marker, it
// states that condition beside every label it emits, and it fails at startup if the
// environment starts to look monetised.
//
// Every other clause keeps running inside the exempted subtree. A price target and a
// stop loss stay forbidden there for the same reason they are forbidden everywhere
// else: they are wrong by content, and no amount of giving the analysis away for free
// makes publishing a level to trade against something this site does.
export const CONCLUSION_EXEMPTION = 'conclusion'
const FORBIDDEN_IN_CONCLUSION = FORBIDDEN.filter((f) => f !== RECOMMENDATION)

/**
 * Check one string of analyzer-authored prose.
 *
 * This governs text the ENGINE writes. It deliberately does not run over the
 * content of a news headline or an exchange filing, because reporting that a
 * brokerage published a target is a fact about the world, not this site making a
 * recommendation. Quoted third-party material is attributed and passes through.
 */
export function checkPhrase(text, rules = FORBIDDEN) {
  const violations = []
  for (const { re, clause, why } of rules) {
    const hit = re.exec(String(text ?? ''))
    if (hit) violations.push({ phrase: hit[0], clause, why })
  }
  return { ok: violations.length === 0, violations }
}

/**
 * Gate for a whole generated report. Throws rather than returning, because a report
 * that failed this check must never reach a response body: returning a flag invites
 * a caller to log it and carry on.
 */
export function assertPublishable(report) {
  const problems = []
  const walk = (node, path, rules) => {
    if (typeof node === 'string') {
      const { violations } = checkPhrase(node, rules)
      for (const v of violations) problems.push(`${path}: "${v.phrase}" is ${v.why} (reg ${v.clause})`)
      return
    }
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`, rules))
    if (node && typeof node === 'object') {
      // Third-party text is attributed, not authored here.
      if (node.source && node.headline) return
      // The exemption applies to the marked node and everything under it, and to
      // nothing else in the report. Grep for CONCLUSION_EXEMPTION to see every place
      // it is claimed; there is one.
      const scoped = node.policyExemption === CONCLUSION_EXEMPTION ? FORBIDDEN_IN_CONCLUSION : rules
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, scoped)
    }
  }
  walk(report, '', FORBIDDEN)

  if (problems.length) {
    throw new Error(
      `Report withheld. The analyzer may publish statistics, not research services:\n  ${problems.join('\n  ')}`
    )
  }
  return report
}

// Every analyzer response carries this. It is not decoration: the carve-out the
// feature relies on is for statistical summaries, so the page has to say that is
// what it is.
/**
 * The disclosure that belongs on a report, which is not always the one above.
 *
 * A report carrying a conclusion block cannot also claim it publishes no
 * recommendation; that sentence is true of the engines and false of the page. Rather
 * than soften the default for every response, the line is replaced only on the
 * responses it would be wrong on, so /resolve and a scorecard-only report keep saying
 * the stronger and still accurate thing.
 *
 * Attached after the gate, like ANALYZER_DISCLOSURE itself and for the same reason:
 * it describes what the report does and does not contain, and checking a description
 * of a rule against the rule withholds every report ever generated.
 */
export function disclosureFor(report) {
  if (!report?.conclusion?.verdict) return ANALYZER_DISCLOSURE
  return {
    ...ANALYZER_DISCLOSURE,
    notWhat:
      'Not a research report and not advice. It carries a buy, sell or hold label derived mechanically from the scorecard, and no target price and no stop loss, by design.',
    consideration:
      'This feature is free. It carries no advertising, no paywall and no broker referral, and the label is published on that basis: SEBI research analyst registration triggers on providing research services for consideration.',
  }
}

export const ANALYZER_DISCLOSURE = {
  what: 'A statistical summary of published exchange and filing data, computed mechanically.',
  notWhat: 'Not a research report, not a recommendation, and not advice. No target price and no stop loss is published, by design.',
  registration: 'InvestoMillionaire is not registered with SEBI as a Research Analyst or an Investment Adviser.',
  consideration: 'This feature is free. It carries no advertising, no paywall and no broker referral.',
  method: 'Every figure shown carries its source and the date it was published. Anything that could not be verified is shown as unavailable rather than estimated.',
}
