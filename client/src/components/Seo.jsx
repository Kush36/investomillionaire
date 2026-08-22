import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export const SITE = {
  name: 'InvestoMillionaire',
  origin: 'https://investomillionaire.com',
  image: 'https://investomillionaire.com/logo.jpg',
}

function upsert(selector, attrs) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(attrs.tag || 'meta')
    document.head.appendChild(el)
  }
  for (const [key, value] of Object.entries(attrs)) {
    if (key !== 'tag' && value != null) el.setAttribute(key, value)
  }
}

/**
 * Keeps the head correct as the user navigates. The build also bakes a static
 * copy of these tags into one HTML file per route, which is what crawlers and
 * link unfurlers read, because they do not run our JavaScript.
 */
export default function Seo({ title, description, image, type = 'website', noindex = false }) {
  const { pathname } = useLocation()

  useEffect(() => {
    const fullTitle = title ? `${title} · ${SITE.name}` : `${SITE.name} — Learn the Indian stock market in 3D`
    const url = `${SITE.origin}${pathname}`
    const img = image || SITE.image

    document.title = fullTitle
    upsert('meta[name="description"]', { name: 'description', content: description })
    upsert('link[rel="canonical"]', { tag: 'link', rel: 'canonical', href: url })
    upsert('meta[name="robots"]', { name: 'robots', content: noindex ? 'noindex, follow' : 'index, follow' })

    upsert('meta[property="og:title"]', { property: 'og:title', content: fullTitle })
    upsert('meta[property="og:description"]', { property: 'og:description', content: description })
    upsert('meta[property="og:url"]', { property: 'og:url', content: url })
    upsert('meta[property="og:image"]', { property: 'og:image', content: img })
    upsert('meta[property="og:type"]', { property: 'og:type', content: type })
    upsert('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE.name })

    upsert('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    upsert('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle })
    upsert('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    upsert('meta[name="twitter:image"]', { name: 'twitter:image', content: img })
  }, [title, description, image, type, noindex, pathname])

  return null
}
