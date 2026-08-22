import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'

const MOATS = [
  { name: 'Brand', angle: 0, color: '#eaa81e' },
  { name: 'Network effects', angle: Math.PI / 2.5, color: '#33e29b' },
  { name: 'Switching costs', angle: (2 * Math.PI) / 2.5, color: '#8b5cf6' },
  { name: 'Cost advantage', angle: (3 * Math.PI) / 2.5, color: '#5ee0ff' },
  { name: 'Licence', angle: (4 * Math.PI) / 2.5, color: '#ffcf5c' },
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
      <Label position={[0, 2.2, 0]} size="xs" tone={hovered ? 'gold' : 'default'}>
        {moat.name}
      </Label>
    </group>
  )
}

export default function MoatCastle3D() {
  const water = useRef()
  const core = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (water.current) water.current.rotation.y = t * 0.15
    if (core.current) {
      core.current.rotation.y = t * 0.3
      core.current.position.y = 1.6 + Math.sin(t) * 0.08
    }
  })

  return (
    <group position={[0, -1.6, 0]}>
      <gridHelper args={[16, 16, '#1c2a48', '#121c33']} />

      {/* the moat itself */}
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[2.2, 4.2, 48]} />
        <meshStandardMaterial color="#14315c" emissive="#1e4a8a" emissiveIntensity={0.4} transparent opacity={0.7} />
      </mesh>

      {/* the business inside it */}
      <mesh ref={core} position={[0, 1.6, 0]} castShadow>
        <icosahedronGeometry args={[1.15, 0]} />
        <meshStandardMaterial color="#eaa81e" emissive="#eaa81e" emissiveIntensity={0.45} metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[1.5, 1.8, 0.7, 6]} />
        <meshStandardMaterial color="#0b1c38" metalness={0.6} roughness={0.35} />
      </mesh>

      {MOATS.map((moat) => (
        <Pillar key={moat.name} moat={moat} radius={4.6} />
      ))}

      <Label position={[0, 3.4, 0]} tone="gold">
        the business
      </Label>
      <Label position={[0, -0.6, 0]} size="xs">
        wider moat = profits survive competition longer
      </Label>
    </group>
  )
}
