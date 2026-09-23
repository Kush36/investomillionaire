// Reading one report honestly.
//
// Both functions here answer the same question in two places: what is this page
// entitled to claim about a thing it did not print? The report already carries the
// answer in both cases, and the page used to flatten it away.
//
// Nothing in this file computes or infers a figure. Each function partitions rows the
// server already produced, using a field the server already set, so a wrong answer
// here is a wrong answer in the report rather than an invention on the page. It is
// plain JS rather than JSX for the same reason the engines are: it can be tested.

/**
 * Split the unavailable list into structural gaps and this run's outages.
 *
 * A gap and an outage are different facts. "No free source publishes the promoter
 * pledge" is a property of the free data; "the news feed timed out" is a property of
 * the last ninety seconds. Saying the second in the words of the first tells a reader
 * that a figure does not exist when it does, and that re-running would not help when
 * it would.
 *
 * The seam is exact rather than guessed. routes/analyze.js stage() catches a throwing
 * stage, returns `{ unavailable: `${name} could not complete: ${message}` }`, and
 * records the same name and message on the pipeline as `{ stage, status: 'failed',
 * why }`. Rebuilding that sentence from the failed pipeline entry and matching it
 * identifies every outage row and can match nothing else, so no row is classified by
 * reading its prose.
 *
 * Any row the pipeline does not account for stays structural, which is the safe
 * direction: an unexplained gap is reported as a gap, never as a failure that did not
 * happen.
 */
export function splitOutages(unavailable = [], pipeline = []) {
  const failed = new Map()
  for (const entry of pipeline ?? []) {
    if (entry?.status === 'failed') failed.set(`${entry.stage} could not complete: ${entry.why}`, entry)
  }

  const structural = []
  const outages = []
  for (const row of unavailable ?? []) {
    const stage = failed.get(row?.why)
    if (stage) outages.push({ ...row, stage: stage.stage, error: stage.why, ms: stage.ms })
    else structural.push(row)
  }
  return { structural, outages }
}

/**
 * How firmly one news item was tied to this company, in the engine's own terms.
 *
 * stocknews.js returns the score rather than applying it, and says so: how much
 * evidence is enough is the caller's decision. This is that decision, and it reads
 * the flag the engine sets rather than picking a number off the score, because the
 * engine knows which kinds of evidence let another company's story through and a
 * threshold invented here would not.
 *
 * Three standings, not two. An item that arrived with no relevance block at all has
 * an unstated tie to the company, which is not the same as a weak one, and calling it
 * either full or weak would be this page asserting something nobody measured.
 */
export function matchStanding(item) {
  const hit = item?.relevance
  if (!hit || typeof hit.score !== 'number') {
    return {
      standing: 'unscored',
      label: 'tie to the company not scored',
      detail: 'This item carries no relevance score, so nothing here establishes that it is about this company.',
    }
  }

  if (hit.basis === 'filing') {
    return {
      standing: 'full',
      label: 'filed by the company',
      detail: 'An exchange announcement filed under this company’s own symbol, so its subject is not inferred.',
    }
  }

  const named = hit.matched ? `“${hit.matched}”` : 'the company name'

  if (hit.weak === true) {
    return {
      standing: 'weak',
      label: hit.where === 'body' ? 'named in the summary only' : 'one word matched',
      detail:
        hit.where === 'body'
          ? `${named} appears in the summary rather than the headline. A market wrap names every mover in it, so this item may be about a different company.`
          : `Only ${named} tied this item to the company, and that word can belong to another issuer the desks also cover. This item may be about a different company.`,
    }
  }

  return {
    standing: 'full',
    label: hit.basis === 'name-prefix' ? 'named in the headline' : `${hit.basis} in the headline`,
    detail: `The headline carries ${named}.`,
  }
}

/**
 * Group news items by standing, keeping the engine's own order inside each group.
 *
 * The order within a group is left exactly as ranked, because that ordering is the
 * spec's priority and re-sorting it here would quietly substitute recency for it.
 * What changes is only that a possibly-wrong-company item no longer sits in the same
 * run as the company's own filing.
 */
export function splitByRelevance(items = []) {
  const asserted = []
  const unasserted = []
  for (const item of items ?? []) {
    const standing = matchStanding(item)
    ;(standing.standing === 'full' ? asserted : unasserted).push({ item, standing })
  }
  return { asserted, unasserted }
}
