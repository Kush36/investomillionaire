import { Chip } from './Chip.jsx'

// Verdict tones are a rating ladder, not a profit and loss readout, so they draw
// from the ink ladder with accent at the top. gain/loss stay reserved for money.
//
// The badge no longer carries the ladder. Three of the four rungs render as a
// neutral chip, because the word inside it already says AVOID or APPLY and the
// hero keeps the ladder visible where it can actually be read: the score colour
// and the progress bar. Only the top rung spends the accent, which is how an IPO
// list ends up with three mulberry marks instead of one on every card.
const TONES = {
  green: { bg: 'bg-accent-tint', text: 'text-accent', border: 'border-accent', bar: 'var(--color-accent)', chip: 'accent' },
  lime: { bg: 'bg-surface-2', text: 'text-ink', border: 'border-hairline-strong', bar: 'var(--color-ink)', chip: 'neutral' },
  amber: { bg: 'bg-surface-2', text: 'text-ink-2', border: 'border-hairline', bar: 'var(--color-ink-2)', chip: 'neutral' },
  red: { bg: 'bg-surface-2', text: 'text-ink-3', border: 'border-hairline', bar: 'var(--color-ink-3)', chip: 'neutral' },
}

export function verdictTone(tone) {
  return TONES[tone] ?? TONES.amber
}

export function VerdictBadge({ verdict, size = 'sm' }) {
  if (!verdict) return null
  return (
    <Chip tone={verdictTone(verdict.tone).chip} size={size === 'lg' ? 'md' : 'sm'}>
      {verdict.verdict}
    </Chip>
  )
}

export function GmpChip({ gmp }) {
  if (!gmp || gmp.percent == null) return null
  const positive = gmp.percent > 0
  return (
    <Chip tone={positive ? 'gain' : 'loss'}>
      GMP {positive ? '+' : ''}
      {gmp.percent}%
    </Chip>
  )
}
