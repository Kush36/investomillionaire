// Run with: npm run check:motion
//
// ============================================================
// THE MOTION DOCTRINE
//
// The old rule said motion must be caused by a finger this instant, and it
// enforced that by banning the word "infinite". It was aimed at the right
// target and it hit the wrong one. Apple product pages are heavy 3D. The
// Awwwards shelf is drenched in motion. Neither reads cheap. What reads cheap
// is motion nobody asked for: a thing that loops forever with nothing causing
// it, a gradient crawling across a headline, a glow breathing under a card.
//
// So the rule is not "no animation". It is "no uncaused, uncrafted animation".
//
// PERMITTED, because something causes it
//   A press, a drag, a hover, a focus, a route change, data arriving.
//   Scroll position, read as a value and mapped to transform or opacity.
//   A spring or a fling coming to rest after the finger has left.
//   Entrance on first reveal, once, when the reader scrolls the element in.
//
// BANNED, because nothing does
//   A gradient sweeping across text, whether the movement comes from a
//     keyframe or from animating background-position. The loudest tell there is.
//   A glow that pulses, breathes, or throbs, in box-shadow, text-shadow or
//     drop-shadow alike. Elevation is a sheen plus an occlusion shadow
//     (--shadow-lift). A palette colour behind a card is never elevation.
//   Idle wobble. A card that bobs, a bar that sways, an icon that drifts.
//   Auto-rotation of a 3D scene. It is also the hardest motion to read.
//   Glassmorphism. Use panel, well and stage.
//   linear easing, and animation of any property that triggers layout.
//   Stock loops parked on decoration: animate-spin, -bounce, -ping. A spinner
//     over a request in flight is caused, and names its cause like anything else.
//
// DURATION AND EASING
//   Never a raw millisecond number. Use --dur-tap for a press, --dur-enter
//   and --dur-exit for a transient, --dur-page for a route, --dur-reveal for
//   a scroll entrance, --dur-settle for mass coming to rest, --dur-data for a
//   number counting. Ease with --ease-standard, --ease-enter, --ease-exit,
//   --ease-data, --ease-inertia on release, --ease-material when a thing
//   needs one small overshoot to have weight.
//
// SCROLL MOTION RUNS ON THE COMPOSITOR
//   transform and opacity only. Prefer CSS animation-timeline: view(), which
//   the browser runs off the main thread. Framer's useScroll is the fallback,
//   and it drives a MotionValue straight into a transform, never React state.
//   Nothing that animates width, height, top, left, margin or padding ships.
//
// HOW A 3D SCENE IS ALLOWED TO IDLE
//   Barely, and never for free. Every Canvas declares frameloop and a capped
//   dpr. Demand rendering is the default: the scene draws when a pointer, a
//   drag, a scroll or an arriving value calls invalidate(), and otherwise
//   costs nothing. A crafted ambient (a specular band travelling across
//   metal, a scale settling) is allowed only while the canvas is on screen
//   and only with a comment naming what causes it:
//
//     // motion: pointer parallax drives the camera, invalidate() per move
//
//   That marker is the crafted opt-in. It waives the loop and free-clock
//   checks below. It requires a real cause in real words; "motion: ok" fails.
//   A scene off screen renders nothing. Scene.jsx takes frameloop="always" for
//   the rare scene that earns a continuous loop and parks it at "never" the
//   moment the reader scrolls past, so the opt-in costs nothing off screen.
//   Scene.jsx also owns the clear colour and the fog: --color-stage and
//   --color-stage-fog, which sit below the page ground so lit geometry reads
//   as a box cut into the sheet rather than pasted onto it.
//
// FRAME BUDGET
//   Sixty frames on a Helio G99 or it does not ship. dpr caps at 1.75. One
//   canvas drawing at a time. Geometry counts in the hundreds, not thousands.
//
// COLOUR
//   No hex in a component. Every colour resolves to a token in index.css, and
//   three.js reads the same tokens through token() in Scene.jsx, so a material
//   and a caption cannot drift apart. A value a finger is moving right now is
//   --color-live, which is hotter than --color-accent on purpose.
//
// Taste does not survive the sixth lesson, so this is a grep rather than a
// guideline, and it fails the build. `--selftest` proves the grep still tells
// the two apart before anyone trusts a green run.
// ============================================================
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname
const EXTENSIONS = new Set(['.js', '.jsx', '.css'])

// A cause named in real words. Twelve characters is enough to stop "motion: ok"
// and short enough that nobody pads a sentence to get past it.
const MARKER = /\bmotion:\s*\S.{11,}/

