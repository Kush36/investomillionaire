import { LESSONS, TRACK_META } from './lessons.js'

// One entry per public URL. The build script reads this to write a static HTML
// file per route and to generate the sitemap, so it is the single source of
// truth for what search engines see.
const STATIC_ROUTES = [
  {
    path: '/',
    title: null,
    description:
      'Learn the Indian stock market through 3D diagrams you can rotate. Twenty lessons on fundamentals and technicals, 200 quiz questions, live NSE IPO tracking and market news. Free, and not a SEBI registered adviser.',
    priority: 1.0,
    changefreq: 'weekly',
  },
  {
    path: '/learn',
    title: 'Learn the Indian stock market',
    description:
      'Two tracks, ten gated levels each. Fundamentals covers shares, financial statements, ratios, moats, taxes and banks. Technicals covers candles, structure, indicators, options and risk. Every lesson is built around a 3D diagram.',
    priority: 0.9,
    changefreq: 'monthly',
  },
  {
    path: '/quiz',
    title: 'Stock market quizzes by level',
    description:
      'Two hundred questions across twenty gated levels. Ten questions per quiz, scored on the server, with an explanation behind every answer. Clear 70 percent to unlock the next level.',
    priority: 0.8,
    changefreq: 'monthly',
  },
  {
    path: '/news',
    title: 'Indian stock market news',
    description:
      'Market headlines from Economic Times, Livemint, Business Standard and BusinessLine, filtered to stories that actually touch the Indian market and tagged bullish, bearish or neutral.',
    priority: 0.8,
    changefreq: 'hourly',
  },
  {
    path: '/ipo',
    title: 'IPO tracker with live NSE subscription',
    description:
      'Every mainboard and SME IPO open or announced, with live subscription figures from NSE, category-wise bidding in 3D, grey market premium with its source, and a prospectus checklist.',
    priority: 0.9,
    changefreq: 'daily',
  },
  {
    path: '/reco',
    title: 'Broker calls and research coverage',
    description:
      'Published research calls from Indian and global broking desks, each attributed to the firm that made it, with rating and target price where stated, and linked back to the source.',
    priority: 0.8,
    changefreq: 'daily',
  },
  {
    path: '/leaderboard',
    title: 'Leaderboard',
    description: 'Top learners by XP. Read lessons, clear quiz levels, build a streak and climb.',
    priority: 0.4,
    changefreq: 'daily',
  },
  {
    path: '/disclaimer',
    title: 'Disclaimer',
    description:
      'InvestoMillionaire is not a SEBI registered investment adviser or research analyst. Everything on the site is general educational material about how the Indian securities market works.',
    priority: 0.5,
    changefreq: 'yearly',
  },
]

function trackRoutes() {
  return Object.entries(TRACK_META).map(([key, meta]) => ({
    path: `/learn/${key}`,
    title: `${meta.label} track for the Indian market`,
    description: `${meta.description} Ten gated levels, each built around a 3D diagram you can rotate, followed by a quiz.`,
    priority: 0.8,
    changefreq: 'monthly',
  }))
}

function lessonRoutes() {
  return Object.entries(LESSONS).flatMap(([track, lessons]) =>
    lessons.map((lesson) => ({
      path: `/learn/${track}/${lesson.level}`,
      title: lesson.title,
      description: `${lesson.subtitle}. Level ${lesson.level} of the ${TRACK_META[track].label.toLowerCase()} track, a ${lesson.minutes} minute read built around an interactive 3D diagram.`,
      priority: 0.7,
      changefreq: 'monthly',
      type: 'article',
    }))
  )
}

export const SEO_ROUTES = [...STATIC_ROUTES, ...trackRoutes(), ...lessonRoutes()]

// Auth pages have nothing to index and should never appear in results.
export const NOINDEX_ROUTES = ['/auth', '/dashboard']
