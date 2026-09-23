import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, ArrowRight, ExternalLink, ImagePlus } from 'lucide-react'
import Seo from '../components/Seo.jsx'
import Chip from '../components/Chip.jsx'
import Notice from '../components/Notice.jsx'
import { api, API_BASE, getToken } from '../lib/api.js'
import { splitOutages, splitByRelevance } from '../lib/report.js'
import { useAuth } from '../lib/store.js'

// The analyzer page.
//
// Two calls, in this order, and the order is the whole safety argument:
//
//   GET  /api/analyze/resolve?q=...   -> universe.js resolve(), unchanged:
//                                        { status: 'exact'|'ambiguous'|'none', match, candidates }
//   POST /api/analyze  { isin, type, horizon }  -> the report
//
// Identification is a separate round trip on purpose. Analysing the wrong company is
// the worst thing this feature can do, so the person sees the name, the NSE symbol
// and the ISIN, and agrees to them, before a single figure is computed. An ambiguous
// resolve never auto-picks; it renders the candidates as buttons and waits. The
// report endpoint takes an ISIN and refuses free text, which is what makes that step
// impossible to skip rather than merely conventional.
//
// The report is read from the shape routes/analyze.js actually returns. That is worth
// stating because it did not used to be: this page read a `sections`/`stats`/`score`
// contract the route never emitted, off a GET that did not exist, so the report half
// of it rendered nothing at all. The keys below are the route's own.
//
//   identity  { symbol, name, isin, series, listedOn, faceValue, source }
//   request   { isin, type, horizon, label, span, timeframeWeights }
//   conclusion?   { verdict, fromBand, demoted, rules[], duration, method, disclosure }
//   breakouts { timeframe, multiYear, cups[], notFound[], baseRate, baseRateMeasured }
//   chart     { timeframe, points[{date,close}], level, marker, basis, stride }
//   technical { [timeframe]: { ema[], rsi, macd, atr, relativeVolume, structure, ... } }
//   patterns  { patterns[], baseRate, baseRateMeasured }
//   fundamental { revenue, profit, margins, shareholding, quarters[], coverage, calendar }
//   peers     { tier, basis, table{ columns, rows, completeness }, notes[] } | { unavailable }
//   activity  { institutional, orders, events, window }
//   news      { recent[{ ..., relevance{ score, basis, matched, weak?, where } }], historical[], window, scored: false, whyNotScored }
//   scorecard { band, gist, score, best, worst, normalised, rules[], confidence }
//   dataQuality { verified[], unavailable[] }      disclosure { ... }
//   pipeline  [{ stage, status: 'ok'|'failed', ms, why? }]
//
// The order the report renders in is the owner's priority order, not the order the
// pipeline computed things in: the company, the conclusion, the multi-year breakout,
// valuation, shareholding, peers, institutional activity and orders, news, the
// scorecard, then what could not be verified. Everything below the fold that is an
// audit trail rather than a finding sits inside a <details>, because a report nobody
// reaches the bottom of is a report that did not say anything.
//
// Nothing here computes a figure. Everything rendered arrived computed, and anything
// the pipeline could not verify arrives as a reason, which this page draws as a
// first-class result rather than hiding behind an empty cell.
//
// Two of those reasons are read off fields the report already carries, and both are
// split in lib/report.js rather than here: the pipeline says which unavailable rows
// are this run's outages instead of permanent gaps, and every news item says how
// firmly it was tied to this company. Flattening either one lets the page claim more
// than the report does.

const RESOLVE = (q) => `/analyze/resolve?q=${encodeURIComponent(q)}`
const EXTRACT = '/analyze/extract'
const BATCH = '/analyze/batch'

const TYPES = [
  { key: 'technical', label: 'Technical', detail: 'Price, volume and chart geometry.' },
  { key: 'fundamental', label: 'Fundamental', detail: 'Filings, peers, activity and news.' },
  // Never merged into one narrative: reconciling the two halves is where a report
  // starts arguing instead of reporting. They render as separate sections.
  { key: 'both', label: 'Side by side', detail: 'Both, kept separate.' },
]

// The picker's copy. server/src/data/indicators.js HORIZONS is authoritative for what
// each horizon actually weights; this list exists so the control can be drawn before
// any request is made, and the report echoes its own label and span back to override
// it. The intraday refusal is copied verbatim from that module so the two cannot
// disagree about the reason.
const HORIZONS = [
  {
    key: 'intraday',
    label: 'Intraday',
    span: 'within one session',
    unavailable:
      'No free intraday source exists. The price feed publishes daily, weekly and monthly candles without a key; anything finer needs a paid, authenticated market data feed. Intraday is refused here rather than approximated from daily bars, which would describe the wrong thing entirely.',
  },
  { key: 'short', label: 'Short term', span: 'days to about four weeks' },
  { key: 'swing', label: 'Swing', span: 'four weeks to three months' },
  { key: 'medium', label: 'Medium term', span: 'three months to a year' },
  { key: 'long', label: 'Long term', span: 'one to three years' },
  { key: 'multiYear', label: 'Multi-year', span: 'three years and beyond' },
]

/* ----------------------------------------------------------------- format -- */

// Periods arrive as ISO dates from the price spine and as filing labels from the
// corporate endpoints, so anything unparseable is printed as it was received rather
// than coerced into a date that would be a guess.
function fmt(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const show = (value) =>
  typeof value === 'number' ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(value ?? '')

const rupees = (value) => (value == null ? null : `Rs ${show(value)}`)
const signed = (value) => (value == null ? null : `${value > 0 ? '+' : ''}${show(value)}`)

// Display only. The server sends rupees because that is the unit the filings are in;
// a crore is how the figure is read in India and the division happens at the last
// possible moment, on the way to the screen, rather than anywhere a number is
// compared or scored.
const crore = (rupeeValue) => (rupeeValue == null ? null : `Rs ${show(Number((rupeeValue / 1e7).toFixed(2)))} cr`)

const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null)

/* ------------------------------------------------------------- primitives -- */

// The unavailable treatment. It is recessed, ruled down one edge and says the words
// "Data unavailable" in mono, so it reads as a different KIND of result rather than
// a dimmer version of a figure. Colour is not used for it: a missing number is not a
// loss, and the accent budget belongs to the things that move.
function Unavailable({ what, why }) {
  return (
    <div
      className="well p-[var(--space-3)]"
      style={{ boxShadow: 'inset 3px 0 0 var(--color-hairline-strong), inset 0 0 0 1px var(--color-hairline)' }}
    >
      {what && <p className="eyebrow">{what}</p>}
      <p className="readout mt-[var(--space-1)] text-sm text-ink-3">Data unavailable</p>
      <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">{why}</p>
    </div>
  )
}

/**
 * A source that did not answer on this run, drawn as its own kind of result.
 *
 * Deliberately not the Unavailable treatment. A missing figure and a failed fetch are
 * different facts, and the whole point of separating them is lost if they look alike:
 * this one says the words "Fetch failed", carries the loss rail rather than the
 * neutral one, and names the stage, the error and how long it ran before giving up,
 * so a reader can see that running the report again might return the figure.
 */
function FetchFailed({ what, stage, error, ms }) {
  return (
    <div
      className="well p-[var(--space-3)]"
      style={{ boxShadow: 'inset 3px 0 0 var(--color-loss), inset 0 0 0 1px var(--color-hairline)' }}
    >
      {what && <p className="eyebrow">{what}</p>}
      <p className="readout mt-[var(--space-1)] text-sm text-loss">Fetch failed</p>
      <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
        The <span className="readout">{stage}</span> stage did not finish, so this run read nothing for it. That is a
        source this report could not reach, not a figure the source does not publish.
      </p>
      <p className="readout mt-[var(--space-1)] text-[length:var(--text-micro)] leading-relaxed text-ink-3">
        {error}
        {ms == null ? '' : ` · gave up after ${ms} ms`}
      </p>
    </div>
  )
}

/**
 * One figure, with the period it belongs to underneath it.
 *
 * Every prop is passed explicitly by the call site rather than sniffed out of
 * whatever shape the producing module used. The page used to guess, and guessing is
 * how a lookback length of 14 gets printed as a date: the call site knows which of
 * its fields is a period and this component never has to.
 */
function Figure({ label, value, unit, when, whenLabel = null, note, source, unavailable }) {
  if (unavailable) return <Unavailable what={label} why={unavailable} />

  return (
    <div className="p-[var(--space-3)]">
      <p className="eyebrow">{label}</p>
      <p className="readout mt-[var(--space-1)] text-xl leading-none text-ink">
        {value == null ? '—' : show(value)}
        {unit && <span className="text-sm text-ink-2"> {unit}</span>}
      </p>

      {/* The evidence line. A figure without the period it belongs to and the place
          it came from is unauditable, so this never collapses to nothing: when the
          pipeline omits one, the omission is printed. */}
      <p className="mt-[var(--space-2)] text-[length:var(--text-micro)] leading-relaxed text-ink-3">
        <span className="readout">{whenLabel ?? (when ? fmt(when) : 'period not stated')}</span>
        {note && <span className="block">{note}</span>}
        {source?.name && (
          <span className="block">
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-ink-2 underline decoration-1 underline-offset-4"
              >
                {source.name} <ExternalLink size={10} aria-hidden="true" />
              </a>
            ) : (
              source.name
            )}
          </span>
        )}
      </p>
    </div>
  )
}

/** A figure read straight off one of the `{ value, unavailable }` cells the engines emit. */
function CellFigure({ label, cell, unit, when, note, source }) {
  if (!cell) return null
  return (
    <Figure
      label={label}
      value={cell.value}
      unit={unit ?? cell.unit}
      when={when ?? cell.asOf ?? cell.to ?? null}
      note={note ?? cell.basis ?? null}
      source={source ?? (Array.isArray(cell.sources) ? cell.sources[0] : cell.source)}
      unavailable={cell.unavailable}
    />
  )
}

