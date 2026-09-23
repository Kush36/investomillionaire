import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import Logo from './Logo.jsx'
import Notice from './Notice.jsx'

// Ten link rows that all turned mulberry on hover is the accent working as a
// second body colour. Hover moves ink-2 to ink instead: the link still answers
// the pointer, and the only colour left in the footer is the loss rail on the
// SEBI notice, which is the one thing down here that has to be seen.
const linkClass = 'transition hover:text-ink'

export default function Footer() {
  return (
    <footer className="mt-[var(--space-7)] border-t border-hairline bg-surface-2">
      <div className="mx-auto max-w-7xl px-4 py-[var(--space-6)] sm:px-6">
        {/* This used to say the site never publishes a buy, sell or hold. The analyzer
            now does, so the sentence had to go rather than be defended. What replaces
            it says the same three things the old one was trying to say, and says them
            about what the site actually ships: nobody here is registered, nobody here
            is paid, and the risk lands on the reader either way. */}
        <Notice tone="loss" title="Not SEBI registered. Free, mechanical, and yours to decide." className="mb-[var(--space-6)]">
          InvestoMillionaire is not a SEBI registered investment adviser or research analyst. The analyzer prints a buy,
          sell or hold label, and that label is arithmetic: fixed rules over published exchange filings, shown with every
          row that produced it. No human judgement goes into it and no money comes out of it, because this site charges
          nothing, carries no advertising, takes no affiliate or broker referral, and runs no paid group. Nobody here
          knows your income, your goals or your tax position, so nothing is tailored to any of them. Trading and
          investing can cost you part or all of your capital, and a label computed by a stranger does not change that.
          The decision is yours. Talk to a SEBI registered adviser before you make it.
        </Notice>

        <div className="grid gap-[var(--space-5)] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-[var(--space-3)] max-w-[34ch] text-sm leading-relaxed text-ink-2">
              The Indian stock market, taught in 3D. Built for people who would rather rotate a chart than read a
              textbook.
            </p>
          </div>

          <div>
            <h4 className="eyebrow mb-[var(--space-2)]">Learn</h4>
            <ul className="space-y-[var(--space-1)] text-sm text-ink-2">
              <li><Link to="/learn/fundamental" className={linkClass}>Fundamentals track</Link></li>
              <li><Link to="/learn/technical" className={linkClass}>Technicals track</Link></li>
              <li><Link to="/quiz" className={linkClass}>Levelled quizzes</Link></li>
              <li><Link to="/reco" className={linkClass}>Broker calls</Link></li>
              <li><Link to="/ipo" className={linkClass}>IPO tracker</Link></li>
              <li><Link to="/news" className={linkClass}>Market news</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="eyebrow mb-[var(--space-2)]">Site</h4>
            <ul className="space-y-[var(--space-1)] text-sm text-ink-2">
              <li><Link to="/leaderboard" className={linkClass}>Leaderboard</Link></li>
              <li><Link to="/dashboard" className={linkClass}>Your progress</Link></li>
              <li><Link to="/disclaimer" className={linkClass}>Disclaimer</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="eyebrow mb-[var(--space-2)]">Reach us</h4>
            <a
              href="mailto:investomillionaire@gmail.com"
              className="flex items-center gap-2 text-sm text-ink-2 transition hover:text-ink"
            >
              <Mail size={15} aria-hidden="true" /> investomillionaire@gmail.com
            </a>
            <p className="readout mt-[var(--space-3)] text-[length:var(--text-micro)] text-ink-3">
              Made in India · for Indian markets
            </p>
          </div>
        </div>

        <p className="readout mt-[var(--space-6)] border-t border-hairline pt-[var(--space-4)] text-[length:var(--text-micro)] text-ink-3">
          © {new Date().getFullYear()} InvestoMillionaire. News headlines and images belong to their respective
          publishers.
        </p>
      </div>
    </footer>
  )
}
