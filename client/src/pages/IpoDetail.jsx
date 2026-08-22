import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, CalendarDays, ExternalLink, ShieldAlert, Check, Square, Info, Users, TrendingUp,
} from 'lucide-react'
import LessonScene from '../three/LessonScene.jsx'
import { formatDate } from './Ipo.jsx'
import { VerdictBadge, verdictTone } from '../components/Verdict.jsx'
import { API_BASE } from '../lib/api.js'

const PHASE_STYLE = {
  open: { color: '#33e29b', label: 'OPEN NOW' },
  upcoming: { color: '#eaa81e', label: 'UPCOMING' },
  closed: { color: '#8b5cf6', label: 'CLOSED' },
}

const CATEGORY_COLORS = ['#eaa81e', '#33e29b', '#8b5cf6', '#5ee0ff', '#ff8b3d']

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
function observations(issue, categories) {
  const notes = []
  const find = (re) => categories.find((c) => re.test(c.category))
  const qib = find(/qualified institutional/i)
  const nii = find(/non institutional/i)
  const retail = find(/retail/i)

  if (issue.board === 'SME') {
    notes.push({
      tone: 'amber',
      title: 'This is an SME issue',
      body: 'SME lots run into tens of thousands of rupees, trading volumes after listing are thin, and disclosure requirements are lighter than the mainboard.',
    })
  }

  if (qib) {
    notes.push({
      tone: qib.times >= 1 ? 'green' : 'amber',
      title: `QIB portion at ${qib.times.toFixed(2)}x`,
      body:
        qib.times >= 1
          ? 'Institutions with in-house research desks have taken up their reserved portion. It tells you they bid, not that they were right.'
          : 'The institutional portion is not yet covered. Institutions often bid on the final day, so this number moves late.',
    })
  }

  if (retail && qib && retail.times > qib.times * 2 && qib.times < 3) {
    notes.push({
      tone: 'amber',
      title: 'Retail is running well ahead of institutions',
      body: 'Retail demand far outpacing the QIB book is a pattern worth noticing. It is a description of who is bidding, nothing more.',
    })
  }

  if (nii && nii.times >= 10) {
    notes.push({
      tone: 'amber',
      title: `NII portion at ${nii.times.toFixed(0)}x`,
      body: 'Heavy non-institutional bidding is often funded by short-term borrowing, which tends to be sold quickly once listing is done.',
    })
  }

  if (issue.issueSizeCrore && issue.issueSizeCrore < 300) {
    notes.push({
      tone: 'amber',
      title: `Small issue, roughly Rs ${issue.issueSizeCrore} crore`,
      body: 'Smaller issues have less float, so prices move harder in both directions after listing.',
    })
  }

  if (issue.phase === 'open' && issue.daysLeft != null && issue.daysLeft <= 0) {
    notes.push({
      tone: 'green',
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
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-flame">{error}</p>
        <Link to="/ipo" className="mt-6 inline-block rounded-full bg-gold px-6 py-3 text-sm font-bold text-ink">
          Back to the tracker
        </Link>
      </div>
    )
  }
  if (!data) return <p className="py-24 text-center text-white/40">Loading issue…</p>

  const { issue, categories, coverage, verdict, gmpSource } = data
  const style = PHASE_STYLE[issue.phase]
  const notes = observations(issue, categories)
  const done = CHECKLIST.filter((item) => ticked[item.id]).length

  const bars = categories.map((cat, i) => ({
    name: shortCategory(cat.category),
    value: Number(cat.times.toFixed(2)),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    note: `${(cat.bid ?? 0).toLocaleString('en-IN')} bid vs ${(cat.offered ?? 0).toLocaleString('en-IN')} offered`,
  }))

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link to="/ipo" className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-white/40 uppercase hover:text-gold">
        <ArrowLeft size={14} /> IPO tracker
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-3 py-1 font-mono text-[11px] font-bold tracking-widest"
            style={{ background: `${style.color}1f`, color: style.color }}
          >
            {style.label}
          </span>
          <span className="rounded-full bg-white/5 px-3 py-1 font-mono text-[11px] tracking-widest text-white/45">
            {issue.board}
          </span>
          <span className="font-mono text-xs text-white/35">{issue.symbol}</span>
        </div>
        <h1 className="mt-4 text-3xl leading-tight font-extrabold sm:text-4xl">{issue.company}</h1>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <div key={label} className="glass rounded-2xl p-4">
            <dt className="font-mono text-[10px] tracking-widest text-white/35 uppercase">{label}</dt>
            <dd className="mt-1 font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {issue.phase === 'open' && issue.daysLeft != null && (
        <p className="mt-4 flex items-center gap-2 font-mono text-xs text-mint">
          <CalendarDays size={14} />
          {issue.daysLeft <= 0 ? 'Bidding closes today' : `${issue.daysLeft} day${issue.daysLeft === 1 ? '' : 's'} of bidding left`}
        </p>
      )}

      {verdict && (
        <section className="mt-10">
          <div className={`glass rounded-3xl border p-7 ${verdictTone(verdict.tone).border}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono text-[10px] tracking-widest text-white/40 uppercase">
                  mechanical score · {verdict.confidence} confidence
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <VerdictBadge verdict={verdict} size="lg" />
                  <span className="text-white/60">{verdict.gist}</span>
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono text-3xl font-extrabold ${verdictTone(verdict.tone).text}`}>
                  {verdict.score > 0 ? '+' : ''}
                  {verdict.score}
                </div>
                <div className="font-mono text-[10px] tracking-widest text-white/35 uppercase">
                  of {verdict.best} possible
                </div>
              </div>
            </div>

            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${Math.round(verdict.normalised * 100)}%`, background: verdictTone(verdict.tone).bar }}
              />
            </div>

            {verdict.capped && (
              <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-sm text-gold">
                Held back from the top band on purpose. Bidding has not opened, so there is no order book to read and
                the score rests almost entirely on grey market chatter.
              </p>
            )}

            <div className="mt-6 space-y-2">
              {verdict.rules.map((rule) => (
                <div key={rule.label} className="flex items-start gap-4 rounded-xl bg-white/[0.03] px-4 py-3">
                  <span
                    className={`w-8 shrink-0 text-center font-mono text-sm font-bold ${
                      rule.points > 0 ? 'text-mint' : rule.points < 0 ? 'text-flame' : 'text-white/30'
                    }`}
                  >
                    {rule.points > 0 ? '+' : ''}
                    {rule.points}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{rule.label}</span>
                    <span className="mt-0.5 block text-sm text-white/50">{rule.detail}</span>
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-6 text-sm leading-relaxed text-white/45">
              Every rule above is fixed and applied identically to every issue, so you can see precisely what produced
              the label and throw out any part you disagree with. It reads exchange and grey market numbers. It has read
              nothing about the business, the management or the industry, and it is not investment advice from a SEBI
              registered adviser, because we are not one.
            </p>
          </div>
        </section>
      )}

      {bars.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-gold" />
            <h2 className="text-2xl font-bold">Who is actually bidding</h2>
          </div>
          <p className="mt-2 text-white/55">
            Live from NSE. Hover a tower for the raw share counts. Each category has its own reserved portion, so they
            subscribe at very different rates.
          </p>
          <div className="mt-6">
            <LessonScene
              scene={{ type: 'towers', bars, caption: 'times subscribed, by investor category', unit: 'x subscribed' }}
              height={420}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {categories.map((cat, i) => (
              <div key={cat.category} className="glass flex items-center justify-between gap-3 rounded-xl p-4">
                <span className="min-w-0 truncate text-sm text-white/70">{cat.category}</span>
                <span className="font-mono text-sm font-bold" style={{ color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}>
                  {cat.times.toFixed(2)}x
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-gold" />
            <h2 className="text-2xl font-bold">What the numbers say</h2>
          </div>
          <p className="mt-2 text-white/55">
            Plain readings of the exchange data. None of these is a reason to apply or to stay away.
          </p>
          <div className="mt-5 space-y-3">
            {notes.map((note) => (
              <div
                key={note.title}
                className="glass rounded-2xl border-l-2 p-5"
                style={{ borderLeftColor: note.tone === 'green' ? '#33e29b' : '#eaa81e' }}
              >
                <h3 className="font-bold">{note.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/60">{note.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GMP */}
      <section className="mt-12">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-flame" />
          <h2 className="text-2xl font-bold">Grey market premium</h2>
        </div>

        {issue.gmp && issue.gmp.percent != null ? (
          <div className="glass mt-5 rounded-2xl border border-flame/25 p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="font-mono text-[10px] tracking-widest text-white/35 uppercase">premium</p>
                <p
                  className="mt-1 font-mono text-3xl font-extrabold"
                  style={{ color: issue.gmp.percent >= 0 ? '#33e29b' : '#ff5d5d' }}
                >
                  Rs {issue.gmp.premium}
                </p>
                <p className="font-mono text-sm text-white/45">
                  {issue.gmp.percent >= 0 ? '+' : ''}
                  {issue.gmp.percent}% over cap
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-widest text-white/35 uppercase">implied listing price</p>
                <p className="mt-1 font-mono text-3xl font-extrabold text-gold">
                  Rs {issue.gmp.estimatedListing ?? '--'}
                </p>
                <p className="font-mono text-sm text-white/45">cap Rs {issue.gmp.capPrice ?? issue.band.max} + premium</p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-widest text-white/35 uppercase">source quoted at</p>
                <p className="mt-1 font-mono text-sm text-white/70">{issue.gmp.updatedLabel ?? 'unknown'}</p>
                <a
                  href={issue.gmp.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-gold hover:underline"
                >
                  {gmpSource?.name ?? 'source'} <ExternalLink size={11} />
                </a>
              </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-sm leading-relaxed text-white/60">
                Read that number with both eyes open. GMP is quoted in an informal, off-exchange market with no
                regulator, no settlement and no published volume. SEBI has repeatedly cautioned investors about relying
                on grey market activity.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-white/55">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-flame" />
                  A handful of unofficial dealers quoting each other. Different sites publish different numbers for the
                  same issue on the same day.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-flame" />
                  It says nothing about the business, its profits or whether the issue price is reasonable.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-flame" />
                  A premium that collapses in the days before listing is common, and the figure is often quietly revised
                  after the fact.
                </li>
              </ul>
              {issue.gmp.matchConfidence != null && issue.gmp.matchConfidence < 1 && (
                <p className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-sm text-gold">
                  This figure was matched to the issue by company name at {Math.round(issue.gmp.matchConfidence * 100)}%
                  confidence. Check the source link before you lean on it.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="glass mt-5 rounded-2xl p-6 text-sm text-white/45">
            No grey market figure is being quoted for this issue yet. GMP usually appears once the price band is
            announced.
          </p>
        )}
      </section>

      {/* Coverage */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold">What the desks are writing</h2>
        <p className="mt-2 text-white/55">
          Published stories matched to this issue. Broker views belong to the brokers quoted in them, not to us.
        </p>
        {coverage.length === 0 ? (
          <p className="glass mt-5 rounded-2xl p-6 text-sm text-white/45">
            Nothing published yet that we can match to this company. Coverage usually appears once the price band is
            announced.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {coverage.map((item) => (
              <a
                key={item.link}
                href={item.link}
                target="_blank"
                rel="noreferrer noopener"
                className="glass group flex items-start gap-4 rounded-2xl p-5 transition hover:border-white/25"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] tracking-widest text-white/40 uppercase">{item.source}</span>
                    {item.mentionsGmp && (
                      <span className="rounded-full bg-flame/15 px-2 py-0.5 font-mono text-[9px] font-bold tracking-widest text-flame">
                        MENTIONS GMP
                      </span>
                    )}
                    {item.isReview && (
                      <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[9px] font-bold tracking-widest text-gold">
                        BROKER VIEW
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-semibold transition group-hover:text-gold">{item.title}</p>
                </div>
                <ExternalLink size={15} className="mt-1 shrink-0 text-white/30" />
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Checklist */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold">Six things to check before you decide</h2>
        <p className="mt-2 text-white/55">
          All six are answerable from the red herring prospectus, free on the SEBI and exchange websites. Tick them off
          as you go. Your answers stay in this browser.
        </p>

        <div className="mt-6 space-y-3">
          {CHECKLIST.map((item) => {
            const isDone = Boolean(ticked[item.id])
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition ${
                  isDone ? 'border-mint/40 bg-mint/5' : 'border-white/10 hover:border-white/25 hover:bg-white/5'
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${isDone ? 'text-mint' : 'text-white/25'}`}>
                  {isDone ? <Check size={18} /> : <Square size={18} />}
                </span>
                <span className="min-w-0">
                  <span className={`block font-semibold ${isDone ? 'text-mint' : ''}`}>{item.question}</span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-white/55">{item.why}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="glass mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
          <div>
            <p className="text-lg font-bold">
              <span className="text-gold">{done}</span> of {CHECKLIST.length} checked
            </p>
            <p className="mt-1 text-sm text-white/50">
              {done === CHECKLIST.length
                ? 'You have done the reading. The decision is yours and it always was.'
                : 'A checklist is homework, not a verdict. We do not score it and we do not tell you what to do with it.'}
            </p>
          </div>
          <Link
            to="/learn/fundamental/2"
            className="rounded-full border border-gold/40 px-5 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold/10"
          >
            Brush up on IPOs
          </Link>
        </div>
      </section>

      <div className="glass mt-10 flex items-start gap-3 rounded-2xl p-5">
        <Info size={17} className="mt-0.5 shrink-0 text-white/40" />
        <p className="text-sm leading-relaxed text-white/50">
          Subscription data belongs to NSE and is shown as the exchange publishes it. Headlines belong to their
          publishers. InvestoMillionaire is not a SEBI registered investment adviser or research analyst and does not
          recommend any issue.{' '}
          <Link to="/disclaimer" className="text-gold hover:underline">
            Full disclaimer
          </Link>
        </p>
      </div>
    </div>
  )
}
