import { Html } from '@react-three/drei'

// DOM labels instead of 3D text: no font fetch, sharp at every zoom, and they
// inherit the site typography for free.
export default function Label({ position, children, tone = 'default', size = 'sm' }) {
  const tones = {
    default: 'bg-surface-2 text-ink-2 border-hairline',
    accent: 'bg-accent-tint text-accent border-accent',
    gain: 'bg-surface text-gain border-gain',
    loss: 'bg-surface text-loss border-loss',
  }
  return (
    <Html position={position} center distanceFactor={11} zIndexRange={[10, 0]}>
      <div
        className={`pointer-events-none whitespace-nowrap rounded-full border px-2.5 py-1 font-mono ${
          size === 'xs' ? 'text-[9px]' : 'text-[11px]'
        } ${tones[tone] ?? tones.default}`}
      >
        {children}
      </div>
    </Html>
  )
}
