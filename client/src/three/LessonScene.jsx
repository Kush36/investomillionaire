import Scene from './Scene.jsx'
import CandleChart3D from './CandleChart3D.jsx'
import Towers3D from './Towers3D.jsx'
import BalanceScale3D from './BalanceScale3D.jsx'
import OrderBook3D from './OrderBook3D.jsx'
import MoatCastle3D from './MoatCastle3D.jsx'
import Scatter3D from './Scatter3D.jsx'
import Compound3D from './Compound3D.jsx'
import PayoffSurface3D from './PayoffSurface3D.jsx'
import Rotation3D from './Rotation3D.jsx'
import BankFlow3D from './BankFlow3D.jsx'
import Funnel3D from './Funnel3D.jsx'
import SessionClock3D from './SessionClock3D.jsx'

const CAMERAS = {
  candles: [0, 2, 10],
  towers: [0, 4.5, 15],
  balance: [0, 3, 13],
  orderbook: [0, 4, 10],
  moat: [0, 4.5, 13],
  scatter: [5, 6, 15],
  compound: [0, 4, 13],
  payoff: [0, 6, 12],
  rotation: [0, 5, 13],
  bankflow: [0, 3.6, 11],
  funnel: [0, 4, 15],
  session: [0, 4, 15],
}

export default function LessonScene({ scene, height = 460 }) {
  const camera = CAMERAS[scene.type] ?? [0, 3, 11]

  return (
    <Scene height={height} camera={camera}>
      {scene.type === 'candles' && <CandleChart3D preset={scene.preset} />}
      {scene.type === 'towers' && <Towers3D preset={scene.preset} bars={scene.bars} caption={scene.caption} unit={scene.unit} />}
      {scene.type === 'balance' && <BalanceScale3D />}
      {scene.type === 'orderbook' && <OrderBook3D />}
      {scene.type === 'moat' && <MoatCastle3D />}
      {scene.type === 'scatter' && <Scatter3D />}
      {scene.type === 'compound' && <Compound3D preset={scene.preset} />}
      {scene.type === 'payoff' && <PayoffSurface3D preset={scene.preset} />}
      {scene.type === 'rotation' && <Rotation3D />}
      {scene.type === 'bankflow' && <BankFlow3D />}
      {scene.type === 'funnel' && <Funnel3D />}
      {scene.type === 'session' && <SessionClock3D />}
    </Scene>
  )
}
