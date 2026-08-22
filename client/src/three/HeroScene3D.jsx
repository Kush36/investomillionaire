import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function Ticker({ index, total }) {
  const mesh = useRef()
  const angle = (index / total) * Math.PI * 2
  const radius = 5.4
  const bull = index % 3 !== 0

  useFrame((state) => {
    if (!mesh.current) return
    const t = state.clock.elapsedTime
    mesh.current.position.y = Math.sin(t * 0.8 + index) * 0.9 + (bull ? 0.6 : -0.4)
    mesh.current.rotation.y = t * 0.25 + angle
  })

  return (
    <mesh ref={mesh} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
      <boxGeometry args={[0.4, 1.4 + (index % 4) * 0.35, 0.4]} />
      <meshStandardMaterial
        color={bull ? '#33e29b' : '#ff5d5d'}
        emissive={bull ? '#33e29b' : '#ff5d5d'}
        emissiveIntensity={0.35}
        metalness={0.4}
        roughness={0.3}
      />
    </mesh>
  )
}

function ArrowCore() {
  const group = useRef()
  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = state.clock.elapsedTime * 0.35
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.15
    }
  })

  // A rising arrow, echoing the mark in the logo.
  return (
    <group ref={group}>
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, 0]}>
        <boxGeometry args={[0.55, 4.4, 0.55]} />
        <meshStandardMaterial color="#eaa81e" emissive="#eaa81e" emissiveIntensity={0.6} metalness={0.8} roughness={0.15} />
      </mesh>
      <mesh position={[1.55, 1.55, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <coneGeometry args={[0.75, 1.5, 4]} />
        <meshStandardMaterial color="#ffcf5c" emissive="#eaa81e" emissiveIntensity={0.7} metalness={0.8} roughness={0.15} />
      </mesh>
    </group>
  )
}

function Dust() {
  const points = useRef()
  const positions = useMemo(() => {
    const arr = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 24
      arr[i * 3 + 1] = (Math.random() - 0.5) * 14
      arr[i * 3 + 2] = (Math.random() - 0.5) * 24
    }
    return arr
  }, [])

  useFrame((state) => {
    if (points.current) points.current.rotation.y = state.clock.elapsedTime * 0.04
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#eaa81e" transparent opacity={0.55} sizeAttenuation blending={THREE.AdditiveBlending} />
    </points>
  )
}

export default function HeroScene3D() {
  return (
    <group>
      <Dust />
      <ArrowCore />
      {Array.from({ length: 14 }).map((_, i) => (
        <Ticker key={i} index={i} total={14} />
      ))}
    </group>
  )
}
