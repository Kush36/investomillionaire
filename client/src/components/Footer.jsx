import { Link } from 'react-router-dom'
import { Mail, ShieldAlert } from 'lucide-react'
import Logo from './Logo.jsx'

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-white/5 bg-ink-soft">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mb-10 flex items-start gap-4 rounded-2xl border border-flame/25 bg-flame/5 p-5">
          <ShieldAlert className="mt-0.5 shrink-0 text-flame" size={22} />
          <div>
            <p className="text-sm font-bold text-flame">Not SEBI registered. Education only.</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60">
              InvestoMillionaire is not a SEBI registered investment adviser or research analyst. Nothing here is a buy,
              sell or hold recommendation, and no stock is ever tipped. Everything on this site exists to teach you how
              the Indian market works so you can make your own decisions. Markets carry real risk of loss. Talk to a SEBI
              registered adviser before you invest.
            </p>
          </div>
        </div>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/50">
              The Indian stock market, taught in 3D. Built for people who would rather rotate a chart than read a
              textbook.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-bold tracking-widest text-white/40 uppercase">Learn</h4>
            <ul className="space-y-2 text-sm text-white/60">
              <li><Link to="/learn/fundamental" className="hover:text-gold">Fundamentals track</Link></li>
              <li><Link to="/learn/technical" className="hover:text-gold">Technicals track</Link></li>
              <li><Link to="/quiz" className="hover:text-gold">Levelled quizzes</Link></li>
              <li><Link to="/reco" className="hover:text-gold">Broker calls</Link></li>
              <li><Link to="/ipo" className="hover:text-gold">IPO tracker</Link></li>
              <li><Link to="/news" className="hover:text-gold">Market news</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-bold tracking-widest text-white/40 uppercase">Site</h4>
            <ul className="space-y-2 text-sm text-white/60">
              <li><Link to="/leaderboard" className="hover:text-gold">Leaderboard</Link></li>
              <li><Link to="/dashboard" className="hover:text-gold">Your progress</Link></li>
              <li><Link to="/disclaimer" className="hover:text-gold">Disclaimer</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-bold tracking-widest text-white/40 uppercase">Reach us</h4>
            <a
              href="mailto:investomillionaire@gmail.com"
              className="flex items-center gap-2 text-sm text-white/60 transition hover:text-gold"
            >
              <Mail size={15} /> investomillionaire@gmail.com
            </a>
            <p className="mt-4 font-mono text-xs text-white/30">Made in India · for Indian markets</p>
          </div>
        </div>

        <p className="mt-12 border-t border-white/5 pt-6 text-xs text-white/30">
          © {new Date().getFullYear()} InvestoMillionaire. News headlines and images belong to their respective
          publishers.
        </p>
      </div>
    </footer>
  )
}
