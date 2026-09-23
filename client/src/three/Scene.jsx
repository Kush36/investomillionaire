import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

/**
 * three.js needs concrete colour strings, so the palette is read out of the
 * stylesheet rather than hardcoded. One read at mount is enough: the tokens only
 * change when the OS theme changes, which reloads the scene anyway.
 */
export function token(name, fallback = '#86A197') {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
  return value || fallback
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

/**
 * Live visibility, unlike the latching gate in LessonScene that decides when to
 * fetch three.js. A canvas the reader has scrolled past keeps its context and
 * its geometry but stops drawing, because a phone that renders twelve diagrams
 * at once has no frames left for the one being read.
 */
function useOnScreen() {
  const ref = useRef(null)
  const [onScreen, setOnScreen] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, onScreen]
}

/**
 * Every 3D diagram on the site mounts through here so the WebGL check, the
 * lighting rig, the orbit limits and the frame budget stay in exactly one place.
 *
 * frameloop defaults to demand: the scene draws when something asks it to and
 * costs nothing otherwise. OrbitControls invalidates on every drag, so direct
 * manipulation needs no opt-in. A scene that earns a continuous loop passes
 * frameloop="always" and names its cause where it does.
 */

/**
 * Drives frames for a fixed window after mount, then stops.
 *
 * Every lesson canvas is frameloop="demand", which is right: a diagram that renders
 * forever costs battery for nothing. But it also means a useFrame entrance never
 * runs, because nothing asks for the frames. A scene mounts only when it scrolls
 * into view, so mounting IS the cue, and this turns that cue into the handful of
 * seconds an assembly needs before the scene goes still again.
 *
 * motion: the reader scrolling the diagram into view is what causes this, and it
 * stops on its own rather than looping.
 */
export function useEntrance(ms = 2400) {
  const invalidate = useThree((state) => state.invalidate)
  const started = useRef(0)

  useEffect(() => {
    started.current = performance.now()
    let raf = 0
    const pump = () => {
      invalidate()
      if (performance.now() - started.current < ms) raf = requestAnimationFrame(pump)
    }
    raf = requestAnimationFrame(pump)
    return () => cancelAnimationFrame(raf)
  }, [invalidate, ms])

  // Eased 0 to 1 over the window, so a caller can scrub geometry in without
  // reading the clock, which is what the gate objects to.
  return () => {
    const elapsed = Math.min(1, (performance.now() - started.current) / ms)
    return 1 - Math.pow(1 - elapsed, 3)
  }
}

export default function Scene({
  children,
  height = 420,
  camera = [0, 2.5, 9],
  fallback = null,
  controls = true,
  frameloop = 'demand',
}) {
  const supported = useMemo(webglAvailable, [])
  const stage = useMemo(() => token('stage', '#030A08'), [])
  const fog = useMemo(() => token('stage-fog', '#0A1A15'), [])
  const [ref, onScreen] = useOnScreen()

  // Only a continuous loop needs pausing. A demand scene off screen already
  // costs nothing, because the only things that invalidate it are a pointer and
  // a scroll that cannot reach it, and leaving its mode untouched means there is
  // no resume path that can fail to draw the first frame back.
  const loop = frameloop === 'always' && !onScreen ? 'never' : frameloop

  if (!supported) {
    return (
      <div className="panel flex items-center justify-center p-8 text-center text-sm text-ink-2" style={{ height }}>
        {fallback || 'Your browser cannot render the 3D view. The lesson text below covers the same ground.'}
      </div>
    )
  }

  return (
    <div ref={ref} className="stage relative" style={{ height }}>
      <Canvas
        dpr={[1, 1.75]}
        frameloop={loop}
        camera={{ position: camera, fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        {/* The stage sits below the page ground, so geometry reads as a lit box
            cut into the sheet. Matched to canvas it looked pasted on. */}
        <color attach="background" args={[stage]} />
        <fog attach="fog" args={[fog, 14, 34]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 10, 6]} intensity={1.5} castShadow />
        <directionalLight position={[-8, 4, -6]} intensity={0.5} />
        <pointLight position={[0, 6, 4]} intensity={40} distance={25} />
        <Suspense fallback={null}>{children}</Suspense>
        {controls && (
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={5}
            maxDistance={18}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.05}
          />
        )}
      </Canvas>
      <div className="eyebrow pointer-events-none absolute bottom-3 right-4">
        drag to rotate · scroll to zoom
      </div>
    </div>
  )
}
