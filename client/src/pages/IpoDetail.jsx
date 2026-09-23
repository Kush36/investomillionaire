import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Check, Square } from 'lucide-react'
import LessonScene from '../three/LessonScene.jsx'
import { formatDate } from './Ipo.jsx'
import { VerdictBadge, verdictTone } from '../components/Verdict.jsx'
import { Chip } from '../components/Chip.jsx'
import { Notice } from '../components/Notice.jsx'
import { API_BASE } from '../lib/api.js'

// Phase is the one mulberry mark in the masthead: it is the only line here that
// changes what you can do today.
const PHASE = {
  open: { tone: 'accent', label: 'OPEN NOW' },
  upcoming: { tone: 'neutral', label: 'UPCOMING' },
  closed: { tone: 'neutral', label: 'CLOSED' },
}

// The 3D towers take colours through THREE.Color, which cannot read a CSS custom
// property, so this one ramp stays literal. It is a single indigo stepped down,
// not five competing hues.
// One hue, stepped by weight. A category chart wants rank, not five brand colours.
const CATEGORY_COLORS = [
  'var(--color-accent)',
  'var(--color-ink)',
  'var(--color-ink-2)',
  'var(--color-ink-3)',
  'var(--color-hairline-strong)',
]

// Shorten the exchange's very formal category names for the 3D labels.
function shortCategory(name) {
  if (/qualified institutional/i.test(name)) return 'QIB'
  if (/non institutional/i.test(name)) return 'NII'
  if (/retail/i.test(name)) return 'Retail'
  if (/employee/i.test(name)) return 'Employees'
  if (/shareholder/i.test(name)) return 'Shareholders'
  return name.split('(')[0].trim().slice(0, 14)
}

// Every line here describes what a number is. None of them says what to do about it.
//
// The tone field these notes used to carry was never rendered: it was computed on
// every note and thrown away at the call site. It is gone rather than promoted,
// because a colour-coded severity on a section whose whole argument is "none of
// these is a reason to apply or to stay away" would contradict the copy, and the
// titles already say which way each reading points.
function observations(issue, categories) {
  const notes = []
  const find = (re) => categories.find((c) => re.test(c.category))
  const qib = find(/qualified institutional/i)
  const nii = find(/non institutional/i)
  const retail = find(/retail/i)

  if (issue.board === 'SME') {
    notes.push({
      title: 'This is an SME issue',
      body: 'SME lots run into tens of thousands of rupees, trading volumes after listing are thin, and disclosure requirements are lighter than the mainboard.',
    })
  }

  if (qib) {
    notes.push({
      title: `QIB portion at ${qib.times.toFixed(2)}x`,
      body:
        qib.times >= 1
          ? 'Institutions with in-house research desks have taken up their reserved portion. It tells you they bid, not that they were right.'
          : 'The institutional portion is not yet covered. Institutions often bid on the final day, so this number moves late.',
    })
  }

  if (retail && qib && retail.times > qib.times * 2 && qib.times < 3) {
    notes.push({
      title: 'Retail is running well ahead of institutions',
      body: 'Retail demand far outpacing the QIB book is a pattern worth noticing. It is a description of who is bidding, nothing more.',
    })
  }

  if (nii && nii.times >= 10) {
    notes.push({
      title: `NII portion at ${nii.times.toFixed(0)}x`,
      body: 'Heavy non-institutional bidding is often funded by short-term borrowing, which tends to be sold quickly once listing is done.',
    })
  }

  if (issue.issueSizeCrore && issue.issueSizeCrore < 300) {
    notes.push({
      title: `Small issue, roughly Rs ${issue.issueSizeCrore} crore`,
      body: 'Smaller issues have less float, so prices move harder in both directions after listing.',
    })
  }

  if (issue.phase === 'open' && issue.daysLeft != null && issue.daysLeft <= 0) {
    notes.push({
      title: 'Final day of bidding',
      body: 'Subscription figures move most in the last few hours as institutional bids land.',
    })
  }

  return notes
}

