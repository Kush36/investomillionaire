import Scene from './Scene.jsx'
import HeroScene3D from './HeroScene3D.jsx'

// Split out so the homepage can reach the hero through a dynamic import without
// naming Scene or HeroScene3D, either of which would drag three.js back into the
// eager graph and undo the split.
//
// motion: this is the one continuously rendered scene on the site, because it is
// the first thing a visitor sees and a frozen hero reads as a broken image. Every
// other canvas stays demand-driven. Scene parks this one at frameloop="never" the
// moment it leaves the viewport, so it costs nothing once the reader scrolls past.
export default function HeroCanvasImpl({ height = 520 }) {
  return (
    <Scene height={height} camera={[0, 1, 12]} controls={false} frameloop="always">
      <HeroScene3D />
    </Scene>
  )
}
