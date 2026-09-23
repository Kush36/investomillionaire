import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import HeroCanvas from '../three/HeroCanvas.jsx'
import LessonScene from '../three/LessonScene.jsx'
import { TRACK_META, LESSONS } from '../data/lessons.js'
import { useAuth } from '../lib/store.js'
import { useStats } from '../lib/useStats.js'
import Seo from '../components/Seo.jsx'

// index.css sets h1/h2/h3 sizes as unlayered element rules, and unlayered CSS
// outranks everything Tailwind emits into @layer utilities. A `text-3xl` on an
// h2 is therefore dead weight in this codebase. Section headings take their one
// step up the scale inline, for the same reason Chip sets its colour inline.
const TITLE = { fontSize: 'var(--text-title)', lineHeight: 1.06 }

// The one accent treatment on the page, and it means exactly one thing: make an
// account. Two appearances, both the same action. Everything else is ink.
const ACTION =
  'inline-flex items-center rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-canvas transition hover:bg-accent/90'

// Every other link is a word with a rule under it. A hairline that darkens on
// hover is affordance enough; a second pill would make the accent pill ordinary.
const LINK =
  '-my-[10px] inline-flex min-h-11 items-center gap-[var(--space-1)] border-b border-hairline py-[10px] pb-[3px] '
  + 'text-sm text-ink transition hover:border-ink'

const features = (stats) => [
  {
    title: 'Concepts you can rotate',
    body: 'A balance sheet is a stack of blocks you can spin. An option payoff is a surface you orbit. Drag it, break it, understand it.',
  },
  {
    title: 'Levels that unlock',
    body: `${stats.levelsPerTrack} levels per track, gated. Clear ${stats.passPercent} percent to move on. XP, streaks and badges, because a progress bar beats a reading list.`,
  },
  {
    title: 'Market news, decoded',
    body: 'Headlines from ET, Mint, Business Standard and BusinessLine, tagged bullish or bearish and sorted so you can scan a whole session in a minute.',
  },
]

const summaryStats = (stats) => [
  { value: String(stats.levels), label: 'Levels' },
  { value: stats.questions ? String(stats.questions) : '—', label: 'Questions' },
  { value: '3D', label: 'Diagrams' },
  { value: '₹0', label: 'Forever' },
]

