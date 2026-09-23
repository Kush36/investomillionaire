import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { token } from './Scene.jsx'

function Ticker({ index, total }) {
  const mesh = useRef()
  const angle = (index / total) * Math.PI * 2
  const radius = 5.4
  const bull = index % 3 !== 0

  useFrame((state) => {
    if (!mesh.current) return
    // motion: the hero renders continuously by design (see HeroCanvasImpl); this drift
    // is what makes the field read as a live market rather than a still render.
    const t = state.clock.elapsedTime
    mesh.current.position.y = Math.sin(t * 0.8 + index) * 0.9 + (bull ? 0.6 : -0.4)
    mesh.current.rotation.y = t * 0.25 + angle
  })

  return (
    <mesh ref={mesh} position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}>
      <boxGeometry args={[0.4, 1.4 + (index % 4) * 0.35, 0.4]} />
      <meshStandardMaterial color={bull ? token('gain') : token('loss')} metalness={0.4} roughness={0.3} />
    </mesh>
  )
}

function ArrowCore() {
  const group = useRef()
  useFrame((state) => {
    if (group.current) {
      // motion: the mark turns so its faces catch the key light from changing angles,
      // which is the only cue that tells a viewer the object has depth at all.
      group.current.rotation.y = state.clock.elapsedTime * 0.35
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.15
    }
  })

  // A rising arrow, echoing the mark in the logo.
  return (
    <group ref={group}>
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, 0]}>
        <boxGeometry args={[0.55, 4.4, 0.55]} />
        <meshStandardMaterial color={token('accent')} metalness={0.8} roughness={0.15} />
      </mesh>
      <mesh position={[1.55, 1.55, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <coneGeometry args={[0.75, 1.5, 4]} />
        <meshStandardMaterial color={token('accent')} metalness={0.8} roughness={0.15} />
      </mesh>
    </group>
  )
}

export default function HeroScene3D() {
  return (
    <group>
      <ArrowCore />
      {Array.from({ length: 14 }).map((_, i) => (
        <Ticker key={i} index={i} total={14} />
      ))}
    </group>
  )
}
