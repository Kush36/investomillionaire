import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'

// One NSE equity day, laid out end to end. Each phase behaves differently and
// most retail damage happens in the first and last of them.
const PHASES = [
  { name: 'Pre-open', span: '9:00 to 9:08', minutes: 8, color: '#8b5cf6', note: 'Call auction. Orders collected, no continuous matching' },
  { name: 'Order matching', span: '9:08 to 9:12', minutes: 4, color: '#a78bfa', note: 'Equilibrium price discovered for the open' },
  { name: 'Opening hour', span: '9:15 to 10:15', minutes: 60, color: '#ff5d5d', note: 'Widest spreads, highest volatility, most stop hunts' },
  { name: 'Mid session', span: '10:15 to 14:30', minutes: 255, color: '#33e29b', note: 'Quieter, tighter ranges, lower volume' },
  { name: 'Closing hour', span: '14:30 to 15:30', minutes: 60, color: '#eaa81e', note: 'Institutions rebalance, intraday positions square off' },
  { name: 'Closing auction', span: '15:30 to 15:40', minutes: 10, color: '#ffcf5c', note: 'Closing price is a weighted average, not the last trade' },
]

const TOTAL = PHASES.reduce((sum, p) => sum + p.minutes, 0)

function Segment({ phase, start, index, hovered, setHovered }) {
  const mesh = useRef()
  const active = hovered === phase.name
  const width = (phase.minutes / TOTAL) * 13
  const x = -6.5 + (start / TOTAL) * 13 + width / 2
  // Short phases would be invisible on a purely proportional bar, so height
  // carries the emphasis instead.
  const height = active ? 1.5 : phase.minutes < 20 ? 1.15 : 0.8

  useFrame((state, delta) => {
    if (!mesh.current) return
    mesh.current.scale.y += (height / 0.8 - mesh.current.scale.y) * delta * 8
  })

  return (
    <group position={[x, 0, 0]}>
      <mesh
        ref={mesh}
        position={[0, 0.4, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(phase.name)
        }}
        onPointerOut={() => setHovered(null)}
        castShadow
      >
        <boxGeometry args={[Math.max(0.22, width - 0.08), 0.8, 1.5]} />
        <meshStandardMaterial
          color={phase.color}
          emissive={phase.color}
          emissiveIntensity={active ? 0.75 : 0.26}
          metalness={0.42}
          roughness={0.3}
        />
      </mesh>
      <Label position={[0, active ? 2.4 : 1.25 + (index % 3) * 0.42, 0]} size="xs" tone={active ? 'gold' : 'default'}>
        {phase.name}
      </Label>
      {active && (
        <>
          <Label position={[0, 3.0, 0]} size="xs" tone="mint">
            {phase.span}
          </Label>
          <Label position={[0, -0.7, 0]} size="xs">
            {phase.note}
          </Label>
        </>
      )}
    </group>
  )
}

export default function SessionClock3D() {
  const [hovered, setHovered] = useState(null)
  const marker = useRef()

  useFrame((state) => {
    if (!marker.current) return
    // A pass along the session, so the shape of the day reads as time.
    const t = (state.clock.elapsedTime * 0.09) % 1
    marker.current.position.x = -6.5 + t * 13
  })

  let cursor = 0
  return (
    <group position={[0, -1, 0]}>
      <gridHelper args={[16, 16, '#1c2a48', '#121c33']} />
      {PHASES.map((phase) => {
        const start = cursor
        cursor += phase.minutes
        return <Segment key={phase.name} phase={phase} start={start} index={PHASES.indexOf(phase)} hovered={hovered} setHovered={setHovered} />
      })}

      <mesh ref={marker} position={[-6.5, 0.9, 0]}>
        <boxGeometry args={[0.06, 2.4, 1.7]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.6} transparent opacity={0.55} />
      </mesh>

      <Label position={[0, 4.3, 0]} tone="gold">
        one NSE equity session
      </Label>
      <Label position={[-7.6, 0.4, 0]} size="xs">
        9:00
      </Label>
      <Label position={[7.5, 0.4, 0]} size="xs">
        15:40
      </Label>
    </group>
  )
}