export default function Home() {
  const { user } = useAuth()
  const stats = useStats()
  const STATS = summaryStats(stats)
  const FEATURES = features(stats)

  return (
    <div>
      <Seo
        description="Learn the Indian stock market through 3D diagrams you can rotate. Twenty lessons on fundamentals and technicals, 200 quiz questions, live NSE IPO tracking and market news. Free, and not a SEBI registered adviser."
      />

      {/* Hero. One voice moment, held on its own full-width line, with the
          product sitting under it rather than competing beside it. */}
      <section>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-7xl px-4 pt-[var(--space-6)] pb-[var(--space-7)] sm:px-6"
        >
          <p className="eyebrow">Indian markets · in 3D</p>

          {/* The display serif, once. Capped near 18ch so it breaks into a
              stack of two or three lines instead of running as a banner. */}
          <h1 className="mt-[var(--space-3)]">
            <span className="display block max-w-[18ch]">Learn the market before it teaches you</span>
          </h1>

          <div className="mt-[var(--space-6)] grid gap-[var(--space-5)] lg:grid-cols-2 lg:items-center lg:gap-[var(--space-6)]">
            <div>
              <p className="prose">
                Fundamentals and technicals for the Indian stock market, built as things you rotate instead of pages you
                skim. {stats.levels} levels{stats.questions ? `, ${stats.questions} questions` : ''}, live market news.
                No tips, no hype, no fees.
              </p>

              <div className="mt-[var(--space-5)] flex flex-wrap items-center gap-[var(--space-4)]">
                <Link to={user ? '/learn' : '/auth?mode=signup'} className={ACTION}>
                  {user ? 'Continue learning' : 'Start free'}
                </Link>
                <Link to="/news" className={LINK}>
                  Today's market <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <HeroCanvas height={440} />
          </div>

          {/* Four figures on one rule, not four tiles. Mono and tabular, so the
              row holds still when the question count arrives from the server. */}
          <div className="mt-[var(--space-6)] flex flex-wrap gap-x-[var(--space-6)] gap-y-[var(--space-4)] border-t border-hairline pt-[var(--space-4)]">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="readout text-ink" style={{ fontSize: 'var(--text-heading)', lineHeight: 1.1 }}>
                  {stat.value}
                </div>
                <div className="eyebrow mt-[var(--space-1)]">{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Tracks. Two editorial blocks with a rule between them: the glass boxes
          and the emoji they were holding up are both gone. */}
      <section className="mx-auto max-w-7xl px-4 py-[var(--space-7)] sm:px-6">
        <h2 style={TITLE}>
          Two tracks. <span className="text-ink-3">Pick your side.</span>
        </h2>
        <p className="prose mt-[var(--space-3)]">
          Fundamentals ask what a business is worth. Technicals ask what the chart is doing. Serious investors learn
          both, and most people never bother with the second half.
        </p>

        <div className="mt-[var(--space-6)] grid lg:grid-cols-2">
          {Object.entries(TRACK_META).map(([key, meta], i) => (
            <div
              key={key}
              className={
                i === 0
                  ? 'border-b border-hairline pb-[var(--space-6)] lg:border-b-0 lg:border-r lg:pr-[var(--space-6)] lg:pb-0'
                  : 'pt-[var(--space-6)] lg:pt-0 lg:pl-[var(--space-6)]'
              }
            >
              <h3 style={{ fontSize: 'var(--text-heading)', lineHeight: 1.2 }}>{meta.label}</h3>
              <p className="eyebrow mt-[var(--space-1)]">{meta.tagline}</p>
              <p className="prose mt-[var(--space-3)]">{meta.description}</p>

              {/* Level numbers set in the readout and right-aligned in a 2ch
                  column, so 1 and 10 share an edge. They used to be twenty
                  mulberry plates, which was most of the accent on the page. */}
              <ul className="mt-[var(--space-4)] space-y-[var(--space-1)]">
                {LESSONS[key].map((lesson) => (
                  <li key={lesson.id} className="flex gap-[var(--space-3)] text-sm text-ink-2">
                    <span className="readout w-[2ch] shrink-0 text-right text-ink-3">{lesson.level}</span>
                    {lesson.title}
                  </li>
                ))}
              </ul>

              <Link to={`/learn/${key}`} className={`${LINK} mt-[var(--space-5)]`}>
                Open track <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* The one interactive demo, on the recessed tone so it reads as a
          different kind of thing from the pages either side of it. */}
      <section className="border-y border-hairline bg-surface-2">
        <div className="mx-auto max-w-7xl px-4 py-[var(--space-7)] sm:px-6">
          <div className="grid items-center gap-[var(--space-6)] lg:grid-cols-2">
            <div>
              <p className="eyebrow">Live example</p>
              <h2 className="mt-[var(--space-2)]" style={TITLE}>
                A candle is four numbers. Go look at them.
              </h2>
              <p className="prose mt-[var(--space-4)]">
                Rotate the chart. Hover any candle to read its open, high, low and close. That translucent row below the
                price is volume, the conviction behind each move. This is the same component that carries every technical
                lesson on the site.
              </p>
              <Link to="/learn/technical/1" className={`${LINK} mt-[var(--space-5)]`}>
                Start Charts 101 <ArrowRight size={14} />
              </Link>
            </div>
            <LessonScene scene={{ type: 'candles', preset: 'sr' }} height={440} />
          </div>
        </div>
      </section>

      {/* Three claims on a shared rule. The mulberry icons that sat above them
          said nothing the headings did not already say. */}
      <section className="mx-auto max-w-7xl px-4 py-[var(--space-7)] sm:px-6">
        <div className="grid gap-[var(--space-5)] border-t border-hairline pt-[var(--space-4)] md:grid-cols-3 md:gap-[var(--space-6)]">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <h3>{feature.title}</h3>
              <p className="mt-[var(--space-2)] text-sm leading-relaxed text-ink-2">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Close. Air does the work the panel used to do. */}
      <section className="mx-auto max-w-7xl px-4 pb-[var(--space-7)] sm:px-6">
        <div className="text-center">
          <h2 style={TITLE}>Free, and it stays free</h2>
          <p className="prose mx-auto mt-[var(--space-3)]">
            Make an account so your XP, streak and level progress follow you across devices.
          </p>
          <Link to={user ? '/quiz' : '/auth?mode=signup'} className={`${ACTION} mt-[var(--space-5)]`}>
            {user ? 'Take a quiz' : 'Create your account'}
          </Link>
        </div>
      </section>
    </div>
  )
}
