import { lazy, Suspense } from 'react'
import { useNearViewport } from './LessonScene.jsx'

const Impl = lazy(() => import('./HeroCanvasImpl.jsx'))

// The hero sits above the fold, so this one is gated on proximity rather than
// genuinely waiting: it starts loading almost immediately, but it loads after the
// text and the call to action rather than in front of them.
export default function HeroCanvas({ height = 520 }) {
  const [ref, near] = useNearViewport('0px')

  return (
    <div ref={ref}>
      {near ? (
        <Suspense fallback={<div style={{ height }} aria-hidden="true" />}>
          <Impl height={height} />
        </Suspense>
      ) : (
        <div style={{ height }} aria-hidden="true" />
      )}
    </div>
  )
}