// The homework. Everything here is answerable from the red herring prospectus,
// which is free on the SEBI and exchange sites.
const CHECKLIST = [
  {
    id: 'ofs',
    question: 'Is this mostly a fresh issue, or an offer for sale?',
    why: 'In an OFS the money goes to existing shareholders cashing out, not into the business. The RHP splits the two on its cover page.',
  },
  {
    id: 'proceeds',
    question: 'What will the company do with the money it raises?',
    why: 'Capacity expansion reads differently from repaying debt, which reads differently again from "general corporate purposes".',
  },
  {
    id: 'profit',
    question: 'Has it made a profit in each of the last three years?',
    why: 'The restated financials are in the RHP. A loss-making company is not automatically bad, but it needs a much stronger story.',
  },
  {
    id: 'valuation',
    question: 'How does the PE at the upper band compare with the listed peers?',
    why: 'The RHP contains a peer comparison table. Sellers choose the issue price, and they choose it in a market they like.',
  },
  {
    id: 'promoter',
    question: 'How much will promoters still hold after the issue?',
    why: 'A promoter selling most of their stake at listing is telling you something about their own view of the price.',
  },
  {
    id: 'risks',
    question: 'Did you read the risk factors section?',
    why: 'Pending litigation, regulatory action, customer concentration and related party dealings all live there. It is the least read and most useful part.',
  },
]

function useChecklist(symbol) {
  const key = `im_ipo_check_${symbol}`
  const [ticked, setTicked] = useState({})

  useEffect(() => {
    try {
      setTicked(JSON.parse(localStorage.getItem(key) || '{}'))
    } catch {
      setTicked({})
    }
  }, [key])

  const toggle = (id) => {
    setTicked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // private browsing, nothing to do about it
      }
      return next
    })
  }

  return [ticked, toggle]
}

