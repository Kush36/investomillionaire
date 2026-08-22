import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Boxes, Newspaper, Trophy, Sparkles, Play } from 'lucide-react'
import Scene from '../three/Scene.jsx'
import HeroScene3D from '../three/HeroScene3D.jsx'
import LessonScene from '../three/LessonScene.jsx'
import { TRACK_META, LESSONS } from '../data/lessons.js'
import { useAuth } from '../lib/store.js'
import { useStats } from '../lib/useStats.js'
import Seo from '../components/Seo.jsx'

const TICKER = [
  'NIFTY 50', 'SENSEX', 'BANK NIFTY', 'RELIANCE', 'TCS', 'HDFC BANK', 'INFOSYS',
  'ITC', 'SBI', 'TATA MOTORS', 'ADANI PORTS', 'BAJAJ FINANCE',
]

const features = (stats) => [
  {
    icon: Boxes,
    title: 'Concepts you can rotate',
    body: 'A balance sheet is a stack of blocks you can spin. An option payoff is a surface you orbit. Drag it, break it, understand it.',
    tint: 'from-gold/20',
  },
  {
    icon: Trophy,
    title: 'Levels that unlock',
    body: `${stats.levelsPerTrack} levels per track, gated. Clear ${stats.passPercent} percent to move on. XP, streaks and badges, because a progress bar beats a reading list.`,
    tint: 'from-mint/20',
  },
  {
    icon: Newspaper,
    title: 'Market news, decoded',
    body: 'Headlines from ET, Mint, Business Standard and BusinessLine, tagged bullish or bearish and sorted so you can scan a whole session in a minute.',
    tint: 'from-violet/20',
  },
]

const summaryStats = (stats) => [
  { value: String(stats.levels), label: 'Levels' },
  { value: stats.questions ? String(stats.questions) : '—', label: 'Questions' },
  { value: '3D', label: 'Diagrams' },
  { value: '₹0', label: 'Forever' },
]

function Ticker() {
  const row = [...TICKER, ...TICKER]
  return (
    <div className="relative border-y border-white/5 bg-ink-soft py-3">
      {/* Names only. Arrows here would look like live quotes, and nothing on this
          site is a live quote. */}
      <div className="flex overflow-hidden">
        <div className="flex w-max animate-marquee gap-8">
          {row.map((symbol, i) => (
            <span key={i} className="flex items-center gap-2 font-mono text-xs tracking-widest text-white/40 uppercase">
              <span className="h-1 w-1 rounded-full bg-gold/60" />
              {symbol}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-center font-mono text-[9px] tracking-widest text-white/20 uppercase">
        names used across the lessons · not live prices
      </p>
    </div>
  )
}

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
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gold/10 blur-[140px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 font-mono text-[11px] tracking-widest text-gold uppercase">
              <Sparkles size={13} /> Indian markets · in 3D
            </span>

            <h1 className="mt-6 text-5xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              Learn the market
              <br />
              <span className="gold-text">before it teaches you</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/60">
              Fundamentals and technicals for the Indian stock market, built as things you rotate instead of pages you
              skim. {stats.levels} levels{stats.questions ? `, ${stats.questions} questions` : ''}, live market news. No
              tips, no hype, no fees.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to={user ? '/learn' : '/auth?mode=signup'}
                className="group inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3.5 font-bold text-ink transition hover:bg-gold-soft"
              >
                {user ? 'Continue learning' : 'Start free'}
                <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </Link>
              <Link
                to="/news"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-7 py-3.5 font-semibold text-white/85 transition hover:border-gold/50 hover:text-gold"
              >
                <Play size={16} /> Today's market
              </Link>
            </div>

            <div className="mt-12 grid max-w-md grid-cols-4 gap-4">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-extrabold text-gold">{stat.value}</div>
                  <div className="font-mono text-[10px] tracking-widest text-white/35 uppercase">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.15 }}>
            <Scene height={520} camera={[0, 1, 12]} controls={false}>
              <HeroScene3D />
            </Scene>
          </motion.div>
        </div>
      </section>

      <Ticker />

      {/* Tracks */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-extrabold sm:text-4xl">
          Two tracks. <span className="text-white/40">Pick your side.</span>
        </h2>
        <p className="mt-3 max-w-2xl text-white/55">
          Fundamentals ask what a business is worth. Technicals ask what the chart is doing. Serious investors learn
          both, and most people never bother with the second half.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {Object.entries(TRACK_META).map(([key, meta]) => (
            <motion.div
              key={key}
              whileHover={{ y: -6 }}
              className="glass group relative overflow-hidden rounded-3xl p-7"
            >
              <div
                className="absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl transition group-hover:opacity-80"
                style={{ background: meta.accent, opacity: 0.14 }}
              />
              <div className="relative">
                <span className="text-3xl">{meta.emoji}</span>
                <h3 className="mt-4 text-2xl font-bold">{meta.label}</h3>
                <p className="mt-1 font-mono text-xs tracking-widest uppercase" style={{ color: meta.accent }}>
                  {meta.tagline}
                </p>
                <p className="mt-4 text-white/60">{meta.description}</p>

                <ul className="mt-6 space-y-2">
                  {LESSONS[key].map((lesson) => (
                    <li key={lesson.id} className="flex items-center gap-3 text-sm text-white/55">
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[11px] font-bold"
                        style={{ background: `${meta.accent}22`, color: meta.accent }}
                      >
                        {lesson.level}
                      </span>
                      {lesson.title}
                    </li>
                  ))}
                </ul>

                <Link
                  to={`/learn/${key}`}
                  className="mt-7 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-ink transition"
                  style={{ background: meta.accent }}
                >
                  Open track <ArrowRight size={15} />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 3D showcase */}
      <section className="border-y border-white/5 bg-ink-soft py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="font-mono text-xs tracking-widest text-gold uppercase">Live example</span>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">A candle is four numbers. Go look at them.</h2>
              <p className="mt-4 text-white/60">
                Rotate the chart. Hover any candle to read its open, high, low and close. That translucent row below the
                price is volume, the conviction behind each move. This is the same component that carries every technical
                lesson on the site.
              </p>
              <Link
                to="/learn/technical/1"
                className="mt-7 inline-flex items-center gap-2 rounded-full border border-gold/40 px-6 py-3 font-semibold text-gold transition hover:bg-gold/10"
              >
                Start Charts 101 <ArrowRight size={16} />
              </Link>
            </div>
            <LessonScene scene={{ type: 'candles', preset: 'sr' }} height={440} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className={`glass relative overflow-hidden rounded-3xl bg-gradient-to-br ${feature.tint} to-transparent p-7`}>
              <feature.icon className="text-gold" size={26} />
              <h3 className="mt-5 text-xl font-bold">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-gold/25 bg-gradient-to-br from-gold/15 via-transparent to-violet/10 p-10 text-center sm:p-16">
          <div className="absolute -bottom-32 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-gold/20 blur-[100px]" />
          <div className="relative">
            <h2 className="text-3xl font-extrabold sm:text-5xl">
              Free, and it stays <span className="gold-text">free</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/60">
              Make an account so your XP, streak and level progress follow you across devices.
            </p>
            <Link
              to={user ? '/quiz' : '/auth?mode=signup'}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gold px-8 py-4 font-bold text-ink transition hover:bg-gold-soft"
            >
              {user ? 'Take a quiz' : 'Create your account'} <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
