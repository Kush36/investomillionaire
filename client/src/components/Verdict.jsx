const TONES = {
  green: { bg: 'bg-mint/15', text: 'text-mint', border: 'border-mint/40', bar: '#33e29b' },
  lime: { bg: 'bg-gold/15', text: 'text-gold', border: 'border-gold/40', bar: '#eaa81e' },
  amber: { bg: 'bg-[#ff8b3d]/15', text: 'text-[#ff8b3d]', border: 'border-[#ff8b3d]/40', bar: '#ff8b3d' },
  red: { bg: 'bg-flame/15', text: 'text-flame', border: 'border-flame/40', bar: '#ff5d5d' },
}

export function verdictTone(tone) {
  return TONES[tone] ?? TONES.amber
}

export function VerdictBadge({ verdict, size = 'sm' }) {
  const tone = verdictTone(verdict.tone)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono font-bold tracking-widest ${tone.bg} ${tone.text} ${tone.border} ${
        size === 'lg' ? 'text-sm' : 'text-[10px]'
      }`}
    >
      {verdict.verdict}
    </span>
  )
}

export function GmpChip({ gmp }) {
  if (!gmp || gmp.percent == null) return null
  const positive = gmp.percent > 0
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold tracking-widest"
      style={{
        background: positive ? 'rgba(51,226,155,0.14)' : 'rgba(255,93,93,0.14)',
        color: positive ? '#33e29b' : '#ff5d5d',
      }}
    >
      GMP {positive ? '+' : ''}
      {gmp.percent}%
    </span>
  )
}