// The house scorecard table: every rule that fired, its points in a fixed column so
// the signs line up, and no label on top of the total.
function RuleTable({ rules }) {
  return (
    <div className="well">
      {rules.map((rule, i) => (
        <div
          key={`${rule.label}-${i}`}
          className="flex items-baseline gap-[var(--space-3)] border-t border-hairline p-[var(--space-3)] first:border-t-0"
        >
          <span
            className={`readout w-9 shrink-0 text-right text-sm ${
              rule.points > 0 ? 'text-ink' : rule.points < 0 ? 'text-ink-2' : 'text-ink-3'
            }`}
          >
            {rule.points > 0 ? '+' : ''}
            {rule.points}
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-ink">{rule.label}</span>
            <span className="mt-[var(--space-1)] block text-sm leading-relaxed text-ink-2">{rule.detail}</span>
            <span className="eyebrow mt-[var(--space-1)] block">
              range {rule.min} to {rule.max}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * A disclosure object, rendered as its sentences.
 *
 * Only strings render. The disclosure blocks nest a base-rate object inside
 * themselves, and a pipeline change that nests one more should cost this component a
 * paragraph rather than white-screening a report somebody is reading.
 */
function Sentences({ from, className = '' }) {
  if (!from) return null
  return (
    <div className={`well ${className}`}>
      {Object.entries(from)
        .filter(([, text]) => typeof text === 'string')
        .map(([key, text]) => (
          <p
            key={key}
            className="max-w-[var(--measure)] border-t border-hairline p-[var(--space-3)] text-sm leading-relaxed text-ink-2 first:border-t-0"
          >
            {text}
          </p>
        ))}
    </div>
  )
}

/**
 * A folded audit trail. Native <details>, so it costs no state, no library and no
 * animation, and it is keyboard operable and findable by browser search without
 * anything here arranging for that.
 */
function Fold({ summary, children, className = '', open = false }) {
  return (
    <details className={`well ${className}`} open={open}>
      <summary className="eyebrow flex min-h-11 cursor-pointer items-center px-[var(--space-3)] transition hover:text-ink-2">
        {summary}
      </summary>
      <div className="border-t border-hairline p-[var(--space-3)]">{children}</div>
    </details>
  )
}

/**
 * The close series, as an inline SVG path.
 *
 * No chart library: the route budget is 170 KiB brotli and this is one path string,
 * one line and one circle. preserveAspectRatio is dropped so the viewBox stretches to
 * whatever width the panel is, and non-scaling-stroke keeps the line one weight while
 * it does.
 *
 * What is drawn is the point of the drawing. The dashed horizontal is the old high
 * the breakout cleared, and the dot is the bar that closed through it. Nothing is
 * drawn to the right of the last bar, and there is no facility here to draw anything
 * there: a line continuing past the last close is a forecast, whatever it is labelled.
 */
function PriceChart({ chart }) {
  const points = (chart?.points ?? []).filter((p) => Number.isFinite(p?.close))
  if (points.length < 2) return null

  const level = chart.level?.price
  const closes = points.map((p) => p.close)
  const low = Math.min(...closes, level ?? Infinity)
  const high = Math.max(...closes, level ?? -Infinity)
  const span = high - low || 1
  const x = (i) => (i / (points.length - 1)) * 300
  const y = (value) => 66 - ((value - low) / span) * 60

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.close)}`).join(' ')
  const markIndex = chart.marker ? points.findIndex((p) => p.date >= chart.marker.date) : -1

  return (
    <figure className="mt-[var(--space-4)]">
      <svg
        viewBox="0 0 300 70"
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label={`${chart.timeframe} closing price from ${fmt(points[0].date)} to ${fmt(points[points.length - 1].date)}, ranging ${show(Math.min(...closes))} to ${show(Math.max(...closes))} rupees${
          chart.level ? `, against a prior high of ${show(chart.level.price)} rupees` : ''
        }`}
      >
        {chart.level && (
          <line
            x1="0"
            y1={y(level)}
            x2="300"
            y2={y(level)}
            stroke="var(--color-hairline-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={path} fill="none" stroke="var(--color-ink-2)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
        {markIndex > -1 && (
          <circle cx={x(markIndex)} cy={y(points[markIndex].close)} r="2.5" fill="var(--color-accent)" />
        )}
      </svg>

      <div className="mt-[var(--space-1)] flex flex-wrap justify-between gap-[var(--space-2)] text-[length:var(--text-micro)] text-ink-3">
        <span className="readout">{fmt(points[0].date)}</span>
        {chart.level && <span className="readout">dashed: {chart.level.label}</span>}
        <span className="readout">{fmt(points[points.length - 1].date)}</span>
      </div>
      <figcaption className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
        {chart.basis} Nothing is drawn to the right of the last close.
      </figcaption>
    </figure>
  )
}

/* --------------------------------------------------------------- findings -- */

/**
 * The multi-year breakout: the owner's starred feature, and the first finding on the
 * page after the conclusion.
 *
 * It renders as prominently when it did NOT fire as when it did, and that is
 * deliberate. The detector refuses far more often than it fires, and a section that
 * appeared only on a hit would teach a reader that this page finds breakouts.
 */
function MultiYearBreakout({ finding, chart, baseRateMeasured }) {
  if (!finding) return null

  if (!finding.found) {
    return (
      <div className="panel p-[var(--space-4)]">
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <Chip>multi-year breakout</Chip>
          <Chip>not detected</Chip>
          <Chip>{finding.series.timeframe} series</Chip>
        </div>
        <p className="prose mt-[var(--space-3)]">{finding.reason}</p>
        <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
          {finding.series.why}
        </p>
      </div>
    )
  }

  const c = finding.confidence ?? {}
  return (
    <div className="panel p-[var(--space-4)]">
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Chip tone="accent">multi-year breakout</Chip>
        <Chip>{finding.status}</Chip>
        <Chip>{finding.window.describedAs}</Chip>
        <Chip>{finding.series.timeframe} series</Chip>
        <Chip>standing {finding.series.standing}</Chip>
      </div>

      <p className="prose mt-[var(--space-3)]">{finding.definition}</p>

      <PriceChart chart={chart} />

      <dl className="well mt-[var(--space-4)] grid grid-cols-2 sm:grid-cols-4">
        <div className="p-[var(--space-3)]">
          <dt className="eyebrow">the old high</dt>
          <dd className="readout mt-[var(--space-1)] text-sm text-ink">{rupees(finding.priorHigh.price)}</dd>
          <dd className="readout text-[length:var(--text-micro)] text-ink-3">
            {fmt(finding.priorHigh.date)} · stood {finding.priorHigh.stoodForYears} years
          </dd>
        </div>
        <div className="p-[var(--space-3)]">
          <dt className="eyebrow">the base under it</dt>
          <dd className="readout mt-[var(--space-1)] text-sm text-ink">{finding.base.depthPercent}% deep</dd>
          <dd className="readout text-[length:var(--text-micro)] text-ink-3">
            low {rupees(finding.base.lowestLow)} · {fmt(finding.base.lowestLowDate)}
          </dd>
        </div>
        <div className="p-[var(--space-3)]">
          <dt className="eyebrow">the close through it</dt>
          <dd className="readout mt-[var(--space-1)] text-sm text-ink">{rupees(finding.breakout.close)}</dd>
          <dd className="readout text-[length:var(--text-micro)] text-ink-3">
            {fmt(finding.breakout.date)} · {signed(finding.breakout.marginPercent)}%
          </dd>
        </div>
        <div className="p-[var(--space-3)]">
          <dt className="eyebrow">since</dt>
          <dd className="readout mt-[var(--space-1)] text-sm text-ink">{rupees(finding.now.lastClose)}</dd>
          <dd className="readout text-[length:var(--text-micro)] text-ink-3">
            {fmt(finding.now.asOf)} · {finding.now.barsSinceBreakout} bars on
          </dd>
        </div>
      </dl>

      <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
        {finding.breakout.basis} {finding.series.why}
      </p>

      {finding.volume?.unavailable ? (
        <div className="mt-[var(--space-3)]">
          <Unavailable what="breakout volume" why={finding.volume.unavailable} />
        </div>
      ) : (
        finding.volume?.ratio != null && (
          <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
            Volume on the breakout bar measured{' '}
            <span className="readout text-ink">{show(finding.volume.ratio)}x</span> the median of the{' '}
            <span className="readout">{finding.volume.baselineBars}</span> bars of the base.
          </p>
        )
      )}

      <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
        {finding.confirmation.reason ??
          `${finding.confirmation.closesAbove} of the ${finding.confirmation.barsAvailable} bars after the breakout closed above the old high.`}{' '}
        {finding.confirmation.basis}
      </p>

      {c.rules?.length > 0 && (
        <Fold className="mt-[var(--space-4)]" summary={`how the detector scored this shape · ${c.score} of ${c.best}`}>
          <RuleTable rules={c.rules} />
        </Fold>
      )}

      {baseRateMeasured && !baseRateMeasured.unavailable && (
        <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
          Measured against chance: over {baseRateMeasured.trials} synthetic series matched to this one in length and
          volatility, this detector fired on{' '}
          <span className="readout text-ink">{baseRateMeasured.firedPercent?.['multi-year-breakout']}%</span> of them.{' '}
          {baseRateMeasured.limitation}
        </p>
      )}
    </div>
  )
}

/** One cup and handle, or one of the shapes patterns.js defines. Geometry only. */
function ShapeCard({ shape }) {
  const c = shape.confidence ?? {}
  const m = shape.measurements ?? {}

  const cells = [
    ...(shape.bottoms ?? []).map((b) => [`low ${b.order}`, rupees(b.price), b.date]),
    shape.leftRim && ['left rim', rupees(shape.leftRim.price), shape.leftRim.date],
    shape.rightRim && ['right rim', rupees(shape.rightRim.price), shape.rightRim.date],
    shape.rimLine && ['rim line', rupees(shape.rimLine.price), null],
    shape.neckline && ['neckline', rupees(shape.neckline.price), shape.neckline.date],
    shape.handle && ['handle low', rupees(shape.handle.low), shape.handle.lowDate],
    shape.breakout && ['close above', rupees(shape.breakout.close), shape.breakout.date],
    shape.retest?.occurred && ['retest', rupees(shape.retest.low), shape.retest.date],
  ].filter(Boolean)

  return (
    <article className="panel p-[var(--space-4)]">
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Chip>{String(shape.kind ?? 'shape').replace(/-/g, ' ')}</Chip>
        <Chip>{shape.status}</Chip>
        {c.band && <Chip>match {c.band}</Chip>}
      </div>

      <p className="prose mt-[var(--space-3)]">{shape.definition}</p>

      {/* Geometry, and only geometry. Where the lows were, where the level was, when
          price closed across it. No level here is projected forward. */}
      <dl className="well mt-[var(--space-4)] grid grid-cols-2 sm:grid-cols-4">
        {cells.map(([label, value, date]) => (
          <div key={label} className="p-[var(--space-3)]">
            <dt className="eyebrow">{label}</dt>
            <dd className="readout mt-[var(--space-1)] text-sm text-ink">{value}</dd>
            {date && <dd className="readout text-[length:var(--text-micro)] text-ink-3">{fmt(date)}</dd>}
          </div>
        ))}
      </dl>

      {shape.volume?.unavailable ? (
        <div className="mt-[var(--space-3)]">
          <Unavailable what="breakout volume" why={shape.volume.unavailable} />
        </div>
      ) : (
        shape.volume?.ratio != null && (
          <p className="mt-[var(--space-3)] text-sm text-ink-2">
            Breakout volume measured <span className="readout text-ink">{show(shape.volume.ratio)}x</span> the{' '}
            <span className="readout">{shape.volume.baselineBars}</span>-bar median.
          </p>
        )
      )}

      {Object.keys(m).length > 0 && (
        <dl className="well mt-[var(--space-3)] grid grid-cols-2 sm:grid-cols-3">
          {[
            ['low spread', m.lowSpreadPercent, '%'],
            ['separation', m.separationBars, 'bars'],
            ['rise to neckline', m.riseToNecklinePercent, '%'],
            ['prior decline', m.priorDeclinePercent, '%'],
            ['last close vs neckline', m.necklineToLastClosePercent, '%'],
          ]
            .filter(([, value]) => value != null)
            .map(([label, value, unit]) => (
              <div key={label} className="p-[var(--space-3)]">
                <dt className="eyebrow">{label}</dt>
                <dd className="readout mt-[var(--space-1)] text-sm text-ink">
                  {show(value)}
                  <span className="text-ink-3"> {unit}</span>
                </dd>
              </div>
            ))}
        </dl>
      )}

      {c.rules?.length > 0 && (
        <Fold className="mt-[var(--space-4)]" summary={`how closely the shape matched · ${c.score} of ${c.best}`}>
          <RuleTable rules={c.rules} />
          {c.means && (
            <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">{c.means}</p>
          )}
        </Fold>
      )}
    </article>
  )
}

/**
 * The conclusion. The one place on this site that names a call, and it renders with
 * its whole derivation attached rather than as a badge.
 *
 * The demotion rules are not the scorecard's shape: each row says what the call was
 * before it and what it was after, so a reader who disagrees with one can see what
 * the call would have been without it.
 */
function Conclusion({ conclusion }) {
  if (!conclusion) return null

  if (!conclusion.verdict) {
    return <Unavailable what="conclusion" why={conclusion.unavailable} />
  }

  return (
    <div className="panel p-[var(--space-4)]">
      <div className="flex flex-wrap items-end justify-between gap-[var(--space-3)]">
        <div>
          <p className="eyebrow">mechanical label</p>
          <p className="readout mt-[var(--space-1)] text-3xl leading-none text-ink uppercase">{conclusion.verdict}</p>
        </div>
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <Chip>{conclusion.duration.label}</Chip>
          {conclusion.demoted && <Chip>moved from {conclusion.fromBand}</Chip>}
          <Chip>{conclusion.inputs.confidence} confidence</Chip>
          <Chip>{conclusion.inputs.rulesFired} rules</Chip>
        </div>
      </div>

      <p className="prose mt-[var(--space-4)]">{conclusion.duration.means}</p>

      <div className="well mt-[var(--space-4)]">
        {conclusion.rules.map((rule, i) => (
          <div key={`${rule.label}-${i}`} className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
            <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)]">
              <p className="text-sm text-ink">{rule.label}</p>
              <p className="readout text-[length:var(--text-micro)] text-ink-3">
                {rule.from ? `${rule.from} → ${rule.to}` : rule.to} · {rule.effect}
              </p>
            </div>
            <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">{rule.detail}</p>
          </div>
        ))}
      </div>

      <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
        {conclusion.method}
      </p>

      <Fold className="mt-[var(--space-4)]" summary="what this label is, and what it is not">
        <Sentences from={conclusion.disclosure} />
      </Fold>
    </div>
  )
}

/** The peer table. Subject first, no column sorted, every empty cell explained. */
function PeerTable({ peers }) {
  if (!peers) return null
  if (peers.unavailable) return <Unavailable what="peer comparison" why={peers.unavailable} />

  const { columns, rows, completeness } = peers.table
  // The balance-sheet columns are empty for every company by construction, so they are
  // folded away rather than drawn as five columns of dashes across a table on a phone.
  const shown = columns.filter((c) => c.basis !== 'balance-sheet')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Chip>
          {peers.tier === 'sector-index'
            ? 'sector index'
            : peers.tier === 'macro-sector'
              ? 'macro sector'
              : 'no peer group'}
        </Chip>
        <Chip>
          {rows.length - 1} {rows.length === 2 ? 'peer' : 'peers'}
        </Chip>
        {peers.sizeBand?.band && <Chip>size band {peers.sizeBand.band}x</Chip>}
      </div>

      <p className="prose mt-[var(--space-3)]">{peers.basis}</p>
      {peers.sizeBand?.note && (
        <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
          {peers.sizeBand.note}
        </p>
      )}

      {/* The table is the one thing on this page allowed to scroll sideways: a
          ten-column comparison cannot be stacked without losing the comparison. */}
      <div className="well mt-[var(--space-4)] overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className="eyebrow p-[var(--space-3)]">
                company
              </th>
              {shown.map((c) => (
                <th key={c.key} scope="col" className="eyebrow p-[var(--space-3)]">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="border-t border-hairline">
                <th scope="row" className="p-[var(--space-3)] text-left align-top text-sm font-normal text-ink">
                  {row.symbol}
                  {row.subject && <span className="readout block text-[length:var(--text-micro)] text-ink-3">this company</span>}
                </th>
                {shown.map((c) => {
                  const cell = row.metrics[c.key]
                  return (
                    <td key={c.key} className="p-[var(--space-3)] align-top">
                      {cell?.value == null ? (
                        <span
                          className="readout text-[length:var(--text-micro)] text-ink-3"
                          title={cell?.unavailable ?? 'No figure was published.'}
                        >
                          unavailable
                        </span>
                      ) : (
                        <>
                          <span className="readout text-sm text-ink">{show(cell.value)}</span>
                          {(cell.asOf || cell.earningsTo) && (
                            <span className="readout block text-[length:var(--text-micro)] text-ink-3">
                              {fmt(cell.earningsTo ?? cell.asOf)}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-[var(--space-2)] text-[length:var(--text-micro)] text-ink-3">
        {completeness.note} No column is sorted and no company here is ranked.
      </p>

      {(peers.notes ?? []).map((note) => (
        <p key={note} className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
          {note}
        </p>
      ))}

      {peers.table.notComputable?.length > 0 && (
        <Fold className="mt-[var(--space-4)]" summary={`${peers.table.notComputable.length} columns no free filing supports`}>
          <div className="space-y-[var(--space-2)]">
            {peers.table.notComputable.map((c) => (
              <Unavailable key={c.label} what={c.label} why={c.why} />
            ))}
          </div>
        </Fold>
      )}

      {peers.excluded?.length > 0 && (
        <Fold className="mt-[var(--space-2)]" summary={`${peers.excluded.length} companies NSE groups with this one and this table left out`}>
          <div className="space-y-[var(--space-2)]">
            {peers.excluded.map((c) => (
              <Unavailable key={c.symbol} what={`${c.symbol} · ${c.name}`} why={c.why} />
            ))}
          </div>
        </Fold>
      )}
    </div>
  )
}

/** Institutional deals, announced orders and classified corporate events. */
function Activity({ activity }) {
  if (!activity) return null
  if (typeof activity.unavailable === 'string') return <Unavailable what="activity" why={activity.unavailable} />

  const { institutional, orders, events } = activity

  return (
    <div className="space-y-[var(--space-5)]">
      <div>
        <h3 className="eyebrow">disclosed deals</h3>
        <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
          {institutional.window.why}
        </p>

        {institutional.latest.length > 0 ? (
          <div className="well mt-[var(--space-3)]">
            {institutional.latest.map((deal, i) => (
              <div key={`${deal.client}-${i}`} className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
                <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)]">
                  <p className="min-w-0 text-sm text-ink">{deal.client}</p>
                  <p className="readout shrink-0 text-sm text-ink-2">
                    {deal.side} · {crore(deal.value)}
                  </p>
                </div>
                <p className="readout mt-[var(--space-1)] text-[length:var(--text-micro)] text-ink-3">
                  {show(deal.quantity)} shares at {rupees(deal.price)} · {fmt(deal.tradedOn)} ·{' '}
                  {deal.disclosedAs.join(' and ')}
                  {deal.clientReading === 'named-as-fund-or-insurer' ? ' · named as a fund or insurer' : ''}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-[var(--space-3)]">
            {(institutional.notes ?? []).map((note) => (
              <p key={note} className="max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                {note}
              </p>
            ))}
          </div>
        )}

        <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
          {institutional.caveat}
        </p>
        {institutional.fiiDiiSplit?.unavailable && (
          <div className="mt-[var(--space-3)]">
            <Unavailable what="foreign and domestic institutional split" why={institutional.fiiDiiSplit.unavailable} />
          </div>
        )}
      </div>

      <div>
        <h3 className="eyebrow">orders announced</h3>
        {orders.found.length > 0 ? (
          <div className="well mt-[var(--space-3)]">
            {orders.found.map((order, i) => (
              <div key={`${order.at}-${i}`} className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
                <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                  <Chip>{order.materiality.grade ? `${order.materiality.grade} materiality` : 'ungraded'}</Chip>
                  {order.materiality.percentOfRevenue != null && (
                    <Chip>{order.materiality.percentOfRevenue}% of trailing revenue</Chip>
                  )}
                  <span className="readout text-[length:var(--text-micro)] text-ink-3">{fmt(order.at)}</span>
                </div>
                {/* The company's own filing, quoted. */}
                <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                  {order.headline}
                </p>
                {order.materiality.unavailable && (
                  <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-[length:var(--text-micro)] leading-relaxed text-ink-3">
                    {order.materiality.unavailable}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null}
        {(orders.notes ?? []).map((note) => (
          <p key={note} className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
            {note}
          </p>
        ))}
      </div>

      {events.events.length > 0 && (
        <Fold summary={`${events.events.length} corporate events classified in the window`}>
          <div className="space-y-[var(--space-2)]">
            {events.events.map((event, i) => (
              <div key={`${event.at}-${i}`}>
                <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                  <Chip>{event.type}</Chip>
                  <span className="readout text-[length:var(--text-micro)] text-ink-3">{fmt(event.at)}</span>
                </div>
                <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                  {event.headline}
                </p>
              </div>
            ))}
          </div>
        </Fold>
      )}
    </div>
  )
}

/**
 * One news item. Quoted from its publisher, linked back, never summarised here.
 *
 * The standing travels with the item because stocknews.js scores relevance for a
 * reason: one shared token can attach another company's story, and a page that drops
 * the score gives that story the same standing as the company's own exchange filing.
 * A weak match is drawn weaker, says on its face what tied it here, and says that it
 * may be about someone else.
 */
function NewsItem({ item, standing }) {
  const weak = standing.standing !== 'full'

  return (
    <li className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Chip>{item.category.replace(/-/g, ' ')}</Chip>
        <Chip tone={weak ? 'loss' : 'neutral'}>{standing.label}</Chip>
        <span className="readout text-[length:var(--text-micro)] text-ink-3">
          {item.date ? fmt(item.date) : 'date unavailable'}
        </span>
      </div>
      {item.source?.url ? (
        <a
          href={item.source.url}
          target="_blank"
          rel="noreferrer noopener"
          className={`mt-[var(--space-2)] block max-w-[var(--measure)] text-sm leading-relaxed underline decoration-1 underline-offset-4 ${
            weak ? 'text-ink-2' : 'text-ink'
          }`}
        >
          {item.headline}
        </a>
      ) : (
        <p
          className={`mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed ${weak ? 'text-ink-2' : 'text-ink'}`}
        >
          {item.headline}
        </p>
      )}
      <p className="readout mt-[var(--space-1)] text-[length:var(--text-micro)] text-ink-3">{item.source?.name}</p>
      <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-[length:var(--text-micro)] leading-relaxed text-ink-3">
        {standing.detail}
      </p>
    </li>
  )
}

/**
 * One run of news, with the weak matches held out of it.
 *
 * Both the recent list and the historical fold render through this, so the separation
 * cannot hold in one place and lapse in the other. The order inside each group is
 * left as the engine ranked it.
 */
function NewsList({ groups }) {
  const { asserted, unasserted } = groups

  return (
    <>
      {asserted.length > 0 && (
        <ul className="well">
          {asserted.map(({ item, standing }, i) => (
            <NewsItem key={`${item.headline}-${i}`} item={item} standing={standing} />
          ))}
        </ul>
      )}

      {unasserted.length > 0 && (
        <div className={asserted.length > 0 ? 'mt-[var(--space-4)]' : ''}>
          <h3 className="eyebrow">weaker matches · {unasserted.length}</h3>
          <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
            Each of these was tied to this company by less than its name in the headline, which is the evidence a shared
            word or a market wrap can produce for a company that is not this one. They are shown because withholding a
            match is its own kind of claim, and kept apart because they are not the same evidence as the items above.
          </p>
          <ul className="well mt-[var(--space-3)]">
            {unasserted.map(({ item, standing }, i) => (
              <NewsItem key={`${item.headline}-${i}`} item={item} standing={standing} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------- the picker -- */

// A real radio in a real label, visually hidden. Arrow keys, the required-one-of-set
// semantics and the disabled behaviour all come free from the platform, which is the
// entire reason this is not a row of divs with click handlers.
function Option({ name, value, checked, disabled, onChange, label, detail }) {
  return (
    <label className={`block flex-1 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="peer sr-only"
      />
      <span
        className="flex min-h-11 flex-col justify-center rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)] transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        style={{
          boxShadow: `inset 0 0 0 1px ${checked ? 'var(--color-hairline-strong)' : 'var(--color-hairline)'}`,
          color: disabled ? 'var(--color-ink-3)' : checked ? 'var(--color-ink)' : 'var(--color-ink-2)',
          background: checked ? 'var(--color-surface)' : 'transparent',
        }}
      >
        <span className="text-sm leading-tight">
          {label}
          {disabled && <span className="readout text-[length:var(--text-micro)] text-ink-3"> · unavailable</span>}
        </span>
        {detail && <span className="mt-0.5 text-[length:var(--text-micro)] leading-tight text-ink-3">{detail}</span>}
      </span>
    </label>
  )
}

