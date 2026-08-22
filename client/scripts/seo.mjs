import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SEO_ROUTES, NOINDEX_ROUTES } from '../src/data/seoRoutes.js'

// Runs after vite build. Writes one HTML file per public route with the head
// already correct, plus robots.txt and sitemap.xml. Crawlers and link unfurlers
// never run our JavaScript, so the tags have to exist in the served HTML.
const DIST = 'dist'
const ORIGIN = process.env.SITE_ORIGIN || 'https://investomillionaire.com'
const NAME = 'InvestoMillionaire'
const IMAGE = `${ORIGIN}/logo.jpg`

const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const organisation = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: NAME,
  url: ORIGIN,
  logo: IMAGE,
  email: 'investomillionaire@gmail.com',
  description:
    'Free educational site teaching the Indian stock market through interactive 3D diagrams, levelled quizzes, IPO tracking and market news.',
  areaServed: { '@type': 'Country', name: 'India' },
  disclaimer: 'Not a SEBI registered investment adviser or research analyst. Educational content only.',
}

function headFor(route) {
  const title = route.title ? `${route.title} · ${NAME}` : `${NAME} — Learn the Indian stock market in 3D`
  const url = `${ORIGIN}${route.path}`
  const noindex = NOINDEX_ROUTES.some((p) => route.path.startsWith(p))

  const jsonLd = [organisation]
  if (route.type === 'article') {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: route.title,
      description: route.description,
      url,
      inLanguage: 'en-IN',
      isAccessibleForFree: true,
      learningResourceType: 'Lesson',
      educationalLevel: 'Beginner to intermediate',
      provider: { '@type': 'EducationalOrganization', name: NAME, url: ORIGIN },
      about: { '@type': 'Thing', name: 'Indian stock market' },
    })
  }

  return `    <title>${esc(title)}</title>
    <meta name="description" content="${esc(route.description)}" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" />
    <meta property="og:type" content="${route.type === 'article' ? 'article' : 'website'}" />
    <meta property="og:site_name" content="${NAME}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(route.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${IMAGE}" />
    <meta property="og:locale" content="en_IN" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(route.description)}" />
    <meta name="twitter:image" content="${IMAGE}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
}

const shell = await readFile(join(DIST, 'index.html'), 'utf8')

// Strip the placeholder head tags so they cannot fight the generated ones.
const base = shell
  .replace(/<title>[\s\S]*?<\/title>/, '__HEAD__')
  .replace(/\s*<meta\s+name="description"[\s\S]*?\/>/, '')

let written = 0
for (const route of SEO_ROUTES) {
  const html = base.replace('__HEAD__', headFor(route))
  const target = route.path === '/' ? join(DIST, 'index.html') : join(DIST, route.path.slice(1), 'index.html')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, html)
  written++
}

const today = new Date().toISOString().slice(0, 10)
const urls = SEO_ROUTES.filter((r) => !NOINDEX_ROUTES.some((p) => r.path.startsWith(p)))
  .map(
    (r) => `  <url>
    <loc>${ORIGIN}${r.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority.toFixed(1)}</priority>
  </url>`
  )
  .join('\n')

await writeFile(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
)

await writeFile(
  join(DIST, 'robots.txt'),
  `User-agent: *
Allow: /
Disallow: /auth
Disallow: /dashboard

Sitemap: ${ORIGIN}/sitemap.xml
`
)

console.log(`[seo] ${written} route pages, sitemap with ${urls.split('<url>').length - 1} urls, robots.txt`)