// No waiver. These are the tells, and a tell with an escape hatch is a tell.
const TELLS = [
  { re: /backdrop-(filter|blur)/, why: 'glassmorphism. panel, well and stage replace it' },
  { re: /animate-pulse\b/, why: 'a pulsing glow, the loudest uncaused motion there is' },
  { re: /\bautoRotate\b/, why: 'auto-rotation: uncaused, and the hardest motion to read' },
  {
    re: /(animation|transition)-timing-function:\s*linear|(ease|easing):\s*['"]linear['"]/,
    why: 'linear easing, which nothing physical does',
  },
  {
    re: /(box-shadow|text-shadow|drop-shadow)[:(][^;]*var\(--color-(accent|gain|loss|live|brass|metal)/,
    why: 'a coloured shadow, which is a glow with a polite name. Elevation is --shadow-lift: a sheen plus occlusion',
  },
  {
    re: /transition:\s*all\b|transition(-property)?:[^;]*\b(width|height|top|left|right|bottom|margin|padding)\b/,
    why: 'animating a layout property, which leaves the compositor and drops frames',
  },
]

// Waived by the marker. Each is legitimate when something causes it.
const NEEDS_CAUSE = [
  {
    re: /\binfinite\b|repeat:\s*(Infinity|-1)|iterationCount:\s*['"]?infinite/,
    why: 'a loop',
  },
  {
    re: /clock\.(elapsedTime|getElapsedTime)/,
    why: 'a free-running clock, which animates whether or not anyone is looking',
  },
  {
    // A spinner while a fetch is in flight is caused; the same class parked on
    // a decorative icon is the cheapest loop in the framework.
    re: /animate-(spin|bounce|ping)\b/,
    why: 'a stock Tailwind loop',
  },
]

// The cause written as code rather than as prose: a loop rendered only while a
// request is in flight is already answering something.
const SELF_EVIDENT = /\b(busy|loading|pending|saving|submitting|isFetching|inFlight)\b/

// A gate nobody trusts gets commented out during the next release crunch, and
// the way a grep loses trust is by firing on honest work. Run with --selftest.
if (process.argv.includes('--selftest')) {
  const SELF_EVIDENT_CASE = [{ re: SELF_EVIDENT }]
  const hits = (list, line) => list.some(({ re }) => re.test(line))
  const cases = [
    // Tells, all of which must fire.
    ['backdrop-filter: blur(12px);', TELLS, true],
    ['<div className="animate-pulse rounded-lg" />', TELLS, true],
    ['<OrbitControls autoRotate enablePan={false} />', TELLS, true],
    ['  animation-timing-function: linear;', TELLS, true],
    ['  box-shadow: 0 0 40px var(--color-accent);', TELLS, true],
    ['  filter: drop-shadow(0 0 12px var(--color-gain));', TELLS, true],
    ['  transition: all var(--dur-enter);', TELLS, true],
    ['  transition-property: height, opacity;', TELLS, true],
    // Crafted work, none of which may fire.
    ['  box-shadow: var(--shadow-lift);', TELLS, false],
    ['  transition: transform var(--dur-enter) var(--ease-enter);', TELLS, false],
    ['<OrbitControls enablePan={false} enableZoom />', TELLS, false],
    ['  background: var(--gradient-metal);', TELLS, false],
    ['  transform: translateY(var(--reveal-offset));', TELLS, false],
    // Legitimate with a cause, so they land in NEEDS_CAUSE rather than TELLS.
    ['  transition={{ repeat: Infinity }}', NEEDS_CAUSE, true],
    ['    const t = state.clock.elapsedTime', NEEDS_CAUSE, true],
    ['<Loader className="animate-spin" />', NEEDS_CAUSE, true],
    ['  {busy && <Loader2 className="animate-spin" />}', SELF_EVIDENT_CASE, true],
    ['<Sparkle className="animate-spin" />', SELF_EVIDENT_CASE, false],
    ['  const t = state.clock.elapsedTime', TELLS, false],
  ]
  const failures = cases.filter(([line, list, want]) => hits(list, line) !== want)
  // The marker has to cost a sentence, or every loop gets waived by "motion: ok".
  if (MARKER.test('// motion: ok')) failures.push(['the marker accepts "motion: ok"'])
  if (!MARKER.test('// motion: the drag position drives this, invalidate per move')) {
    failures.push(['the marker rejects a real cause'])
  }
  if (failures.length) {
    console.error('Self-test failed:\n' + failures.map(([line]) => `  ${line}`).join('\n'))
    process.exit(1)
  }
  console.log(`Self-test passed: ${cases.length + 2} rules behave.`)
  process.exit(0)
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (EXTENSIONS.has(extname(entry.name))) yield full
  }
}

const at = (rel, i, line, why) => `${rel}:${i + 1}  ${why}\n    ${line.trim().slice(0, 100)}`

const tells = []
const uncaused = []
const budget = []

for await (const file of walk(ROOT)) {
  const rel = file.replace(ROOT, 'src/')
  const source = await readFile(file, 'utf8')
  const lines = source.split('\n')

  // A gradient crawling across a headline needs two halves to exist. Static gold
  // on text is the metal utility and is fine, so both halves must be present.
  // The moving half is a keyframe touching background, or anything animating
  // background-position, which is how the effect is written without a keyframe.
  const clipsToText = /background-clip:\s*text|bg-clip-text/.test(source)
  const movesBackground = /@keyframes[^}]*background/s.test(source) || /background-position/.test(source)
  if (clipsToText && movesBackground) {
    tells.push(`${rel}  an animated gradient on text, the single loudest pump-site tell`)
  }

  let keyframeDepth = 0
  lines.forEach((line, i) => {
    if (/@keyframes/.test(line)) keyframeDepth = 1
    else if (keyframeDepth > 0) {
      keyframeDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length
      if (keyframeDepth < 1) keyframeDepth = 0
    }

    if (keyframeDepth > 0 && /(box-shadow|text-shadow|drop-shadow|filter:)/.test(line)) {
      tells.push(at(rel, i, line, 'a glow animated in a keyframe'))
    }
    if (keyframeDepth > 0 && /\b(width|height|top|left|right|bottom|margin|padding):/.test(line)) {
      tells.push(at(rel, i, line, 'a layout property animated in a keyframe'))
    }

    for (const { re, why } of TELLS) if (re.test(line)) tells.push(at(rel, i, line, why))

    for (const { re, why } of NEEDS_CAUSE) {
      if (!re.test(line)) continue
      // A spinner gated on request state carries its cause in the code. Making
      // someone write a comment that restates `busy &&` is how a gate gets deleted.
      if (SELF_EVIDENT.test(line)) continue
      const near = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
      if (!MARKER.test(near)) uncaused.push(at(rel, i, line, `${why} with no cause named`))
    }
  })

  // Every canvas states its frame budget at the point it is created, because a
  // budget kept somewhere else is a budget nobody reads.
  let idx = source.indexOf('<Canvas')
  while (idx !== -1) {
    const tag = source.slice(idx, idx + 600)
    const line = source.slice(0, idx).split('\n').length
    if (!/frameloop/.test(tag)) budget.push(`${rel}:${line}  a Canvas with no frameloop. Demand rendering is the default`)
    if (!/\bdpr\b/.test(tag)) budget.push(`${rel}:${line}  a Canvas with no dpr cap. A Helio G99 cannot pay for a 3x buffer`)
    idx = source.indexOf('<Canvas', idx + 1)
  }
}

// A hex in a component is a colour that cannot follow the theme, cannot be
// audited for contrast, and will be the one thing still cream after the next
// repaint. Scene.jsx is the single exception: it bridges CSS variables into
// three.js and needs literals for the case where there is no document.
const HEX_ALLOWED = new Set(['src/index.css', 'src/three/Scene.jsx'])
const hex = []
for await (const file of walk(ROOT)) {
  const rel = file.replace(ROOT, 'src/')
  if (HEX_ALLOWED.has(rel)) continue
  const lines = (await readFile(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    // Six and eight digits, plus Tailwind's arbitrary form. A bare three-digit
    // match would fire on href="#faq", and a gate that cries wolf gets deleted.
    if (/#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|\[#[0-9a-fA-F]{3,8}\]/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) {
      hex.push(at(rel, i, line, 'a hardcoded colour'))
    }
  })
}

// Gold works by appearing almost never, which is a policy, and a policy with
// nothing enforcing it dies one reasonable pull request at a time. It survives
// as the wordmark, a static seal, and one material the 3D scenes share.
const GOLD_ALLOWED = new Set(['src/index.css', 'src/components/Logo.jsx', 'src/components/Chip.jsx', 'src/three/Metal.jsx'])
const GOLD = /\bbrass\b|color-metal|gradient-metal|(class|className)=(["'`])[^"'`]*\bmetal\b/
const gold = []
for await (const file of walk(ROOT)) {
  const rel = file.replace(ROOT, 'src/')
  if (GOLD_ALLOWED.has(rel)) continue
  if (GOLD.test(await readFile(file, 'utf8'))) gold.push(rel)
}

const report = (list, heading, advice) => {
  if (!list.length) return false
  console.error(`\n${heading}\n`)
  console.error(list.join('\n\n'))
  console.error(`\n${advice}\n`)
  return true
}

// Everything reports before anything exits. Checking one contract and bailing
// meant a change that broke three only ever showed you the first.
const broken = [
  report(tells, `Cheap tells, ${tells.length}:`, 'None of these have a waiver. Read the doctrine at the top of this file.'),
  report(
    uncaused,
    `Motion with nothing causing it, ${uncaused.length}:`,
    'Give it a cause and say so: // motion: <what drives this, and what invalidates>. Or delete it.'
  ),
  report(budget, `Frame budget unstated, ${budget.length}:`, 'Every Canvas declares frameloop and dpr where it is created.'),
  report(hex, `Colours outside the token set, ${hex.length}:`, 'Add it to @theme in src/index.css with its measured contrast, then use the token.'),
  report(gold, `Gold outside its three places:\n${gold.map((f) => `  ${f}`).join('\n')}`, 'brass and the metal ramp belong to the wordmark, a seal and one shared material. Anything else wanting emphasis wants size, space or the accent.'),
].some(Boolean)

if (broken) process.exit(1)

console.log('Motion doctrine holds: nothing loops uncaused, every canvas states its budget, gold stays rare.')
