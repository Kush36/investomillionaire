import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import Label from './Label.jsx'

const PRESETS = {
  marketcap: {
    caption: 'Market cap = price x shares outstanding',
    unit: 'Rs lakh crore',
    bars: [
      { name: 'Mega cap', value: 20, color: '#eaa81e', note: 'Top 10 by size' },
      { name: 'Large cap', value: 13, color: '#ffcf5c', note: 'Rank 1-100' },
      { name: 'Mid cap', value: 6.5, color: '#8b5cf6', note: 'Rank 101-250' },
      { name: 'Small cap', value: 2.5, color: '#33e29b', note: 'Rank 251+' },
      { name: 'Micro cap', value: 0.8, color: '#4b6ba8', note: 'Thin liquidity' },
    ],
  },
  valuation: {
    caption: 'Same profit, very different price tags',
    unit: 'PE ratio',
    bars: [
      { name: 'FMCG', value: 55, color: '#eaa81e', note: 'Pays up for stability' },
      { name: 'IT services', value: 28, color: '#ffcf5c', note: 'Steady growth' },
      { name: 'Private bank', value: 18, color: '#8b5cf6', note: 'Cyclical earnings' },
      { name: 'Auto', value: 22, color: '#33e29b', note: 'Cycle sensitive' },
      { name: 'Metals', value: 8, color: '#ff5d5d', note: 'Cheap at the peak' },
    ],
  },
  risk: {
    caption: 'What you need to gain back after a loss',
    unit: '% gain to recover',
    bars: [
      { name: '-10%', value: 11, color: '#33e29b', note: 'Recoverable' },
      { name: '-20%', value: 25, color: '#ffcf5c', note: 'Annoying' },
      { name: '-33%', value: 50, color: '#eaa81e', note: 'Painful' },
      { name: '-50%', value: 100, color: '#ff8b3d', note: 'Must double' },
      { name: '-80%', value: 400, color: '#ff5d5d', note: 'Almost fatal' },
    ],
  },
}

function Tower({ bar, x, maxValue, hovered, setHovered }) {
  const mesh = useRef()
  const height = (bar.value / maxValue) * 5 + 0.2
  const active = hovered === bar.name

  useFrame((state, delta) => {
    if (!mesh.current) return
    const target = active ? 1.12 : 1
    mesh.current.scale.x += (target - mesh.current.scale.x) * delta * 8
    mesh.current.scale.z = mesh.current.scale.x
    mesh.current.position.y = height / 2 + Math.sin(state.clock.elapsedTime * 1.2 + x) * 0.04
  })

  return (
    <group position={[x, 0, 0]}>
      <mesh
        ref={mesh}
        position={[0, height / 2, 0]}
        castShadow
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(bar.name)
        }}
        onPointerOut={() => setHovered(null)}
      >
        <boxGeometry args={[0.9, height, 0.9]} />
        <meshStandardMaterial
          color={bar.color}
          emissive={bar.color}
          emissiveIntensity={active ? 0.6 : 0.22}
          metalness={0.45}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 32]} />
        <meshBasicMaterial color={bar.color} transparent opacity={0.18} />
      </mesh>
      <Label position={[0, height + 0.45, 0]} tone={active ? 'gold' : 'default'}>
        {bar.value}
      </Label>
      <Label position={[0, -0.55, 0]} size="xs">
        {bar.name}
      </Label>
      {active && (
        <Label position={[0, height + 1.1, 0]} tone="mint" size="xs">
          {bar.note}
        </Label>
      )}
    </group>
  )
}

// `bars` lets a caller pass live data (IPO subscription, say) instead of one of
// the built-in teaching presets.
export default function Towers3D({ preset = 'marketcap', bars, caption, unit }) {
  const config = bars?.length ? { bars, caption: caption ?? '', unit: unit ?? '' } : PRESETS[preset] ?? PRESETS.marketcap
  const [hovered, setHovered] = useState(null)
  const maxValue = useMemo(() => Math.max(...config.bars.map((b) => b.value)), [config])
  const spacing = 1.5
  const startX = (-(config.bars.length - 1) * spacing) / 2

  return (
    <group position={[0, -1.6, 0]}>
      <gridHelper args={[14, 14, '#1c2a48', '#121c33']} />
      {config.bars.map((bar, i) => (
        <Tower
          key={bar.name}
          bar={bar}
          x={startX + i * spacing}
          maxValue={maxValue}
          hovered={hovered}
          setHovered={setHovered}
        />
      ))}
      <Label position={[0, 6.8, 0]} tone="gold">
        {config.caption}
      </Label>
      <Label position={[0, -1.2, 0]} size="xs">
        {config.unit}
      </Label>
    </group>
  )
}
