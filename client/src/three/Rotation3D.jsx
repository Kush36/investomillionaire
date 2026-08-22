import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'

// The classic cycle: money rotates between sectors as the economy moves through
// its phases. Heights show relative strength, not price.
const SECTORS = [
  { name: 'IT', strength: 2.6, phase: 'Late bull', color: '#5ee0ff' },
  { name: 'Private banks', strength: 3.4, phase: 'Early bull', color: '#eaa81e' },
  { name: 'Auto', strength: 3.0, phase: 'Early bull', color: '#33e29b' },
  { name: 'Capital goods', strength: 3.6, phase: 'Mid bull', color: '#ffcf5c' },
  { name: 'Metals', strength: 2.2, phase: 'Peak', color: '#f97316' },
  { name: 'Energy', strength: 1.8, phase: 'Peak', color: '#ff8b3d' },
  { name: 'FMCG', strength: 1.2, phase: 'Slowdown', color: '#a78bfa' },
  { name: 'Pharma', strength: 1.5, phase: 'Slowdown', color: '#8b5cf6' },
  { name: 'Utilities', strength: 1.0, phase: 'Recession', color: '#4b6ba8' },
]

function SectorPillar({ sector, index, total, sweep, setHovered, hovered }) {
  const angle = (index / total) * Math.PI * 2
  const radius = 4.4
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  const active = hovered === sector.name
  // lit when the sweeping hand passes over it
  const lit = Math.abs(((sweep - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.45

  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, sector.strength / 2, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(sector.name)
        }}
        onPointerOut={() => setHovered(null)}
        castShadow
      >
        <cylinderGeometry args={[0.36, 0.44, sector.strength, 8]} />
        <meshStandardMaterial
          color={sector.color}
          emissive={sector.color}
          emissiveIntensity={active ? 0.85 : lit ? 0.6 : 0.18}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      <Label position={[0, sector.strength + 0.45, 0]} size="xs" tone={active || lit ? 'gold' : 'default'}>
        {sector.name}
      </Label>
      {active && (
        <Label position={[0, sector.strength + 0.95, 0]} size="xs" tone="mint">
          {sector.phase}
        </Label>
      )}
    </group>
  )
}

export default function Rotation3D() {
  const hand = useRef()
  const [hovered, setHovered] = useState(null)
  const sweepRef = useRef(0)
  const [, force] = useState(0)

  useFrame((state) => {
    const sweep = state.clock.elapsedTime * 0.35
    sweepRef.current = sweep
    if (hand.current) hand.current.rotation.y = -sweep
    // cheap re-render so the lit pillar keeps up with the hand
    if (Math.floor(sweep * 4) !== Math.floor((sweep - 0.02) * 4)) force((n) => n + 1)
  })

  return (
    <group position={[0, -1.8, 0]}>
      <gridHelper args={[16, 16, '#1c2a48', '#121c33']} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[3.9, 4.9, 64]} />
        <meshBasicMaterial color="#14315c" transparent opacity={0.55} />
      </mesh>

      <group ref={hand}>
        <mesh position={[2.1, 0.12, 0]}>
          <boxGeometry args={[4.2, 0.06, 0.16]} />
          <meshStandardMaterial color="#eaa81e" emissive="#eaa81e" emissiveIntensity={0.8} />
        </mesh>
      </group>

      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.5, 24, 24]} />
        <meshStandardMaterial color="#0b1c38" emissive="#eaa81e" emissiveIntensity={0.25} metalness={0.7} roughness={0.25} />
      </mesh>

      {SECTORS.map((sector, i) => (
        <SectorPillar
          key={sector.name}
          sector={sector}
          index={i}
          total={SECTORS.length}
          sweep={sweepRef.current}
          hovered={hovered}
          setHovered={setHovered}
        />
      ))}

      <Label position={[0, 5.4, 0]} tone="gold">
        money rotates, it rarely leaves
      </Label>
      <Label position={[0, -0.6, 0]} size="xs">
        pillar height = relative strength vs the Nifty
      </Label>
    </group>
  )
}
