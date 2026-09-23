---
surface: web
feature: worldclass-genz
target: client/src/index.css (tokens), client/src/components/panel/* (new design system), client/src/pages/* + client/src/three/* (per-phase)
status: draft
author: design-advisor v2.0
date: 2026-09-19
---

# InvestoMillionaire: the world-class Gen-Z rebuild

The verdict is settled. The panel voted 3-0 for **PLAYABLE: KNURL**, and this document
turns that vote into one buildable design with a recommended default for every open
question. It resolves the two places the judges disagreed, grafts the eleven ideas they
ruled non-negotiable, and drops the ones that only sounded good.

Read this before writing a line of UI. The senior-dev builds from Section 11.

---

## 1. Design system pick

**Chosen direction: KNURL.** Every concept becomes a physical control with detents,
damping, and a rupee consequence. The luxury lives in how the control answers a thumb,
not in a colour. That is the only premium a tipster with a Canva account cannot copy,
and it inverts the finfluencer grammar at the level of interaction rather than palette:
the SEBI 89% number arrives as the conclusion of an experiment the learner ran, not as a
hook they were shown.

Why KNURL over the other two, in the owner's terms:

- It is the only direction where the learner can be **wrong about something and find out
  in rupees**. The leverage fader turns a statistic into a consequence in about four
  seconds with a thumb.
- It is the only direction that **fixes the 11-hover / 0-click defect by construction**.
  The whole audience is on touch; the whole current interactive payload is behind hover.
- It is the only direction **nobody in Indian finance can ship by next quarter**, because
  the value is in execution tolerances (does the cap keep up with the thumb, does the
  detent land in the same frame as the vibration, does the number stay still while it
  changes), not in a screenshot.
- Only 5.8% of surveyed urban Indian Gen Z pay a premium for status; 50% pay for quality.
  KNURL spends the entire premium budget on craft the 50% reads, and none on the gold the
  scam detector fires at.

**ui-ux-pro-max style cited:** the closest catalogued style is a **neo-brutalist /
functional-hardware** register (physical controls, milled channels, screen-printed
legends, monochrome restraint with a single functional accent), scored light-friendly and
trust-forward. We deliberately reject the catalogue's "glassmorphism dark" and "vibrant
neon" rows: the CSV flags both as conversion-focused decoration, and the dossier shows
decoration measures at g = -0.16 for recall on this exact content.

**Reuse vs invent.** The current `@theme` token system stays as the mechanism (Tailwind v4
css-first, `--color-*` / `--font-*`), so this is a **values swap, not a new dependency**.
The one net-new code asset is the Panel: seven control primitives (Section 2). No new
runtime dependency is added anywhere; Framer Motion 12, react-three-fiber and three.js are
already installed and stay, and three.js is reduced from thirteen scenes to one.

### The two disagreements the panel left me, resolved

**Light vs dark default.** Cinematic overruled the light-default recommendation and went
dark-first. Two of three judges called that wrong, and they are right: Stripe, Mercury,
Groww and Zerodha Varsity are all light-canvas, and dark plus any warm accent is the
register this audience has been trained by 1.33 lakh flagged posts to distrust.
**Resolution: light is the default surface, with a true dark twin, auto-switched on
`prefers-color-scheme`.** The dark twin is not optional: the documented use moment is 11pm
in bed, where a paper-white page is a face full of light. We take Editorial's *measured*
palette (every ratio verified against its own canvas) rather than re-deriving one. The
dark twin is neutral near-black (`#0A0A0B`), never navy.

**How much three.js survives.** The dossier says two scenes (PayoffSurface3D, Scatter3D)
put independent information on the z-axis; Cinematic's own risk section concedes Scatter3D
is the weaker of the two and could be a 2D scatter with dot-size as the third channel.
**Resolution: three.js survives on exactly one scene, PayoffSurface3D (the options Strike
Dial).** Scatter3D flattens to a 2D canvas with dot-size encoding liquidity. The payoff
surface is the one lesson on the whole site that text genuinely cannot deliver (theta
decay is the rate of change of a surface), so it earns its renderer; a risk-return scatter
does not. This is the "the renderer is the entire bill" logic taken to its end. See Open
Question 1 for the one spike that could delete three.js entirely.

---

## 2. Component inventory

### 2.1 The Panel (new design system, ~600 lines, ~7 KiB brotli)

Seven primitives and nothing else. Twenty instruments become twenty configurations of
these seven, which is the only version of this thesis a solo developer finishes. If the
Panel grows an eighth primitive, the direction is failing.

| Primitive | Purpose | States |
|---|---|---|
| `Fader` | Continuous horizontal value in a milled channel | rest, focus-visible, dragging, at-detent, at-end-stop, disabled, reduced-motion (quantised) |
| `Encoder` | Rotary value dragged in an arc, LED tick ring | rest, focus, dragging, at-detent, disabled |
| `Switch` | 2- or 3-position discrete selector | each position rest/active, focus, disabled |
| `Momentary` | Press-and-hold or single-fire button | rest, press (120ms scale 0.97), hold-active, disabled |
| `Readout` | Number window, never tweened, `--font-mono` tabular | value present, empty, loss-frozen (loss colour) |
| `Legend` | Screen-printed label under a control, mono uppercase | static only (the one place positive tracking is allowed) |
| `Channel` | The recessed groove a cap runs in | static; radius 999px, cap radius = channel radius − padding |

Panel rules that make these read as hardware, not HTML:

- The cap transform is written from the **raw pointer position with no transition
  property**. Any easing between finger and cap is lag, and lag is what makes a control
  feel like a web page.
- Every continuous control has **detents**: 8ms `navigator.vibrate` plus a one-frame 2%
  cap overshoot. A stiffer double detent (`vibrate([8,30,8])`) marks the one value per
  control that carries the lesson (at-the-money on the strike fader, 5x on leverage).
- The cap is a **flat disc**, drawn with exactly `--shadow-cap` (highlight, ring, drop).
  No gradient, no glass, no `backdrop-filter`. Material honesty: it is plastic, not
  frosted glass.
- Hit target 44x44 minimum, grab zone extended 12px past the visible cap.
- `touch-action: pan-y` on horizontal controls plus a 10px horizontal-intent threshold
  before `setPointerCapture`, so a thumb that lands on a cap while scrolling still scrolls.

### 2.2 Signature components (brand-unique, built on the Panel)

| Component | Where | Built from |
|---|---|---|
| **You-Are-Here dot grid** | Home cold open, above the fader | 2D canvas, ~3 KB, no Panel |
| **Leverage Fader** | Home hero, second beat, above the fold | `Fader` + `Switch` + 2D account bar |
| **Strike Dial** | Lesson t7 (options) | `Fader` x2 + `Encoder` + `Momentary` + PayoffSurface3D (only WebGL scene) |
| **Scrubbable Readout** | Inline in lesson prose | `role="slider"` span, ~60 lines, no canvas |
| **Consequence Replay** | End of every technicals lesson + `/practice` | 2D candle canvas + `Switch` + drag-stop + `Momentary` |
| **Stat / Source Line** | Under every number, sitewide | ~25 lines + a lint rule (grafted from Editorial) |
| **Regulator's Screen** | First visit + head of every F&O lesson + `/honesty` | full-bleed, no card (grafted from Editorial) |
| **Contents Page** | `/learn`, `/learn/:track` | typeset, five node states in type (grafted from Editorial) |
| **Contact Sheet** | Universal fallback + `/learn` card art | 4 build-time WebP stills (grafted from Cinematic) |

### 2.3 Generic components (existing, re-skinned to tokens)

Nav, Footer, quiz option button, lesson section block, IPO stat grid, RHP checklist, news
card, dashboard tiles, auth form. All lose `glass`, gold, and the wide-tracked eyebrow;
all gain the surface ladder, the ink ladder, `--shadow-ring` edges, and tabular numerals.

### 2.4 Deleted components

`HeroScene3D`, `MoatCastle3D`, `CandleChart3D` (3D form), `Towers3D`, `BankFlow3D`,
`Funnel3D`, `SessionClock3D`, `Rotation3D`, `BalanceScale3D`, `OrderBook3D`, the `.glass`
utility, the `.gold-text` utility, the `float`/`marquee`/`shimmer` keyframes, the fake
ticker marquee, the `/reco` broker-call feed, the four IPO verdict verbs.

---

## 3. Wireframe-as-text

### 3.1 Home (`/`) — the hook, then the proof

Home is two beats and a curriculum door. No WebGL, no gold, nothing moving until a finger
moves it.

```
MOBILE (360–430px)                          DESKTOP (>=1024px, max 1024 column)
┌───────────────────────────────┐          ┌──────────────────────────────────────────┐
│ [wordmark, Instrument Serif]  │          │ [wordmark]        Learn  Practice  Honesty │
│                               │          ├──────────────────────────────────────────┤
│  BEAT 1 — You Are Here        │          │  100 dots (10x10), greyscale               │
│  ┌───────────────────────┐    │          │  drag → 89 go dark in index order          │
│  │ 100 dots, 10x10 grid  │    │          │  caption + source line beneath             │
│  │ still until touched   │    │          │                                            │
│  └───────────────────────┘    │          │  BEAT 2 — Leverage Fader (thumb-rest row)  │
│  "89 of 100 traders under 30  │          │  [==========O==============] LEVERAGE ×    │
│   lost. SEBI, FY26."          │          │  readout: capital ₹50,000 · a 2% move …    │
│  ── source line ─────────     │          │  account bar (2D canvas) reacts live       │
│                               │          │                                            │
│  BEAT 2 — Leverage Fader      │          │  door: [ Fundamentals ]  [ Technicals ]    │
│  LEVERAGE ×  (mono legend)    │          └──────────────────────────────────────────┘
│  readout (mono, tabular)      │
│  [====O===============]       │          Trust chrome (persistent, all pages):
│  ▁▁▁▂▃▅ account bar ▅▃▂▁▁     │          "Not a SEBI registered adviser. We never
│                               │          give tips. We will never message you.
│  [ Fundamentals ][Technicals] │          We have no Telegram group. We never take money."
└───────────────────────────────┘
```

Beat 1 (dot grid) answers KNURL's admitted risk that a greyscale panel gives a reel-arrival
visitor nothing to fire at. Beat 2 (fader) is the direction's proof: a thumb learns the
89% lesson in four seconds. The dot-grid content sequence, grafted from Cinematic, runs
across four caption ranges as the thumb travels:

1. 89 of 100 dots go dark in index order. "89 of every 100 derivatives traders under 30
   lost money. SEBI, FY26."
2. The 100 dots reflow into two bars, 89 vs 81. "You are more likely to lose money than
   your grandfather is. 81 of every 100 traders over 60 lost."
3. Bars collapse into a rupee stack scaling to ₹1,05,603 crore, with ₹74,812 crore drawn
   behind it in hairline. "Net losses got worse after the curbs. FY25, SEBI, July 2025."
4. Everything drains to one still serif line. "Nine crore people are running SIPs instead.
   AMFI, September 2025, ₹29,361 crore a month." The site needs somewhere honest to point,
   not only something to warn against.

### 3.2 Lesson (`/learn/:track/:level`) — the canvas answers the prose

The single biggest structural miss today is that the 3D scene and the prose never refer to
each other. The fix is a pinned instrument the prose drives.

```
MOBILE                                       DESKTOP
┌───────────────────────────────┐           ┌────────────────────────────────────────┐
│ Level 7 · Options · 6 min      │           │ Level 7 · Options       [pinned canvas]  │
│ [h1, Instrument Serif line]    │           │ h1 line                 sticky right rail│
│                               │           │ ── retrieval Q (before) ─  Strike Dial   │
│ RETRIEVAL Q (before prose)    │           │ prose section 1          [====O=====]    │
│ [ 2–3 questions, get wrong ]  │           │ prose section 2          DAYS  IV faders │
│                               │           │ (each section cues one   readout (mono)  │
│ ┌── instrument, sticky ────┐  │           │  element in the canvas)  source line     │
│ │ Strike Dial (canvas)     │  │           │                                          │
│ │ pins to top 45vh on      │  │           │                                          │
│ │ scroll-past              │  │           └────────────────────────────────────────┘
│ └──────────────────────────┘  │
│ readout (mono, tabular)       │           A "check yourself" question sits every two
│ [strike][days][iv] faders     │           sections, drawn from the 200-bank. The
│                               │           "Mark complete" 15-XP button is gone; XP is
│ prose section 1 …             │           paid when a Scrubbable Readout is moved AND
│ prose section 2 …             │           a retrieval question is answered.
└───────────────────────────────┘
```

Each section in `lessons.js` gains a `cue: { element, camera }` key. An IntersectionObserver
fires a 600ms signal pulse (two pulses of `--color-live`, zero position change) when a
paragraph naming an element scrolls in. The glossary moves from a footer grid to inline
tap-to-reveal chips where the word first appears.

For the 11 of 20 lessons that ride flat instruments (candles x5, towers x4, compound x2),
the "canvas" is a 2D `<canvas>`, not WebGL, and it never gates.

### 3.3 Learn (`/learn`, `/learn/:track`) — the map, not a directory

Delete the ten identical glass rows. Draw a typeset contents page: one 1px vertical rule,
brass level numbers hanging outside it, state carried entirely in type.

```
   │ 1  Money is a claim on the future      ✓ read  ▬ cleared
   │ 2  What a share actually is            ✓ read  ▬ cleared
 ● │ 3  Reading a balance sheet             ← you are here (accent)
   │ 4  Ratios that actually matter           unread (ink-3)
   │ 5  ⬡ Margin of safety                   perfect (brass seal)
   │ 6  Cash flow …                           locked (ink-3, NOT a link)
   ─── 3 of 10 cleared · 34 minutes of practice this week ───
```

Node states: unread (title ink-3), read (title ink), quiz-cleared (1px brass rule under
the number), perfect (brass seal glyph), locked (ink-3, and the entry is not a link). The
"not a link when locked" detail is what finally stops the site deep-linking a learner into
a 403. Card art is the Contact Sheet frame set. The line above the current position prints
**minutes of practice this week**, not lifetime XP, because that is the north-star metric.

### 3.4 Practice (`/practice/:episodeId`) — the consequence loop

A dated, anonymised NSE episode at least three months old, drawn as a flat 2D candle
canvas. A `Switch` (Long / Flat / Short), a drag-on `STOP` handle that snaps to round
levels, and a `Momentary` `STEP` button. Each step advances one session; P&L and cost
update in the readout with 8ms haptic. At the end, a staged 2000ms reveal draws your line,
the did-nothing line, and the cost line, then leaves a **small-multiples strip of four
stills** underneath to study. No live prices, no prize, no XP on the outcome, source line
on everything. Six episodes ship (Section 11, Phase 6).

### 3.5 IPO (`/ipo`, `/ipo/:symbol`) — teach the scorecard, delete the verdict

Keep the transparent scoring engine and its full derivation (the best original teaching on
the site; no Indian competitor shows its scoring function). Delete the four verbs
(APPLY / CONSIDER / RISKY / AVOID) and rebalance grey-market premium off its ±3 top weight.
Verbs become descriptive labels ("Institutions covered", "Demand concentrated in retail").
**Invert the page order**: RHP checklist directly under the header, verdict-scorecard and
GMP below. The order today rewards score-first, homework-last, which is the behaviour the
site says it opposes.

### 3.6 Leaderboard — weekly cohort, not an immortal hall of fame

Replace the all-time top-20-by-lifetime-XP board (which also leaks real full names from an
unauthenticated endpoint) with a **weekly league of ~30 similar-effort strangers, ranked
by minutes of active practice, Monday reset**, using a display handle chosen at signup and
compared by id. This is the one Duolingo mechanic with a measured lift (+17% learning time)
and it ranks effort, not returns, so it transfers to a no-recommendation site.

---

## 4. A11y contract

**Target: WCAG 2.2 AA.** Every ink tier and the accent were chosen to pass AA at their
intended size (Section 8 carries the measured ratios).

**Focus indicator, verified against every surface it appears on.** The current codebase has
zero `:focus-visible` styles and uses `outline-none` everywhere; keyboard focus that
disappears reads as unfinished. The ring is a single rule: `outline: 2px solid
var(--color-accent); outline-offset: 2px`. Because `outline-offset` renders the ring on the
parent surface (never on the control's own fill), one accent ring reads on all of them:

| Ring sits on | Light ratio (accent #3A46C4) | Dark ratio (accent #6E79E8) | Pass (>=3:1 non-text) |
|---|---|---|---|
| canvas | 7.11:1 | 5.24:1 | yes |
| surface | 6.9:1 | ~4.6:1 | yes |
| surface-2 | ~6.8:1 | ~4.4:1 | yes |
| accent-tint | ~6.6:1 | ~4.5:1 | yes |

The one case the offset does not cover is a control flush against another accent-filled
element (rare). There the ring flips to `--color-ink` with the same offset. State this in
the Panel `focus-visible` styles.

- **Quiz options** get `role="radiogroup"` on the container and `role="radio"` +
  `aria-checked` on each option. Today they are plain buttons with no selected semantics.
- **Scrubbable Readout** is `role="slider"`, `tabindex="0"`, `aria-valuenow`,
  `aria-valuetext`, arrow-key support. It must work on a keyboard and a screen reader, not
  only a thumb.
- **The instrument canvas** carries an `aria-label` describing its current readout, and the
  DOM readout below it is the accessible source of truth (labels live in DOM, never in
  WebGL `Html`).
- **One `<h1>` per page.** Learn and QuizPlay currently render two.
- **Focus order** follows visual order: retrieval question, then instrument, then prose,
  then the level CTA.
- **Reduced motion** is honoured for real (Section 6), not the current CSS-only placebo.
- **Haptics** (`navigator.vibrate`) are a capability-checked bonus (0% on iOS Safari), never
  the primary signal for a detent, with a persistent user toggle.
- **WCAG 2.2.2** is satisfied by deletion: the auto-starting marquee is gone.
- **Charts** (dot grid, replay, payoff) provide a text summary / `aria-label` of the key
  insight and are not the only channel for the number, which always appears in a DOM
  readout.

### The three empty states (each is a real screen, not an edge case)

The lesson map, the leaderboard, and every data feed have three empty states that must be
designed, because the first is what every new user sees first:

1. **Empty on day one** (new account, no progress): the Learn map shows level 1 open and
   "Start here"; the leaderboard shows "Your week starts now, first minute counts"; the
   dashboard shows a single "Resume: Level 1" hero, not four zeroed tiles.
2. **Empty after a filter / cohort with no peers yet**: the leaderboard shows "You are the
   first in your cohort this week, check back tomorrow", never a blank table.
3. **Empty because the request failed** (Render cold start, timeout): a skeleton for up to
   8s, then a retry affordance with a plain sentence ("The server was asleep, tap to wake
   it"), never a bare "Loading…" that hangs forever.

---

## 5. Responsive contract

Breakpoints: **375 / 768 / 1024 / 1440**. Mobile-first; the design target is a 360x640
Android after browser chrome.

| Surface | What reflows |
|---|---|
| Home | Two beats stack vertically on mobile; side-by-side is not used, the fader is always full-column so the thumb-rest position holds. `clamp()` display sizes so the hero never breaks between 360px and desktop. |
| Lesson | Instrument pins to top 45vh via `position: sticky` on mobile once scrolled past; on desktop it is a sticky right rail beside the prose. Reading column locks at `--page-max` (1024px) with `--page-inset`. |
| Learn map | Single column always; the vertical rule and hanging numbers are identical at all widths. Contact-sheet card art is 2x2 on mobile, 4x1 on desktop. |
| Data pages (IPO, News) | The two-stat pill and refresh control currently vanish behind `sm:` and leave the phone header as an h1 and a lone icon. Fix: the counts stay visible on mobile, restacked. |
| Replay | Candle canvas is full-width; controls sit below in a single row that wraps to two on the narrowest phones. |

- **Safe area**: fixed trust chrome and any bottom control bar respect
  `env(safe-area-inset-bottom)`; captions sit at `bottom: max(24px, env(safe-area-inset-bottom))`.
- **Touch density**: 44x44 minimum, 8px minimum between targets, grab zones extended 12px.
- **Reading measure**: ~68–72 characters at 17px body.
- **No horizontal scroll**; `overflow-x: hidden` on body stays.
- **The sticky-stage check is a build gate, not an assumption**: before the pinned lesson
  instrument ships, verify on a real 360x640 Android that the diagram is readable in the
  ~400px that remains after chrome and a two-line caption. If not, fall back to a half-height
  stage with the caption beside rather than below.

---

## 6. Motion contract

The governing rule: **motion is caused by a finger this instant, or it does not exist.**
There is no idle motion anywhere. A `grep` for `infinite` in `client/src` must return
nothing, enforced as a CI check.

### Duration tokens (raw numbers banned in JSX)

- `--dur-tap: 120ms` (press feedback, toggles)
- `--dur-enter: 260ms` (a panel or card arriving)
- `--dur-exit: 200ms` (exit shorter than enter)
- `--dur-page: 360ms` (route change via same-document View Transitions)
- `--dur-data: 1200ms` (the only motion over 400ms; single-stage data reveal)

Staged data reveals (the consequence replay) run **2000ms total, split into stages with a
200ms dwell between them** so each change is observed separately, per Heer & Robertson 2007
(staged beats direct beats hard cut, F(2,286) >= 22.03, p < 0.001). Anything over 400ms
that is not carrying data does not ship.

### Easing tokens

- `--ease-standard: cubic-bezier(0.2, 0, 0, 1)` (M3 emphasized; move-in-place)
- `--ease-enter: cubic-bezier(0.05, 0.7, 0.1, 1)` (M3 emphasized-decelerate)
- `--ease-exit: cubic-bezier(0.3, 0, 0.8, 0.15)` (M3 emphasized-accelerate)
- `--ease-data: cubic-bezier(0.4, 0, 0.2, 1)` (symmetric slow-in slow-out for data)

`linear` is banned outright (there is no marquee left to justify it).

### The five motion classes

1. **FOLLOW** (finger to cap): 0ms, no easing, no transition. Transform written from the
   raw pointer position, coalesced to one rAF, value in a ref so React is off the hot path.
2. **SETTLE** (finger lifts, cap snaps to nearest detent): Motion 12 duration-based spring,
   `{ type: 'spring', visualDuration: 0.18, bounce: 0.15 }`. **Bounce above 0.15 is
   forbidden on anything attached to a number**, because overshoot makes the readout briefly
   display a value that is not true.
3. **READOUT**: never tweened. The number is replaced, not counted up, in tabular figures
   so nothing reflows. A counting-up number is a lie about the current value.
4. **SIGNAL** (cue): two pulses of `--color-live` emissive/opacity over 600ms, zero position
   change, fired by IntersectionObserver on the paragraph that names the element. This is
   the one uncaused motion permitted; Richter, Scheiter & Eitel 2016 (N = 2,464) measured
   r = 0.17, concentrated in low-prior-knowledge learners, which is the whole audience.
5. **STAGGER**: one rule, `staggerChildren: 0.05`, total capped at 200ms, declared once on a
   parent variants. Lists over 8 items get one group fade at 260ms and no stagger.

### Scroll and navigation

- Scroll reveals run on the compositor: `.reveal { animation: reveal 1ms linear both;
  animation-timeline: view(); animation-range: entry 15% entry 60% }` inside
  `@supports (animation-timeline: view())`, with a `whileInView` fallback for Firefox below
  159. Reaches ~93% of Indian mobile traffic.
- Route changes use **same-document View Transitions** (~88% coverage, no library):
  `view-transition-name: lesson-<id>` on the Learn entry, the same name on the lesson h1.
  The title you tapped becomes the heading. This is the only navigation animation.

### Reduced motion: reduce, do not remove

Wrap the app in `<MotionConfig reducedMotion="user">` and gate 3D with `useReducedMotion()`.
For the scrub, **quantise, do not disable**: `t = Math.round(v * (n-1)) / (n-1)`, so the
same instrument becomes n discrete states under the same finger. Reduced motion kills the
SETTLE spring, the SIGNAL pulse, and the replay tween; it never touches direct manipulation,
because WCAG 2.3.3 exempts movement the user controls. Ship an in-app toggle too, because
Android's animation switch is buried three menus deep.

### Page-view motion budget

Three seconds of motion per page view, of which the instrument owns 1.2. If a page needs
more, delete something on the page.

---

## 6.5 Platform integration contract

Web (PWA), not native, so this section is mostly `n/a` for native APIs, with three real
integrations:

- **PWA install + offline (net-new).** No manifest and no service worker exist today. Add
  `manifest.webmanifest` (name, icons, `display: standalone`, theme colour = canvas) and a
  minimal service worker that caches the shell, the 20 lessons, and the Panel, so the site
  installs to an Android home screen and a lesson opens on the Mumbai local with no signal.
  Icon uses the brass wordmark on canvas.
- **Haptics.** `navigator.vibrate` for detents and stop-loss hits; capability-checked,
  ~94% of Indian mobile traffic, 0% of iPhones, so never the primary signal, with a toggle.
- **Web Share** on the certificate and the replay end-state still frame, so a result the
  audience can screenshot also has a public verify URL that survives a recruiter clicking it.

No deep-link-into-native, no push notifications in this phase (a return-appointment via
push is a good later idea but out of scope here, and notifications are a consent surface
that needs its own design).

---

## 8. Brand tokens

Paste-ready. This replaces the entire current `@theme` block (gold, navy, mint, flame,
violet, Sora, Space Grotesk, and the three infinite keyframes all go). Contrast ratios are
measured against the canvas of the same theme.

```css
@import 'tailwindcss';

/* ============================================================
   InvestoMillionaire design tokens — KNURL (light default, dark twin)
   Every ratio below is WCAG against the canvas of the same theme.
   ============================================================ */

