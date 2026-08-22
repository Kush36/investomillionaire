import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'

const ASSETS = [
  { name: 'Cash', value: 1.2, color: '#33e29b' },
  { name: 'Receivables', value: 1.0, color: '#5ee0ff' },
  { name: 'Inventory', value: 0.8, color: '#8b5cf6' },
  { name: 'Plant & property', value: 1.6, color: '#eaa81e' },
]

const CLAIMS = [
  { name: 'Debt', value: 1.8, color: '#ff5d5d' },
  { name: 'Payables', value: 0.9, color: '#ff8b3d' },
  { name: 'Equity', value: 1.9, color: '#ffcf5c' },
]

function Stack({ items, x, tone, heading }) {
  const [hovered, setHovered] = useState(null)
  let cursor = 0

  return (
    <group position={[x, 0, 0]}>
      {items.map((item) => {
        const y = cursor + item.value / 2
        cursor += item.value + 0.06
        const active = hovered === item.name
        return (
          <group key={item.name}>
            <mesh
              position={[0, y, 0]}
              castShadow
              onPointerOver={(e) => {
                e.stopPropagation()
                setHovered(item.name)
              }}
              onPointerOut={() => setHovered(null)}
            >
              <boxGeometry args={[2.1, item.value, 1.5]} />
              <meshStandardMaterial
                color={item.color}
                emissive={item.color}
                emissiveIntensity={active ? 0.55 : 0.18}
                metalness={0.35}
                roughness={0.35}
              />
            </mesh>
            <Label position={[0, y, 0.9]} size="xs" tone={active ? 'gold' : 'default'}>
              {`${item.name} · ${item.value}`}
            </Label>
          </group>
        )
      })}
      <Label position={[0, cursor + 0.6, 0]} tone={tone}>
        {heading}
      </Label>
    </group>
  )
}

export default function BalanceScale3D() {
  const beam = useRef()

  // The beam settles level because assets equal liabilities plus equity. Always.
  useFrame((state) => {
    if (beam.current) {
      beam.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.9) * 0.012
    }
  })

  const totalAssets = ASSETS.reduce((sum, a) => sum + a.value, 0)
  const totalClaims = CLAIMS.reduce((sum, c) => sum + c.value, 0)

  return (
    <group ref={beam} position={[0, -2.6, 0]}>
      <gridHelper args={[16, 16, '#1c2a48', '#121c33']} />
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[9, 0.24, 2.2]} />
        <meshStandardMaterial color="#14315c" metalness={0.6} roughness={0.3} />
      </mesh>
      <Stack items={ASSETS} x={-2.6} tone="mint" heading={`Assets · ${totalAssets.toFixed(1)}`} />
      <Stack items={CLAIMS} x={2.6} tone="flame" heading={`Liabilities + Equity · ${totalClaims.toFixed(1)}`} />
      <Label position={[0, 3.2, 0]} tone="gold">
        Assets = Liabilities + Equity
      </Label>
      <Label position={[0, -0.7, 0]} size="xs">
        both sides always match
      </Label>
    </group>
  )
}
