// The conclusion layer: the only place in this codebase that names a call.
//
// Everything upstream of this file measures and refuses to interpret. indicators.js
// prints RSI and will not say what it means; the scorecard adds rows up and says in
// as many words that the total "describes what the measurements were, not what to do
// about them". This module is the deliberate exception, and it is one because of a
// condition that has nothing to do with the arithmetic.
//
// SEBI's 16 December 2024 amendment triggers Research Analyst registration on
// providing research services FOR CONSIDERATION. This site is free: no paywall, no
// advertising, no affiliate link, no broker referral. On that reading the trigger is
// not met and a buy/sell/hold label is publishable here. The whole feature rests on
// that single fact, so the code is built to make it visible and to break in the right
// direction rather than to sit quietly:
//
//   VERDICT_ENABLED is one flag, read once from the environment, and switching it off
//   removes the label and changes nothing else. There is no second place to look.
//
//   consideration() runs at import and throws if the environment has grown a variable
//   that names ads, an affiliate, a referral or a paywall. It cannot detect
//   monetisation; nothing in a process can. What it can do is make the assumption
//   findable by grep and noisy on the day someone starts wiring money in, which is
//   the day this label needs a registration behind it.
//
// Two things stay forbidden whatever the flag says, because they are forbidden by
// content and not by consideration: a price target and a stop loss. policy.js keeps
// enforcing both over everything this module emits.
//
// The label itself is DERIVED, never asserted. It is the band the scorecard's own
// normalised total fell into, moved only toward hold by the rules below, and every
// rule is returned with what it changed so a reader can strike any one of them out
// and recompute the call by hand.

import { HORIZONS } from './indicators.js'
import { BASE_RATE_CAVEAT } from './patterns.js'
import { CONCLUSION_EXEMPTION } from './policy.js'

// ---------------------------------------------------------------------------
// The condition the feature sits on
// ---------------------------------------------------------------------------

// Default on. The owner asked for the label, so the absence of configuration means
// the label ships; an operator who wants it gone sets one variable. Anything that
// reads as a negative turns it off, because ANALYZER_VERDICT=false silently meaning
// "on" is the sort of thing that gets found during an inspection.
const OFF = new Set(['off', '0', 'false', 'no'])
export const VERDICT_ENABLED = !OFF.has(String(process.env.ANALYZER_VERDICT ?? 'on').trim().toLowerCase())

// Segment match, not substring: a variable called PAYWALL_SECRET or STRIPE_AD_KEY
// should trip this and HEADLESS should not. Only the four families the exemption
// actually turns on are listed, because a list long enough to catch everything is a
// list that gets disabled the first time it cries wolf.
const MONETISATION = /(?:^|_)(ADS?|ADSENSE|ADVERTIS[A-Z]*|AFFILIATE[A-Z]*|REFERRAL[A-Z]*|PAYWALL[A-Z]*)(?:_|$)/

/**
 * Startup self-check for the assumption the label depends on.
 *
 * Throws rather than warns. A warning in a log nobody reads is worth nothing on the
 * one day this matters, and the failure mode of throwing is a server that will not
 * boot until someone reads a message explaining exactly which regulation it is
 * about. That is the correct cost.
 *
 * It proves nothing: a payment integration named BILLING_KEY sails straight past it,
 * and so does a sponsorship agreed over email. It is a tripwire on the obvious path
 * and a comment that executes, not a compliance control.
 */
export function consideration(env = process.env) {
  const found = Object.keys(env).filter((key) => env[key] && MONETISATION.test(key.toUpperCase()))

  if (found.length) {
    throw new Error(
      `Analyzer verdict refuses to start. The environment defines ${found.join(', ')}, which reads as ` +
        'advertising, affiliate, referral or paywall configuration. The buy/sell/hold label is published ' +
        'only because this site provides research services for no consideration, which is what keeps it ' +
        'outside the SEBI Research Analyst trigger amended on 16 December 2024. If the site now takes ' +
        'money for anything on the analyzer, the label needs a registration behind it: set ' +
        'ANALYZER_VERDICT=off. If the variable is unrelated to revenue, rename it.'
    )
  }

  return {
    ok: true,
    variablesChecked: Object.keys(env).length,
    pattern: MONETISATION.source,
    assumption:
      'No advertising, no paywall, no affiliate link and no broker referral on any analyzer surface. The verdict is published on that basis alone.',
  }
}

