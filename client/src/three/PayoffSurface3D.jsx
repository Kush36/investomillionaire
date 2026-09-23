import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Label from './Label.jsx'
import { token } from './Scene.jsx'

// Abramowitz and Stegun 26.2.17. Accurate enough to draw a surface with.
function normalCdf(x) {
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z)
  return 0.5 * (1 + sign * y)
}

function blackScholes(type, spot, strike, years, vol = 0.28, rate = 0.065) {
  if (years <= 0.0005) {
    return type === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0)
  }
  const d1 = (Math.log(spot / strike) + (rate + (vol * vol) / 2) * years) / (vol * Math.sqrt(years))
  const d2 = d1 - vol * Math.sqrt(years)
  const discounted = strike * Math.exp(-rate * years)
  return type === 'call'
    ? spot * normalCdf(d1) - discounted * normalCdf(d2)
    : discounted * normalCdf(-d2) - spot * normalCdf(-d1)
}

const STRIKE = 100

const STRATEGIES = {
  'long-call': {
    label: 'Long call · 100 CE',
    note: 'Pay premium, unlimited upside, loss capped at the premium',
    legs: [{ type: 'call', strike: STRIKE, qty: 1 }],
  },
  'long-put': {
    label: 'Long put · 100 PE',
    note: 'Pay premium, profits as the market falls',
    legs: [{ type: 'put', strike: STRIKE, qty: 1 }],
  },
  straddle: {
    label: 'Long straddle · 100 CE + 100 PE',
    note: 'Pays off on a big move either way, bleeds if nothing happens',
    legs: [
      { type: 'call', strike: STRIKE, qty: 1 },
      { type: 'put', strike: STRIKE, qty: 1 },
    ],
  },
  'covered-call': {
    label: 'Covered call · stock + short 105 CE',
    note: 'Premium income, upside capped above the strike',
    legs: [
      { type: 'stock', qty: 1 },
      { type: 'call', strike: 105, qty: -1 },
    ],
  },
}

function positionValue(legs, spot, years) {
  return legs.reduce((sum, leg) => {
    if (leg.type === 'stock') return sum + leg.qty * spot
    return sum + leg.qty * blackScholes(leg.type, spot, leg.strike, years)
  }, 0)
}

const SPOT_STEPS = 44
const TIME_STEPS = 26
const SPOT_MIN = 78
const SPOT_MAX = 126
const MAX_YEARS = 0.25 // roughly three months to expiry

export default function PayoffSurface3D({ preset = 'long-call' }) {
  const strategy = STRATEGIES[preset] ?? STRATEGIES['long-call']
  const mesh = useRef()

  const geometry = useMemo(() => {
    const entryCost = positionValue(strategy.legs, STRIKE, MAX_YEARS)
    const geo = new THREE.PlaneGeometry(11, 7, SPOT_STEPS, TIME_STEPS)
    const position = geo.attributes.position
    const colors = new Float32Array(position.count * 3)
    const profit = new THREE.Color(token('gain'))
    const loss = new THREE.Color(token('loss'))
    const flat = new THREE.Color(token('ink-3'))

    let peak = 0.001
    const values = new Float32Array(position.count)

    for (let i = 0; i < position.count; i++) {
      // x runs across spot price, y across time left, before the plane is laid flat.
      const u = (position.getX(i) + 5.5) / 11
      const v = (position.getY(i) + 3.5) / 7
      const spot = SPOT_MIN + u * (SPOT_MAX - SPOT_MIN)
      const years = v * MAX_YEARS
      const pnl = positionValue(strategy.legs, spot, years) - entryCost
      values[i] = pnl
      peak = Math.max(peak, Math.abs(pnl))
    }

    for (let i = 0; i < position.count; i++) {
      const scaled = (values[i] / peak) * 2.4
      position.setZ(i, scaled)
      const shade = values[i] > 0.15 ? profit : values[i] < -0.15 ? loss : flat
      const strength = 0.45 + Math.min(1, Math.abs(values[i]) / peak) * 0.55
      colors[i * 3] = shade.r * strength
      colors[i * 3 + 1] = shade.g * strength
      colors[i * 3 + 2] = shade.b * strength
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.rotateX(-Math.PI / 2)
    geo.computeVertexNormals()
    return geo
  }, [strategy])

  return (
    <group position={[0, -0.6, 0]}>
      <group ref={mesh}>
        <mesh geometry={geometry}>
          <meshStandardMaterial vertexColors side={THREE.DoubleSide} metalness={0.2} roughness={0.55} flatShading />
        </mesh>
        {/* the wire grid is what makes the kink at the strike and the time sag readable */}
        <mesh geometry={geometry}>
          <meshBasicMaterial color={token('hairline-strong')} wireframe transparent opacity={0.35} />
        </mesh>
      </group>

      {/* break-even plane: everything above it is profit */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11, 7]} />
        <meshBasicMaterial color={token('accent')} transparent opacity={0.13} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      <Label position={[0, 3.6, 0]} tone="accent">
        {strategy.label}
      </Label>
      <Label position={[0, 3.0, 0]} size="xs">
        {strategy.note}
      </Label>

      <Label position={[-6.3, 0, 0]} size="xs" tone="loss">
        spot {SPOT_MIN}
      </Label>
      <Label position={[6.3, 0, 0]} size="xs" tone="gain">
        spot {SPOT_MAX}
      </Label>
      <Label position={[0, 0, 4.3]} size="xs">
        expiry day
      </Label>
      <Label position={[0, 0, -4.3]} size="xs">
        3 months left
      </Label>
      <Label position={[-4.6, 1.6, -3.2]} size="xs" tone="accent">
        height = profit and loss
      </Label>
    </group>
  )
}
