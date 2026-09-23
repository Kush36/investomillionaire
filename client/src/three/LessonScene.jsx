import { lazy, Suspense, useEffect, useRef, useState } from 'react'

// three.js, the fiber reconciler and drei are a third of everything this site ships,
// and six of its thirteen routes never draw a diagram at all. Keeping the import
// behind a dynamic boundary takes that weight off those routes completely, and off
// the first paint of the routes that do use it, since a diagram is rarely the thing
// the reader is looking at when the page opens.
const Impl = lazy(() => import('./LessonSceneImpl.jsx'))

/**
 * Resolves true once the element is within `margin` of the viewport, then stops
 * watching. Loading starts before the diagram is on screen, so by the time it is
 * scrolled to it has usually already arrived.
 */
export function useNearViewport(margin = '500px') {
  const ref = useRef(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    if (near) return
    const el = ref.current
    if (!el) return
    // Old browsers and jsdom get the diagram immediately rather than never.
    if (typeof IntersectionObserver !== 'function') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setNear(true)
        observer.disconnect()
      },
      { rootMargin: margin }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [near, margin])

  return [ref, near]
}

// Holds the exact height the canvas will take, so arrival shifts nothing.
function Reserved({ height }) {
  return (
    <div className="well" style={{ height }} aria-hidden="true" />
  )
}

export default function LessonScene({ scene, height = 460 }) {
  const [ref, near] = useNearViewport()

  return (
    <div ref={ref}>
      {near ? (
        <Suspense fallback={<Reserved height={height} />}>
          <Impl scene={scene} height={height} />
        </Suspense>
      ) : (
        <Reserved height={height} />
      )}
    </div>
  )
}