// At import, so the process dies at boot rather than on the first reader's request.
// Skipped when the label is already off, because then there is nothing to protect.
if (VERDICT_ENABLED) consideration()

// ---------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------

/**
 * Score bands.
 *
 * scorecard() normalises against the range its own rules could have spanned, so 0.5
 * means the rows that fired cancelled out, not that the company is average. The dead
 * band is 0.2 wide on each side of that midpoint, and the width is arithmetic rather
 * than taste: on a typical eight-rule report best minus worst is around 20 points, a
 * single ±2 rule flipping sign moves the total by 4, and 4/20 is 0.2. So one row
 * changing its mind can carry the call to the neighbouring band and can never carry
 * it from buy to sell.
 */
const BANDS = [
  { min: 0.7, call: 'buy', gist: 'The rows that fired put the total in the top band: most of what could be measured came out positive.' },
  { min: 0.3, call: 'hold', gist: 'The rows that fired left the total inside the dead band around the midpoint, so the measurements do not agree on a direction.' },
  { min: -1, call: 'sell', gist: 'The rows that fired put the total in the bottom band: most of what could be measured came out negative.' },
]

/**
 * Rows needed before the call is allowed to point anywhere.
 *
 * Six, because at five rows one maximal rule is a fifth of the evidence and the band
 * arithmetic above stops holding. scorecard() calls a report of fewer than four rows
 * low confidence and fewer than eight medium; six sits between them, which is the
 * point where a directional call is no longer the opinion of a handful of readings.
 */
const MIN_RULES_FOR_DIRECTION = 6

/**
 * Where the requested holding period and the evidence under it are on different
 * scales. Both entries are about sampling rate, not about which kind of analysis is
 * worth more.
 */
const MISMATCHES = [
  {
    type: 'technical',
    horizons: ['long', 'multiYear'],
    why: 'Price history is the only input under this call, and across a year or more what moves a listed company is what it earns. No filing was read.',
  },
  {
    type: 'fundamental',
    horizons: ['short', 'swing'],
    why: 'Quarterly filings arrive four times a year, so the newest observation under this call can be almost three months old. That is the wrong sampling rate for a window measured in days to weeks.',
  },
]

export const VERDICT_DISCLOSURE = {
  what: 'A label produced mechanically from the scorecard by the fixed rules printed beside it. No language model touched it and no judgement was applied to it.',
  who: 'InvestoMillionaire is not registered with SEBI as a Research Analyst or an Investment Adviser. This label is a mechanical read of published exchange and filing data by an unregistered party.',
  consideration:
    'The analyzer is free. It carries no advertising, no paywall, no affiliate link and no broker referral, and that is the condition this label is published under. If it changes, the label comes down.',
  risk: 'Investing and trading in securities carries the risk of losing part or all of your capital. Past performance of any stock, pattern or score is not a reliable indicator of future results.',
  losses:
    'SEBI studies have repeatedly found that the large majority of individual traders in the equity derivatives segment lose money, with aggregate losses running into thousands of crores in a single year.',
  // Imported rather than restated. The figure belongs to the pattern engine's own
  // measurement, and a second copy of a number is a second number to get wrong.
  baseRate: BASE_RATE_CAVEAT.measured,
  // Deliberately phrased without the two forbidden nouns themselves. Everything in
  // this object is inside the exempted subtree, and the exemption covers the
  // buy/sell/hold clause ONLY: writing "no price target is published" here would be
  // withheld by policy.js exactly as it would be anywhere else in the report.
  notPublished:
    'No level to enter at, no level to leave at and no figure for where the price goes next appears anywhere in this report, whatever this label says. Those are withheld because of what they are, not because of what this site charges.',
}

const step = (label, detail, from, to, effect) => ({ label, detail, from, to, effect })

function refused(why) {
  // No marker: a refusal names no call, so it needs no exemption from the clause that
  // forbids naming one.
  return { verdict: null, unavailable: why, disclosure: VERDICT_DISCLOSURE }
}

/**
 * Which period the reading covers.
 *
 * Phrased as coverage rather than as a holding period on purpose. The horizon
 * selection is the question the reader asked, and the windows below are the data that
 * was actually read to answer it. Neither is a claim about a future period, and the
 * distinction is the difference between a statistic and a forecast.
 */
