import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import Label from './Label.jsx'
import { token } from './Scene.jsx'

const YEARS = 25

// Two series drawn side by side. The gap between them is the lesson.
const PRESETS = {
  growth: {
    caption: 'Rs 10,000 a month, 12% a year',
    unit: 'corpus in Rs lakh',
    series: [
      {
        name: 'SIP from age 25',
        color: token('accent'),
        note: 'Starts early, ends far ahead',
        value: (year) => sipCorpus(10000, 0.12, year),
      },
      {
        name: 'SIP from age 35',
        color: token('ink-3'),
        note: 'Same amount, ten years late',
        value: (year) => sipCorpus(10000, 0.12, Math.max(0, year - 10)),
      },
    ],
  },
  drag: {
    caption: 'What 1.5% in yearly costs quietly removes',
    unit: 'corpus in Rs lakh',
    series: [
      {
        name: 'Index fund, 0.2% cost',
        color: token('gain'),
        note: 'Low cost keeps the compounding',
        value: (year) => sipCorpus(10000, 0.118, year),
      },
      {
        name: 'High cost fund, 1.7%',
        color: token('loss'),
        note: 'Same returns, worse outcome',
        value: (year) => sipCorpus(10000, 0.103, year),
      },
    ],
  },
}

function sipCorpus(monthly, annualRate, years) {
  if (years <= 0) return 0
  const r = annualRate / 12
  const n = years * 12
  return (monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r)) / 100000
}

function SeriesBars({ series, zOffset, maxValue, spacing, startX, hovered, setHovered }) {
  const group = useRef()

  // The bars grow out of the axis as the diagram arrives, which is the whole point
  // of a compounding chart: the shape is the argument. It ran off the clock before,
  // which meant it never ran at all on a demand-rendered canvas.
  const entrance = useEntrance(2200)
  useFrame(() => {
    if (group.current) group.current.scale.y = entrance()
  })

  const points = useMemo(() => {
    const pts = []
    for (let year = 0; year <= YEARS; year++) {
      pts.push([startX + year * spacing, (series.value(year) / maxValue) * 5 + 0.05, zOffset])
    }
    return pts
  }, [series, maxValue, spacing, startX, zOffset])

  return (
    <group>
      <group ref={group}>
        {Array.from({ length: YEARS + 1 }).map((_, year) => {
          if (year % 2 !== 0) return null
          const value = series.value(year)
          const height = Math.max(0.04, (value / maxValue) * 5)
          const active = hovered === `${series.name}-${year}`
          return (
            <mesh
              key={year}
              position={[startX + year * spacing, height / 2, zOffset]}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHovered(`${series.name}-${year}`)
              }}
              onPointerOut={() => setHovered(null)}
            >
              <boxGeometry args={[0.32, height, 0.32]} />
              <meshStandardMaterial
                color={series.color}
                emissive={series.color}
                emissiveIntensity={active ? 0.7 : 0.22}
                metalness={0.4}
                roughness={0.3}
              />
            </mesh>
          )
        })}
      </group>
      <Line points={points} color={series.color} lineWidth={2.5} />
      <Label position={[startX + YEARS * spacing + 1.2, (series.value(YEARS) / maxValue) * 5, zOffset]} size="xs" tone="accent">
        {`${series.value(YEARS).toFixed(1)} L`}
      </Label>
    </group>
  )
}

export default function Compound3D({ preset = 'growth' }) {
  const config = PRESETS[preset] ?? PRESETS.growth
  const [hovered, setHovered] = useState(null)

  const spacing = 0.36
  const startX = (-YEARS * spacing) / 2
  const maxValue = useMemo(
    () => Math.max(...config.series.map((s) => s.value(YEARS))),
    [config]
  )

  return (
    <group position={[0, -2.4, 0]}>
      <gridHelper args={[14, 14, token('hairline-strong'), token('hairline')]} />

      {config.series.map((series, i) => (
        <SeriesBars
          key={series.name}
          series={series}
          zOffset={i === 0 ? -0.9 : 0.9}
          maxValue={maxValue}
          spacing={spacing}
          startX={startX}
          hovered={hovered}
          setHovered={setHovered}
        />
      ))}

      {config.series.map((series, i) => (
        <Label key={series.name} position={[startX - 1.6, 4.6 - i * 0.7, i === 0 ? -0.9 : 0.9]} size="xs" tone={i === 0 ? 'accent' : 'default'}>
          {series.name}
        </Label>
      ))}

      <Label position={[0, 6.1, 0]} tone="accent">
        {config.caption}
      </Label>
      <Label position={[0, -0.5, 0]} size="xs">
        {`year 0 → ${YEARS} · ${config.unit}`}
      </Label>
      {hovered && (
        <Label position={[0, 5.4, 0]} size="xs" tone="accent">
          {config.series.find((s) => hovered.startsWith(s.name))?.note}
        </Label>
      )}
    </group>
  )
}
