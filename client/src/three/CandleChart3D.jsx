import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import Label from './Label.jsx'

const GOLD = '#eaa81e'

// Ratios traders actually mark. The 38.2 to 61.8 band is where pullbacks in a
// healthy trend most often stall.
const FIB_LEVELS = [
  { ratio: 0, label: '0% · swing high', color: '#ff5d5d', golden: false },
  { ratio: 0.236, label: '23.6%', color: '#8b5cf6', golden: false },
  { ratio: 0.382, label: '38.2%', color: '#eaa81e', golden: true },
  { ratio: 0.5, label: '50%', color: '#eaa81e', golden: true },
  { ratio: 0.618, label: '61.8%', color: '#eaa81e', golden: true },
  { ratio: 1, label: '100% · swing low', color: '#33e29b', golden: false },
]
const MINT = '#33e29b'
const FLAME = '#ff5d5d'

// Seeded so the diagram is identical on every render and every device.
function mulberry(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildSeries(preset) {
  const rand = mulberry(preset.length * 977 + 42)
  const bars = 26
  const out = []
  let price = 100

  // Each preset needs a different shape for the lesson it illustrates.
  const drift = (i) => {
    if (preset === 'sr') return Math.sin((i / bars) * Math.PI * 2.4) * 2.2
    if (preset === 'pattern') {
      // Rough head-and-shoulders: shoulder, head, shoulder, then breakdown.
      const shape = [0, 1, 2.5, 1.5, 0.5, 2, 4.5, 6.5, 4, 1.5, 0.4, 2.2, 3.4, 2, 0, -2, -4]
      return (shape[Math.min(i, shape.length - 1)] ?? -4) * 0.9
    }
    if (preset === 'fib') {
      // strong rally, then a pullback that lands inside the golden zone
      const rally = Math.min(i, 14) * 0.85
      const pull = i > 14 ? (i - 14) * -0.55 : 0
      return rally + pull
    }
    if (preset === 'indicators') return i * 0.35 + Math.sin(i / 2) * 1.6
    return i * 0.18 + Math.sin(i / 3) * 1.4
  }

  for (let i = 0; i < bars; i++) {
    const open = price
    const target = 100 + drift(i)
    const noise = (rand() - 0.5) * 2.4
    const close = target + noise
    const high = Math.max(open, close) + rand() * 1.5
    const low = Math.min(open, close) - rand() * 1.5
    out.push({ i, open, high, low, close, volume: 0.35 + rand() * 0.9 })
    price = close
  }
  return out
}

function Candle({ bar, x, scaleY, base, mid, onHover }) {
  const bull = bar.close >= bar.open
  const color = bull ? MINT : FLAME
  const bodyHeight = Math.max(0.08, Math.abs(bar.close - bar.open) * scaleY)
  const bodyY = base + ((bar.open + bar.close) / 2 - mid) * scaleY
  const wickHeight = Math.max(0.1, (bar.high - bar.low) * scaleY)
  const wickY = base + ((bar.high + bar.low) / 2 - mid) * scaleY

  return (
    <group
      position={[x, 0, 0]}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover(bar)
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh position={[0, wickY, 0]}>
        <boxGeometry args={[0.04, wickHeight, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, bodyY, 0]} castShadow>
        <boxGeometry args={[0.34, bodyHeight, 0.34]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={bull ? 0.35 : 0.25}
          metalness={0.3}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, -3.1 + bar.volume / 2, 0]}>
        <boxGeometry args={[0.26, bar.volume, 0.26]} />
        <meshStandardMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

function MovingAverage({ series, period, color, scaleY, base, mid, spacing, startX }) {
  const points = useMemo(() => {
    const pts = []
    for (let i = period - 1; i < series.length; i++) {
      const slice = series.slice(i - period + 1, i + 1)
      const avg = slice.reduce((sum, b) => sum + b.close, 0) / period
      pts.push([startX + i * spacing, base + (avg - mid) * scaleY, 0.3])
    }
    return pts
  }, [series, period, scaleY, base, mid, spacing, startX])

  return <Line points={points} color={color} lineWidth={2.5} />
}

function Zone({ y, width, color, opacity = 0.16 }) {
  return (
    <mesh position={[0, y, -0.4]} rotation={[0, 0, 0]}>
      <planeGeometry args={[width, 0.45]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

export default function CandleChart3D({ preset = 'basic' }) {
  const group = useRef()
  const [hovered, setHovered] = useState(null)
  const series = useMemo(() => buildSeries(preset), [preset])

  const spacing = 0.42
  const startX = (-(series.length - 1) * spacing) / 2
  const base = 0
  const width = series.length * spacing + 0.6

  // Auto-fit vertically so a gentle drift and a 15 percent rally both fill the frame.
  const highest = Math.max(...series.map((b) => b.high))
  const lowest = Math.min(...series.map((b) => b.low))
  const mid = (highest + lowest) / 2
  const scaleY = 4.4 / Math.max(2, highest - lowest)

  useFrame((state) => {
    if (group.current) {
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.06
    }
  })

  return (
    <group ref={group}>
      {/* floor grid */}
      <gridHelper args={[width + 4, 20, '#1c2a48', '#121c33']} position={[0, -3.2, 0]} />

      {series.map((bar) => (
        <Candle
          key={bar.i}
          bar={bar}
          x={startX + bar.i * spacing}
          scaleY={scaleY}
          base={base}
          mid={mid}
          onHover={setHovered}
        />
      ))}

      {preset === 'sr' && (
        <>
          <Zone y={base + (highest - mid) * scaleY - 0.2} width={width} color={FLAME} />
          <Zone y={base + (lowest - mid) * scaleY + 0.2} width={width} color={MINT} />
          <Label position={[startX - 0.25, base + (highest - mid) * scaleY, 0]} tone="flame">
            resistance
          </Label>
          <Label position={[startX - 0.25, base + (lowest - mid) * scaleY, 0]} tone="mint">
            support
          </Label>
        </>
      )}

      {preset === 'indicators' && (
        <>
          <MovingAverage series={series} period={5} color={GOLD} scaleY={scaleY} base={base} mid={mid} spacing={spacing} startX={startX} />
          <MovingAverage series={series} period={12} color="#8b5cf6" scaleY={scaleY} base={base} mid={mid} spacing={spacing} startX={startX} />
          <Label position={[startX + series.length * spacing + 0.4, base + 1.6, 0]} tone="gold">
            fast MA (5)
          </Label>
          <Label position={[startX + series.length * spacing + 0.4, base + 0.6, 0]}>slow MA (12)</Label>
        </>
      )}

      {preset === 'fib' && (
        <>
          {FIB_LEVELS.map((level) => {
            const price = lowest + (highest - lowest) * (1 - level.ratio)
            const y = base + (price - mid) * scaleY
            return (
              <group key={level.ratio}>
                <Zone y={y} width={width} color={level.color} opacity={level.golden ? 0.22 : 0.1} />
                <Label position={[startX - 0.3, y, 0]} size="xs" tone={level.golden ? 'gold' : 'default'}>
                  {level.label}
                </Label>
              </group>
            )
          })}
          <Label position={[startX + series.length * spacing * 0.5, base + (highest - mid) * scaleY + 0.9, 0]} tone="gold">
            golden zone 38.2 to 61.8 percent
          </Label>
        </>
      )}

      {preset === 'pattern' && (
        <>
          <Zone y={base - 0.6} width={width} color={GOLD} opacity={0.2} />
          <Label position={[startX + 3.2, base + 3.4, 0]} tone="flame">
            head
          </Label>
          <Label position={[startX + 1.1, base + 1.6, 0]} tone="gold">
            left shoulder
          </Label>
          <Label position={[startX + 5.4, base + 1.6, 0]} tone="gold">
            right shoulder
          </Label>
          <Label position={[startX - 0.25, base - 0.6, 0]}>neckline</Label>
        </>
      )}

      <Label position={[0, -3.75, 0]} size="xs">
        volume
      </Label>

      {hovered && (
        <Label position={[startX + hovered.i * spacing, base + (hovered.high - mid) * scaleY + 0.7, 0]} tone="gold" size="xs">
          {`O ${hovered.open.toFixed(1)} · H ${hovered.high.toFixed(1)} · L ${hovered.low.toFixed(1)} · C ${hovered.close.toFixed(1)}`}
        </Label>
      )}
    </group>
  )
}
