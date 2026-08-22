import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'

// Risk on X, expected return on Y, liquidity on Z. Rough long-run Indian numbers,
// meant for shape and relative position, not for planning a portfolio.
const ASSETS = [
  { name: 'Savings account', risk: 0.4, ret: 0.6, liquid: 2.6, lift: 0, color: '#5ee0ff', note: '~3% · instant access' },
  { name: 'Fixed deposit', risk: 1.2, ret: 1.6, liquid: 1.4, lift: 0, color: '#33e29b', note: '~7% · locked, taxed at slab' },
  { name: 'Debt fund', risk: 2.0, ret: 2.1, liquid: 2.0, lift: 0.55, color: '#38bdf8', note: '~7% · rate sensitive' },
  { name: 'Gold / SGB', risk: 3.0, ret: 2.7, liquid: 1.0, lift: 0, color: '#ffcf5c', note: 'Inflation hedge, no cash flow' },
  { name: 'REIT / InvIT', risk: 3.6, ret: 3.0, liquid: 0.6, lift: 0.55, color: '#a78bfa', note: 'Rent or toll income' },
  { name: 'Index fund', risk: 4.4, ret: 4.0, liquid: 2.2, lift: 0, color: '#eaa81e', note: 'Whole market, low cost' },
  { name: 'Large cap stock', risk: 5.2, ret: 4.3, liquid: 2.4, lift: 0.55, color: '#f59e0b', note: 'Single company risk' },
  { name: 'Small cap', risk: 6.2, ret: 5.0, liquid: 0.7, lift: 0, color: '#f97316', note: 'Brutal drawdowns' },
  { name: 'F&O trading', risk: 7.2, ret: 0.9, liquid: 2.4, lift: 0, color: '#ff5d5d', note: 'Most retail traders lose' },
]


function Node({ asset, hovered, setHovered }) {
  const mesh = useRef()
  const active = hovered === asset.name

  useFrame((state, delta) => {
    if (!mesh.current) return
    const target = active ? 1.5 : 1
    mesh.current.scale.setScalar(mesh.current.scale.x + (target - mesh.current.scale.x) * delta * 8)
    mesh.current.position.y = asset.ret + Math.sin(state.clock.elapsedTime * 1.1 + asset.risk) * 0.05
  })

  return (
    <group>
      {/* stem down to the risk floor makes the height readable */}
      <mesh position={[asset.risk, asset.ret / 2, asset.liquid]}>
        <cylinderGeometry args={[0.02, 0.02, asset.ret, 6]} />
        <meshBasicMaterial color={asset.color} transparent opacity={0.35} />
      </mesh>
      <mesh
        ref={mesh}
        position={[asset.risk, asset.ret, asset.liquid]}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(asset.name)
        }}
        onPointerOut={() => setHovered(null)}
      >
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color={asset.color} emissive={asset.color} emissiveIntensity={active ? 0.8 : 0.35} metalness={0.4} roughness={0.25} />
      </mesh>
      <Label position={[asset.risk, asset.ret + 0.45 + asset.lift, asset.liquid]} size="xs" tone={active ? 'gold' : 'default'}>
        {asset.name}
      </Label>
      {active && (
        <Label position={[asset.risk, asset.ret + 1.05 + asset.lift, asset.liquid]} size="xs" tone="mint">
          {asset.note}
        </Label>
      )}
    </group>
  )
}

export default function Scatter3D() {
  const [hovered, setHovered] = useState(null)

  return (
    <group position={[-3.8, -2.4, -1.4]}>
      <gridHelper args={[18, 18, '#1c2a48', '#121c33']} position={[3.8, 0, 1.4]} />

      {/* axes */}
      <mesh position={[4.3, 0, 0]}>
        <boxGeometry args={[8.6, 0.03, 0.03]} />
        <meshBasicMaterial color="#ff5d5d" />
      </mesh>
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[0.03, 6, 0.03]} />
        <meshBasicMaterial color="#33e29b" />
      </mesh>
      <mesh position={[0, 0, 1.6]}>
        <boxGeometry args={[0.03, 0.03, 3.2]} />
        <meshBasicMaterial color="#8b5cf6" />
      </mesh>

      <Label position={[9, 0, 0]} size="xs" tone="flame">
        risk →
      </Label>
      <Label position={[0, 6.4, 0]} size="xs" tone="mint">
        expected return ↑
      </Label>
      <Label position={[0, 0, 3.5]} size="xs">
        liquidity
      </Label>

      {ASSETS.map((asset) => (
        <Node key={asset.name} asset={asset} hovered={hovered} setHovered={setHovered} />
      ))}

      <Label position={[4, 7.2, 1.4]} tone="gold">
        higher return always costs higher risk
      </Label>
    </group>
  )
}
