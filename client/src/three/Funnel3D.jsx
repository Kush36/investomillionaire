import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'
import { token } from './Scene.jsx'

// Roughly what happens when you go from the whole listed universe down to the
// handful of companies you would actually put money into.
const STAGES = [
  { name: 'Listed in India', count: '~5,000', radius: 3.4, color: token('hairline-strong'), note: 'NSE and BSE combined' },
  { name: 'Liquid enough to trade', count: '~1,500', radius: 2.8, color: token('ink-3'), note: 'Daily volume you can exit into' },
  { name: 'Pass a numeric screen', count: '~200', radius: 2.1, color: token('ink-3'), note: 'ROCE, debt, growth, cash flow' },
  { name: 'Business you understand', count: '~40', radius: 1.5, color: token('ink-2'), note: 'You can explain how it makes money' },
  { name: 'Read the annual report', count: '~15', radius: 1.0, color: token('ink'), note: 'Notes, related parties, auditor' },
  { name: 'Priced sensibly today', count: '~5', radius: 0.55, color: token('accent'), note: 'Good company, fair price, both' },
]

function Ring({ stage, index, hovered, setHovered }) {
  const mesh = useRef()
  const active = hovered === stage.name
  const y = 4.2 - index * 0.85

  useFrame((state, delta) => {
    if (!mesh.current) return
    mesh.current.rotation.y += delta * (active ? 0.6 : 0.15)
    const target = active ? 1.1 : 1
    mesh.current.scale.x += (target - mesh.current.scale.x) * delta * 8
    mesh.current.scale.z = mesh.current.scale.x
  })

  return (
    <group position={[0, y, 0]}>
      <mesh
        ref={mesh}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(stage.name)
        }}
        onPointerOut={() => setHovered(null)}
      >
        <cylinderGeometry args={[stage.radius, stage.radius * 0.82, 0.5, 32, 1, true]} />
        <meshStandardMaterial
          color={stage.color}
          emissive={stage.color}
          emissiveIntensity={active ? 0.75 : 0.3}
          transparent
          opacity={0.62}
          side={2}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>
      <Label position={[-stage.radius - 1.6, 0, 0]} size="xs" tone={active ? 'accent' : 'default'}>
        {stage.name}
      </Label>
      <Label position={[stage.radius + 1.0, 0, 0]} size="xs" tone="accent">
        {stage.count}
      </Label>
      {active && (
        <Label position={[0, 0.6, 0]} size="xs" tone="accent">
          {stage.note}
        </Label>
      )}
    </group>
  )
}

export default function Funnel3D() {
  const [hovered, setHovered] = useState(null)

  return (
    <group position={[0, -1.6, 0]}>
      <gridHelper args={[16, 16, token('hairline-strong'), token('hairline')]} />
      {STAGES.map((stage, i) => (
        <Ring key={stage.name} stage={stage} index={i} hovered={hovered} setHovered={setHovered} />
      ))}
      <Label position={[0, 5.6, 0]} tone="accent">
        five thousand down to five
      </Label>
      <Label position={[0, -1.35, 0]} size="xs">
        every layer removes more than the last
      </Label>
    </group>
  )
}
