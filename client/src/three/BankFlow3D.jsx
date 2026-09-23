import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'
import { token } from './Scene.jsx'

// A bank does not sell a product, it rents money. Deposits come in cheap, loans
// go out dearer, and the gap is the whole business. Bad loans leak out of it.
const STAGES = [
  { name: 'Deposits', value: 100, color: token('ink-3'), note: 'CASA is the cheapest funding a bank has' },
  { name: 'Lent out', value: 78, color: token('ink-2'), note: 'Credit-deposit ratio, usually 70 to 80 percent' },
  { name: 'Interest earned', value: 100, color: token('gain'), note: 'Yield on advances' },
  { name: 'Interest paid', value: 62, color: token('ink-2'), note: 'Cost of funds' },
  { name: 'Net interest income', value: 38, color: token('accent'), note: 'The gap. NIM is this over assets' },
  { name: 'After provisions', value: 27, color: token('loss'), note: 'Credit cost eats into it every year' },
]

function Slab({ stage, index, hovered, setHovered }) {
  const mesh = useRef()
  const active = hovered === stage.name
  const width = (stage.value / 100) * 6
  const z = index * 1.25 - 3.1

  useFrame((state, delta) => {
    if (!mesh.current) return
    const target = active ? 1.08 : 1
    mesh.current.scale.y += (target - mesh.current.scale.y) * delta * 8
  })

  return (
    <group position={[0, 0, z]}>
      <mesh
        ref={mesh}
        position={[0, 0.35, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(stage.name)
        }}
        onPointerOut={() => setHovered(null)}
        castShadow
      >
        <boxGeometry args={[width, 0.62, 0.9]} />
        <meshStandardMaterial
          color={stage.color}
          emissive={stage.color}
          emissiveIntensity={active ? 0.7 : 0.24}
          metalness={0.4}
          roughness={0.32}
        />
      </mesh>
      <Label position={[-width / 2 - 1.5, 0.35, 0]} size="xs" tone={active ? 'accent' : 'default'}>
        {stage.name}
      </Label>
      <Label position={[width / 2 + 0.8, 0.35, 0]} size="xs" tone="accent">
        {stage.value}
      </Label>
      {active && (
        <Label position={[0, 1.3, 0]} size="xs" tone="accent">
          {stage.note}
        </Label>
      )}
    </group>
  )
}

function Leak() {
  const points = useRef()
  const count = 140
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 5
    positions[i * 3 + 1] = Math.random() * 2
    positions[i * 3 + 2] = 3.1 + (Math.random() - 0.5) * 0.8
  }

  useFrame((state, delta) => {
    if (!points.current) return
    const arr = points.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= delta * 0.6
      if (arr[i * 3 + 1] < -0.4) arr[i * 3 + 1] = 2
    }
    points.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.09} color={token('loss')} transparent opacity={0.7} />
    </points>
  )
}

export default function BankFlow3D() {
  const [hovered, setHovered] = useState(null)

  return (
    <group position={[0, -1.2, 0]}>
      <gridHelper args={[16, 16, token('hairline-strong'), token('hairline')]} />
      {STAGES.map((stage, i) => (
        <Slab key={stage.name} stage={stage} index={i} hovered={hovered} setHovered={setHovered} />
      ))}
      {/* bad loans falling out of the bottom */}
      <Leak />
      <Label position={[0, 3.4, 0]} tone="accent">
        a bank rents money, the spread is the business
      </Label>
      <Label position={[0, -0.55, 3.6]} size="xs" tone="loss">
        provisions for bad loans
      </Label>
    </group>
  )
}