export default function IpoDetail() {
  const { symbol } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [ticked, toggle] = useChecklist(symbol)

  useEffect(() => {
    setData(null)
    setError('')
    fetch(`${API_BASE}/ipo/${symbol}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Could not load that issue.')
        return json
      })
      .then(setData)
      .catch((err) => setError(err.message))
  }, [symbol])

  if (error) {
    return (
      <div className="mx-auto max-w-[var(--measure)] px-[var(--page-inset)] py-[var(--space-7)] text-center">
        <p className="text-loss">{error}</p>
        <Link
          to="/ipo"
          className="mt-[var(--space-4)] inline-block rounded-full border border-hairline-strong px-[var(--space-4)] py-[var(--space-2)] text-sm text-accent transition hover:border-accent"
        >
          Back to the tracker
        </Link>
      </div>
    )
  }
  if (!data) return <p className="py-[var(--space-7)] text-center text-ink-3">Loading issue…</p>

  const { issue, categories, coverage, verdict, gmpSource } = data
  const phase = PHASE[issue.phase]
  const notes = observations(issue, categories)
  const done = CHECKLIST.filter((item) => ticked[item.id]).length

  const bars = categories.map((cat, i) => ({
    name: shortCategory(cat.category),
    value: Number(cat.times.toFixed(2)),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    note: `${(cat.bid ?? 0).toLocaleString('en-IN')} bid vs ${(cat.offered ?? 0).toLocaleString('en-IN')} offered`,
  }))

  return (
    <div className="mx-auto max-w-[var(--page-max)] px-[var(--page-inset)] pt-[var(--space-5)] pb-[var(--space-7)]">
      <Link to="/ipo" className="eyebrow inline-flex items-center gap-2 transition hover:text-ink">
        <ArrowLeft size={14} /> IPO tracker
      </Link>

      <header className="mt-[var(--space-5)]">
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          {phase && <Chip tone={phase.tone}>{phase.label}</Chip>}
          <Chip>{issue.board}</Chip>
          <span className="readout text-xs text-ink-3">{issue.symbol}</span>
        </div>
        {/* The one serif line on this page: the company the page is about. */}
        <h1 className="display mt-[var(--space-3)]">{issue.company}</h1>
      </header>

      {/* One well, one grid, one baseline. Eight separate wells made eight boxes
          out of what is a single table of terms. */}
      <dl className="well mt-[var(--space-6)] grid grid-cols-2 sm:grid-cols-4">
        {[
          ['price band', issue.band.label],
          ['issue size', issue.issueSizeCrore ? `~Rs ${issue.issueSizeCrore} cr` : 'TBA'],
          ['opens', formatDate(issue.opens)],
          ['closes', formatDate(issue.closes)],
          ['lot size', issue.lot ? `${issue.lot} shares` : 'See RHP'],
          ['min application', issue.lot && issue.band.max ? `~Rs ${(issue.lot * issue.band.max).toLocaleString('en-IN')}` : 'See RHP'],
          ['allotment', formatDate(issue.allotmentDate)],
          ['listing', formatDate(issue.listingDate)],
        ].map(([label, value]) => (
          <div key={label} className="p-[var(--space-3)]">
            <dt className="eyebrow">{label}</dt>
            <dd className="readout mt-[var(--space-1)] text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {issue.phase === 'open' && issue.daysLeft != null && (
        <p className="mt-[var(--space-2)] text-sm text-ink-2">
          {issue.daysLeft <= 0 ? 'Bidding closes today' : `${issue.daysLeft} day${issue.daysLeft === 1 ? '' : 's'} of bidding left`}
        </p>
      )}

      {verdict && (
        <section className="mt-[var(--space-7)]">
          {/* No border on the panel: panel already draws its edge as a ring, and the
              rating ladder stays legible in the score colour and the bar. */}
          <div className="panel p-[var(--space-4)]">
            <div className="flex flex-wrap items-end justify-between gap-[var(--space-3)]">
              <div>
                <p className="eyebrow">mechanical score · {verdict.confidence} confidence</p>
                <div className="mt-[var(--space-2)]">
                  <VerdictBadge verdict={verdict} size="lg" />
                </div>
              </div>
              <div className="text-right">
                <div className={`readout text-3xl leading-none ${verdictTone(verdict.tone).text}`}>
                  {verdict.score > 0 ? '+' : ''}
                  {verdict.score}
                </div>
                <p className="eyebrow mt-[var(--space-1)]">of {verdict.best} possible</p>
              </div>
            </div>

            <p className="mt-[var(--space-3)] max-w-[var(--measure)] text-ink-2">{verdict.gist}</p>

            <div className="mt-[var(--space-3)] h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width] duration-[var(--dur-data)] ease-[var(--ease-data)]"
                style={{ width: `${Math.round(verdict.normalised * 100)}%`, background: verdictTone(verdict.tone).bar }}
              />
            </div>

            {verdict.capped && (
              <p className="well mt-[var(--space-4)] max-w-[var(--measure)] p-[var(--space-3)] text-sm leading-relaxed text-ink-2">
                Held back from the top band on purpose. Bidding has not opened, so there is no order book to read and
                the score rests almost entirely on grey market chatter.
              </p>
            )}

            {/* A scorecard is a table. One well, hairline rules, points in a fixed
                column so every sign lines up under the one above it. */}
            <div className="well mt-[var(--space-4)]">
              {verdict.rules.map((rule) => (
                <div
                  key={rule.label}
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
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-[var(--space-4)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
              Every rule above is fixed and applied identically to every issue, so you can see precisely what produced
              the label and throw out any part you disagree with. It reads exchange and grey market numbers. It has read
              nothing about the business, the management or the industry, and it is not investment advice from a SEBI
              registered adviser, because we are not one.
            </p>
          </div>
        </section>
      )}

      {bars.length > 0 && (
        <section className="mt-[var(--space-7)]">
          <h2>Who is actually bidding</h2>
          <p className="prose mt-[var(--space-2)]">
            Live from NSE. Hover a tower for the raw share counts. Each category has its own reserved portion, so they
            subscribe at very different rates.
          </p>
          <div className="mt-[var(--space-4)]">
            <LessonScene
              scene={{ type: 'towers', bars, caption: 'times subscribed, by investor category', unit: 'x subscribed' }}
              height={420}
            />
          </div>

          <div className="well mt-[var(--space-3)]">
            {categories.map((cat, i) => (
              <div
                key={cat.category}
                className="flex items-center justify-between gap-[var(--space-3)] border-t border-hairline px-[var(--space-3)] py-[var(--space-2)] first:border-t-0"
              >
                <span className="flex min-w-0 items-center gap-[var(--space-2)] text-sm text-ink-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                  />
                  <span className="truncate">{cat.category}</span>
                </span>
                <span className="readout shrink-0 text-sm text-ink">{cat.times.toFixed(2)}x</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section className="mt-[var(--space-7)]">
          <h2>What the numbers say</h2>
          <p className="prose mt-[var(--space-2)]">
            Plain readings of the exchange data. None of these is a reason to apply or to stay away.
          </p>
          <div className="well mt-[var(--space-4)]">
            {notes.map((note) => (
              <div key={note.title} className="border-t border-hairline p-[var(--space-3)] first:border-t-0">
                <h3>{note.title}</h3>
                <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                  {note.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GMP */}
      <section className="mt-[var(--space-7)]">
        <h2>Grey market premium</h2>

        {issue.gmp && issue.gmp.percent != null ? (
          <>
            <dl className="well mt-[var(--space-4)] grid gap-[var(--space-3)] p-[var(--space-3)] sm:grid-cols-3">
              <div>
                <dt className="eyebrow">premium</dt>
                <dd
                  className={`readout mt-[var(--space-1)] text-2xl leading-none ${
                    issue.gmp.percent >= 0 ? 'text-gain' : 'text-loss'
                  }`}
                >
                  Rs {issue.gmp.premium}
                </dd>
                <dd className="readout mt-[var(--space-1)] text-sm text-ink-2">
                  {issue.gmp.percent >= 0 ? '+' : ''}
                  {issue.gmp.percent}% over cap
                </dd>
              </div>
              <div>
                <dt className="eyebrow">implied listing price</dt>
                <dd className="readout mt-[var(--space-1)] text-2xl leading-none text-ink">
                  Rs {issue.gmp.estimatedListing ?? '--'}
                </dd>
                <dd className="readout mt-[var(--space-1)] text-sm text-ink-2">
                  cap Rs {issue.gmp.capPrice ?? issue.band.max} + premium
                </dd>
              </div>
              <div>
                <dt className="eyebrow">source quoted at</dt>
                <dd className="readout mt-[var(--space-1)] text-sm text-ink-2">{issue.gmp.updatedLabel ?? 'unknown'}</dd>
                <dd className="mt-[var(--space-1)]">
                  <a
                    href={issue.gmp.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="readout inline-flex items-center gap-1 text-xs text-ink underline decoration-1 underline-offset-4"
                  >
                    {gmpSource?.name ?? 'source'} <ExternalLink size={11} />
                  </a>
                </dd>
              </div>
            </dl>

            <Notice className="mt-[var(--space-3)]">
              Read that number with both eyes open. GMP is quoted in an informal, off-exchange market with no
              regulator, no settlement and no published volume. SEBI has repeatedly cautioned investors about relying
              on grey market activity.
              <ul className="mt-[var(--space-2)] list-disc space-y-[var(--space-1)] pl-[var(--space-3)]">
                <li>
                  A handful of unofficial dealers quoting each other. Different sites publish different numbers for the
                  same issue on the same day.
                </li>
                <li>It says nothing about the business, its profits or whether the issue price is reasonable.</li>
                <li>
                  A premium that collapses in the days before listing is common, and the figure is often quietly revised
                  after the fact.
                </li>
              </ul>
              {issue.gmp.matchConfidence != null && issue.gmp.matchConfidence < 1 && (
                <p className="mt-[var(--space-2)] border-t border-hairline pt-[var(--space-2)]">
                  This figure was matched to the issue by company name at {Math.round(issue.gmp.matchConfidence * 100)}%
                  confidence. Check the source link before you lean on it.
                </p>
              )}
            </Notice>
          </>
        ) : (
          <p className="well mt-[var(--space-4)] max-w-[var(--measure)] p-[var(--space-4)] text-sm leading-relaxed text-ink-2">
            No grey market figure is being quoted for this issue yet. GMP usually appears once the price band is
            announced.
          </p>
        )}
      </section>

      {/* Coverage */}
      <section className="mt-[var(--space-7)]">
        <h2>What the desks are writing</h2>
        <p className="prose mt-[var(--space-2)]">
          Published stories matched to this issue. Broker views belong to the brokers quoted in them, not to us.
        </p>
        {coverage.length === 0 ? (
          <p className="well mt-[var(--space-4)] max-w-[var(--measure)] p-[var(--space-4)] text-sm leading-relaxed text-ink-2">
            Nothing published yet that we can match to this company. Coverage usually appears once the price band is
            announced.
          </p>
        ) : (
          <div className="mt-[var(--space-4)] space-y-[var(--space-2)]">
            {coverage.map((item) => (
              <a
                key={item.link}
                href={item.link}
                target="_blank"
                rel="noreferrer noopener"
                className="panel flex items-start gap-[var(--space-3)] p-[var(--space-4)] transition hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                    <span className="eyebrow">{item.source}</span>
                    {item.mentionsGmp && <Chip tone="loss">MENTIONS GMP</Chip>}
                    {item.isReview && <Chip>BROKER VIEW</Chip>}
                  </div>
                  <p className="mt-[var(--space-2)] max-w-[var(--measure)]">{item.title}</p>
                </div>
                <ExternalLink size={15} className="mt-1 shrink-0 text-ink-3" />
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Checklist */}
      <section className="mt-[var(--space-7)]">
        <h2>Six things to check before you decide</h2>
        <p className="prose mt-[var(--space-2)]">
          All six are answerable from the red herring prospectus, free on the SEBI and exchange websites. Tick them off
          as you go. Your answers stay in this browser.
        </p>

        {/* Done recedes rather than lighting up: the tick goes to ink and the
            question steps back to ink-3. Six mulberry rows were six answers to a
            question nobody asked, which is what a verdict looks like. */}
        <div className="well mt-[var(--space-4)]">
          {CHECKLIST.map((item) => {
            const isDone = Boolean(ticked[item.id])
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                aria-pressed={isDone}
                className="flex w-full items-start gap-[var(--space-3)] border-t border-hairline p-[var(--space-3)] text-left transition first:border-t-0 hover:bg-surface"
              >
                <span className={`mt-0.5 shrink-0 ${isDone ? 'text-ink' : 'text-ink-3'}`}>
                  {isDone ? <Check size={17} /> : <Square size={17} />}
                </span>
                <span className="min-w-0">
                  <span className={`block ${isDone ? 'text-ink-3' : 'text-ink'}`}>{item.question}</span>
                  <span className="mt-[var(--space-1)] block max-w-[var(--measure)] text-sm leading-relaxed text-ink-2">
                    {item.why}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-[var(--space-4)] flex flex-wrap items-center justify-between gap-[var(--space-3)]">
          <div>
            <p>
              <span className="readout">{done}</span> of {CHECKLIST.length} checked
            </p>
            <p className="mt-[var(--space-1)] max-w-[var(--measure)] text-sm text-ink-2">
              {done === CHECKLIST.length
                ? 'You have done the reading. The decision is yours and it always was.'
                : 'A checklist is homework, not a verdict. We do not score it and we do not tell you what to do with it.'}
            </p>
          </div>
          {/* The one action this page argues for. */}
          <Link
            to="/learn/fundamental/2"
            className="shrink-0 rounded-full border border-hairline-strong px-[var(--space-4)] py-[var(--space-2)] text-sm text-accent transition hover:border-accent"
          >
            Brush up on IPOs
          </Link>
        </div>
      </section>

      <Notice tone="info" className="mt-[var(--space-6)]">
        Subscription data belongs to NSE and is shown as the exchange publishes it. Headlines belong to their
        publishers. InvestoMillionaire is not a SEBI registered investment adviser or research analyst and does not
        recommend any issue.{' '}
        <Link to="/disclaimer" className="text-ink underline decoration-1 underline-offset-4">
          Full disclaimer
        </Link>
      </Notice>
    </div>
  )
}