function duration(horizon, spec, verified) {
  return {
    horizon,
    label: spec.label,
    span: spec.span,
    timeframeWeights: spec.timeframes,
    covers: verified.map((v) => `${v.field}: ${v.detail}`),
    means:
      `The reader asked for a ${spec.label.toLowerCase()} reading, which this analyzer takes to mean ${spec.span}, and weighted the timeframes above accordingly. ` +
      'The windows listed are the published data the reading was taken over. They are not a period over which anything is promised, and no figure here describes what happens after the last date in them.',
  }
}

/**
 * Score plus horizon in, a call and its whole derivation out.
 *
 * Returns null when the flag is off, which is what keeps "no verdict" from being a
 * shape the rest of the report has to know about: the caller omits the key and
 * everything else is byte for byte what it was.
 *
 * The rule list is not verdict.js's points-and-range shape, because this is not a
 * sum. It is a band followed by demotions, so each row carries what the call was
 * before it and what it was after, and every row is returned whether it fired or not.
 * A reader who disagrees with one of them can see what the call would have been
 * without it.
 */
export function conclude({ scorecard, horizon, type = 'both', verified = [] } = {}) {
  if (!VERDICT_ENABLED) return null

  const spec = HORIZONS[horizon]
  if (!spec) return refused(`${horizon} is not one of the horizons this analyzer computes, so no call is derived.`)
  if (!spec.supported) return refused(spec.unavailable)
  if (!scorecard || !scorecard.rulesFired) {
    return refused('No scoring rule could be computed from the available data, so there is nothing to derive a call from. The report carries the reasons each figure was unavailable.')
  }

  const band = BANDS.find((b) => scorecard.normalised >= b.min) ?? BANDS[BANDS.length - 1]
  let call = band.call
  const rules = [
    step(
      'Scorecard band',
      `The scorecard totalled ${scorecard.score} against a range of ${scorecard.worst} to ${scorecard.best} across ${scorecard.rulesFired} rules, which normalises to ${scorecard.normalised}. The bands are ${BANDS[0].min} and above for buy, ${BANDS[1].min} up to ${BANDS[0].min} for hold, and below ${BANDS[1].min} for sell. ${band.gist}`,
      null,
      call,
      'set the call'
    ),
  ]

  // Every rule after the band can move the call toward hold and in no other
  // direction. Nothing below can turn a hold into a buy or a sell into a buy: the
  // score is the only thing allowed to point, and the rest is allowed to stop it
  // pointing.
  const demote = (label, detail, condition) => {
    const from = call
    const fired = condition && call !== 'hold'
    if (fired) call = 'hold'
    rules.push(
      step(label, detail, from, call, fired ? 'moved the call to hold' : condition ? 'condition met, the call was already hold' : 'did not fire')
    )
  }

  demote(
    'Weight of evidence',
    `${scorecard.rulesFired} scoring rules could be computed and a directional call needs at least ${MIN_RULES_FOR_DIRECTION}. The scorecard reports ${scorecard.confidence} confidence on that count.`,
    scorecard.rulesFired < MIN_RULES_FOR_DIRECTION
  )

  const mismatch = MISMATCHES.find((m) => m.type === type && m.horizons.includes(horizon))
  demote(
    'Evidence against the requested period',
    mismatch
      ? `This report reads ${type} data only, and the requested period is ${spec.label.toLowerCase()}, ${spec.span}. ${mismatch.why}`
      : `This report reads ${type} data and the requested period is ${spec.label.toLowerCase()}, ${spec.span}. Nothing in the evidence is on a different scale from the question.`,
    Boolean(mismatch)
  )

  return {
    // The narrow exemption policy.js grants. It lifts the buy/sell/hold clause of reg
    // 2(1)(wa) over this subtree and nothing else; a price target or a stop loss
    // written anywhere under here is still withheld.
    policyExemption: CONCLUSION_EXEMPTION,
    verdict: call,
    fromBand: band.call,
    demoted: call !== band.call,
    inputs: {
      normalised: scorecard.normalised,
      score: scorecard.score,
      best: scorecard.best,
      worst: scorecard.worst,
      rulesFired: scorecard.rulesFired,
      confidence: scorecard.confidence,
      horizon,
      type,
    },
    rules,
    duration: duration(horizon, spec, verified),
    method:
      'The call is the band the scorecard total fell into, moved toward hold by the rules above and by nothing else. Every threshold is a constant in server/src/data/conclusion.js with the reasoning for its value beside it. Strike out any rule above and the call can be recomputed by hand.',
    disclosure: VERDICT_DISCLOSURE,
  }
}