@theme {
  /* ---- Surface ladder (LIGHT is the default theme) ---- */
  --color-canvas: #fbfbfa;       /* warm paper, page ground */
  --color-surface: #ffffff;      /* raised: instrument frame, active quiz card */
  --color-surface-2: #f4f4f2;    /* recessed well: fader channel, table rows */
  --color-hairline: #e4e4e0;     /* every edge, drawn as a ring shadow not a border */
  --color-hairline-strong: #d4d4cf;

  /* ---- Ink ladder (all pass AA at their intended size) ---- */
  --color-ink: #121214;          /* 18.07:1  headlines, body */
  --color-ink-2: #4a4a50;        /*  8.50:1  secondary prose, captions */
  --color-ink-3: #69696f;        /*  5.27:1  source lines, dates, legends — the floor */

  /* ---- One chromatic accent + the LIVE state ---- */
  --color-accent: #3a46c4;       /*  7.11:1  links, the one button, slider fill; white on it 7.36:1 */
  --color-accent-tint: #edeefb;  /* selected option, cued-element wash */
  --color-live: #3a46c4;         /* the value a finger is changing this instant */

  /* ---- Consequence pair (never a rating chip) ---- */
  --color-gain: #1e7a4c;         /* P&L / payoff profit only */
  --color-loss: #b3271f;         /* P&L / payoff loss + the risk-disclosure screen */

  /* ---- Brass: material accent, 63.6% saturation. Wordmark, level seal, cert only ---- */
  --color-brass: #8a6320;        /*  5.22:1 */

  /* ---- Type ---- */
  --font-sans: 'Inter', system-ui, sans-serif;             /* UI + body; opsz auto, cv01/cv11/ss03 */
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;  /* readouts, legends, tickers — truly monospaced */
  --font-display: 'Instrument Serif', Georgia, serif;      /* wordmark + one line per page (the voice) */

  /* ---- Motion durations (raw numbers banned in JSX) ---- */
  --dur-tap: 120ms;
  --dur-enter: 260ms;
  --dur-exit: 200ms;
  --dur-page: 360ms;
  --dur-data: 1200ms;

  /* ---- Motion easings ---- */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0.05, 0.7, 0.1, 1);
  --ease-exit: cubic-bezier(0.3, 0, 0.8, 0.15);
  --ease-data: cubic-bezier(0.4, 0, 0.2, 1);

  /* ---- Radii (concentric rule: inner = outer − padding) ---- */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;

  /* ---- Elevation (Linear scale; edges are ring shadows, real shadows are rare) ---- */
  --shadow-ring: 0 0 0 1px var(--color-hairline);
  --shadow-low: 0 2px 4px rgb(0 0 0 / 0.06);
  --shadow-med: 0 4px 24px rgb(0 0 0 / 0.08);
  --shadow-high: 0 7px 32px rgb(0 0 0 / 0.12);
  --shadow-cap: inset 0 1px 0 #ffffff, 0 0 0 1px var(--color-hairline), 0 1px 2px rgb(0 0 0 / 0.18);

  /* ---- Layout ---- */
  --page-max: 1024px;    /* reading column, ~68–72 chars at 17px */
  --page-inset: 24px;
  --section-rhythm: 96px; /* 64px on mobile via a utility */
}

