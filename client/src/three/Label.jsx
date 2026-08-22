import { Html } from '@react-three/drei'

// DOM labels instead of 3D text: no font fetch, sharp at every zoom, and they
// inherit the site typography for free.
export default function Label({ position, children, tone = 'default', size = 'sm' }) {
  const tones = {
    default: 'bg-white/10 text-white/85 border-white/15',
    gold: 'bg-gold/20 text-gold-soft border-gold/40',
    mint: 'bg-mint/15 text-mint border-mint/40',
    flame: 'bg-flame/15 text-flame border-flame/40',
  }
  return (
    <Html position={position} center distanceFactor={11} zIndexRange={[10, 0]}>
      <div
        className={`pointer-events-none whitespace-nowrap rounded-full border px-2.5 py-1 font-mono ${
          size === 'xs' ? 'text-[9px]' : 'text-[11px]'
        } backdrop-blur-sm ${tones[tone]}`}
      >
        {children}
      </div>
    </Html>
  )
}
