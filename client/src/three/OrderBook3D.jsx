import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'

const BIDS = [
  { price: 249.9, qty: 1.8 },
  { price: 249.8, qty: 2.6 },
  { price: 249.7, qty: 1.2 },
  { price: 249.6, qty: 3.1 },
  { price: 249.5, qty: 2.2 },
]

const ASKS = [
  { price: 250.1, qty: 1.4 },
  { price: 250.2, qty: 2.9 },
  { price: 250.3, qty: 1.7 },
  { price: 250.4, qty: 2.4 },
  { price: 250.5, qty: 3.3 },
]

function Level({ entry, z, side, index }) {
  const mesh = useRef()
  const [hovered, setHovered] = useState(false)
  const color = side === 'bid' ? '#33e29b' : '#ff5d5d'
  const x = side === 'bid' ? -entry.qty / 2 - 0.35 : entry.qty / 2 + 0.35

  useFrame((state) => {
    if (mesh.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2 + index) * 0.05
      mesh.current.scale.x = pulse
    }
  })

  return (
    <group position={[0, 0, z]}>
      <mesh
        ref={mesh}
        position={[x, 0.2, 0]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[entry.qty, 0.4, 0.55]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.7 : 0.25}
          transparent
          opacity={0.9}
        />
      </mesh>
      <Label position={[x, 0.75, 0]} size="xs" tone={side === 'bid' ? 'mint' : 'flame'}>
        {`${entry.price} × ${(entry.qty * 400).toFixed(0)}`}
      </Label>
    </group>
  )
}

export default function OrderBook3D() {
  return (
    <group position={[0, -0.6, 0]} rotation={[0, -0.25, 0]}>
      <gridHelper args={[14, 14, '#1c2a48', '#121c33']} position={[0, -0.1, 0]} />

      {BIDS.map((entry, i) => (
        <Level key={entry.price} entry={entry} z={-i * 0.85 - 0.6} side="bid" index={i} />
      ))}
      {ASKS.map((entry, i) => (
        <Level key={entry.price} entry={entry} z={-i * 0.85 - 0.6} side="ask" index={i + 5} />
      ))}

      {/* the spread: the real, quiet cost of every round trip */}
      <mesh position={[0, 0.2, -2.4]}>
        <boxGeometry args={[0.5, 2.4, 5]} />
        <meshBasicMaterial color="#eaa81e" transparent opacity={0.12} depthWrite={false} />
      </mesh>

      <Label position={[0, 2.1, -2.4]} tone="gold">
        spread 249.90 / 250.10
      </Label>
      <Label position={[-3.4, 1.6, 0]} tone="mint">
        BIDS · buyers
      </Label>
      <Label position={[3.4, 1.6, 0]} tone="flame">
        ASKS · sellers
      </Label>
      <Label position={[0, -0.9, 1.2]} size="xs">
        depth grows as you move away from the touch
      </Label>
    </group>
  )
}