/* ============================================================
   Dark twin — auto, because the documented use moment is 11pm.
   Neutral near-black, NOT navy. Hairline reads at 1.24:1 (Linear),
   not the current invisible 1.10:1.
   ============================================================ */
@media (prefers-color-scheme: dark) {
  :root {
    --color-canvas: #0a0a0b;
    --color-surface: #17171a;
    --color-surface-2: #1d1d21;
    --color-hairline: #26262b;        /* 1.24:1 against surface */
    --color-hairline-strong: #33333a;
    --color-ink: #f2f2f0;             /* 17.65:1 */
    --color-ink-2: #b5b5b8;           /*  9.67:1 */
    --color-ink-3: #86868b;           /*  5.46:1 */
    --color-accent: #6e79e8;          /*  5.24:1 */
    --color-accent-tint: #15162b;
    --color-live: #6e79e8;
    --color-gain: #35b673;            /*  7.62:1 */
    --color-loss: #e4675c;            /*  6.02:1 */
    --color-brass: #d9a94f;           /*  9.18:1 */
    --shadow-cap: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 0 1px var(--color-hairline), 0 1px 2px rgb(0 0 0 / 0.4);
  }
  html { color-scheme: dark; }
}

/* ---- Global: tabular figures everywhere, so no number ever reflows ---- */
:root {
  font-variant-numeric: tabular-nums;
}

