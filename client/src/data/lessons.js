// Every lesson maps to one of five reusable 3D scenes via `scene`.
export const LESSONS = {
  fundamental: [
    {
      id: 'f1',
      level: 1,
      title: 'What You Actually Own',
      subtitle: 'Shares, exchanges, indices and the plumbing behind them',
      minutes: 8,
      scene: { type: 'towers', preset: 'marketcap' },
      sections: [
        {
          heading: 'A share is a slice of a business',
          body: 'Forget the blinking green and red numbers for a minute. When you buy one share of Asian Paints you own a real, if tiny, piece of factories, paint formulas, dealer relationships and future profits. The price on your screen is just what the last two people agreed that slice was worth.',
          bullets: [
            'Ownership gives you a claim on profits, usually paid out as dividends.',
            'It also gives you voting rights on major company decisions.',
            'Your downside is capped at what you invested. Your upside is not capped.',
          ],
        },
        {
          heading: 'Where the trading happens',
          body: 'India runs two main stock exchanges. NSE is the larger by volume and hosts the Nifty. BSE is Asia oldest exchange and hosts the Sensex. Both are just marketplaces, matching buyers to sellers thousands of times a second.',
          bullets: [
            'NSE — National Stock Exchange, home of the Nifty 50.',
            'BSE — Bombay Stock Exchange, home of the Sensex 30.',
            'SEBI regulates both. It writes the rules and punishes those who break them.',
          ],
        },
        {
          heading: 'The three accounts you need',
          body: 'People mix these up constantly. A bank account holds your money. A trading account is the interface that places orders. A demat account holds the shares themselves in electronic form, parked with a depository, NSDL or CDSL. Your broker is the wiring between all three.',
        },
        {
          heading: 'Indices are the market mood ring',
          body: 'Nifty 50 tracks 50 of the biggest NSE-listed companies, weighted by free-float market cap. When someone says "the market fell today", they almost always mean the Nifty or the Sensex fell. It is a summary, not the whole market. On plenty of red Nifty days, hundreds of smaller stocks close green.',
          example: {
            title: 'Market cap, in real numbers',
            body: 'A company with 100 crore shares outstanding trading at Rs 250 has a market cap of Rs 25,000 crore. That is the rank SEBI uses. Top 100 by market cap are large caps, 101 to 250 are mid caps, and everything from 251 down is small cap.',
          },
        },
      ],
      terms: [
        { term: 'Free float', meaning: 'The portion of shares actually available to public investors, excluding promoter and locked-in holdings.' },
        { term: 'Depository', meaning: 'NSDL or CDSL. They hold shares electronically, so your broker cannot simply lose them.' },
        { term: 'Ticker', meaning: 'The short trading symbol for a stock, like RELIANCE or TCS.' },
      ],
    },
    {
      id: 'f2',
      level: 2,
      title: 'How a Trade Actually Works',
      subtitle: 'IPOs, order types, the order book and T+1 settlement',
      minutes: 9,
      scene: { type: 'orderbook' },
      sections: [
        {
          heading: 'Primary versus secondary market',
          body: 'In the primary market the company itself sells new shares and keeps the money. That is an IPO or an FPO. In the secondary market you buy from another investor, and the company gets nothing. Almost everything you will ever do happens in the secondary market.',
        },
        {
          heading: 'The order book is the real price',
          body: 'At any moment there is a stack of buy orders (bids) and sell orders (asks). The highest bid and lowest ask define the spread. A liquid stock has a spread of a few paise. An illiquid small cap can have a spread of several rupees, and that gap is a hidden cost you pay on entry and again on exit.',
          bullets: [
            'Market order — fills immediately at whatever price is available. Fast, but you accept the price.',
            'Limit order — fills only at your price or better. Controls cost, may never execute.',
            'Stop-loss order — sits dormant and triggers only when price hits your pain threshold.',
          ],
        },
        {
          heading: 'Settlement: T+1',
          body: 'India moved to a T+1 settlement cycle in January 2023, ahead of most of the world, and now runs an optional same-day T+0 cycle for selected stocks. Buy on Monday and the shares land in your demat on Tuesday. Sell on Monday and the money is usable Tuesday.',
        },
        {
          heading: 'Circuits and the costs nobody mentions',
          body: 'Circuit filters cap how far a stock can move in a session, which stops panic from feeding on itself. Meanwhile every trade quietly leaks money: brokerage, STT, exchange fees, GST, stamp duty and SEBI charges. On small intraday trades these costs can exceed the profit you were chasing.',
          example: {
            title: 'What an IPO price band means',
            body: 'A company announces a band of Rs 300 to Rs 315. You bid anywhere in that range or at cut-off. Book building collects all bids, and the final price is set from where demand actually is. Oversubscribed issues then allot by lottery, so a full application is no guarantee of allotment.',
          },
        },
      ],
      terms: [
        { term: 'Liquidity', meaning: 'How easily you can buy or sell size without moving the price against yourself.' },
        { term: 'Slippage', meaning: 'The gap between the price you expected and the price you actually got.' },
        { term: 'Cut-off price', meaning: 'An IPO bid option where you accept whatever final price the book discovers.' },
      ],
    },
    {
      id: 'f3',
      level: 3,
      title: 'Reading the Three Statements',
      subtitle: 'Profit and loss, balance sheet, cash flow',
      minutes: 12,
      scene: { type: 'balance' },
      sections: [
        {
          heading: 'Profit is an opinion. Cash is a fact.',
          body: 'Every listed company publishes three statements each quarter. The P&L shows performance across a period. The balance sheet is a snapshot on one date. The cash flow statement tracks money that actually moved. Accounting rules leave real room for judgement in the first two. The third is much harder to dress up.',
        },
        {
          heading: 'The balance sheet identity',
          body: 'Assets = Liabilities + Equity. Always. Everything the company controls was funded either by borrowing or by owners. If a company has Rs 5,000 crore in assets and Rs 3,000 crore in liabilities, shareholders own Rs 2,000 crore of book value.',
          bullets: [
            'Assets — cash, inventory, receivables, plant, investments, goodwill.',
            'Liabilities — debt, payables, provisions, deferred tax.',
            'Equity — share capital plus retained earnings built up over the years.',
          ],
        },
        {
          heading: 'Walking down the P&L',
          body: 'Revenue at the top. Subtract cost of goods sold to get gross profit. Subtract operating expenses to get operating profit, often reported as EBITDA. Subtract depreciation, interest and tax and you land at net profit, which divided by share count gives EPS.',
        },
        {
          heading: 'The cash flow reality check',
          body: 'Cash flow splits into three buckets. Operating is cash from the actual business. Investing is capex and acquisitions. Financing is debt raised or repaid and dividends paid. A company reporting strong profit while operating cash flow keeps shrinking is the single most common pattern before an accounting blow-up.',
          example: {
            title: 'The receivables tell',
            body: 'Revenue grows 10 percent but receivables grow 60 percent. Sales are being booked without cash arriving. Sometimes it is a genuine timing issue. Sometimes it is channel stuffing. Either way it belongs in your notes before you buy.',
          },
        },
        {
          heading: 'Read the notes. Seriously.',
          body: 'Contingent liabilities, related party transactions, auditor qualifications and pledged shares all live in the notes to accounts, never in the headline numbers. This is where the uncomfortable truth hides, and it is exactly the part retail investors skip.',
        },
      ],
      terms: [
        { term: 'EBITDA', meaning: 'Earnings before interest, tax, depreciation and amortisation. An operating proxy, not cash flow.' },
        { term: 'Free cash flow', meaning: 'Operating cash flow minus capital expenditure. What is genuinely left for owners.' },
        { term: 'Consolidated', meaning: 'Results including all subsidiaries. Always prefer it over standalone for a group.' },
      ],
    },
    {
      id: 'f4',
      level: 4,
      title: 'Ratios That Actually Matter',
      subtitle: 'PE, PB, ROE, ROCE, leverage and valuation sanity',
      minutes: 11,
      scene: { type: 'towers', preset: 'valuation' },
      sections: [
        {
          heading: 'Ratios are questions, not verdicts',
          body: 'A PE of 12 does not mean cheap and a PE of 70 does not mean expensive. Ratios exist to make you ask why. Why is this business priced at half its sector? Why does the market pay up for that one? Answering the why is the actual work.',
        },
        {
          heading: 'Valuation ratios',
          bullets: [
            'PE = price / earnings per share. What you pay for one rupee of yearly profit.',
            'PB = price / book value. Genuinely useful for banks and asset-heavy firms, near useless for asset-light services.',
            'PEG = PE / earnings growth rate. Asks whether the growth justifies the price.',
            'EV/EBITDA — includes debt, so it compares two companies with different leverage more fairly.',
          ],
          body: 'Always compare a ratio to the same company history and to its direct peers. Comparing an IT firm PE to a steel producer PE tells you nothing at all.',
        },
        {
          heading: 'Quality ratios',
          body: 'These reveal whether the business is any good, independent of price. ROE is net profit over shareholder equity. ROCE is operating profit over all capital employed, debt included, so leverage cannot flatter it. A business compounding at 20 percent-plus ROCE for a decade is genuinely rare.',
        },
        {
          heading: 'Leverage and payout',
          body: 'Debt-to-equity above roughly 1 in a cyclical business is a risk you must actively justify. Interest coverage, which is EBIT divided by interest expense, tells you whether profits comfortably cover the interest bill. Below 2 is uncomfortable. Dividend yield is dividend per share over price, while payout ratio is the share of profit distributed.',
          example: {
            title: 'The cyclical trap',
            body: 'A steel company posts record profits at the peak of the commodity cycle, so its PE collapses to 5 and screens flag it as cheap. Then the cycle turns, earnings drop 80 percent, and that PE of 5 becomes a PE of 25 on a falling price. Low PE at a cyclical peak is a trap, not a bargain.',
          },
        },
      ],
      terms: [
        { term: 'Book value', meaning: 'Shareholder equity per share. The accounting value of your slice.' },
        { term: 'Interest coverage', meaning: 'EBIT / interest expense. How many times over the profits cover the interest bill.' },
        { term: 'Enterprise value', meaning: 'Market cap plus net debt. What buying the entire business would truly cost.' },
      ],
    },
    {
      id: 'f5',
      level: 5,
      title: 'Moats, Cycles and Corporate Actions',
      subtitle: 'Business quality, macro forces and what corporate events do to your holding',
      minutes: 12,
      scene: { type: 'moat' },
      sections: [
        {
          heading: 'What keeps competitors out',
          body: 'A moat is a durable advantage that stops rivals from copying a business and competing its profits away. Without one, high returns attract competition and returns fall back to average. With one, they can persist for decades.',
          bullets: [
            'Brand — people pay more for the same product because of the name.',
            'Network effects — each new user makes the service better for every other user.',
            'Switching costs — leaving is painful, expensive or risky.',
            'Cost advantage — structurally cheaper production, so you win a price war.',
            'Regulatory or licence protection — legal barriers competitors cannot cross.',
          ],
        },
        {
          heading: 'Sectors move in cycles',
          body: 'Metals, real estate, autos and capital goods swing hard with the economy. FMCG, pharma and utilities are defensive because people buy soap and medicine in every kind of year. Knowing which type you hold tells you whether a 40 percent drawdown is a crisis or just Tuesday for that sector.',
        },
        {
          heading: 'Macro forces you should track',
          bullets: [
            'RBI repo rate — higher rates squeeze rate-sensitive sectors and leveraged balance sheets.',
            'Rupee versus dollar — a weak rupee helps IT and pharma exporters, hurts importers and airlines.',
            'Crude oil — India imports most of its oil, so high crude pressures inflation and margins broadly.',
            'FII and DII flows — foreign selling can drag good companies down alongside bad ones.',
          ],
        },
        {
          heading: 'Corporate actions decoded',
          body: 'A bonus issue gives free shares and proportionally cuts the price, leaving value unchanged. A split reduces face value and multiplies share count, also value neutral. A buyback shrinks share count so each remaining share owns more, which creates value only if the price paid was sensible. A rights issue offers existing holders new shares at a discount, and ignoring it dilutes you.',
          example: {
            title: 'Governance red flags worth memorising',
            body: 'Heavy promoter pledging, auditor resignation mid-year, repeated related-party transactions, frequent CFO churn, and profits that never convert into operating cash. Any one deserves scrutiny. Two together usually means walk away.',
          },
        },
      ],
      terms: [
        { term: 'Promoter pledging', meaning: 'Promoters using their shares as loan collateral. A price fall can force lender selling.' },
        { term: 'Rights issue', meaning: 'New shares offered to existing holders at a discount, in proportion to their holding.' },
        { term: 'Defensive sector', meaning: 'One whose demand barely changes with the economic cycle.' },
      ],
    },
    {
      id: 'f6',
      level: 6,
      title: 'Everything That Is Not a Stock',
      subtitle: 'Mutual funds, ETFs, bonds, gold, REITs and where each one fits',
      minutes: 12,
      scene: { type: 'scatter' },
      sections: [
        {
          heading: 'Stocks are one tool, not the whole box',
          body: 'Most people start with direct stocks because that is what the internet shouts about. In practice a working portfolio uses several instruments, each doing a job the others cannot. The question is never which one is best. It is which one fits the goal, the horizon and how much volatility you can actually sit through.',
        },
        {
          heading: 'Mutual funds and ETFs',
          body: 'A mutual fund pools money and buys a basket. You transact at the day-end NAV, not at a live price. An ETF holds the same kind of basket but trades on the exchange through your demat account, so it needs a buyer on the other side and can drift slightly from its NAV.',
          bullets: [
            'Active fund — a manager picks stocks and charges more for trying to beat the index.',
            'Index fund — mechanically copies the Nifty or Sensex at a fraction of the cost.',
            'Direct plan — same portfolio as the regular plan, minus distributor commission. Always prefer it.',
            'ELSS — equity fund with a three year lock-in, eligible for Section 80C under the old regime.',
          ],
        },
        {
          heading: 'Debt: lending instead of owning',
          body: 'A bond makes you a lender. You get a fixed coupon and your principal back at maturity, and you rank ahead of shareholders if things go wrong. The catch is interest rate risk: when new bonds start paying more, the older low-coupon bond in your hand must fall in price to stay competitive. Longer maturity means a sharper fall.',
          example: {
            title: 'Why a safe bond can still lose you money',
            body: 'You hold a 10 year government bond paying 7 percent. Rates move to 8 percent. Nobody will buy your 7 percent bond at par when they can get 8 percent fresh, so its market price drops. Hold to maturity and you still get your money. Sell early and you book that loss.',
          },
        },
        {
          heading: 'Gold, REITs and InvITs',
          body: 'Gold pays nothing and produces nothing, which is exactly why it holds up when everything else is falling. Sovereign gold bonds add an interest coupon and remove storage and purity risk. REITs give you a slice of rent-generating commercial property, and InvITs the infrastructure version, roads and transmission lines. Both pass most of their cash flow through to unitholders, so they behave more like income assets than growth assets.',
        },
        {
          heading: 'Matching instrument to horizon',
          bullets: [
            'Money you need within a year — savings account or liquid fund. Never equity.',
            'One to three years — short duration debt or a fixed deposit.',
            'Three to five years — hybrid or conservative allocation.',
            'Five years and beyond — equity, mostly through index or diversified funds.',
          ],
          body: 'The single most common retail mistake is putting a two year goal into small cap equity because the last two years looked great. Horizon decides the instrument. Returns do not get a vote.',
        },
      ],
      terms: [
        { term: 'NAV', meaning: 'Net asset value per unit of a fund, calculated after the market closes.' },
        { term: 'Expense ratio', meaning: 'Annual fee a fund charges, deducted daily from NAV whether it performs or not.' },
        { term: 'Duration', meaning: 'How sharply a bond price reacts to a change in interest rates.' },
      ],
    },
    {
      id: 'f7',
      level: 7,
      title: 'Compounding and the Portfolio',
      subtitle: 'CAGR, XIRR, SIPs, allocation and rebalancing',
      minutes: 12,
      scene: { type: 'compound', preset: 'growth' },
      sections: [
        {
          heading: 'Time does the heavy lifting',
          body: 'Compounding is not a clever trick, it is arithmetic that turns brutal in your favour if you leave it alone. The diagram above runs the same Rs 10,000 monthly SIP at the same 12 percent, started ten years apart. The gap at the end is not ten years of contributions. It is ten years of growth on top of growth, and no amount of stock picking closes it.',
        },
        {
          heading: 'Measuring returns honestly',
          bullets: [
            'Absolute return — total gain. Useless without a time period attached.',
            'CAGR — the smoothed annual rate. Correct only for a single lumpsum.',
            'XIRR — the right measure for SIPs and any uneven cash flow. Every rupee is weighted by how long it stayed invested.',
            'Rule of 72 — divide 72 by the annual rate for a quick doubling time. At 12 percent, six years.',
          ],
        },
        {
          heading: 'Allocation beats selection',
          body: 'How you split money across equity, debt, gold and cash explains far more of your outcome than which particular stock you picked. A simple rule to start from is holding your age in percentage terms in debt, adjusted for how much volatility you genuinely tolerate. The right allocation is the one you will not abandon in a 30 percent drawdown.',
        },
        {
          heading: 'Rebalancing is mechanical selling high',
          body: 'Set target weights, say 70 equity and 30 debt. After a strong run equity drifts to 82 percent and your portfolio is riskier than you chose. Rebalancing trims the winner back to 70 and moves the proceeds into the laggard. It feels wrong every single time, which is precisely why it works. Once a year, or when a weight drifts more than 5 percentage points, is plenty.',
          example: {
            title: 'What diversification can and cannot do',
            body: 'Holding 40 stocks across 12 sectors removes the risk that one fraud or one failed product ruins you. It does nothing about a market-wide fall, because in a real crash correlations go to one and everything drops together. Diversification protects against company risk, not market risk. Only your allocation to debt and cash does that.',
          },
        },
        {
          heading: 'Build the base before the portfolio',
          body: 'Before any of this: an emergency fund of roughly six months of expenses in something you can reach within a day, adequate term insurance if anyone depends on your income, and no high-interest debt. Equity returns of 12 percent mean nothing while a credit card charges you 36.',
        },
      ],
      terms: [
        { term: 'XIRR', meaning: 'Annualised return that accounts for the timing and size of every cash flow.' },
        { term: 'Rebalancing', meaning: 'Restoring target asset weights by trimming winners and adding to laggards.' },
        { term: 'Drawdown tolerance', meaning: 'The fall you can live through without selling. The real constraint on your allocation.' },
      ],
    },
    {
      id: 'f8',
      level: 8,
      title: 'Tax, Costs and the Investor in the Mirror',
      subtitle: 'What the taxman takes, what fees quietly eat, and what your own brain costs you',
      minutes: 12,
      scene: { type: 'compound', preset: 'drag' },
      sections: [
        {
          heading: 'Capital gains on listed equity',
          body: 'Hold listed equity or an equity mutual fund for more than 12 months and the gain is long term. Below that it is short term and taxed at a higher rate. Long term gains carry an annual exemption, raised to Rs 1.25 lakh in the July 2024 budget, and only the excess is taxed. Rates and thresholds change with almost every budget, so confirm the current numbers before you act.',
          bullets: [
            'Holding period for listed equity: 12 months.',
            'Long term gains are exempt up to Rs 1.25 lakh a financial year.',
            'Debt fund units bought on or after 1 April 2023 are taxed at your slab regardless of holding period.',
            'Dividends are taxed at your slab in your hands, with TDS deducted above a threshold.',
          ],
        },
        {
          heading: 'Harvesting losses, legally',
          body: 'If you are sitting on a realised gain and also hold a genuine loser, selling the loser books a loss that offsets the gain in the same financial year. Short term capital losses can be set off against both short and long term gains, and unabsorbed losses carry forward for eight years provided you file the return on time. Only buy the position back if the original reason to own it still stands.',
        },
        {
          heading: 'The cost drag nobody feels',
          body: 'The diagram above runs identical returns through two fee levels. A 1.5 percentage point difference in annual cost does not sound like much, and across twenty years it can quietly remove a fifth of the final corpus. Fees compound exactly the way returns do, just against you. Brokerage, STT, GST, stamp duty and expense ratios are all leaks in the same bucket.',
        },
        {
          heading: 'The four biases that cost the most',
          bullets: [
            'Loss aversion — a loss hurts far more than an equal gain feels good, so people hold losers and sell winners.',
            'Anchoring — refusing to sell below your purchase price. The market has no idea what you paid.',
            'Recency bias — assuming the last two years repeat forever, which is why small cap SIPs peak right after small cap rallies.',
            'Herding — buying because everyone is buying, which by definition means buying late.',
          ],
        },
        {
          heading: 'The one page that fixes most of it',
          body: 'Write down, while calm, what you own and why, your target allocation, what would make you sell, and what you will do in a 30 percent fall. That single page is the cheapest risk control available, because every rule you did not write in advance becomes negotiable at exactly the wrong moment.',
          example: {
            title: 'Survivorship bias in every performance table',
            body: 'A category average showing 15 percent over ten years has quietly dropped the funds that performed so badly they were merged away. The survivors define the average. This is why a fund that beat its category is a weaker claim than it first appears.',
          },
        },
      ],
      terms: [
        { term: 'STCG and LTCG', meaning: 'Short and long term capital gains, split by how long you held the asset.' },
        { term: 'Tax loss harvesting', meaning: 'Booking a real loss to offset a realised gain in the same financial year.' },
        { term: 'Fee drag', meaning: 'The compounding cost of annual charges, invisible year to year and large across decades.' },
      ],
    },
    {
      id: 'f9',
      level: 9,
      title: 'Banks and NBFCs Are a Different Animal',
      subtitle: 'NIM, CASA, bad loans, provisions and why your usual ratios break',
      minutes: 13,
      scene: { type: 'bankflow' },
      sections: [
        {
          heading: 'Why this needs its own lesson',
          body: 'Financials are the single largest block in the Nifty, so most Indian portfolios own several of them whether or not the owner meant to. And almost every ratio from the earlier levels either misleads you here or stops working. A bank does not manufacture anything. It rents money, and its inventory is credit risk.',
        },
        {
          heading: 'Follow the spread',
          body: 'The diagram above traces one rupee through a lender. Deposits come in, most of them get lent out, interest is earned on the loans and paid on the deposits, and the gap between those two is net interest income. Expressed against average earning assets it becomes net interest margin, the number every bank analyst starts with.',
          bullets: [
            'CASA ratio — current and savings deposits as a share of total. These pay little or no interest, so a high CASA is a structural cost advantage.',
            'Credit-deposit ratio — how much of the deposit base is actually lent out, usually 70 to 80 percent.',
            'Cost of funds versus yield on advances — the two ends of the spread, worth tracking separately.',
          ],
        },
        {
          heading: 'The bad loan vocabulary',
          body: 'A loan turns into a non-performing asset once interest or principal is overdue by 90 days under RBI norms. Before that it sits in special mention accounts, which is where the early warning lives. Gross NPA is the full bad book. Net NPA is what remains after provisions already taken. Provision coverage ratio tells you how much of the damage is pre-funded, and credit cost is the annual provision charge as a share of the loan book.',
          example: {
            title: 'Why the profit line lies about lenders',
            body: 'A bank grows profit 25 percent for four straight years by lending aggressively, then the cycle turns and one year of provisions erases all of it. This is why price-to-book is the standard lens for banks rather than price-to-earnings. Earnings are a cyclical opinion here, book value moves far more slowly.',
          },
        },
        {
          heading: 'Capital is the shock absorber',
          body: 'Capital adequacy ratio measures capital against risk-weighted assets. It is the buffer between depositors and a lending mistake, and RBI sets the floor under the Basel framework. A bank running close to the minimum has to either slow lending or raise equity, and raising equity at a low price dilutes you.',
        },
        {
          heading: 'NBFCs carry one extra risk',
          body: 'A non-banking finance company lends like a bank but cannot take deposits the same way, so it funds itself in the market. That creates asset liability mismatch: borrowing short and lending long. The loans can be perfectly healthy while the funding simply stops rolling over. Several Indian NBFC failures were liquidity events, not credit events, and the distinction matters when you read the risk section.',
        },
      ],
      terms: [
        { term: 'NIM', meaning: 'Net interest margin. Net interest income over average earning assets.' },
        { term: 'PCR', meaning: 'Provision coverage ratio. How much of the bad book is already provided for.' },
        { term: 'ALM mismatch', meaning: 'Funding short term while lending long term. The classic NBFC failure mode.' },
      ],
    },
    {
      id: 'f10',
      level: 10,
      title: 'Researching a Company End to End',
      subtitle: 'From five thousand listed names down to the handful you would actually own',
      minutes: 13,
      scene: { type: 'funnel' },
      sections: [
        {
          heading: 'The funnel, not the tip',
          body: 'Around five thousand companies are listed in India. You will never own more than a few dozen. The work is a sequence of filters, each cheaper than the one after it, so the expensive reading only happens on names that survived the cheap tests. Rotate the funnel above to see roughly how brutal the narrowing is.',
        },
        {
          heading: 'Step one, a numeric screen',
          body: 'Free screeners let you filter the whole market in seconds. Reasonable starting filters are consistent ROCE, manageable debt, positive operating cash flow across several years, and enough daily volume that you could exit. A screen is a filter, never a decision. It cannot see a lawsuit, a promoter, or an industry about to be disrupted.',
        },
        {
          heading: 'Step two, understand the business',
          body: 'Before any valuation, answer three plain questions in your own words. What does this company sell, and to whom? Why does the customer choose it over the alternative? What would have to go wrong for it to stop working? If you cannot answer those without jargon, no ratio will rescue the decision.',
        },
        {
          heading: 'Step three, read the actual documents',
          bullets: [
            'Management discussion and analysis, read across three years side by side. Promises that quietly vanish tell you a lot.',
            'Notes to accounts: contingent liabilities, related party transactions, auditor qualifications.',
            'Earnings call transcripts, where analysts ask unscripted questions. The deflected ones matter most.',
            'Shareholding pattern each quarter, tracking promoter, FII and DII movement and any pledge.',
          ],
        },
        {
          heading: 'The red flag checklist',
          body: 'None of these is proof on its own. Two of them together usually means walk away.',
          bullets: [
            'Profit consistently far above operating cash flow.',
            'Receivables or inventory growing much faster than revenue.',
            'Auditor resignation or a qualified opinion.',
            'Rising promoter pledge, or frequent CFO changes.',
            'Large related party transactions with no clear commercial logic.',
            'Contingent liabilities that are big relative to net worth.',
          ],
          example: {
            title: 'Price comes last',
            body: 'Valuation is the final question, not the first. A great business at an absurd price is a poor investment, and a cheap price on a business you cannot explain is not an edge. Answer what it is worth only after you know what it does and whether the accounts can be trusted.',
          },
        },
      ],
      terms: [
        { term: 'RHP and annual report', meaning: 'Free on SEBI and exchange sites. The primary sources, not somebody summary of them.' },
        { term: 'Concall transcript', meaning: 'The written record of the earnings call. Usually more useful than the presentation.' },
        { term: 'Cash conversion', meaning: 'Operating cash flow measured against reported net profit.' },
      ],
    },
  ],

  technical: [
    {
      id: 't1',
      level: 1,
      title: 'Charts 101',
      subtitle: 'Candlesticks, OHLC, timeframes and volume',
      minutes: 8,
      scene: { type: 'candles', preset: 'basic' },
      sections: [
        {
          heading: 'One candle, four numbers',
          body: 'Each candle compresses a period of trading into four values: open, high, low and close. The body spans open to close. The thin wicks reach the extremes. Green means the close finished above the open, red means below.',
          bullets: [
            'Long body — one side dominated the whole session.',
            'Long upper wick — price pushed up and got sold back down.',
            'Long lower wick — price dropped and buyers absorbed it.',
            'Tiny body with wicks on both sides — a fight with no winner.',
          ],
        },
        {
          heading: 'Timeframe changes everything',
          body: 'The same stock looks bullish on a weekly chart and bearish on a 15-minute chart, and both readings are correct for their horizon. Shorter timeframes carry more noise per signal. Pick a timeframe that matches how long you actually intend to hold, then stop flipping between them mid-trade.',
        },
        {
          heading: 'Volume is the conviction meter',
          body: 'Price tells you what happened. Volume tells you how many people meant it. A 5 percent move on triple the average volume is a genuine shift in participation. The same move on half the usual volume is often noise that fades within days.',
          example: {
            title: 'Reading a real candle',
            body: 'Open 1,000, high 1,050, low 995, close 1,005. Small green body from 1,000 to 1,005 with a long 45-point upper wick. Translation: buyers ran it up to 1,050 and lost almost the entire move by the close. Sellers were waiting up there.',
          },
        },
      ],
      terms: [
        { term: 'OHLC', meaning: 'Open, High, Low, Close. The four prices every candle encodes.' },
        { term: 'Wick', meaning: 'Also called the shadow. The thin line marking the extreme price of the period.' },
        { term: 'Gap', meaning: 'When a session opens away from the previous close, usually on overnight news.' },
      ],
    },
    {
      id: 't2',
      level: 2,
      title: 'Trend and Structure',
      subtitle: 'Support, resistance, trendlines and market structure',
      minutes: 10,
      scene: { type: 'candles', preset: 'sr' },
      sections: [
        {
          heading: 'Market structure beats opinion',
          body: 'An uptrend is a sequence of higher highs and higher lows. A downtrend is lower highs and lower lows. That is the whole definition. The trend stays intact until that sequence actually breaks, no matter how strongly you feel about the chart.',
        },
        {
          heading: 'Support and resistance are zones, not lines',
          body: 'Support is where buying interest has repeatedly halted declines. Resistance is where selling has repeatedly capped rallies. Draw them as bands a few percent wide, not as hairline-precise lines, because that is how real orders sit in the book.',
          bullets: [
            'More touches generally means a more significant level.',
            'Higher timeframe levels matter more because more participants see them.',
            'Broken resistance often flips into support on the retest, and vice versa.',
          ],
        },
        {
          heading: 'Breakouts and fakeouts',
          body: 'A breakout carries weight when volume expands with it. A break on thin volume that snaps straight back inside the range is a fakeout, and they happen constantly because stop-loss orders pile up just beyond obvious levels. Waiting for a close beyond the level, or for a successful retest, filters out most of them.',
          example: {
            title: 'The polarity flip',
            body: 'A stock rejects 2,400 three times over four months, then breaks above it on heavy volume. Two weeks later it drifts back to 2,400 and holds. That old ceiling is now a floor: buyers who missed the break are finally getting their entry, and earlier sellers are defending their exit.',
          },
        },
      ],
      terms: [
        { term: 'Swing high', meaning: 'A peak with lower highs on both sides. The building block of structure.' },
        { term: 'Consolidation', meaning: 'Sideways movement between two levels while the market decides direction.' },
        { term: 'Retest', meaning: 'Price returning to a broken level to check whether it now holds.' },
      ],
    },
    {
      id: 't3',
      level: 3,
      title: 'Indicators Without the Hype',
      subtitle: 'Moving averages, RSI, MACD, Bollinger Bands',
      minutes: 11,
      scene: { type: 'candles', preset: 'indicators' },
      sections: [
        {
          heading: 'Every indicator is repackaged price',
          body: 'No indicator sees the future. All of them are formulas applied to past price and volume. They are useful for making a trend or a loss of momentum visually obvious, and they are dangerous the moment you start treating them as predictions.',
        },
        {
          heading: 'Moving averages',
          body: 'An SMA averages the last N closes equally. An EMA weights recent prices more, so it turns faster and whipsaws more. The 50 DMA and 200 DMA are watched by nearly everyone, which is exactly why they matter. A golden cross is the 50 crossing above the 200, and a death cross is the reverse. Both are lagging by construction.',
        },
        {
          heading: 'RSI and MACD',
          bullets: [
            'RSI runs 0 to 100. Above 70 is called overbought, below 30 oversold.',
            'In a strong trend RSI can pin above 70 for weeks. Overbought alone is not a sell signal.',
            'Divergence, where price makes a higher high while RSI makes a lower high, is the more useful read.',
            'MACD is the 12 EMA minus the 26 EMA, with a 9 EMA signal line. Crossovers flag momentum shifts.',
          ],
        },
        {
          heading: 'Bollinger Bands and ATR',
          body: 'Bollinger Bands sit two standard deviations either side of a 20 period average, so they widen when volatility rises and squeeze when it falls. A long squeeze often precedes a big move, though the bands never tell you the direction. ATR measures average range and is the sane way to size a stop that fits how the stock actually moves.',
          example: {
            title: 'The redundancy trap',
            body: 'RSI, Stochastic, CCI, Williams %R and MACD all agree the stock is overbought. That feels like five confirmations. It is one: they are all momentum oscillators reading the same recent price. Pick one from each family, trend, momentum and volatility, and stop there.',
          },
        },
      ],
      terms: [
        { term: 'Lagging indicator', meaning: 'One derived from past price, so it confirms rather than predicts.' },
        { term: 'Divergence', meaning: 'Price and indicator moving in opposite directions. A quiet warning of fading momentum.' },
        { term: 'ATR', meaning: 'Average True Range. A volatility measure used for sizing stops.' },
      ],
    },
    {
      id: 't4',
      level: 4,
      title: 'Patterns Worth Knowing',
      subtitle: 'Candlestick patterns, chart patterns and breakouts',
      minutes: 11,
      scene: { type: 'candles', preset: 'pattern' },
      sections: [
        {
          heading: 'Candlestick patterns',
          bullets: [
            'Hammer — small body, long lower wick, after a decline. Sellers were rejected.',
            'Shooting star — small body, long upper wick, after a rally. Buyers were rejected.',
            'Bullish engulfing — a green body that completely swallows the previous red body.',
            'Doji — open and close nearly equal. Pure indecision, and meaningless without context.',
            'Morning star — a three-candle bottoming sequence: big red, small indecisive, big green.',
          ],
          body: 'A pattern in the middle of a range is noise. The same pattern at a tested support level with rising volume is a signal. Location is the difference.',
        },
        {
          heading: 'Chart patterns',
          body: 'Head and shoulders is a bearish reversal that is only confirmed on a neckline break. Double top makes an M and double bottom a W. Triangles are compressions: ascending is usually bullish, descending usually bearish, symmetrical is neutral until it resolves. Flags and pennants are brief pauses inside a strong move and usually continue in the same direction.',
        },
        {
          heading: 'Measuring the move',
          body: 'The rough target for a triangle or head and shoulders break is the height of the pattern projected from the breakout point. Treat that as a rough expectation, never as a promise. Manage the actual trade with price action and your stop, not with a target number you calculated in advance.',
          example: {
            title: 'Why your brain lies to you',
            body: 'Humans are pattern-matching machines, which means we find shapes in pure noise. Draw enough lines on any chart and a textbook pattern appears. The defences are simple: demand volume confirmation, require a decisive close beyond the level, and always define your invalidation before you enter.',
          },
        },
      ],
      terms: [
        { term: 'Neckline', meaning: 'The support line of a head and shoulders. The break is the confirmation.' },
        { term: 'Continuation pattern', meaning: 'A pause that usually resolves in the direction of the prior trend.' },
        { term: 'Invalidation', meaning: 'The price at which your idea is objectively proven wrong. Decide it before entering.' },
      ],
    },
    {
      id: 't5',
      level: 5,
      title: 'Risk, Sizing and Psychology',
      subtitle: 'The part that decides whether you survive',
      minutes: 10,
      scene: { type: 'towers', preset: 'risk' },
      sections: [
        {
          heading: 'Position sizing is the whole game',
          body: 'Two traders take the same setup. One risks 1 percent of capital, the other risks 20 percent. After five losses in a row the first is down about 5 percent and still trading. The second is down two thirds and is emotionally finished. Same idea, opposite outcome, purely because of size.',
          bullets: [
            'Decide rupee risk per trade first, typically 1 to 2 percent of capital.',
            'Position size = rupee risk / (entry price minus stop price).',
            'Conviction is a feeling. It is not a sizing input.',
          ],
        },
        {
          heading: 'Risk-reward and expectancy',
          body: 'At 1:3 risk-reward you can lose 6 of 10 trades and still finish well ahead. Expectancy is (win rate x average win) minus (loss rate x average loss). A positive number over a large sample is what an edge actually looks like. Anything less is a hobby with fees.',
        },
        {
          heading: 'Drawdown maths is brutal',
          body: 'Lose 20 percent and you need 25 percent to recover. Lose 50 percent and you need 100 percent. Lose 80 percent and you need 400 percent. This asymmetry is exactly why capital preservation outranks return chasing, and why professionals obsess over the downside.',
        },
        {
          heading: 'The psychology tax',
          body: 'Revenge trading after a loss, moving a stop further away because you cannot accept being wrong, averaging down into a broken idea, and sizing up after a lucky win are the four habits that end most accounts. A written trading journal is the cheapest defence: entry, exit, reason, emotion, outcome.',
          example: {
            title: 'The F&O reality check',
            body: 'SEBI studies have repeatedly found the large majority of individual traders in the equity derivatives segment lose money, with aggregate losses running into thousands of crores in a single year. Leverage does not create an edge. It multiplies whatever edge you already have, including a negative one.',
          },
        },
      ],
      terms: [
        { term: 'Expectancy', meaning: 'Average profit per trade across a large sample. The only honest scoreboard.' },
        { term: 'Drawdown', meaning: 'The percentage fall from a portfolio peak to its trough.' },
        { term: 'Trailing stop', meaning: 'A stop that follows price in your favour and never moves against you.' },
      ],
    },
    {
      id: 't6',
      level: 6,
      title: 'Fibonacci, Pivots and Gaps',
      subtitle: 'Measuring pullbacks, mapping intraday levels, reading the empty space',
      minutes: 11,
      scene: { type: 'candles', preset: 'fib' },
      sections: [
        {
          heading: 'Retracements measure the pullback',
          body: 'After a strong move, price rarely goes straight on. It pulls back, and Fibonacci retracement gives you a ruler for how deep that pullback is. Mark the swing low and swing high, and the tool draws horizontal levels at 23.6, 38.2, 50, 61.8 and 78.6 percent of that range.',
          bullets: [
            'A shallow pullback to 23.6 or 38.2 percent suggests a strong, eager trend.',
            'The 38.2 to 61.8 percent band is the golden zone where healthy pullbacks usually stall.',
            'Past 78.6 percent the original move is mostly given back and the idea is on thin ice.',
            'Fifty percent is not actually a Fibonacci number. It survived from Dow theory because it works often enough.',
          ],
        },
        {
          heading: 'Why these levels work at all',
          body: 'There is nothing mystical here. Enough traders draw the same levels on the same swing that real orders cluster there, and clustered orders move price. That also means the level is a zone, not a line, and it deserves confirmation from price action rather than a blind limit order sitting on it.',
        },
        {
          heading: 'Pivot points for the intraday map',
          body: 'The standard pivot is the average of yesterday high, low and close. Support and resistance levels are derived arithmetically from it. Their value is that they are mechanical and identical for everyone, so intraday traders arrive at the open already looking at the same map. Price opening above the pivot is generally read as intraday strength.',
          example: {
            title: 'Working a pivot by hand',
            body: 'Yesterday: high 1,050, low 1,010, close 1,040. Pivot = (1050 + 1010 + 1040) / 3 = 1,033. First resistance = 2 x 1033 minus the low = 1,056. First support = 2 x 1033 minus the high = 1,016. You now have a framework before the bell rings.',
          },
        },
        {
          heading: 'Gaps tell you where the move is',
          bullets: [
            'Common gap — small, inside a range, usually filled quickly. Ignore it.',
            'Breakaway gap — price leaves a base on heavy volume. A new move is starting.',
            'Runaway or measuring gap — appears mid-trend, often near the halfway point of the whole move.',
            'Exhaustion gap — late in an extended trend, huge volume, then no follow-through. The last buyers just arrived.',
          ],
          body: 'The same empty space on a chart means completely different things depending on where in the trend it appears. Volume and location are what separate them.',
        },
        {
          heading: 'Two timeframes, two jobs',
          body: 'Take direction from the higher timeframe and entry from the lower one. Daily chart for the trend, hourly for the entry. Trading a 15 minute long signal against a falling daily trend is how most beginners get repeatedly stopped out while being technically right about the small picture.',
        },
      ],
      terms: [
        { term: 'Golden zone', meaning: 'The 38.2 to 61.8 percent retracement band where trend pullbacks most often stall.' },
        { term: 'Pivot point', meaning: '(High + Low + Close) / 3 from the previous session, the anchor for intraday levels.' },
        { term: 'Gap fill', meaning: 'Price returning to trade through the empty space a gap left behind.' },
      ],
    },
    {
      id: 't7',
      level: 7,
      title: 'Futures and Options, Honestly',
      subtitle: 'Margin, expiry, premium, open interest and why most retail traders lose',
      minutes: 14,
      scene: { type: 'payoff', preset: 'long-call' },
      sections: [
        {
          heading: 'Read the surface above first',
          body: 'That shape is the profit and loss of a single bought call. Left to right is the price of the underlying. Front to back is time left until expiry. Height is your money. Notice two things: the loss is flat and capped at the premium you paid, and the whole surface sags as it moves toward the expiry edge. That sag is time decay, and it is working against you every day you hold.',
        },
        {
          heading: 'Futures: the same exposure, borrowed',
          body: 'A futures contract commits you to a price on a future date, and you post only a margin rather than the full value. That is leverage. Profit and loss is marked to market and settled in cash every evening, so a losing position drains your margin daily and eventually triggers a call. Stock futures in India settle by physical delivery at expiry, index futures settle in cash.',
        },
        {
          heading: 'Options: rights on one side, obligations on the other',
          bullets: [
            'Call buyer — right to buy at the strike. Loss capped at the premium, upside open.',
            'Put buyer — right to sell at the strike. Profits as price falls.',
            'Option seller — collects the premium and carries the obligation. Best case is the premium, worst case is very large.',
            'Premium = intrinsic value + time value. An out of the money option is pure time value.',
          ],
          body: 'Buyers pay for optionality and lose slowly to decay. Sellers get paid for taking risk and lose rarely but violently. Neither side is safer in the abstract, and both need position sizing.',
        },
        {
          heading: 'The Greeks, in plain terms',
          bullets: [
            'Delta — how much the option moves per one rupee move in the underlying. Roughly 0.5 at the money.',
            'Theta — how much value bleeds away per day. Accelerates sharply in the final week.',
            'Vega — sensitivity to implied volatility. Explains why buyers get the direction right and still lose.',
            'Gamma — how fast delta itself changes. Small far from the strike, explosive near it on expiry day.',
          ],
        },
        {
          heading: 'Open interest and implied volatility',
          body: 'Open interest counts contracts still outstanding, not contracts traded today. Rising price with rising OI points to fresh long positions. Rising price with falling OI usually means shorts covering, which is a weaker signal. Implied volatility is the market price of expected movement. Ahead of results or a policy event IV inflates premiums, and the moment the event passes it collapses.',
          example: {
            title: 'The IV crush that catches everyone',
            body: 'You buy a call before an earnings announcement. Results beat expectations, the stock opens 4 percent up, and your call is worth less than yesterday. IV dropped from 55 to 30 the second the uncertainty disappeared. You were right about direction and still lost, because you paid for volatility that no longer existed.',
          },
        },
        {
          heading: 'The uncomfortable statistics',
          body: 'SEBI has repeatedly studied individual traders in the equity derivatives segment and found the large majority lose money, with aggregate losses running into thousands of crores in a single year. Leverage does not manufacture an edge. It multiplies whatever edge you already have, and for most people that number is negative before costs. Learn this segment to understand the market, and stay small until a written, tested system says otherwise.',
        },
      ],
      terms: [
        { term: 'Strike price', meaning: 'The fixed price at which an option can be exercised.' },
        { term: 'Time decay', meaning: 'The daily erosion of an option time value, measured by theta.' },
        { term: 'IV crush', meaning: 'The sharp fall in implied volatility once an anticipated event is over.' },
      ],
    },
    {
      id: 't8',
      level: 8,
      title: 'Breadth, Rotation and Building a System',
      subtitle: 'Reading the whole market, then turning a hunch into rules',
      minutes: 12,
      scene: { type: 'rotation' },
      sections: [
        {
          heading: 'The index is not the market',
          body: 'A handful of heavyweights can drag the Nifty to a record high while most listed stocks are quietly falling. Breadth measures how many names are actually participating. The advance-decline line, which accumulates advancing minus declining stocks each day, is the standard tool. When the index climbs and the A-D line does not follow, the rally is thinner than the headline suggests.',
        },
        {
          heading: 'Money rotates, it rarely leaves',
          body: 'The wheel above is sector rotation. Capital moves between sectors as the economic cycle turns rather than sitting out entirely. Rate sensitive names such as banks, autos and real estate tend to lead early in a recovery. Capital goods and industrials pick up through the middle. Metals and energy peak late. Defensives like FMCG, pharma and utilities take over as growth slows.',
        },
        {
          heading: 'Relative strength is not RSI',
          body: 'They get confused constantly. RSI is a momentum oscillator on one instrument. Relative strength is a ratio chart of one thing divided by another, say a bank index over the Nifty. A rising ratio means the sector is outperforming, whether or not either is going up in absolute terms. Ratio charts are how professionals find where money is actually flowing.',
        },
        {
          heading: 'Turning an idea into a system',
          bullets: [
            'Entry — the exact, checkable condition. Not "looks strong".',
            'Invalidation — the price that proves the idea wrong. Decided before you enter.',
            'Size — derived from that stop distance and your fixed risk per trade.',
            'Exit — target, trailing rule or time stop, written in advance.',
            'Universe and timeframe — which stocks and which chart. Fixed, not chosen per trade.',
          ],
        },
        {
          heading: 'Testing without fooling yourself',
          body: 'A backtest is easy to fake by accident. Overfitting means tuning so tightly to past data that the system only works on the years you tuned it on. Look-ahead bias means using information that was not available at that moment, such as a quarterly result on the quarter-end date. Survivorship bias means testing on today index constituents, quietly excluding every company that failed. Reserve a slice of data the system never saw, and judge it there.',
          example: {
            title: 'Expectancy is the only real scoreboard',
            body: 'Expectancy = (win rate x average win) minus (loss rate x average loss). A system winning 40 percent of trades with an average win of 3R and average loss of 1R has expectancy of 0.4 x 3 minus 0.6 x 1 = 0.6R per trade. Positive across a large sample, boring, and profitable. A 70 percent win rate with 1R wins and 3R losses is negative and feels wonderful right up until it does not.',
          },
        },
        {
          heading: 'Then go small',
          body: 'Backtests miss slippage, real liquidity and your own behaviour under pressure. Paper trade or run minimum size for a few dozen trades before scaling. That phase is not wasted time, it is the cheapest tuition available for finding out whether you can actually follow your own rules.',
        },
      ],
      terms: [
        { term: 'Advance-decline line', meaning: 'Running total of advancing minus declining stocks. The standard breadth gauge.' },
        { term: 'Relative strength', meaning: 'A ratio chart comparing one instrument against a benchmark.' },
        { term: 'Out-of-sample test', meaning: 'Judging a system on data it was never tuned against.' },
      ],
    },
    {
      id: 't9',
      level: 9,
      title: 'Orders, Costs and Getting Filled',
      subtitle: 'The plumbing between your idea and your actual profit',
      minutes: 12,
      scene: {
        type: 'towers',
        caption: 'what one Rs 1,00,000 intraday round trip costs',
        unit: 'rupees per round trip',
        bars: [
          { name: 'Brokerage', value: 40, color: '#eaa81e', note: 'Rs 20 per executed order, two orders' },
          { name: 'STT', value: 25, color: '#ff5d5d', note: '0.025% on the sell side only, intraday' },
          { name: 'GST', value: 8.3, color: '#8b5cf6', note: '18% on brokerage plus exchange charges' },
          { name: 'Exchange', value: 6, color: '#5ee0ff', note: 'Transaction charges on both legs' },
          { name: 'Stamp duty', value: 3, color: '#33e29b', note: '0.003% on the buy side' },
        ],
      },
      sections: [
        {
          heading: 'Costs are not a rounding error',
          body: 'The towers above are one intraday round trip on a turnover of Rs 1,00,000 each way, at discount broker rates. Roughly Rs 82 leaves your account before the trade has done anything. Thirty such trades in a month is around Rs 2,500 of pure friction. Many strategies are profitable on paper and lose money the moment real costs are applied, and that gap is the reason.',
        },
        {
          heading: 'Know exactly what each order does',
          bullets: [
            'Market — fills now, at whatever the book offers. Certain execution, uncertain price.',
            'Limit — your price or better. Certain price, uncertain execution.',
            'Stop-loss limit — triggers at your level, then works as a limit. In a fast gap it may never fill.',
            'Stop-loss market (SL-M) — triggers, then takes whatever is available. It gets you out, sometimes painfully.',
            'Bracket — entry, target and stop placed together, so the exit plan exists before the trade does.',
            'Cover — entry with a compulsory stop-loss, which is why it carries higher leverage.',
            'GTT — a broker-side trigger, not an exchange order, so it depends on your broker being up.',
            'AMO — queued after hours and sent when the market next opens. Convenience, not a better price.',
          ],
        },
        {
          heading: 'Slippage and impact cost',
          body: 'Slippage is the gap between the price you expected and the price you received. Impact cost is how far the price moves against you purely because of the size you are trying to trade. NSE uses impact cost to decide index eligibility for exactly this reason. In an illiquid small cap, impact cost can dwarf every visible charge on the contract note.',
          example: {
            title: 'The spread you never see on the bill',
            body: 'A stock shows a bid of 240.10 and an ask of 241.40. You buy at the ask and later sell at the bid. That Rs 1.30 gap, roughly half a percent, never appears as a line item anywhere. It is simply the price of being impatient in a thin book.',
          },
        },
        {
          heading: 'Surveillance can trap you',
          body: 'Exchanges move unusual stocks into ASM and GSM frameworks, which raise margins and restrict trading, and into the Trade to Trade segment, where intraday squaring off is not allowed at all. If you are leveraged in a name that gets moved overnight, you can be forced to take delivery you never intended or to post margin you do not have. Check the surveillance list before sizing up in a small cap.',
        },
        {
          heading: 'Delivery and intraday cost differently',
          body: 'On delivery equity, STT is charged on both the buy and the sell. On intraday it is charged only on the sell side, but brokerage typically applies to both legs. The two structures are different enough that the same idea can be viable in one and hopeless in the other. Work out your real cost per trade once, in rupees, and keep the number in front of you.',
        },
      ],
      terms: [
        { term: 'Slippage', meaning: 'The difference between the expected fill price and the actual one.' },
        { term: 'Impact cost', meaning: 'How far your own order moves the price against you.' },
        { term: 'T2T segment', meaning: 'Trade to trade. Delivery compulsory, no intraday squaring off.' },
      ],
    },
    {
      id: 't10',
      level: 10,
      title: 'Trading the Indian Session',
      subtitle: 'Pre-open, the opening hour, the quiet middle, expiry and the close',
      minutes: 12,
      scene: { type: 'session' },
      sections: [
        {
          heading: 'The day is not one uniform block',
          body: 'Hover the phases above. An NSE equity session behaves like several different markets bolted together, and a strategy that works in one of them can be actively dangerous in another. Knowing which part of the day you are in is as useful as knowing which stock you are in.',
        },
        {
          heading: 'Pre-open, 9:00 to 9:15',
          body: 'Orders are collected from 9:00 to 9:08, matched from 9:08 to 9:12, then a short buffer runs before the normal session begins at 9:15. It is a call auction, not continuous trading, and its job is to absorb overnight news through one price discovery rather than through a violent first few seconds. The equilibrium price it produces becomes the open.',
        },
        {
          heading: 'The opening hour is the most expensive hour',
          bullets: [
            'Spreads are widest, so every entry and exit costs more than it will later.',
            'Overnight orders and news collide, producing moves that reverse just as fast.',
            'Stop-loss orders cluster just beyond the previous day levels, and they get swept.',
            'Many disciplined traders simply wait 15 to 30 minutes and let the range form first.',
          ],
          body: 'The opening range breakout strategy formalises that patience. Mark the high and low of the first 15 or 30 minutes and trade a decisive break of that band, with volume confirming. On quiet days it produces a steady supply of false breaks, which is exactly why the stop matters more than the entry.',
        },
        {
          heading: 'The quiet middle and the busy close',
          body: 'Between roughly 11am and 2pm ranges compress and volume thins. Strategies that need movement stop working, while costs stay exactly the same. The last hour picks back up as institutions rebalance and intraday positions square off, which is why late-session moves often carry more follow-through than late-morning ones.',
          example: {
            title: 'The close is an average, not a print',
            body: 'The official closing price is a volume weighted average of trades in the final 30 minutes, not the last traded price. That design makes the close far harder to manipulate with a single late trade, and it is why your screen sometimes shows a last price slightly different from the official close.',
          },
        },
        {
          heading: 'Expiry days behave differently',
          body: 'On expiry, option time value collapses toward zero and gamma goes extreme, so small moves in the underlying produce violent swings in premium. Index derivatives settle in cash, while single stock derivatives have been physically settled since 2019, which means an in-the-money stock position you forget about can turn into an actual delivery obligation.',
        },
        {
          heading: 'Two things worth knowing',
          bullets: [
            'Bulk deals cross 0.5 percent of listed shares by one client and are disclosed the same day. Block deals happen in a separate window at negotiated size.',
            'Muhurat trading is a symbolic short session on Diwali marking the start of the Hindu accounting year. Volumes are thin and it is ceremony more than opportunity.',
          ],
        },
      ],
      terms: [
        { term: 'Call auction', meaning: 'Orders collected and matched at one equilibrium price rather than continuously.' },
        { term: 'Opening range', meaning: 'The high and low of the first fixed window of the session.' },
        { term: 'Bulk deal', meaning: 'A single client trading over 0.5 percent of a company listed shares, disclosed same day.' },
      ],
    },
  ],
}

export const TRACK_META = {
  fundamental: {
    label: 'Fundamentals',
    tagline: 'Value the business, not the ticker',
    accent: '#eaa81e',
    emoji: '🏛️',
    description: 'Understand what a company is worth by reading its business, its books and its moat.',
  },
  technical: {
    label: 'Technicals',
    tagline: 'Read what the chart is telling you',
    accent: '#33e29b',
    emoji: '📈',
    description: 'Learn price action, structure, indicators and the risk control that keeps you in the game.',
  },
}

export function findLesson(track, level) {
  return LESSONS[track]?.find((l) => l.level === Number(level))
}
