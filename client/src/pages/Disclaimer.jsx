import Seo from '../components/Seo.jsx'

// This page used to say, in clause 02, that we never recommend a specific stock. The
// analyzer now publishes a buy, sell or hold label, so that clause was false the day
// the label shipped. It has been replaced rather than softened: a disclaimer that is
// wrong about the product is worse than no disclaimer, because it is the document a
// reader is entitled to rely on.
//
// What replaces it does three things the old clause could not. It says what the label
// actually is, which is arithmetic over published filings with every row shown. It
// says why the site is allowed to publish one without a registration, which is that it
// takes no money in any form, and states plainly what happens the day that changes.
// And it moves the risk warnings UP the page rather than leaving them below a
// reassurance that no longer holds.
const SECTIONS = [
  {
    heading: 'We are not SEBI registered',
    body: 'InvestoMillionaire is not registered with the Securities and Exchange Board of India as an investment adviser under the SEBI (Investment Advisers) Regulations, 2013, or as a research analyst under the SEBI (Research Analysts) Regulations, 2014. We do not hold any SEBI registration number, and we do not claim one. Read everything below in that light: it is published by people the regulator has not vetted, checked or licensed.',
  },
  {
    heading: 'The analyzer does print a buy, sell or hold label',
    body: 'It prints one, and you should know exactly how little went into it. The label is the band a score fell into, and the score is the sum of fixed rules run over published exchange filings and published closing prices. Every rule that fired is shown next to the label with the points it contributed and the range it could have contributed, so you can strike out any row you disagree with and redo the arithmetic yourself. No person formed a view. No language model wrote a number. Nobody at InvestoMillionaire looked at the company before the label appeared.',
  },
  {
    heading: 'What the label is not',
    body: 'It is not a research report and it is not advice. It is not tailored to your income, your goals, your risk appetite, your time horizon or your tax position, because the analyzer knows none of those things and never asks. It publishes no price to enter at, no price to leave at and no figure for where the price goes next, and those are withheld by design rather than by omission. The label describes measurements taken from data that has already been published. It says nothing about what happens next.',
  },
  {
    heading: 'It is free, and that is load-bearing',
    body: 'We charge nothing for any of this. There is no fee, no subscription, no paywall, no advertising, no affiliate link, no broker referral and no paid group, and we do not sell your data. That matters legally as well as morally: SEBI amended the research analyst rules on 16 December 2024 so that registration turns on providing research services for consideration, and we take no consideration in any form. If that ever changes, the label comes down until there is a registration behind it.',
  },
  {
    heading: 'No tips, no calls, no portfolio management',
    body: 'We do not run a tips service, a Telegram or WhatsApp calls group, a paid signal channel, or a portfolio management service. We do not handle your money, and we will never ask for your trading credentials, demat details or funds. Anyone claiming to offer those things in our name is impersonating us. Report them and tell us.',
  },
  {
    heading: 'Markets carry real risk, and a label does not reduce it',
    body: 'Investing and trading in securities carries the risk of losing part or all of your capital. Past performance of any stock, index, strategy, pattern or score is not a reliable indicator of future results, and neither is a breakout, a chart shape or a run of good quarters. Leveraged products such as futures and options can lose more than the amount you commit. SEBI studies have repeatedly found that the large majority of individual traders in the equity derivatives segment lose money, with aggregate losses running into thousands of crores in a single year. A mechanical label computed by an unregistered party changes none of that arithmetic.',
  },
  {
    heading: 'The data has holes, and we show you where',
    body: 'Free public sources do not publish everything a paid terminal does. No free feed carries intraday prices for NSE equities, the foreign and domestic institutional split for a single company, promoter pledge data, or a quarterly balance sheet. Every report names the figures it could not verify and the reason each one was unavailable, and it never estimates, interpolates or borrows a number from a comparable company to fill a gap. A report with a short section is a report about a company the public record says less about.',
  },
  {
    heading: 'The decision is yours, and so is the outcome',
    body: 'Nothing here executes a trade, sizes a position, or knows whether you can afford to lose what you are about to commit. If you act on anything on this site you are acting on your own account and at your own risk, and the loss, if there is one, is yours alone. Read the rows. Disagree with them. Check them against the filings we link to. That is what the page is for.',
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
    body: 'Before you invest, speak to a SEBI registered investment adviser or a qualified financial professional who can look at your full financial picture. You can verify anyone’s registration on the SEBI website. Every decision you make on your own account remains entirely yours.',
  },
]

export default function Disclaimer() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-[var(--space-7)] sm:px-6">
      <Seo title="Disclaimer" description="InvestoMillionaire is not a SEBI registered investment adviser or research analyst. The analyzer publishes a mechanical buy, sell or hold label, free of charge, and the decision is yours." />

      {/* The page's one voice moment. The alert icon that used to sit beside the
          title has gone: a legal notice that has to shout with a glyph before the
          first word is read is not a document, it is a banner. */}
      <h1 className="display">Disclaimer</h1>
      <p className="prose mt-[var(--space-4)]">Read this before you use anything on the site, and read clauses 02 to 04 before you read a single report. They say what the analyzer publishes, what it refuses to publish, and why it is free.</p>

      {/* Numbered clauses in a mono gutter, under a single rule. This is what
          makes the page read as a printed instrument rather than a stack of blog
          headings: the reader can cite clause 04, and the numerals are set in the
          readout face so they share one column edge all the way down.

          The rule is a border on this container rather than an <hr>, because an
          hr needs border-0 plus border-t and those are two width utilities in one
          layer — whichever Tailwind emits last wins, which is not a bet worth
          taking for a line. */}
      <div className="mt-[var(--space-6)] space-y-[var(--space-6)] border-t border-hairline pt-[var(--space-6)]">
        {SECTIONS.map((section, i) => (
          <section key={section.heading} className="sm:grid sm:grid-cols-[var(--space-6)_1fr]">
            <span className="readout mb-[var(--space-1)] block text-[length:var(--text-micro)] text-ink-3 sm:mt-[0.4rem] sm:mb-0">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <h2>{section.heading}</h2>
              <p className="prose mt-[var(--space-2)]">{section.body}</p>
            </div>
          </section>
        ))}
      </div>

      {/* Not `prose` here: prose declares its own font-size, and overriding one
          utility with another is a source-order bet. Measure and colour by hand,
          size from the token. */}
      <p className="mt-[var(--space-6)] max-w-[var(--measure)] border-t border-hairline pt-[var(--space-4)] text-[length:var(--text-small)] text-ink-2">
        Questions about any of this? Write to{' '}
        <a href="mailto:investomillionaire@gmail.com" className="text-accent underline underline-offset-4">
          investomillionaire@gmail.com
        </a>
        .
      </p>
    </div>
  )
}