/* ---- The one focus ring, verified on every surface (Section 4) ---- */
:where(a, button, input, select, textarea, [role="slider"], [tabindex]):focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* ---- Reduced motion: reduce, do not remove. JS handled by MotionConfig;
        the scrub quantises; direct manipulation is untouched (WCAG 2.3.3). ---- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Type scale (Linear's measured ladder, `clamp()`-driven)

| Role | Size / line-height / tracking | Weight |
|---|---|---|
| Hero (one line, serif) | 56px / 1.05 / -0.022em | Instrument Serif |
| Display | 40px / 1.1 / -0.022em | 600 |
| Title | 32px / 1.125 / -0.022em | 600 |
| Subtitle | 24px / 1.33 / -0.012em | 600 |
| Body-lg / caption-in-motion | 20px / 1.4 / -0.011em, max 2 lines / ~14 words, `text-wrap: balance` | 500 |
| Body | 17px / 1.55 / -0.011em | 400 |
| Small | 14px / 1.5 / -0.013em | 400 |
| Legend / micro | 11–12px / 1.4 / 0.04em uppercase (mono) | 500 |

Weights: 400 body, 500 UI and legends, 600 titles, 700 for exactly one line. `font-extrabold`
is deleted (29 uses). Tracking inverts: display negative, one eyebrow per section capped at
0.06em. `text-wrap: balance` on every h1/h2, `text-wrap: pretty` on body. The legend (mono
uppercase) is the only positive-tracked type on the site, because a screen-printed legend
under a control is the one place it is correct.

### Fonts, self-hosted, ~45 KiB budget

Inter (static 400 + 600 latin subset, or the variable file if it fits under budget),
JetBrains Mono (subset to digits, punctuation, A-Z, ~8 KB), Instrument Serif (one weight,
roman, ~12 KB). All woff2, latin subset, preloaded from the same origin, `font-display:
swap` with a `size-adjust` metric-matched local fallback so fonts swap with no layout shift.
This replaces the render-blocking ten-file Google Fonts chain on two extra origins.

### RN token module

`n/a` — this is a web surface. No React Native.

---

## 9. Out of scope

- **Push notifications / return-appointment nudges.** A named nightly unit is a strong later
  idea; notifications are a consent surface needing their own design pass.
- **Hinglish audio track per lesson.** Genuinely differentiating and low-cost, but a content
  and recording effort, not a UI build. Flag for a content roadmap.
- **Full anonymous-to-authed conversion flow beyond level 1.** The design lets level 1 run
  in localStorage and prompts to save progress after the first cleared level; the broader
  auth funnel redesign is a separate spec.
- **The 3-4x quiz pool expansion (600–800 questions).** The retrieval and spaced-return
  mechanics are designed here; authoring the extra questions is a content task.
- **New lesson prose.** This document restructures how prose relates to the instrument and
  splits it per-lesson for delivery; writing depth-per-concept content is out of scope.
- **Deleting three.js entirely** (see Open Question 1). Kept for the payoff surface for now.

---

## 10. Open questions (recommended default in bold, so the pipeline never blocks)

1. **Can the payoff surface be projected to a 2D canvas at acceptable fidelity, deleting
   three.js entirely?** Default: **keep WebGL for PayoffSurface3D only, gated behind the
   seven-condition mount.** A ~200-line software projection of a 45x27 height field is a
   real alternative that removes ~200 KiB brotli, but it needs a spike to judge fidelity.
   Owner decision after a one-day spike.
2. **Does the greyscale-until-touched home hero survive a 3-second first-impression test?**
   Default: **ship it and run the test on 20 Indian 18-25 year-olds** ("would you scroll?"
   and "course or tip service?"). If under 60% would scroll, the dot grid gets one entry
   motion. If more than one says "tip service", the problem is elsewhere and we learn that.
3. **Does pointer-capture-in-a-scrolling-article work on a real Redmi?** Default: **build the
   Leverage Fader first and device-test before any other pixel** (this is the firstSlice).
   If `touch-action: pan-y` plus the 10px intent threshold still fights scroll, horizontal
   controls move into their own full-width strips pulled out of the text flow.
4. **Keep the `InvestoMillionaire` name and the "Millionaire" wealth framing?** Default:
   **keep the name for now, drop the gold that made it read as a tip service.** ASCI
   required 98% of processed influencer finance ads to modify; test the name on real
   20-25s. This is a brand call only the owner makes.
5. **Delete `/reco` (an indexed SEO page) or restructure it into dated 3-month-lagged case
   studies?** Default: **delete the live broker-call feed; the site cannot say it never
   recommends a stock on one page and publish price targets on another.** The owner may
   reasonably weigh the lost search traffic.
6. **Mobile number at signup: required, optional, or removed?** Default: **optional.** A
   required 10-digit mobile reads as a tip-service tell to exactly the audience burned by
   one, and the encryption-at-rest work already done means optional is cheap.
7. **Ship light-default with auto dark twin, or add a manual theme toggle too?** Default:
   **auto on `prefers-color-scheme`, no manual toggle in phase 1**, add a toggle later if
   users ask. The 11pm use moment is the reason the dark twin is not optional either way.

---

## 11. Implementation hand-off

Six phases, ordered so phase 1 alone visibly transforms the site and the owner can stop
after any phase with something coherent. Each phase names its target files.

### Phase 0 (prelude, invisible, ships inside Phase 1): make the numbers real

None of the measured bundle numbers reach a visitor until the API stops sleeping. Do this
first, folded into Phase 1:
- `server/src/index.js`: add `compression()`, set `cors({ maxAge: 86400 })`, add a
  keep-alive ping route.
- `client/src/lib/api.js`: drop `Content-Type: application/json` from GETs (it forces a CORS
  preflight on every call), add an 8s `AbortController` timeout and real skeletons.

### Phase 1 — Foundation and first paint (transformative, days)

The biggest visible lever and the biggest perf lever, together. After this the site is
light, quiet, fast, and legible, and nothing looks like a tip sheet.
- **Target:** `client/src/index.css` (paste Section 8), `client/vite.config.js`,
  `client/index.html`, `client/src/App.jsx`, `client/src/main.jsx`.
- Fix `manualChunks` so react-dom leaves the three chunk; add `React.lazy` on all 13 routes;
  drop the `modulepreload` for three. Self-host the three fonts, preload, delete the Google
  Fonts link. Split lesson prose from metadata via `import.meta.glob`.
- Delete `.glass`, `.gold-text`, and the `float`/`marquee`/`shimmer` keyframes. Swap
  `motion` for `m` + `LazyMotion`. Add `<MotionConfig reducedMotion="user">` at the root.
- Re-skin Nav, Footer, and generic cards to the token ladder; apply `tabular-nums`,
  `:focus-visible`, `text-wrap`, `clamp()` display sizes.
- Add the CI check: `grep -r 'infinite' client/src` must return nothing.
- **Coherent stop point:** a fast, quiet, legible site with the old features intact.

### Phase 2 — The trust layer (high, days)

- **Target:** new `client/src/components/Stat.jsx` (Source Line, with the dev-mode throw
  when `src` or `date` is missing) + a lint rule; new `client/src/pages/Honesty.jsx`; new
  `RegulatorScreen` component; `client/src/components/Footer.jsx` (persistent trust chrome);
  `client/src/pages/Recommendations.jsx` (delete feed); `server/src/data/verdict.js` +
  `client/src/pages/Ipo.jsx`, `IpoDetail.jsx` (verbs to descriptive labels, invert order,
  rebalance GMP).
- Route every numeric literal shown to a user through `<Stat value claim src date href/>`.
- **Coherent stop point:** every number is sourced and dated, the regulator's own screen
  greets first visits, `/honesty` names the 13 CCPA patterns, the tip-sheet verbs are gone.

### Phase 3 — The Panel and the hero (transformative, days)

- **Target:** new `client/src/components/panel/*` (Fader, Encoder, Switch, Momentary,
  Readout, Legend, Channel + a pointer-capture hook + an INR lakh/crore formatter + a
  haptics wrapper); `client/src/pages/Home.jsx` (You-Are-Here dot grid + Leverage Fader,
  delete both WebGL canvases).
- **Build the Leverage Fader and device-test on a real Redmi before anything else in this
  phase** (Open Question 3).
- **Coherent stop point:** a homepage that teaches the 89% lesson with a thumb, no WebGL.

### Phase 4 — The lesson, the map, and retrieval (transformative, days)

- **Target:** three flat-canvas instrument components (candles, towers, compound) covering
  11 of 20 lessons; `client/src/three/Scatter3D` flattened to 2D; `client/src/pages/Lesson.jsx`
  (pinned instrument, cue-driven signal, inline glossary, Scrubbable Readout, delete "Mark
  complete"); `client/src/pages/Learn.jsx` (typeset Contents Page, five node states, locked
  = not a link, minutes-of-practice line, view-transition-names); `client/src/data/lessons.js`
  (add `cue`, `vars`, `derive` keys); retrieval-question-before-prose wiring through the
  existing signed-JWT flow in `server/src/routes/quiz.js`.
- Build the three flat instruments first (they cover 11 lessons and design out the
  partial-migration death), then the shared lesson layout.
- **Coherent stop point:** lessons where the prose drives the diagram, XP paid for answers
  not scrolls, a map that shows where you are, retrieval before reading.

### Phase 5 — The Strike Dial (high, day to days)

- **Target:** `client/src/three/PayoffSurface3D.jsx` (lift STRIKE/vol/rate/MAX_YEARS
  constants to refs bound to faders + an Encoder + a HOLD-TO-EXPIRY Momentary; delete
  `computeVertexNormals`; swap `meshStandardMaterial` + four-light rig for
  `meshBasicMaterial({ vertexColors })`); `client/src/three/Scene.jsx` (frameloop demand,
  dpr [1,1.5], antialias false, seven-condition mount gate); the Contact Sheet component +
  a ~40-line Playwright poster script writing four WebP stills.
- **Coherent stop point:** the one lesson text cannot deliver, operable with a thumb, with a
  static poster that is the LCP element and the universal fallback.

### Phase 6 — The consequence loop and the social layer (high, days)

- **Target:** new `client/src/pages/Practice.jsx` + six episode JSON assets; per-question
  quiz scoring + 7-day return-quiz scheduler in `server/src/routes/quiz.js`;
  `server/src/routes/progress.js` (weekly cohort league, `touchDay(user)` streak,
  read-time streak, display handles, compare by id, close the name-leak endpoint);
  `client/src/pages/Leaderboard.jsx`, `Dashboard.jsx` (resume-here hero, sparkline, streak
  toward day 10).
- Ship all six replay episodes: gap-down open, a range that breaks and fails, an uptrend
  that punishes early exits, a stock that halves, forty sideways bars that punish
  overtrading, and one where doing nothing wins.
- **Coherent stop point:** an always-on consequence loop, effort-ranked weekly cohorts, and
  a streak engineered for day 10.

### Also ship (folded into the relevant phase)

PWA manifest + service worker (Phase 1 shell caching), the empty-state screens (Section 4,
per page in its phase), and the `role`/`aria` semantics on quiz options and the Scrubbable
Readout (Phase 4).
