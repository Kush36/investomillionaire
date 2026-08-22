import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

function Loader() {
  return (
    <mesh>
      <torusGeometry args={[0.6, 0.12, 12, 40]} />
      <meshBasicMaterial color="#eaa81e" wireframe />
    </mesh>
  )
}

/**
 * Every 3D diagram on the site mounts through here so the WebGL check,
 * lighting rig and orbit limits stay in exactly one place.
 */
export default function Scene({ children, height = 420, camera = [0, 2.5, 9], fallback = null, controls = true }) {
  const supported = useMemo(webglAvailable, [])

  if (!supported) {
    return (
      <div
        className="glass flex items-center justify-center rounded-3xl p-8 text-center text-sm text-white/60"
        style={{ height }}
      >
        {fallback || 'Your browser cannot render the 3D view. The lesson text below covers the same ground.'}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#070d1c]" style={{ height }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: camera, fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#070d1c']} />
        <fog attach="fog" args={['#070d1c', 14, 34]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 10, 6]} intensity={1.5} castShadow />
        <directionalLight position={[-8, 4, -6]} intensity={0.5} color="#8b5cf6" />
        <pointLight position={[0, 6, 4]} intensity={40} color="#eaa81e" distance={25} />
        <Suspense fallback={<Loader />}>{children}</Suspense>
        {controls && (
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={5}
            maxDistance={18}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.05}
            autoRotate
            autoRotateSpeed={0.4}
          />
        )}
      </Canvas>
      <div className="pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] tracking-widest text-white/30 uppercase">
        drag to rotate · scroll to zoom
      </div>
    </div>
  )
}
