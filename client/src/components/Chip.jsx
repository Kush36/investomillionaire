// One chip. The sixteen hand-rolled label spans scattered across the pages all
// collapse into this, which is the only way the tracking, the size and the ring
// stay identical from the IPO list to the recommendations filter row.
//
// Three decisions are deliberate and load-bearing:
//   - The ring is an INSET shadow, so it never doubles against the ring a panel
//     already draws and never grows the box by a pixel.
//   - Colour is the only thing tone changes. No fills, not even for accent: a
//     mulberry chip earns its place by being the one mulberry thing on screen,
//     and a tinted plate around it just makes it another block.
//   - Weight is inherited, which means 400. Mono, uppercase and 11px is already
//     three signals; a fourth is shouting.
//
// Colour and size go through inline style rather than utility classes because
// the eyebrow utility sets its own colour and font-size, and utility-vs-utility
// ordering is not something worth betting a design system on.
const TONES = {
  neutral: 'var(--color-ink-2)',
  accent: 'var(--color-accent)',
  gain: 'var(--color-gain)',
  loss: 'var(--color-loss)',
  brass: 'var(--color-brass)',
}

// Padding only. Both sizes keep --text-micro: a bigger chip is a longer pill,
// never louder type, so a chip can sit beside a 3xl readout without competing.
const SIZES = {
  sm: 'px-2.5 py-1.5',
  md: 'px-3.5 py-2',
}

export function Chip({ tone = 'neutral', size = 'sm', className = '', children, ...rest }) {
  const colour = TONES[tone] ?? TONES.neutral

  return (
    <span
      className={`eyebrow inline-flex items-center gap-1.5 rounded-full leading-none whitespace-nowrap ${
        SIZES[size] ?? SIZES.sm
      } ${className}`}
      style={{
        color: colour,
        fontSize: 'var(--text-micro)',
        boxShadow: 'inset 0 0 0 1px var(--color-hairline)',
      }}
      {...rest}
    >
      {children}
    </span>
  )
}

export default Chip