/* -------------------------------------------------------------- watchlist -- */

/**
 * The add and remove control, drawn on a listing the reader has already confirmed.
 *
 * Signed out it is a sentence with a link in it rather than a disabled button. A
 * control that does nothing and does not say why reads as a broken feature instead of
 * one that needs an account.
 *
 * What gets stored is the ISIN on the confirmation card directly above this, so the
 * entry is the listing the reader agreed to and not whatever they typed.
 */
function WatchControl({ subject }) {
  const { user, watchlist, watchlistCap, addToWatchlist, removeFromWatchlist } = useAuth()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState('')

  if (!user) {
    return (
      <p className="mt-[var(--space-4)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
        <Link to="/auth" className="text-ink underline decoration-1 underline-offset-4">
          Sign in
        </Link>{' '}
        to keep {subject.symbol} on a watchlist and run this report again from your dashboard.
      </p>
    )
  }

  const listed = (watchlist ?? []).some((entry) => entry.isin === subject.isin)
  const atCap = !listed && watchlist != null && watchlistCap != null && watchlist.length >= watchlistCap

  async function toggle() {
    setSaving(true)
    setFailed('')
    try {
      if (listed) await removeFromWatchlist(subject.isin)
      else await addToWatchlist(subject.isin)
    } catch (err) {
      setFailed(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-[var(--space-4)] flex flex-wrap items-center gap-[var(--space-2)]">
      <button
        type="button"
        onClick={toggle}
        disabled={saving || atCap}
        className="inline-flex min-h-11 items-center rounded-full px-[var(--space-3)] text-sm text-ink-2 transition hover:text-ink disabled:opacity-50"
        style={{ boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }}
      >
        {saving ? 'Saving…' : listed ? 'Remove from watchlist' : 'Add to watchlist'}
      </button>

      {watchlist != null && watchlistCap != null && (
        <span className="readout text-[length:var(--text-micro)] text-ink-3">
          {watchlist.length} of {watchlistCap} saved
        </span>
      )}

      {atCap && (
        <p className="w-full max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
          The list holds {watchlistCap} companies, which is the limit. Remove one from your dashboard to add this.
        </p>
      )}

      {failed && (
        <p className="w-full text-sm text-loss" role="status">
          {failed}
        </p>
      )}
    </div>
  )
}

/* ----------------------------------------------------------- from an image -- */

// A screenshot of a watchlist or a holdings page, read into a list of companies.
//
// The order is the single-company flow's order, widened: the server reads the image,
// resolves every line it read against the equity list, and STOPS. Nothing is computed
// until a person has looked at each line and agreed to the company it resolved to.
//
// That is not caution for its own sake. Recognition misreads INFY as lNFY and
// BAJAJ-AUTO as BAJAJ-AUT0 often enough that it is the ordinary case, and the resolver
// will happily find a plausible company for a near miss. A ticked row here is a person
// saying "yes, that one", which is the only thing on this page allowed to decide it.

// api() writes a JSON content type and stringifies its body, which is wrong for a file.
// Rather than teach the shared helper about uploads for one caller, this sends the
// FormData itself. The content type is deliberately NOT set: the browser writes it,
// with the multipart boundary, and a hand-written one loses the boundary and the server
// cannot split the body.
async function uploadForExtraction(file) {
  const form = new FormData()
  form.append('image', file, file.name)
  const token = getToken()

  const res = await fetch(`${API_BASE}${EXTRACT}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // The refusals on this endpoint carry the reason in a second field, and the reason
    // is the useful half: "that file was not read" is not actionable and "it does not
    // begin with a PNG or JPEG header" is.
    throw new Error([data.error, data.why ?? data.reason ?? data.instead].filter(Boolean).join(' '))
  }
  return data
}

/**
 * One line the recogniser read, and what the equity list made of it.
 *
 * Three states, drawn as three different things rather than as one row in three
 * shades. An exact match is a checkbox. An ambiguous line is the candidate buttons the
 * search path already uses, because the answer to "which one did you mean" does not
 * change because the question arrived as a picture. A line that matched nothing is the
 * page's unavailable treatment, with the text that was read printed verbatim so the
 * reader can see whether it was misread or simply is not listed.
 */
function ExtractedRow({ row, chosen, onChoose }) {
  const read = row.read?.headline ?? ''

  if (row.status === 'none') {
    return (
      <li className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
        <Unavailable
          what={`“${read}” matched nothing`}
          why={
            row.why ??
            'Nothing on the NSE equity list matched this line closely enough to be sure. It may have been misread, or it may not be an NSE listing. Search for it by name above.'
          }
        />
      </li>
    )
  }

  if (row.status === 'ambiguous') {
    return (
      <li className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
        <p className="readout text-sm text-ink-2">
          read as <span className="text-ink">{read}</span>
        </p>
        <p className="mt-[var(--space-1)] text-[length:var(--text-micro)] text-ink-3">
          More than one listing matched and none of them clearly. Pick one, or leave it out.
        </p>
        <div className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
          {row.candidates.map((c) => (
            <button
              key={c.isin}
              type="button"
              aria-pressed={chosen === c.isin}
              onClick={() => onChoose(chosen === c.isin ? '' : c.isin)}
              className="min-h-11 rounded-[var(--radius-md)] px-[var(--space-3)] text-left text-sm transition hover:bg-surface"
              style={{
                boxShadow: `inset 0 0 0 1px ${chosen === c.isin ? 'var(--color-hairline-strong)' : 'var(--color-hairline)'}`,
                background: chosen === c.isin ? 'var(--color-surface)' : 'transparent',
                color: chosen === c.isin ? 'var(--color-ink)' : 'var(--color-ink-2)',
              }}
            >
              {c.name}
              <span className="readout block text-[length:var(--text-micro)] text-ink-3">
                {c.symbol} · {Math.round(c.confidence * 100)}%
              </span>
            </button>
          ))}
        </div>
      </li>
    )
  }

  const match = row.match
  return (
    <li className="border-t border-hairline first:border-t-0">
      <label className="flex min-h-11 cursor-pointer items-start gap-[var(--space-3)] p-[var(--space-3)]">
        <input
          type="checkbox"
          checked={Boolean(chosen)}
          onChange={(e) => onChoose(e.target.checked ? match.isin : '')}
          className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span className="min-w-0">
          <span className="block truncate text-ink">{match.name}</span>
          <span className="readout mt-[var(--space-1)] block text-[length:var(--text-micro)] text-ink-3">
            {match.symbol} · {match.isin} · read as “{read}”
          </span>
        </span>
      </label>
    </li>
  )
}

/** One stock's outcome in a batch. A report, or the reason there is not one. */
function BatchRow({ result, onOpen }) {
  if (result.status === 'failed') {
    return (
      <li className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
        <Unavailable what={result.isin} why={[result.error, result.reason].filter(Boolean).join(' ')} />
      </li>
    )
  }

  const { identity, scorecard, conclusion, breakouts } = result.report
  const brokeOut = breakouts?.multiYear?.found
  return (
    <li className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)]">
        <div className="min-w-0">
          <p className="truncate text-ink">{identity.name}</p>
          <p className="readout mt-[var(--space-1)] text-[length:var(--text-micro)] text-ink-3">
            {identity.symbol} · {identity.isin}
          </p>
        </div>
        <p className="readout shrink-0 text-sm text-ink-2">
          {scorecard.score} of {scorecard.worst} to {scorecard.best} · {scorecard.rulesFired} rules
        </p>
      </div>

      <div className="mt-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-2)]">
        <Chip>{scorecard.band}</Chip>
        {conclusion?.verdict && <Chip>{conclusion.verdict}</Chip>}
        {conclusion?.duration?.label && <Chip>{conclusion.duration.label}</Chip>}
        {/* The starred finding survives into the list view, because a reader running
            ten reports at once is looking for exactly this one thing. */}
        {brokeOut && <Chip tone="accent">{breakouts.multiYear.window.describedAs}</Chip>}
        <Chip>{scorecard.confidence} confidence</Chip>
      </div>

      <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
        {conclusion?.unavailable ?? scorecard.gist}
      </p>

      <button
        type="button"
        onClick={() => onOpen(identity)}
        className="mt-[var(--space-2)] inline-flex min-h-11 items-center gap-[var(--space-2)] text-sm text-ink-2 transition hover:text-ink"
      >
        Open this one on its own
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </li>
  )
}

/* ------------------------------------------------------------------- page -- */

export default function Analyze() {
  const [query, setQuery] = useState('')
  const [resolution, setResolution] = useState(null)
  const [subject, setSubject] = useState(null)
  const [type, setType] = useState('both')
  const [horizon, setHorizon] = useState('swing')
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // The image path. `picked` is keyed by row index rather than by ISIN, because two
  // lines of a screenshot can resolve to the same company and each line still has to be
  // ticked or left alone on its own.
  const [extract, setExtract] = useState(null)
  const [picked, setPicked] = useState({})
  const [batch, setBatch] = useState(null)

  const { user, watchlist, loadWatchlist } = useAuth()
  const [params] = useSearchParams()
  const linkedIsin = params.get('isin')

  // Someone typing fast fires several resolves; without this the slowest reply wins
  // and the page confirms a company nobody asked for.
  const ticket = useRef(0)

  // The dashboard's list links here carrying an ISIN. It still goes through the
  // resolver rather than being taken as a subject on arrival, so the confirmation card
  // names whichever company that identifier belongs to today, and a stored entry for a
  // company that has since left the equity list fails visibly instead of quietly
  // becoming a report.
  useEffect(() => {
    if (!linkedIsin) return
    const mine = ++ticket.current
    setBusy('resolving')
    setError('')
    api(RESOLVE(linkedIsin), { auth: false })
      .then((data) => {
        if (mine !== ticket.current) return
        setResolution(data)
        if (data.status === 'exact') {
          setSubject(data.match)
          setQuery(data.match.name)
        }
      })
      .catch((err) => {
        if (mine === ticket.current) setError(err.message)
      })
      .finally(() => {
        if (mine === ticket.current) setBusy('')
      })
  }, [linkedIsin])

  // Once per session, and only when signed in. The control cannot name its own action
  // until it knows whether this company is already on the list.
  useEffect(() => {
    if (user && watchlist === null) loadWatchlist().catch(() => {})
  }, [user, watchlist, loadWatchlist])

  async function search(event) {
    event.preventDefault()
    const q = query.trim()
    if (!q) return

    const mine = ++ticket.current
    setBusy('resolving')
    setError('')
    setReport(null)
    setSubject(null)
    setResolution(null)
    try {
      const data = await api(RESOLVE(q), { auth: false })
      if (mine !== ticket.current) return
      setResolution(data)
      // An ambiguous result is never auto-picked here either. The candidates render
      // as buttons and the page waits for a person.
      if (data.status === 'exact') setSubject(data.match)
    } catch (err) {
      if (mine === ticket.current) setError(err.message)
    } finally {
      if (mine === ticket.current) setBusy('')
    }
  }

  async function run() {
    if (!subject?.isin) return
    const mine = ++ticket.current
    setBusy('running')
    setError('')
    setReport(null)
    try {
      // POST, and the body is an ISIN. The route refuses free text here on purpose,
      // which is what makes /resolve impossible to skip rather than merely expected.
      const data = await api('/analyze', {
        method: 'POST',
        body: { isin: subject.isin, type, horizon },
        auth: false,
      })
      if (mine !== ticket.current) return
      setReport(data)
    } catch (err) {
      if (mine === ticket.current) setError(err.message)
    } finally {
      if (mine === ticket.current) setBusy('')
    }
  }

  async function readImage(event) {
    const file = event.target.files?.[0]
    // The control holds on to its selection, so choosing the same screenshot twice in a
    // row fires no change event and the second attempt looks like a dead button.
    event.target.value = ''
    if (!file) return

    setBusy('reading')
    setError('')
    setExtract(null)
    setPicked({})
    setBatch(null)
    try {
      const data = await uploadForExtraction(file)
      setExtract(data)
      // Only the lines the resolver was sure about start ticked. An ambiguous line
      // starts unticked and stays that way until a person picks one of its candidates,
      // which is the same rule the typed path follows.
      setPicked(Object.fromEntries(data.rows.map((row, i) => [i, row.status === 'exact' ? row.match.isin : ''])))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function runBatch() {
    // Two rows resolving to the same company would be the same report twice.
    const isins = [...new Set(Object.values(picked).filter(Boolean))]
    if (!isins.length) return

    setBusy('batching')
    setError('')
    setBatch(null)
    setReport(null)
    try {
      setBatch(await api(BATCH, { method: 'POST', body: { isins, type, horizon }, auth: false }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  // Changing a picker invalidates what is on screen. Leaving the old report under a
  // new pill would be a figure attached to the wrong question.
  const repick = (setter) => (value) => {
    setter(value)
    setReport(null)
    setBatch(null)
  }

  // Derived rather than held in state: the ticks are the truth and a second copy of
  // them is a second thing that can be wrong.
  const confirmedIsins = [...new Set(Object.values(picked).filter(Boolean))]

  const chosenHorizon = HORIZONS.find((h) => h.key === horizon)
  const intraday = HORIZONS[0]
  const identity = report?.identity ?? subject

  // Everything the report render needs, read once, so no branch below has to guess
  // whether a block arrived.
  const request = report?.request ?? {}
  const fundamental = report?.fundamental && !report.fundamental.unavailable ? report.fundamental : null
  const subjectPeerRow = report?.peers?.table?.rows?.find((r) => r.subject) ?? null
  const revenueYoy = last(fundamental?.revenue?.yoy)
  const profitYoy = last(fundamental?.profit?.yoy)
  const shareholding = fundamental?.shareholding
  const news = report?.news
  const shapes = [...(report?.breakouts?.cups ?? []), ...(report?.patterns?.patterns ?? [])]

  // Two partitions the report already supports and the page used to throw away. Both
  // are derived here so the counts in a sentence and the rows under it are read off
  // one split rather than two that can disagree.
  const recentNews = splitByRelevance(news?.recent ?? [])
  const gaps = splitOutages(report?.dataQuality?.unavailable ?? [], report?.pipeline ?? [])

  return (
    <div className="mx-auto max-w-[var(--page-max)] px-[var(--page-inset)] pt-[var(--space-5)] pb-[var(--space-7)]">
      <Seo
        title="Stock Analyzer for NSE listed companies"
        description="Type a company or a ticker, confirm the exact NSE listing, and read a computed statistical summary: multi-year breakouts, valuation, shareholding, peers, institutional activity, orders and ranked news, every figure beside the period and source it came from."
      />

      <p className="eyebrow">stock analyzer</p>

      {/* The one serif line on the page, and it names whatever the page is currently
          about: the tool before a company is chosen, the company afterwards. */}
      <h1 className="display mt-[var(--space-2)]">{identity ? identity.name : 'Read the evidence'}</h1>

      <p className="prose mt-[var(--space-4)]">
        A statistical summary of published exchange and filing data, computed in code. Every figure below carries the
        period it belongs to and the source it came from, and anything that could not be verified is printed as
        unavailable with the reason, never estimated.
      </p>

      {/* Search */}
      <form onSubmit={search} className="mt-[var(--space-6)]">
        <label htmlFor="analyze-query" className="eyebrow">
          company name, NSE symbol or ISIN
        </label>
        <div className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
          <div className="well flex min-w-0 flex-1 items-center gap-[var(--space-2)] px-[var(--space-3)]">
            <Search size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
            <input
              id="analyze-query"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Reliance, TCS, INE002A01018"
              autoComplete="off"
              className="min-h-11 w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          {/* The one filled control on the page. */}
          <button
            type="submit"
            disabled={busy === 'resolving' || !query.trim()}
            className="min-h-11 shrink-0 rounded-[var(--radius-md)] bg-accent px-[var(--space-4)] text-sm text-canvas transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'resolving' ? 'Looking up…' : 'Find the listing'}
          </button>
        </div>
      </form>

      {/* The other way in. One screenshot of a watchlist or a holdings page, read into
          a list of companies, none of which is analysed until it has been ticked. */}
      <section className="mt-[var(--space-4)]">
        <div className="flex flex-wrap items-center gap-[var(--space-3)]">
          <label
            className={`inline-flex min-h-11 items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-4)] text-sm transition ${
              busy === 'reading' ? 'cursor-wait opacity-50' : 'cursor-pointer text-ink-2 hover:bg-surface hover:text-ink'
            }`}
            style={{ boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }}
          >
            <ImagePlus size={16} aria-hidden="true" />
            {busy === 'reading' ? 'Reading the image…' : 'Read a list from a screenshot'}
            <input type="file" accept="image/png,image/jpeg" onChange={readImage} disabled={busy === 'reading'} className="sr-only" />
          </label>
          <p className="text-[length:var(--text-micro)] text-ink-3">PNG or JPEG. Nothing is analysed until you confirm each line.</p>
        </div>
        {/* Said before the file picker opens rather than after it, because the 401 for
            a signed-out reader arrives once they have already chosen a screenshot.
            Reading an image is the one thing here that spends a shared third-party
            allowance, so it is the one thing that needs an account attached to it. */}
        {!user && (
          <p className="mt-[var(--space-2)] text-[length:var(--text-micro)] text-ink-3">
            Reading an image needs an account. <Link to="/auth" className="text-ink-2 underline underline-offset-2 hover:text-ink">Sign in</Link> first, or
            search by name above, which does not.
          </p>
        )}
      </section>

      {error && (
        <p className="mt-[var(--space-3)] text-sm text-loss" role="status">
          {error}
        </p>
      )}

      {/* What the image said, and what the equity list made of it. */}
      {extract && (
        <section className="mt-[var(--space-5)]">
          <h2>Confirm what was read</h2>
          <p className="prose mt-[var(--space-2)]">
            {extract.recogniser.name} read {extract.linesRead} lines off that image and {extract.rows.length} of them looked
            like companies. {extract.caveat} Nothing has been computed.
          </p>

          <ul className="well mt-[var(--space-4)]">
            {extract.rows.map((row, i) => (
              <ExtractedRow key={`${row.read?.headline}-${i}`} row={row} chosen={picked[i] ?? ''} onChoose={(isin) => setPicked((p) => ({ ...p, [i]: isin }))} />
            ))}
          </ul>

          <fieldset className="mt-[var(--space-5)] border-0 p-0">
            <legend className="eyebrow">what to compute for all of them</legend>
            <div className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
              {TYPES.map((t) => (
                <Option key={t.key} name="batch-type" value={t.key} checked={type === t.key} onChange={repick(setType)} label={t.label} detail={t.detail} />
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-[var(--space-4)] border-0 p-0">
            <legend className="eyebrow">horizon</legend>
            <div className="mt-[var(--space-2)] grid gap-[var(--space-2)] sm:grid-cols-3">
              {HORIZONS.map((h) => (
                <Option
                  key={h.key}
                  name="batch-horizon"
                  value={h.key}
                  checked={horizon === h.key}
                  disabled={Boolean(h.unavailable)}
                  onChange={repick(setHorizon)}
                  label={h.label}
                  detail={h.span}
                />
              ))}
            </div>
          </fieldset>

          <div className="mt-[var(--space-5)] flex flex-wrap items-center gap-[var(--space-3)]">
            <button
              type="button"
              onClick={runBatch}
              disabled={busy === 'batching' || confirmedIsins.length === 0 || confirmedIsins.length > extract.batchCap}
              className="inline-flex min-h-11 items-center gap-[var(--space-2)] rounded-[var(--radius-md)] bg-accent px-[var(--space-4)] text-sm text-canvas transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'batching' ? 'Computing…' : `Run ${confirmedIsins.length} report${confirmedIsins.length === 1 ? '' : 's'}`}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <p className="text-[length:var(--text-micro)] text-ink-3">
              {confirmedIsins.length} of {extract.rows.length} confirmed
              {confirmedIsins.length > extract.batchCap
                ? `. ${extract.batchCap} at a time is the limit, because one report is up to three price series and a dozen filings.`
                : ''}
            </p>
          </div>
        </section>
      )}

      {/* One row per confirmed company. A failure is one row, never the whole answer. */}
      {batch && (
        <section className="mt-[var(--space-6)]">
          <h2>
            {batch.analysed} of {batch.results.length} computed
          </h2>
          <p className="prose mt-[var(--space-2)]">{batch.note}</p>
          <ul className="well mt-[var(--space-4)]">
            {batch.results.map((result) => (
              <BatchRow
                key={result.isin}
                result={result}
                onOpen={(opened) => {
                  setSubject(opened)
                  setReport(null)
                  setQuery(opened.name)
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Nothing cleared the resolver's floor. */}
      {resolution?.status === 'none' && !subject && (
        <div className="mt-[var(--space-4)]">
          <Unavailable
            what="no match"
            why="Nothing on the NSE equity list matched that closely enough to be sure. The list covers companies listed on NSE only; try the exact ticker, or the ISIN from a contract note."
          />
        </div>
      )}

      {/* Ambiguity. Real buttons, one company each, because picking for someone here
          is how a report ends up about the wrong company. */}
      {resolution?.status === 'ambiguous' && !subject && (
        <section className="mt-[var(--space-5)]">
          <h2>Which one did you mean?</h2>
          <p className="prose mt-[var(--space-2)]">
            More than one listing matched and none of them clearly. Nothing is computed until you say which.
          </p>
          <ul className="well mt-[var(--space-4)]">
            {resolution.candidates.map((c) => (
              <li key={c.isin} className="border-t border-hairline first:border-t-0">
                <button
                  type="button"
                  onClick={() => setSubject(c)}
                  className="flex min-h-11 w-full items-center justify-between gap-[var(--space-3)] p-[var(--space-3)] text-left transition hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{c.name}</span>
                    <span className="readout mt-[var(--space-1)] block text-[length:var(--text-micro)] text-ink-3">
                      {c.symbol} · {c.isin} · series {c.series}
                    </span>
                  </span>
                  <span className="readout shrink-0 text-sm text-ink-3">{Math.round(c.confidence * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 1. The resolved company. Confirmation, before anything runs. */}
      {subject && (
        <section className="mt-[var(--space-5)]">
          <div className="panel p-[var(--space-4)]">
            <div className="flex flex-wrap items-start justify-between gap-[var(--space-3)]">
              <div className="min-w-0">
                <p className="eyebrow">confirm the listing</p>
                <p className="mt-[var(--space-2)] text-ink">{subject.name}</p>
                <p className="readout mt-[var(--space-1)] text-sm text-ink-2">
                  {subject.symbol} · {subject.isin}
                </p>
                <p className="readout mt-[var(--space-1)] text-[length:var(--text-micro)] text-ink-3">
                  series {subject.series}
                  {subject.listedOn ? ` · listed ${subject.listedOn}` : ''}
                  {subject.via ? ` · matched on ${subject.via}` : ''}
                  {subject.confidence != null && subject.confidence < 1
                    ? ` · ${Math.round(subject.confidence * 100)}% confidence`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSubject(null)
                  setReport(null)
                  setResolution(null)
                }}
                className="min-h-11 shrink-0 rounded-full px-[var(--space-3)] text-sm text-ink-2 transition hover:text-ink"
                style={{ boxShadow: 'inset 0 0 0 1px var(--color-hairline)' }}
              >
                Not this one
              </button>
            </div>

            <WatchControl subject={subject} />

            <fieldset className="mt-[var(--space-5)] border-0 p-0">
              <legend className="eyebrow">what to compute</legend>
              <div className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
                {TYPES.map((t) => (
                  <Option
                    key={t.key}
                    name="analysis-type"
                    value={t.key}
                    checked={type === t.key}
                    onChange={repick(setType)}
                    label={t.label}
                    detail={t.detail}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-[var(--space-4)] border-0 p-0">
              <legend className="eyebrow">horizon</legend>
              <div className="mt-[var(--space-2)] grid gap-[var(--space-2)] sm:grid-cols-3">
                {HORIZONS.map((h) => (
                  <Option
                    key={h.key}
                    name="horizon"
                    value={h.key}
                    checked={horizon === h.key}
                    disabled={Boolean(h.unavailable)}
                    onChange={repick(setHorizon)}
                    label={h.label}
                    detail={h.span}
                  />
                ))}
              </div>
              {/* Refused out loud. A horizon that quietly vanished from the picker
                  would read as a horizon nobody thought of. */}
              <div className="mt-[var(--space-3)]">
                <Unavailable what={`${intraday.label} horizon`} why={intraday.unavailable} />
              </div>
              <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                The horizon changes which timeframe the indicators are computed on, and how far back a multi-year
                breakout is measured. It does not change a word of what the report says about them.
              </p>
            </fieldset>

            <button
              type="button"
              onClick={run}
              disabled={busy === 'running'}
              className="mt-[var(--space-5)] inline-flex min-h-11 items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-4)] text-sm text-ink transition hover:bg-surface-2 disabled:opacity-50"
              style={{ boxShadow: 'inset 0 0 0 1px var(--color-hairline-strong)' }}
            >
              {busy === 'running' ? 'Computing…' : `Run the ${chosenHorizon?.label.toLowerCase()} report`}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* The report, in the order the reader asked for it. */}
      {report?.scorecard && (
        <>
          <section className="mt-[var(--space-7)]">
            <div className="flex flex-wrap items-center gap-[var(--space-2)]">
              <Chip>{report.identity.symbol}</Chip>
              <Chip>{request.label}</Chip>
              <Chip>{request.type === 'both' ? 'technical and fundamental' : request.type}</Chip>
              {report.cached && <Chip>from cache</Chip>}
            </div>
            <dl className="well mt-[var(--space-4)] grid grid-cols-2 sm:grid-cols-4">
              {[
                ['isin', report.identity.isin],
                ['span', request.span],
                ['computed', fmt(report.generatedAt)],
                ['took', `${report.tookMs} ms`],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="p-[var(--space-3)]">
                    <dt className="eyebrow">{label}</dt>
                    <dd className="readout mt-[var(--space-1)] text-sm text-ink">{value}</dd>
                  </div>
                ))}
            </dl>

            {request.timeframeWeights && Object.keys(request.timeframeWeights).length > 0 && (
              <p className="mt-[var(--space-2)] text-sm text-ink-2">
                Weighted{' '}
                {Object.entries(request.timeframeWeights)
                  .map(([tf, weight]) => `${Math.round(weight * 100)}% ${tf}`)
                  .join(', ')}
                .
              </p>
            )}
          </section>

          {/* 2. The conclusion, when the label is enabled. */}
          {report.conclusion && (
            <section className="mt-[var(--space-6)]">
              <h2>The call, and how it was derived</h2>
              <div className="mt-[var(--space-4)]">
                <Conclusion conclusion={report.conclusion} />
              </div>
            </section>
          )}

          {/* 3. The multi-year breakout. First finding on the page, because it is the
                rarest thing the detectors can report and the one the reader asked to
                be told about before anything else. */}
          {report.breakouts && typeof report.breakouts.unavailable !== 'string' && (
            <section className="mt-[var(--space-6)]">
              <h2>Multi-year breakout</h2>
              <p className="prose mt-[var(--space-2)]">
                A close above the highest high of the preceding years, where that high had already stood long enough to
                be a fact about the company rather than about last month. Read off the longest series available, because
                a level of that age is a monthly-chart fact.
              </p>
              <div className="mt-[var(--space-4)]">
                <MultiYearBreakout
                  finding={report.breakouts.multiYear}
                  chart={report.chart}
                  baseRateMeasured={report.breakouts.baseRateMeasured}
                />
              </div>
              <Sentences from={report.breakouts.baseRate} className="mt-[var(--space-3)]" />
            </section>
          )}

          {/* 4. Valuation. */}
          {(subjectPeerRow || fundamental) && (
            <section className="mt-[var(--space-6)]">
              <h2>Valuation</h2>
              <p className="prose mt-[var(--space-2)]">
                What the market capitalises, against what the filings report. Every multiple here is derived from a
                published quarterly filing and a published close, and the ones that need a balance sheet are absent
                rather than approximated.
              </p>
              {/* Not a <dl>: Figure draws a label and a value as paragraphs, and a
                  description list whose children are not dt/dd pairs is a list that
                  lies to a screen reader about what it contains. */}
              <div className="well mt-[var(--space-4)] grid sm:grid-cols-2 lg:grid-cols-3">
                {subjectPeerRow && (
                  <>
                    <CellFigure label="Market capitalisation" cell={subjectPeerRow.metrics.marketCap} />
                    <CellFigure label="P/E" cell={subjectPeerRow.metrics.pe} when={subjectPeerRow.metrics.pe?.earningsTo} />
                    <CellFigure label="Dividend yield" cell={subjectPeerRow.metrics.dividendYield} />
                  </>
                )}
                {fundamental && (
                  <>
                    <Figure
                      label="Revenue, trailing twelve months"
                      value={fundamental.revenue.ttm.value == null ? null : Number((fundamental.revenue.ttm.value / 1e7).toFixed(2))}
                      unit="Rs crore"
                      when={fundamental.revenue.ttm.to}
                      note={`${fundamental.basis} basis`}
                      source={fundamental.source}
                      unavailable={fundamental.revenue.ttm.unavailable}
                    />
                    <Figure
                      label="Profit, trailing twelve months"
                      value={fundamental.profit.ttm.value == null ? null : Number((fundamental.profit.ttm.value / 1e7).toFixed(2))}
                      unit="Rs crore"
                      when={fundamental.profit.ttm.to}
                      note={`${fundamental.basis} basis`}
                      source={fundamental.source}
                      unavailable={fundamental.profit.ttm.unavailable}
                    />
                    <Figure
                      label="Operating margin"
                      value={fundamental.margins.latest?.operating}
                      unit="%"
                      when={fundamental.margins.latest?.periodEnd}
                      note="earnings before interest, tax, depreciation and amortisation, over revenue from operations"
                      source={fundamental.source}
                      unavailable={
                        fundamental.margins.latest?.operatingUnavailable ??
                        fundamental.margins.latest?.unavailable ??
                        (fundamental.margins.latest ? null : 'No quarter with a readable profit and loss statement was available.')
                      }
                    />
                    <Figure
                      label="Revenue, year on year"
                      value={revenueYoy?.value}
                      unit="%"
                      when={revenueYoy?.periodEnd}
                      note={revenueYoy ? `against the quarter to ${revenueYoy.against}` : null}
                      source={fundamental.source}
                      unavailable={revenueYoy ? revenueYoy.unavailable : 'No year-on-year comparison could be built from the filings that were read.'}
                    />
                    <Figure
                      label="Profit, year on year"
                      value={profitYoy?.value}
                      unit="%"
                      when={profitYoy?.periodEnd}
                      note={profitYoy ? `against the quarter to ${profitYoy.against}` : null}
                      source={fundamental.source}
                      unavailable={profitYoy ? profitYoy.unavailable : 'No year-on-year comparison could be built from the filings that were read.'}
                    />
                    <Figure
                      label="Revenue growth across the filing history"
                      value={fundamental.revenue.cagr.value}
                      unit="% a year"
                      whenLabel={
                        fundamental.revenue.cagr.value == null
                          ? null
                          : `${fundamental.revenue.cagr.fromPeriod} to ${fundamental.revenue.cagr.toPeriod}`
                      }
                      source={fundamental.source}
                      unavailable={fundamental.revenue.cagr.unavailable}
                    />
                  </>
                )}
              </div>

              {fundamental && (
                <>
                  <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                    {fundamental.basisReason} {fundamental.coverage.quarters} quarterly filings were read, from{' '}
                    {fmt(fundamental.coverage.from)} to {fmt(fundamental.coverage.to)}.
                  </p>
                  <Fold className="mt-[var(--space-4)]" summary={`every quarter that was read · ${fundamental.quarters.length}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[30rem] border-collapse text-left">
                        <thead>
                          <tr>
                            {['quarter to', 'revenue', 'profit before tax', 'profit', 'audited'].map((h) => (
                              <th key={h} scope="col" className="eyebrow pb-[var(--space-2)]">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {fundamental.quarters.map((q) => (
                            <tr key={q.periodEnd} className="border-t border-hairline">
                              <td className="readout py-[var(--space-2)] text-sm text-ink">{q.periodEnd}</td>
                              <td className="readout py-[var(--space-2)] text-sm text-ink-2">
                                {q.revenueCrore == null ? 'unavailable' : show(q.revenueCrore)}
                              </td>
                              <td className="readout py-[var(--space-2)] text-sm text-ink-2">
                                {q.pbtCrore == null ? 'unavailable' : show(q.pbtCrore)}
                              </td>
                              <td className="readout py-[var(--space-2)] text-sm text-ink-2">
                                {q.patCrore == null ? 'unavailable' : show(q.patCrore)}
                              </td>
                              <td className="readout py-[var(--space-2)] text-[length:var(--text-micro)] text-ink-3">
                                {q.audited}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-[var(--space-2)] text-[length:var(--text-micro)] text-ink-3">
                      Rs crore, {fundamental.basis} basis, as filed.
                    </p>
                  </Fold>
                </>
              )}
            </section>
          )}

          {/* 5. Shareholding change, quarter by quarter. */}
          {shareholding && (
            <section className="mt-[var(--space-6)]">
              <h2>Shareholding, quarter on quarter</h2>
              {shareholding.unavailable ? (
                <div className="mt-[var(--space-4)]">
                  <Unavailable what="shareholding pattern" why={shareholding.unavailable} />
                </div>
              ) : (
                <>
                  <dl className="well mt-[var(--space-4)] grid grid-cols-2 sm:grid-cols-4">
                    {Object.entries(shareholding.latest.holders).map(([label, value]) => (
                      <div key={label} className="p-[var(--space-3)]">
                        <dt className="eyebrow">{label}</dt>
                        <dd className="readout mt-[var(--space-1)] text-xl leading-none text-ink">
                          {show(value)}
                          <span className="text-sm text-ink-2">%</span>
                        </dd>
                        <dd className="readout mt-[var(--space-2)] text-[length:var(--text-micro)] text-ink-3">
                          {shareholding.latest.date}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {shareholding.latestQuarterMove != null && (
                    <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                      Promoter and promoter group shareholding moved{' '}
                      <span className="readout text-ink">{signed(shareholding.latestQuarterMove)}</span> percentage
                      points in the latest quarter, against a materiality threshold of{' '}
                      <span className="readout">{shareholding.materialThresholdPp}</span> points.
                    </p>
                  )}

                  {(shareholding.notes ?? []).map((note) => (
                    <p key={note} className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                      {note}
                    </p>
                  ))}

                  <Fold className="mt-[var(--space-4)]" summary={`every quarter NSE publishes · ${shareholding.series.length}`}>
                    <div className="space-y-[var(--space-2)]">
                      {[...shareholding.series].reverse().map((q) => (
                        <p key={q.date} className="readout text-sm text-ink-2">
                          <span className="text-ink">{q.date}</span>{' '}
                          {Object.entries(q.holders)
                            .map(([k, v]) => `${k} ${v}%`)
                            .join(' · ')}
                        </p>
                      ))}
                    </div>
                  </Fold>
                </>
              )}
            </section>
          )}

          {/* 6. Peers. */}
          {report.peers && (
            <section className="mt-[var(--space-6)]">
              <h2>Compared with the companies NSE groups it with</h2>
              <p className="prose mt-[var(--space-2)]">
                The peer group is NSE's own, not one chosen here. No column is sorted and nothing in the table is ranked:
                a league table would say one of these companies is the good one, which is a judgement this report does
                not make.
              </p>
              <div className="mt-[var(--space-4)]">
                <PeerTable peers={report.peers} />
              </div>
            </section>
          )}

          {/* 7. Institutional activity and orders. */}
          {report.activity && (
            <section className="mt-[var(--space-6)]">
              <h2>Institutional activity and orders</h2>
              <p className="prose mt-[var(--space-2)]">
                What one named client transacted on the latest trading day NSE publishes, what the company announced
                winning, and the corporate events it filed. All of it is the exchange's record, quoted.
              </p>
              <div className="mt-[var(--space-4)]">
                <Activity activity={report.activity} />
              </div>
            </section>
          )}

          {/* 8. News, ranked by subject. */}
          {news && (
            <section className="mt-[var(--space-6)]">
              <h2>Latest news, ranked by subject</h2>
              <p className="prose mt-[var(--space-2)]">{news.note}</p>
              <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                {news.whyNotScored}
              </p>

              {news.unavailable ? (
                <div className="mt-[var(--space-4)]">
                  <Unavailable what="news" why={news.unavailable} />
                </div>
              ) : (
                <>
                  {/* Nothing inside the window is a result, not an empty box. These
                      are market-wide desks with a short feed, so a company outside the
                      index going two weeks without a headline is the ordinary case. */}
                  {news.recent.length > 0 ? (
                    <div className="mt-[var(--space-4)]">
                      <NewsList groups={recentNews} />
                    </div>
                  ) : (
                    <p className="well mt-[var(--space-4)] max-w-[var(--measure)] p-[var(--space-4)] text-sm leading-relaxed text-ink-2">
                      No item published in the last {news.window.recentDays} days named this company, out of{' '}
                      {news.scanned} scanned across the desks. Absence here is absence from those feeds, not evidence
                      that nothing happened.
                    </p>
                  )}
                  {/* Counted by standing rather than in one total, because a run of
                      twelve is a different report when nine of them matched on a
                      single shared word. */}
                  <p className="mt-[var(--space-2)] text-[length:var(--text-micro)] text-ink-3">
                    {recentNews.asserted.length} named this company outright and {recentNews.unasserted.length} matched
                    it weakly, inside {news.window.recentDays} days, from {news.scanned} scanned across the desks.
                  </p>

                  {news.historical.length > 0 && (
                    <Fold className="mt-[var(--space-4)]" summary={`older coverage · ${news.historical.length} items`}>
                      <NewsList groups={splitByRelevance(news.historical)} />
                    </Fold>
                  )}
                </>
              )}
            </section>
          )}

          {/* Chart geometry, below the priority list: the cup and the shapes patterns.js
              detects are real findings, and they are also the ones with the base rate
              problem, so they sit under the sections that carry more weight. */}
          {shapes.length > 0 && (
            <section className="mt-[var(--space-6)]">
              <h2>Other chart geometry</h2>
              <p className="prose mt-[var(--space-2)]">
                Where the lows sat, where the level sat, and when price closed across it. Measured from the same bars as
                the indicators, and worth exactly what the base rate beneath them says.
              </p>
              <div className="mt-[var(--space-4)] space-y-[var(--space-3)]">
                {shapes.map((shape, i) => (
                  <ShapeCard key={`${shape.kind}-${i}`} shape={shape} />
                ))}
              </div>
              <Sentences from={report.patterns?.baseRate} className="mt-[var(--space-4)]" />
            </section>
          )}

          {/* 9. The full scorecard. */}
          <section className="mt-[var(--space-6)]">
            <h2>Every rule that fired</h2>
            <p className="prose mt-[var(--space-2)]">
              Each row was computed by a fixed rule with a fixed range. The total is the sum of the rows and nothing
              else. Discard any row you disagree with and the arithmetic is yours to redo.
            </p>

            <div className="panel mt-[var(--space-4)] p-[var(--space-4)]">
              <div className="flex flex-wrap items-end justify-between gap-[var(--space-3)]">
                <div>
                  <p className="eyebrow">
                    {report.scorecard.rulesFired} rules · {report.scorecard.confidence} coverage
                  </p>
                  <p className="mt-[var(--space-1)] text-sm text-ink-2">{report.scorecard.gist}</p>
                </div>
                <p className="readout text-3xl leading-none text-ink">
                  {report.scorecard.score > 0 ? '+' : ''}
                  {report.scorecard.score}
                  <span className="text-sm text-ink-3">
                    {' '}
                    of {report.scorecard.worst} to {report.scorecard.best}
                  </span>
                </p>
              </div>

              <div className="mt-[var(--space-3)] h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-[var(--dur-data)] ease-[var(--ease-data)]"
                  style={{ width: `${Math.round((report.scorecard.normalised ?? 0) * 100)}%` }}
                />
              </div>

              <div className="mt-[var(--space-4)]">
                <RuleTable rules={report.scorecard.rules} />
              </div>

              <p className="mt-[var(--space-4)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                {report.scorecard.means}
              </p>
            </div>

            {report.technical && (
            <Fold className="mt-[var(--space-4)]" summary={`every indicator, per timeframe · ${Object.keys(report.technical).length} series`}>
              <div className="space-y-[var(--space-4)]">
                {Object.entries(report.technical).map(([tf, block]) => (
                  <div key={tf}>
                    <p className="eyebrow">
                      {tf} · weight {Math.round((block.weight ?? 0) * 100)}%
                    </p>
                    {block.unavailable ? (
                      <div className="mt-[var(--space-2)]">
                        <Unavailable what={`${tf} series`} why={block.unavailable} />
                      </div>
                    ) : (
                      <dl className="mt-[var(--space-2)] grid gap-[var(--space-1)] sm:grid-cols-2 lg:grid-cols-3">
                        {[
                          ['last close', block.lastClose, block.asOf],
                          ...block.ema.map((e) => [`${e.period} EMA`, e.value, e.asOf, e.unavailable]),
                          [`RSI(${block.rsi.period})`, block.rsi.value, block.rsi.asOf, block.rsi.unavailable],
                          ['MACD histogram', block.macd.histogram, block.macd.asOf, block.macd.unavailable],
                          ['ATR % of close', block.atr.percentOfClose, block.atr.asOf, block.atr.unavailable],
                          ['relative volume', block.relativeVolume.value, block.relativeVolume.asOf, block.relativeVolume.unavailable],
                        ].map(([label, value, when, why]) => (
                          <div key={label} className="flex items-baseline justify-between gap-[var(--space-2)]">
                            <dt className="text-sm text-ink-2">{label}</dt>
                            <dd
                              className="readout shrink-0 text-sm text-ink"
                              title={why ?? undefined}
                            >
                              {why ? <span className="text-ink-3">unavailable</span> : show(value)}
                              {when && !why && (
                                <span className="text-[length:var(--text-micro)] text-ink-3"> {when}</span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {block.structure?.description && (
                      <p className="mt-[var(--space-2)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                        {block.structure.description}.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Fold>
            )}
          </section>

          {/* 10. Data quality, then the disclosure. */}
          <section className="mt-[var(--space-6)]">
            <h2>What was verified, and what could not be</h2>
            {/* The claim that used to sit here ran over the whole list, and the list
                holds two different facts. A figure no free source publishes is a limit
                of the data; a feed that timed out ninety seconds ago is a limit of this
                run, and telling a reader the second in the words of the first says a
                figure does not exist when it does. Each kind now says which it is. */}
            <p className="prose mt-[var(--space-2)]">
              {report.dataQuality.rule} Listing what is missing is the point: a reader who can see the gaps can judge
              the rest. They are split below, because a figure no free source publishes and a source that did not answer
              this minute are different facts about this report.
            </p>

            <div className="well mt-[var(--space-4)]">
              {report.dataQuality.verified.map((v) => (
                <p
                  key={v.field}
                  className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)] border-t border-hairline p-[var(--space-3)] text-sm first:border-t-0"
                >
                  <span className="text-ink">{v.field}</span>
                  <span className="readout text-[length:var(--text-micro)] text-ink-3">{v.detail}</span>
                  {v.source?.url && (
                    <a
                      href={v.source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[length:var(--text-micro)] text-ink-2 underline decoration-1 underline-offset-4"
                    >
                      {v.source.name} <ExternalLink size={10} aria-hidden="true" />
                    </a>
                  )}
                </p>
              ))}
            </div>

            {/* Open, and above the structural gaps. A live outage is the one thing in
                this section that changes between two runs a minute apart, and folding
                it away under a count reads as the same standing permanent gap. */}
            {gaps.outages.length > 0 && (
              <Fold
                open
                className="mt-[var(--space-4)]"
                summary={`${gaps.outages.length} ${gaps.outages.length === 1 ? 'source' : 'sources'} that did not answer on this run`}
              >
                <p className="max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                  These are failures of this run, not limits of free data. The source publishes the figure and it could
                  not be read at {fmt(report.generatedAt)}, so running the report again may return it. A fetch that
                  failed is not evidence that nothing happened.
                </p>
                <div className="mt-[var(--space-3)] space-y-[var(--space-2)]">
                  {gaps.outages.map((item, i) => (
                    <FetchFailed
                      key={`${item.field}-${i}`}
                      what={item.field}
                      stage={item.stage}
                      error={item.error}
                      ms={item.ms}
                    />
                  ))}
                </div>
              </Fold>
            )}

            <Fold
              className="mt-[var(--space-4)]"
              summary={`${gaps.structural.length} figures no free source publishes`}
            >
              <p className="max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                None of these is a failure of this run. Each is a figure a paid terminal would show, or history this
                listing does not have, and no free source publishes it. Running the report again will not fill one in.
              </p>
              <div className="mt-[var(--space-3)] space-y-[var(--space-2)]">
                {gaps.structural.map((item, i) => (
                  <Unavailable key={`${item.field}-${i}`} what={item.field} why={item.why} />
                ))}
              </div>
            </Fold>

            <Fold className="mt-[var(--space-2)]" summary={`how the report was built · ${report.pipeline.length} stages`}>
              <div className="space-y-[var(--space-1)]">
                {report.pipeline.map((p, i) => (
                  <p key={`${p.stage}-${i}`} className="readout text-sm text-ink-2">
                    <span className={p.status === 'ok' ? 'text-ink' : 'text-loss'}>{p.status}</span> · {p.stage} ·{' '}
                    {p.ms} ms{p.why ? ` · ${p.why}` : ''}
                  </p>
                ))}
              </div>
            </Fold>

            <h2 className="mt-[var(--space-5)]">What this is</h2>
            <Sentences from={report.disclosure} className="mt-[var(--space-4)]" />
          </section>
        </>
      )}

      <Notice className="mt-[var(--space-6)]">
        InvestoMillionaire is not a SEBI registered investment adviser or research analyst. This page publishes
        statistics computed mechanically from published exchange and filing data, and where it carries a label, that
        label was derived from the arithmetic printed beside it by an unregistered party. It is free, it takes no money
        in any form, and the decision is entirely yours. Markets carry real risk of losing your capital.{' '}
        <Link to="/disclaimer" className="text-ink underline decoration-1 underline-offset-4">
          Full disclaimer
        </Link>
      </Notice>
    </div>
  )
}
