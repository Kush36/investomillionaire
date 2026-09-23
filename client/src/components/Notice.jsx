import { ShieldAlert } from 'lucide-react'

// One notice for every risk and disclosure block on the site. There were six
// recipes for this: a panel with a left border, a tinted well, a rounded-2xl
// card with a full border, and three variations on the padding. Six recipes for
// one sentence of legal copy is the cheapest-looking thing a site can do.
//
// The rail is an inset shadow sitting alongside --shadow-ring, never a border.
// panel already draws its edge as a ring shadow; adding a border on top gives
// two lines a pixel apart, which is the exact mistake the utility exists to
// prevent. Listing the ring in the same declaration keeps it, because an inline
// box-shadow replaces the utility's rather than adding to it.
const TONES = {
  loss: 'var(--color-loss)',
  info: 'var(--color-ink-3)',
}

export function Notice({ tone = 'loss', title, className = '', children }) {
  const colour = TONES[tone] ?? TONES.loss

  return (
    <div
      className={`panel flex items-start gap-[var(--space-2)] p-[var(--space-4)] ${className}`}
      style={{ boxShadow: `inset 2px 0 0 ${colour}, var(--shadow-ring)` }}
    >
      <ShieldAlert size={17} className="mt-0.5 shrink-0" style={{ color: colour }} aria-hidden="true" />
      <div className="max-w-[var(--measure)]">
        {title && (
          <p className="text-sm font-semibold" style={{ color: colour }}>
            {title}
          </p>
        )}
        {/* Capped at the prose measure. A disclosure set across the full 1024px
            runs past 120 characters a line, which is the single most reliable
            way to make a paragraph look like boilerplate nobody proofread. */}
        <div className={`text-sm leading-relaxed text-ink-2 ${title ? 'mt-[var(--space-1)]' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

export default Notice
