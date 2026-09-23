import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'
import { token } from './Scene.jsx'

const MOATS = [
  { name: 'Brand', angle: 0, color: token('accent') },
  { name: 'Network effects', angle: Math.PI / 2.5, color: token('ink') },
  { name: 'Switching costs', angle: (2 * Math.PI) / 2.5, color: token('ink-2') },
  { name: 'Cost advantage', angle: (3 * Math.PI) / 2.5, color: token('ink-3') },
  { name: 'Licence', angle: (4 * Math.PI) / 2.5, color: token('hairline-strong') },
]

function Pillar({ moat, radius }) {
  const [hovered, setHovered] = useState(false)
  const x = Math.cos(moat.angle) * radius
  const z = Math.sin(moat.angle) * radius

  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0.9, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        castShadow
      >
        <cylinderGeometry args={[0.32, 0.42, 1.8, 6]} />
        <meshStandardMaterial
          color={moat.color}
          emissive={moat.color}
          emissiveIntensity={hovered ? 0.7 : 0.25}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>
      <Label position={[0, 2.2, 0]} size="xs" tone={hovered ? 'accent' : 'default'}>
        {moat.name}
      </Label>
    </group>
  )
}

export default function MoatCastle3D() {
  const water = useRef()
  const core = useRef()

  return (
    <group position={[0, -1.6, 0]}>
      <gridHelper args={[16, 16, token('hairline-strong'), token('hairline')]} />

      {/* the moat itself */}
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[2.2, 4.2, 48]} />
        <meshStandardMaterial color={token('hairline-strong')} transparent opacity={0.7} />
      </mesh>

      {/* the business inside it */}
      <mesh ref={core} position={[0, 1.6, 0]} castShadow>
        <icosahedronGeometry args={[1.15, 0]} />
        <meshStandardMaterial color={token('accent')} metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[1.5, 1.8, 0.7, 6]} />
        <meshStandardMaterial color={token('hairline-strong')} metalness={0.6} roughness={0.35} />
      </mesh>

      {MOATS.map((moat) => (
        <Pillar key={moat.name} moat={moat} radius={4.6} />
      ))}

      <Label position={[0, 3.4, 0]} tone="accent">
        the business
      </Label>
      <Label position={[0, -0.6, 0]} size="xs">
        wider moat = profits survive competition longer
      </Label>
    </group>
  )
}
