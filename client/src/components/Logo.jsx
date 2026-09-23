import { Link } from 'react-router-dom'

/**
 * The mark is drawn rather than loaded.
 *
 * It used to be logo.jpg: a gold badge from the retired palette, which sat at the
 * top of every page arguing with the one that replaced it. Drawing it means it
 * follows the theme, stays sharp at any density, and costs no request.
 *
 * The form is a rising step, which is the same idea the wordmark carries and the
 * only shape this product can honestly use: it says the market moves, not that it
 * moves upward for you.
 */
export default function Logo({ size = 'md', withText = true }) {
  const dims = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-16 w-16' }[size]

  return (
    // The whole lockup is one target, and at md it clears 44px so a thumb can hit
    // it. Before this the mark alone was 40px and the text was not part of the link.
    <Link to="/" className="group -m-2 flex min-h-11 items-center gap-3 p-2" aria-label="InvestoMillionaire, home">
      <span
        className={`${dims} grid shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-2 ring-1 ring-hairline transition group-hover:ring-hairline-strong`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M3 17.5 L9 11.5 L13.5 15 L21 6.5"
            stroke="var(--color-accent)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M15.5 6.5 H21 V12" stroke="var(--color-brass)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {withText && (
        <span className="leading-none">
          <span className="block font-display text-[19px] leading-none tracking-tight text-ink">INVESTO</span>
          <span className="block font-mono text-[11px] font-medium tracking-[0.18em] text-brass">MILLIONAIRE</span>
        </span>
      )}
    </Link>
  )
}
