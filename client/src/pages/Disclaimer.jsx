import { ShieldAlert } from 'lucide-react'
import Seo from '../components/Seo.jsx'

const SECTIONS = [
  {
    heading: 'We are not SEBI registered',
    body: 'InvestoMillionaire is not registered with the Securities and Exchange Board of India as an investment adviser under the SEBI (Investment Advisers) Regulations, 2013, or as a research analyst under the SEBI (Research Analysts) Regulations, 2014. We do not hold any SEBI registration number, and we do not claim one.',
  },
  {
    heading: 'Education, not advice',
    body: 'Everything on this site is general educational material about how the Indian securities market works. It is not investment advice, it is not a research report, and it is not tailored to your income, goals, risk appetite or tax situation. We never recommend a specific stock, and we will never ask you to buy or sell anything.',
  },
  {
    heading: 'No tips, no calls, no portfolio management',
    body: 'We do not run a tips service, a Telegram or WhatsApp calls group, a paid signal channel, or a portfolio management service. We do not handle your money, and we will never ask for your trading credentials, demat details or funds. Anyone claiming to offer those things in our name is impersonating us.',
  },
  {
    heading: 'Markets carry real risk',
    body: 'Investing and trading in securities carries the risk of losing part or all of your capital. Past performance of any stock, index, strategy or pattern is not a reliable indicator of future results. Leveraged products such as futures and options can lose more than the amount you commit, and SEBI studies have repeatedly found that most individual traders in these segments lose money.',
  },
  {
    heading: 'About the news feed',
    body: 'Headlines shown on the News page are pulled from public RSS feeds published by The Economic Times, Livemint, Business Standard and BusinessLine. Those headlines, summaries and images belong to their respective publishers, and we link back to the original article. We do not edit them, verify them, or endorse them, and we are not responsible for their accuracy.',
  },
  {
    heading: 'Accuracy and changes',
    body: 'Market rules change. Settlement cycles, tax rates, regulations and index constituents are all revised from time to time. We try to keep the lessons current, but you should verify any regulatory or tax detail with the official SEBI, NSE, BSE or Income Tax Department source before acting on it.',
  },
  {
    heading: 'Talk to a registered professional',
    body: 'Before you invest, speak to a SEBI registered investment adviser or a qualified financial professional who can look at your full financial picture. You can verify anyone registration on the SEBI website. Every decision you make on your own account remains entirely yours.',
  },
]

export default function Disclaimer() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <Seo title="Disclaimer" description="InvestoMillionaire is not a SEBI registered investment adviser or research analyst. Educational content only." />
      <div className="flex items-center gap-3">
        <ShieldAlert className="text-flame" size={28} />
        <h1 className="text-4xl font-extrabold sm:text-5xl">Disclaimer</h1>
      </div>
      <p className="mt-4 text-lg text-white/60">
        Read this before you use anything on the site. It is short and it matters.
      </p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-bold text-gold">{section.heading}</h2>
            <p className="mt-3 leading-relaxed text-white/65">{section.body}</p>
          </section>
        ))}
      </div>

      <div className="glass mt-12 rounded-2xl p-6">
        <p className="text-sm text-white/60">
          Questions about any of this? Write to{' '}
          <a href="mailto:investomillionaire@gmail.com" className="font-semibold text-gold hover:underline">
            investomillionaire@gmail.com
          </a>
          .
        </p>
      </div>
    </div>
  )
}
