// Question bank. `a` is the index of the correct option and never leaves the server
// on a GET — routes/quiz.js strips it before sending questions to the browser.

export const LEVELS = {
  fundamental: [
    { level: 1, title: 'Market Basics', tag: 'Rookie', blurb: 'Shares, exchanges, indices, demat.' },
    { level: 2, title: 'How Trades Work', tag: 'Explorer', blurb: 'IPOs, order types, T+1 settlement, circuits.' },
    { level: 3, title: 'Reading Financials', tag: 'Analyst', blurb: 'P&L, balance sheet, cash flow.' },
    { level: 4, title: 'Ratios & Valuation', tag: 'Strategist', blurb: 'PE, PB, ROE, ROCE, debt, dividends.' },
    { level: 5, title: 'Moats & Macro', tag: 'Pro', blurb: 'Business quality, cycles, corporate actions.' },
    { level: 6, title: 'Beyond Stocks', tag: 'Allocator', blurb: 'Mutual funds, ETFs, bonds, gold, REITs.' },
    { level: 7, title: 'Compounding & Portfolio', tag: 'Compounder', blurb: 'CAGR, XIRR, SIP, allocation, rebalancing.' },
    { level: 8, title: 'Tax, Costs & Behaviour', tag: 'Steward', blurb: 'STCG, LTCG, fee drag, investor psychology.' },
    { level: 9, title: 'Banks & NBFCs', tag: 'Underwriter', blurb: 'NIM, CASA, NPAs, provisions, capital adequacy.' },
    { level: 10, title: 'Researching a Company', tag: 'Sleuth', blurb: 'Screens, annual reports, concalls, red flags.' },
  ],
  technical: [
    { level: 1, title: 'Charts 101', tag: 'Rookie', blurb: 'Candles, OHLC, timeframes, volume.' },
    { level: 2, title: 'Trend & Structure', tag: 'Explorer', blurb: 'Support, resistance, trendlines, market structure.' },
    { level: 3, title: 'Indicators', tag: 'Analyst', blurb: 'Moving averages, RSI, MACD, Bollinger Bands.' },
    { level: 4, title: 'Patterns', tag: 'Strategist', blurb: 'Candle patterns, chart patterns, breakouts.' },
    { level: 5, title: 'Risk & Psychology', tag: 'Pro', blurb: 'Position sizing, stops, R:R, expectancy.' },
    { level: 6, title: 'Fibonacci, Pivots & Gaps', tag: 'Tactician', blurb: 'Retracements, pivots, gap types, multi-timeframe.' },
    { level: 7, title: 'Futures & Options', tag: 'Derivative', blurb: 'Margin, expiry, premium, OI, IV, Greeks.' },
    { level: 8, title: 'Breadth & Systems', tag: 'Architect', blurb: 'Dow theory, breadth, relative strength, backtesting.' },
    { level: 9, title: 'Orders, Costs & Execution', tag: 'Operator', blurb: 'Order types, slippage, surveillance, real costs.' },
    { level: 10, title: 'The Indian Session', tag: 'Local', blurb: 'Pre-open, opening range, expiry, closing auction.' },
  ],
}

export const PASS_PERCENT = 70
export const QUESTIONS_PER_QUIZ = 10

const F1 = [
  { q: 'Buying one share of Reliance Industries makes you what?', o: ['A lender to the company', 'A part-owner of the company', 'An employee of the company', 'A customer with special rights'], a: 1, e: 'Equity means ownership. One share = one tiny slice of the company, including a claim on its profits.' },
  { q: 'Which two exchanges handle almost all equity trading in India?', o: ['NSE and BSE', 'MCX and NCDEX', 'NSDL and CDSL', 'RBI and SEBI'], a: 0, e: 'NSE and BSE are the stock exchanges. NSDL and CDSL are depositories, MCX and NCDEX are commodity exchanges.' },
  { q: 'What does SEBI actually do?', o: ['Sets interest rates', 'Regulates the securities market and protects investors', 'Guarantees your profits', 'Runs the NSE'], a: 1, e: 'SEBI is the market regulator. It writes the rules and polices them. It never guarantees returns.' },
  { q: 'The Nifty 50 tracks how many companies?', o: ['30', '50', '100', '500'], a: 1, e: 'Nifty 50 holds 50 large companies on the NSE. Sensex holds 30 on the BSE.' },
  { q: 'A demat account is used to:', o: ['Hold your shares in electronic form', 'Place buy and sell orders', 'Store your salary', 'Pay your taxes'], a: 0, e: 'Demat holds securities. A trading account places orders. A bank account moves money. You need all three.' },
  { q: 'The Sensex is made up of how many stocks?', o: ['30', '50', '75', '100'], a: 0, e: 'Sensex = BSE Sensitive Index = 30 large, actively traded companies.' },
  { q: 'A stock is "large cap" in India when its market cap rank is:', o: ['Top 100', 'Top 250', 'Top 500', 'Top 1000'], a: 0, e: 'SEBI defines it by rank: top 100 large cap, 101 to 250 mid cap, 251 onward small cap.' },
  { q: 'Market capitalisation is calculated as:', o: ['Share price x total outstanding shares', 'Revenue x profit margin', 'Total assets minus liabilities', 'Share price x daily volume'], a: 0, e: 'Market cap is what the market says the whole company is worth right now.' },
  { q: 'Who holds your shares safe in electronic form?', o: ['Your broker', 'NSDL or CDSL', 'SEBI', 'RBI'], a: 1, e: 'The depositories NSDL and CDSL hold them. Your broker is only the middleman that connects you.' },
  { q: 'A dividend is:', o: ['A loan repayment', 'A share of profit paid to shareholders', 'A tax on trading', 'A bonus share'], a: 1, e: 'Companies distribute part of their profit as dividends. Paying one is optional, not a promise.' },
]

const F2 = [
  { q: 'A company selling shares to the public for the first time is doing a:', o: ['FPO', 'IPO', 'Buyback', 'Rights issue'], a: 1, e: 'IPO is the first sale. An FPO is a follow-on offer by an already listed company.' },
  { q: 'India settles equity trades on which cycle?', o: ['T+0 only', 'T+1', 'T+2', 'T+3'], a: 1, e: 'India moved fully to T+1 in January 2023 and now runs an optional same-day T+0 for select stocks.' },
  { q: 'A limit order guarantees:', o: ['Execution', 'Your price or better', 'Both price and execution', 'Zero brokerage'], a: 1, e: 'A limit order controls price but may never fill. A market order controls execution but not price.' },
  { q: 'A stop-loss order is designed to:', o: ['Lock in profit at a target', 'Cap your loss by triggering an exit', 'Double your position', 'Delay settlement'], a: 1, e: 'It triggers an exit once price hits your pain threshold, before the loss grows.' },
  { q: 'A circuit limit does what?', o: ['Halts or bands price movement beyond a percentage', 'Blocks foreign investors', 'Caps brokerage', 'Freezes your demat account'], a: 0, e: 'Circuit filters stop runaway moves, giving the market time to cool off and absorb news.' },
  { q: 'The primary market is where:', o: ['Investors trade shares with each other', 'Companies issue new shares to raise capital', 'Derivatives are settled', 'Indices are calculated'], a: 1, e: 'Primary = company raises money. Secondary = investors trade among themselves on the exchange.' },
  { q: 'In an IPO, the price band is:', o: ['The range within which you may bid', 'The listing day gain', 'The regulator fee', 'The lot size'], a: 0, e: 'Book building collects bids inside the band, then the cut-off price is discovered from demand.' },
  { q: 'The bid-ask spread is:', o: ['Brokerage plus taxes', 'Gap between the highest buy price and lowest sell price', 'Daily price range', 'Difference between two exchanges'], a: 1, e: 'A tight spread means liquidity. A wide spread quietly costs you on every entry and exit.' },
  { q: 'Intraday trading means:', o: ['Holding for a year', 'Squaring off the position on the same day', 'Buying only IPOs', 'Trading only in derivatives'], a: 1, e: 'Positions open and close before the market shuts, so nothing is delivered to your demat.' },
  { q: 'STT stands for:', o: ['Standard Trading Tariff', 'Securities Transaction Tax', 'Short Term Transfer', 'Settlement Turnover Tax'], a: 1, e: 'STT is a government levy charged on every trade. It is a real drag on high-frequency strategies.' },
]

const F3 = [
  { q: 'The balance sheet always satisfies:', o: ['Assets = Liabilities + Equity', 'Revenue - Cost = Profit', 'Assets = Revenue', 'Equity = Revenue - Debt'], a: 0, e: 'That identity is why it is called a balance sheet. Both sides must match, always.' },
  { q: 'A P&L statement reports:', o: ['A snapshot on one date', 'Performance across a period', 'Only cash movements', 'Only debt'], a: 1, e: 'P&L covers a period like a quarter. The balance sheet is a snapshot on a single date.' },
  { q: 'Which statement is hardest to manipulate with accounting choices?', o: ['P&L', 'Balance sheet', 'Cash flow statement', 'Annual report cover'], a: 2, e: 'Profit is an opinion, cash is a fact. Cash flow from operations is the reality check on reported profit.' },
  { q: 'EBITDA excludes:', o: ['Revenue', 'Interest, tax, depreciation and amortisation', 'Cost of goods sold', 'Employee cost'], a: 1, e: 'It strips financing and accounting charges to approximate operating performance. It is not cash flow.' },
  { q: 'Working capital equals:', o: ['Current assets minus current liabilities', 'Total assets minus total debt', 'Revenue minus expenses', 'Cash plus inventory'], a: 0, e: 'It funds day-to-day operations. Chronically negative working capital in a non-retail business is a warning.' },
  { q: 'Rising receivables with flat revenue usually signals:', o: ['Strong demand', 'Customers are paying slower or sales quality is weak', 'Falling debt', 'Higher dividends'], a: 1, e: 'Revenue booked but not collected is a classic early sign of stretched or stuffed sales.' },
  { q: 'Depreciation is:', o: ['A cash outflow this year', 'A non-cash charge spreading an asset cost over its life', 'A type of debt', 'A dividend'], a: 1, e: 'The cash left when the asset was bought. Depreciation is the accounting spread of that cost.' },
  { q: 'Free cash flow is roughly:', o: ['Operating cash flow minus capital expenditure', 'Revenue minus tax', 'Net profit plus debt', 'EBITDA minus dividends'], a: 0, e: 'FCF is what is genuinely left for owners after keeping the business running and growing.' },
  { q: 'Contingent liabilities appear where?', o: ['In the P&L as an expense', 'In the notes to accounts', 'In the cash flow statement', 'Nowhere'], a: 1, e: 'They live in the notes. Skipping the notes is how investors miss the scariest numbers in a report.' },
  { q: 'Consolidated results differ from standalone because they:', o: ['Exclude tax', 'Include subsidiaries', 'Use older data', 'Ignore depreciation'], a: 1, e: 'For any group with subsidiaries, always read consolidated. Standalone alone can hide a lot.' },
]

const F4 = [
  { q: 'The PE ratio compares price to:', o: ['Book value', 'Earnings per share', 'Sales', 'Dividend'], a: 1, e: 'PE = price / EPS. Roughly, how many rupees you pay for one rupee of annual earnings.' },
  { q: 'ROE measures return on:', o: ['Total assets', 'Shareholder equity', 'Revenue', 'Market cap'], a: 1, e: 'ROE = net profit / shareholder equity. High ROE sustained for years usually means a genuinely good business.' },
  { q: 'A high PE can mean:', o: ['Always overvalued', 'High growth expectations or depressed earnings', 'Guaranteed loss', 'Low risk'], a: 1, e: 'PE is a question, not an answer. Cyclicals often look cheapest exactly at the top of their cycle.' },
  { q: 'ROCE is preferred over ROE when a company:', o: ['Has zero debt', 'Uses significant debt', 'Pays no dividend', 'Is newly listed'], a: 1, e: 'ROCE covers all capital, debt included, so leverage cannot flatter the number the way it flatters ROE.' },
  { q: 'Debt-to-equity of 3.0 means:', o: ['Three rupees of equity per rupee of debt', 'Three rupees of debt per rupee of equity', 'The firm is debt-free', 'Equity tripled'], a: 1, e: 'That is heavy leverage. Fine for a utility or a bank, alarming for a cyclical manufacturer.' },
  { q: 'Dividend yield equals:', o: ['Dividend per share / market price', 'Dividend / profit', 'Profit / share price', 'Dividend / book value'], a: 0, e: 'Payout ratio is dividend / profit. Yield compares the dividend to what you pay today.' },
  { q: 'Price-to-book is most useful for:', o: ['Software firms', 'Banks and asset-heavy businesses', 'Startups with no assets', 'Consulting firms'], a: 1, e: 'PB needs meaningful book value. For an asset-light services firm the number tells you very little.' },
  { q: 'The PEG ratio adjusts PE for:', o: ['Debt', 'Growth rate', 'Dividend', 'Sector'], a: 1, e: 'PEG = PE / earnings growth. It asks whether you are paying a fair price for the growth you expect.' },
  { q: 'Diluted EPS accounts for:', o: ['Buybacks only', 'Potential shares from ESOPs and convertibles', 'Dividends paid', 'Depreciation'], a: 1, e: 'It assumes every convertible instrument converts. That is the conservative and more honest number.' },
  { q: 'A DCF valuation is most sensitive to:', o: ['The company logo', 'Discount rate and terminal growth assumptions', 'Last year revenue only', 'Number of employees'], a: 1, e: 'Small tweaks to those two inputs swing the output massively. Always test a range, never a single point.' },
]

const F5 = [
  { q: 'An economic moat is:', o: ['A durable competitive advantage', 'A type of debt', 'A SEBI rule', 'A chart pattern'], a: 0, e: 'Brand, network effects, switching costs, patents and cost advantages are the classic moat sources.' },
  { q: 'A 1:1 bonus issue does what to your holding?', o: ['Doubles shares, halves price, same value', 'Doubles your money', 'Cuts your shares in half', 'Pays cash'], a: 0, e: 'It is a cosmetic split of the same pie. Your total value on the ex-date is unchanged.' },
  { q: 'In a stock split from face value 10 to 2:', o: ['You get 5x shares at roughly 1/5th price', 'You lose 80 percent', 'Nothing changes', 'You receive cash'], a: 0, e: 'Splits improve affordability and liquidity. The underlying business is exactly the same.' },
  { q: 'A buyback typically:', o: ['Increases share count', 'Reduces share count and lifts EPS', 'Reduces cash and revenue', 'Is illegal in India'], a: 1, e: 'Fewer shares means each remaining share owns more. It only creates value if the buyback price is sensible.' },
  { q: 'Defensive sectors in India usually include:', o: ['FMCG and pharma', 'Real estate and metals', 'Auto and infrastructure', 'PSU banks'], a: 0, e: 'Demand for soap and medicine barely moves in a downturn. Metals and real estate swing hard with the cycle.' },
  { q: 'Rising repo rate generally pressures:', o: ['Rate-sensitive sectors like real estate and autos', 'Only IT exporters', 'Nothing at all', 'Only FMCG'], a: 0, e: 'Costlier loans mean fewer homes and cars bought on EMI, and higher interest costs for leveraged firms.' },
  { q: 'A falling rupee typically helps:', o: ['Importers', 'IT and pharma exporters', 'Oil refiners', 'Airlines'], a: 1, e: 'Exporters earn dollars and spend rupees. Importers such as airlines and refiners feel the opposite squeeze.' },
  { q: 'Promoter pledging of shares is a red flag because:', o: ['It is illegal', 'Forced selling can crash the price if the pledge is invoked', 'It reduces revenue', 'It doubles taxes'], a: 1, e: 'Pledged shares are collateral. A price fall can trigger lender selling, which drives the price down further.' },
  { q: 'Related party transactions matter because they can:', o: ['Improve liquidity', 'Move money out to promoter-linked entities', 'Raise the dividend', 'Reduce STT'], a: 1, e: 'Not all are bad, but large unexplained ones are a well-known governance warning sign.' },
  { q: 'Rupee cost averaging through an SIP mainly reduces:', o: ['Tax', 'Timing risk', 'Brokerage', 'Inflation'], a: 1, e: 'Buying on a fixed schedule stops you from betting everything on one entry point.' },
]

const T1 = [
  { q: 'A candlestick shows which four values?', o: ['Open, High, Low, Close', 'Only close', 'Volume, Price, Time, Trend', 'Bid, Ask, Spread, Size'], a: 0, e: 'The body spans open to close. The wicks reach the high and the low of that period.' },
  { q: 'A green (bullish) candle means:', o: ['Close above open', 'Close below open', 'High equals low', 'No trading'], a: 0, e: 'Buyers finished the session in control, pushing the close above where it opened.' },
  { q: 'A long upper wick suggests:', o: ['Buyers dominated to the close', 'Sellers rejected higher prices', 'No volatility', 'A gap down'], a: 1, e: 'Price pushed up and got sold back down. That rejection is what the wick records.' },
  { q: 'Volume measures:', o: ['Price change', 'Number of shares traded', 'Number of investors', 'Market cap'], a: 1, e: 'Volume is participation. A breakout on thin volume deserves real suspicion.' },
  { q: 'A gap up open happens when:', o: ['Open is above the previous close', 'Volume doubles', 'RSI is above 70', 'The market is shut'], a: 0, e: 'Gaps come from news or sentiment shifting while the market was closed.' },
  { q: 'A doji candle indicates:', o: ['Strong trend', 'Open and close nearly equal, indecision', 'Circuit limit hit', 'Guaranteed reversal'], a: 1, e: 'Neither side won. Context around the doji decides whether it matters at all.' },
  { q: 'Line charts plot which value?', o: ['High', 'Low', 'Closing price', 'Volume'], a: 2, e: 'The close is the most watched price of a session, which is why line charts use it.' },
  { q: 'A longer timeframe chart generally produces:', o: ['More noise', 'Fewer but more reliable signals', 'Faster profits', 'Lower volume'], a: 1, e: 'A weekly chart filters intraday noise. A one-minute chart is mostly noise.' },
  { q: 'NSE equity trading hours are:', o: ['9:00 to 15:00', '9:15 to 15:30', '10:00 to 16:00', '9:15 to 17:00'], a: 1, e: 'The normal session runs 9:15 to 15:30 IST, with a pre-open window from 9:00 to 9:08.' },
  { q: 'A Heikin-Ashi chart is used to:', o: ['Show exact prices', 'Smooth price action to read trend', 'Measure volume', 'Track dividends'], a: 1, e: 'It averages values to reduce noise. The tradeoff is that it no longer shows true open and close.' },
]

const T2 = [
  { q: 'Support is a level where:', o: ['Selling pressure typically overwhelms buying', 'Buying interest tends to halt a fall', 'Volume disappears', 'Trading stops'], a: 1, e: 'Demand shows up there. Resistance is the mirror image, where supply appears.' },
  { q: 'An uptrend is defined by:', o: ['Higher highs and higher lows', 'Lower highs and lower lows', 'Flat price', 'High volume only'], a: 0, e: 'Market structure, not opinion. The trend is intact until a higher low breaks.' },
  { q: 'When broken decisively, old resistance often becomes:', o: ['Stronger resistance', 'New support', 'Irrelevant', 'A gap'], a: 1, e: 'Polarity flip. Trapped sellers and new buyers both defend that level on a retest.' },
  { q: 'A trendline in an uptrend is drawn by connecting:', o: ['Swing highs', 'Swing lows', 'Closing prices only', 'Volume bars'], a: 1, e: 'Rising lows form the line. It needs at least two touches, and three make it credible.' },
  { q: 'A consolidation or range means:', o: ['Price moving sideways between two levels', 'A sharp rally', 'A crash', 'No volume'], a: 0, e: 'Ranges are pauses. Direction resolves only on a decisive break with volume behind it.' },
  { q: 'A breakout is more trustworthy when:', o: ['Volume expands', 'Volume dries up', 'It happens in the last minute', 'RSI is exactly 50'], a: 0, e: 'Real breakouts need participation. Low-volume breaks often turn into fakeouts.' },
  { q: 'A false breakout (fakeout) is when price:', o: ['Breaks a level then quickly reverses back inside', 'Never touches the level', 'Hits a circuit limit', 'Gaps up'], a: 0, e: 'Stop-loss orders cluster just outside levels. Fakeouts sweep them, then reverse.' },
  { q: 'The 200-day moving average is commonly used to judge:', o: ['Intraday scalps', 'The long-term trend', 'Dividend yield', 'Option premium'], a: 1, e: 'Institutions watch it as a broad regime line. Above it is a bull regime, below it is caution.' },
  { q: 'A pullback in an uptrend is:', o: ['A trend reversal', 'A temporary dip inside the larger trend', 'A circuit halt', 'A stock split'], a: 1, e: 'Healthy trends breathe. The pullback becomes a reversal only when structure actually breaks.' },
  { q: 'Higher timeframe levels are generally:', o: ['Weaker than intraday levels', 'Stronger and more respected', 'Only for beginners', 'Irrelevant'], a: 1, e: 'More participants see a weekly level than a 5-minute one, so more orders sit there.' },
]

const T3 = [
  { q: 'RSI above 70 traditionally signals:', o: ['Oversold', 'Overbought', 'No trend', 'A dividend'], a: 1, e: 'But in a strong trend RSI can stay above 70 for weeks. Overbought is not a sell signal by itself.' },
  { q: 'MACD is built from:', o: ['Two moving averages and their difference', 'Volume and price', 'RSI and ATR', 'Open and close only'], a: 0, e: 'The MACD line is 12 EMA minus 26 EMA, and the signal line is its 9 EMA.' },
  { q: 'A golden cross is when:', o: ['50 DMA crosses above 200 DMA', '200 DMA crosses above 50 DMA', 'RSI crosses 50', 'Price gaps up'], a: 0, e: 'The reverse, 50 crossing below 200, is the death cross. Both are lagging by design.' },
  { q: 'Bollinger Bands widen when:', o: ['Volatility rises', 'Volume falls', 'RSI hits 50', 'Price is flat'], a: 0, e: 'The bands sit at 2 standard deviations. A squeeze often precedes an expansion move.' },
  { q: 'An EMA differs from an SMA because it:', o: ['Ignores volume', 'Weights recent prices more heavily', 'Uses only highs', 'Is always higher'], a: 1, e: 'EMA reacts faster to new prices. Faster also means more whipsaws in choppy markets.' },
  { q: 'RSI divergence occurs when:', o: ['Price and RSI move in opposite directions', 'RSI equals 50', 'Volume spikes', 'Two MAs cross'], a: 0, e: 'A higher price high with a lower RSI high warns that momentum is quietly fading.' },
  { q: 'ATR measures:', o: ['Trend direction', 'Average volatility or range', 'Volume', 'Valuation'], a: 1, e: 'ATR is the standard way to size a stop so it fits the stock actual movement.' },
  { q: 'VWAP is most used by:', o: ['Long-term investors', 'Intraday traders as a fair-value reference', 'Auditors', 'Regulators'], a: 1, e: 'Volume weighted average price is the intraday benchmark institutions measure execution against.' },
  { q: 'The main weakness of every indicator is that they are:', o: ['Illegal', 'Derived from price and therefore lagging', 'Too expensive', 'Only for options'], a: 1, e: 'Indicators repackage past price. They describe what happened, they do not predict.' },
  { q: 'Stacking five indicators that all measure momentum causes:', o: ['Better accuracy', 'Redundant confirmation and false confidence', 'Lower brokerage', 'Faster execution'], a: 1, e: 'Multicollinearity. Five versions of the same signal feels like confirmation and is not.' },
]

const T4 = [
  { q: 'A hammer candle after a downtrend suggests:', o: ['Continued selling', 'Potential bullish reversal', 'A stock split', 'Low volume'], a: 1, e: 'Long lower wick, small body. Sellers pushed down and got fully rejected. Needs confirmation next candle.' },
  { q: 'A bullish engulfing pattern is:', o: ['A green candle whose body engulfs the prior red body', 'Two dojis', 'A gap down', 'Three red candles'], a: 0, e: 'It shows a decisive shift in control, and is strongest at support after a decline.' },
  { q: 'Head and shoulders is usually:', o: ['A bullish continuation', 'A bearish reversal pattern', 'A volume indicator', 'An options strategy'], a: 1, e: 'Three peaks with a lower middle-flanking structure. Confirmation only comes on a neckline break.' },
  { q: 'A double bottom looks like:', o: ['W shape signalling potential reversal up', 'M shape', 'Straight line', 'Triangle'], a: 0, e: 'Two failed attempts to break lower. The double top M is the bearish mirror.' },
  { q: 'A bull flag is:', o: ['A brief sideways or slightly down consolidation after a sharp rally', 'A crash pattern', 'A dividend event', 'An RSI reading'], a: 0, e: 'The pole is the sharp move, the flag is the pause. Continuation is the usual resolution.' },
  { q: 'An ascending triangle is generally read as:', o: ['Bearish', 'Bullish continuation with flat resistance and rising lows', 'Neutral forever', 'A reversal only'], a: 1, e: 'Buyers keep paying up while sellers hold one price. That pressure usually resolves upward.' },
  { q: 'A shooting star appears:', o: ['At the top of an uptrend with a long upper wick', 'At the bottom of a downtrend', 'Only on weekly charts', 'During circuit halts'], a: 0, e: 'Buyers pushed high and lost the entire move by the close. That is a warning of exhaustion.' },
  { q: 'The measured move of a triangle breakout is estimated by:', o: ['Projecting the widest part of the triangle from the breakout point', 'Doubling the price', 'Using the PE ratio', 'Halving the volume'], a: 0, e: 'It is a rough target, not a promise. Manage the trade with price action, not with the target alone.' },
  { q: 'A cup and handle is:', o: ['A bullish continuation pattern', 'A bearish reversal', 'A candlestick', 'A volume oscillator'], a: 0, e: 'Rounded base plus a shallow pullback. The handle should not retrace deep into the cup.' },
  { q: 'The biggest risk when reading patterns is:', o: ['They are illegal', 'Seeing patterns that are not statistically meaningful', 'They require options', 'Brokerage cost'], a: 1, e: 'The human brain finds shapes in noise. Confirmation, volume and risk control are what keep you honest.' },
]

const T5 = [
  { q: 'Risking 1 percent per trade on a 5,00,000 account means a maximum loss of:', o: ['Rs 500', 'Rs 5,000', 'Rs 50,000', 'Rs 1,00,000'], a: 1, e: 'One percent of 5,00,000 is 5,000. Position size follows from that number and your stop distance.' },
  { q: 'A 1:3 risk-reward trade means:', o: ['Risk 3 to make 1', 'Risk 1 to make 3', 'Guaranteed 3x', 'Three trades per day'], a: 1, e: 'At 1:3 you can be wrong more often than right and still finish the month green.' },
  { q: 'After a 50 percent drawdown you need what gain to recover?', o: ['50 percent', '75 percent', '100 percent', '150 percent'], a: 2, e: 'Losses compound cruelly. Halving means you must double just to get back to level.' },
  { q: 'Position size should be derived from:', o: ['Your conviction level', 'Stop distance and account risk per trade', 'Tips from social media', 'The stock price'], a: 1, e: 'Size = rupee risk / (entry minus stop). Conviction is an emotion, not a sizing input.' },
  { q: 'The main risk of leverage in F&O is that it:', o: ['Reduces losses', 'Amplifies both gains and losses', 'Removes brokerage', 'Guarantees profit'], a: 1, e: 'SEBI studies repeatedly find the large majority of individual F&O traders lose money.' },
  { q: 'A trailing stop is used to:', o: ['Lock in gains while letting a winner run', 'Add to a loser', 'Increase leverage', 'Avoid tax'], a: 0, e: 'It follows price in your favour and never moves against you.' },
  { q: 'Revenge trading after a loss usually leads to:', o: ['Faster recovery', 'Larger unplanned losses', 'Better discipline', 'Lower volatility'], a: 1, e: 'Emotion raises size and drops standards at exactly the worst moment.' },
  { q: 'Diversification mainly reduces:', o: ['Market-wide risk', 'Company-specific risk', 'Brokerage', 'Volatility to zero'], a: 1, e: 'Spreading across companies removes single-stock blowups. Systemic market risk stays.' },
  { q: 'A trading journal is valuable because it:', o: ['Is required by SEBI', 'Turns your results into feedback you can actually learn from', 'Reduces STT', 'Predicts price'], a: 1, e: 'Without written entries, exits and reasons, you repeat the same mistake with a new stock name.' },
  { q: 'The realistic first goal for a new market participant is:', o: ['Doubling money in a month', 'Not blowing up while you learn the process', 'Trading maximum leverage', 'Copying every tip'], a: 1, e: 'Survival compounds. Capital preservation is what buys you enough time to get good.' },
]

const F6 = [
  { q: 'A mutual fund NAV is:', o: ['The market price you bid for', 'Net asset value per unit at end of day', 'The fund total assets', 'The expense ratio'], a: 1, e: 'Open ended funds transact at NAV computed after market close. Only ETFs trade live on the exchange.' },
  { q: 'The main difference between an index fund and an ETF is that an ETF:', o: ['Has no expense ratio', 'Trades on the exchange at live prices', 'Guarantees returns', 'Cannot track an index'], a: 1, e: 'Both track an index. An ETF needs a demat account and can trade at a premium or discount to its NAV.' },
  { q: 'A direct plan of a mutual fund differs from a regular plan because it:', o: ['Invests in different stocks', 'Carries no distributor commission, so a lower expense ratio', 'Is only for institutions', 'Has a lock-in'], a: 1, e: 'Same portfolio, same manager. Over 20 years that commission gap alone can cost several lakh.' },
  { q: 'Buying a bond makes you:', o: ['An owner of the company', 'A lender to the issuer', 'A director', 'A distributor'], a: 1, e: 'Bondholders get paid before shareholders, which is why they earn less when things go well.' },
  { q: 'When market interest rates rise, prices of existing bonds:', o: ['Rise', 'Fall', 'Stay flat', 'Double'], a: 1, e: 'New bonds pay more, so older lower-coupon bonds must get cheaper to compete. Longer maturity means a bigger fall.' },
  { q: 'A REIT lets you own a slice of:', o: ['Government bonds', 'Rent generating commercial real estate', 'Gold reserves', 'Foreign currency'], a: 1, e: 'Indian REITs must distribute the bulk of their net distributable cash flow to unitholders.' },
  { q: 'An InvIT typically holds:', o: ['Residential flats', 'Infrastructure assets such as roads, transmission lines or pipelines', 'Only shares', 'Bank deposits'], a: 1, e: 'It is the infrastructure cousin of a REIT, and the income usually comes from tolls or annuities.' },
  { q: 'An ELSS fund carries a lock-in of:', o: ['1 year', '3 years', '5 years', '15 years'], a: 1, e: 'Three years, the shortest lock-in among the tax-saving options under the old regime Section 80C.' },
  { q: 'The main appeal of a sovereign gold bond over physical gold is:', o: ['You can wear it', 'It pays interest and avoids storage or purity risk', 'It never falls in price', 'It has no tenure'], a: 1, e: 'Gold price exposure plus a fixed interest coupon, with no locker charges and no making charges.' },
  { q: 'For most people, the biggest advantage of an index fund is:', o: ['Guaranteed outperformance', 'Low cost and no fund manager risk', 'Zero volatility', 'Assured dividends'], a: 1, e: 'You accept the market return and remove both high fees and the risk of picking a manager who underperforms.' },
]

const F7 = [
  { q: 'CAGR measures:', o: ['Total return over the period', 'The smoothed annual growth rate', 'Return adjusted for tax', 'Return of a SIP'], a: 1, e: 'CAGR flattens a lumpy journey into one annual number. It hides how violent the ride actually was.' },
  { q: 'For a SIP with many uneven cash flows, the right return measure is:', o: ['CAGR', 'XIRR', 'Absolute return', 'Simple average'], a: 1, e: 'XIRR weights every instalment by how long it stayed invested. CAGR quietly assumes a single lumpsum.' },
  { q: 'Rs 1 lakh compounding at 12 percent roughly doubles in:', o: ['3 years', '6 years', '12 years', '20 years'], a: 1, e: 'Rule of 72: divide 72 by the rate. 72 / 12 = 6 years.' },
  { q: 'The single biggest driver of a long-term SIP corpus is:', o: ['Picking the top performing fund', 'The number of years you stay invested', 'Timing each instalment', 'The fund name'], a: 1, e: 'Compounding is exponential in time. Ten extra years usually beats two extra percent of return.' },
  { q: 'Rebalancing a portfolio means:', o: ['Selling everything in a crash', 'Trimming what grew and topping up what lagged to restore target weights', 'Only buying more of the winner', 'Switching brokers'], a: 1, e: 'It is a mechanical way to sell high and buy low, and it keeps your risk level from silently drifting up.' },
  { q: 'Asset allocation refers to:', o: ['How you split money across equity, debt, gold and cash', 'Which stock you buy first', 'Your broker plan', 'The tax slab'], a: 0, e: 'Studies consistently find allocation explains far more of a portfolio outcome than individual security picks.' },
  { q: 'An emergency fund should sit in:', o: ['Small cap stocks', 'Liquid, low-risk instruments you can reach in a day', 'Locked fixed deposits', 'Options'], a: 1, e: 'Its job is availability, not return. Six months of expenses in a savings account or liquid fund is the usual rule.' },
  { q: 'Holding 40 stocks across 12 sectors mainly reduces:', o: ['Market risk', 'Company-specific risk', 'Inflation risk', 'Currency risk'], a: 1, e: 'Diversification kills single-stock blowups. When the whole market falls, everything falls together.' },
  { q: 'Over-diversification, say 80 funds and stocks, usually produces:', o: ['Higher returns', 'Index-like returns with far more work and cost', 'Zero risk', 'Better tax treatment'], a: 1, e: 'Past roughly 25 to 30 well-chosen holdings you have quietly bought an expensive, hand-built index.' },
  { q: 'Rupee cost averaging works because a fixed SIP amount buys:', o: ['More units when prices are low', 'Fewer units when prices are low', 'The same units always', 'Only on rallies'], a: 0, e: 'Your average cost drifts below the average price, and you stop trying to guess the bottom.' },
]

const F8 = [
  { q: 'Listed equity held for more than 12 months is taxed as:', o: ['Short term capital gain', 'Long term capital gain', 'Business income', 'Tax free'], a: 1, e: 'Twelve months is the line for listed equity and equity mutual funds. Below it, gains are short term.' },
  { q: 'Long term capital gains on listed equity are exempt up to:', o: ['Rs 50,000 a year', 'Rs 1 lakh a year', 'Rs 1.25 lakh a year', 'No exemption'], a: 2, e: 'The exemption was raised to Rs 1.25 lakh per financial year in the July 2024 budget. Gains above it are taxed.' },
  { q: 'Dividends received by an individual investor are:', o: ['Fully exempt', 'Taxed at the investor slab rate', 'Taxed at a flat 10 percent', 'Taxed only above Rs 10 lakh'], a: 1, e: 'Since FY 2020-21 the tax moved from the company to you, at your slab, with TDS deducted above a threshold.' },
  { q: 'Tax loss harvesting means:', o: ['Hiding gains from the department', 'Booking a loss to offset a realised gain in the same year', 'Never selling', 'Claiming a loss twice'], a: 1, e: 'Perfectly legal. Realise the loss, offset it against gains, and buy back only if the idea is still sound.' },
  { q: 'A fund with a 1.8 percent expense ratio versus one at 0.2 percent costs you:', o: ['Nothing, fees are paid by the AMC', '1.6 percent of your corpus every single year', 'Only in the first year', 'Only if you sell'], a: 1, e: 'It is deducted daily from NAV. Compounded across two decades that gap can consume a fifth of the final corpus.' },
  { q: 'Loss aversion in investing describes the tendency to:', o: ['Feel a loss far more intensely than an equal gain', 'Always cut losses early', 'Never take risk', 'Only buy winners'], a: 0, e: 'It is why people hold losers hoping to break even and sell winners early. Exactly backwards.' },
  { q: 'Anchoring shows up when an investor:', o: ['Refuses to sell below the price they paid', 'Diversifies widely', 'Reads the annual report', 'Uses a SIP'], a: 0, e: 'The market has no idea what you paid. Your purchase price is not a valuation input.' },
  { q: 'Recency bias makes investors:', o: ['Study long history', 'Assume the last two years will repeat forever', 'Ignore news', 'Prefer bonds'], a: 1, e: 'It is why small cap SIPs peak right after a small cap rally, which is usually the worst possible time.' },
  { q: 'Survivorship bias in fund performance data means:', o: ['Only closed funds are shown', 'Funds that failed and merged away are missing, flattering the average', 'Returns are inflated by tax', 'Nothing important'], a: 1, e: 'The dead funds vanish from the table, so the surviving category average looks better than reality was.' },
  { q: 'A written investment policy, one page listing your goals, allocation and sell rules, mainly protects you from:', o: ['Market falls', 'Your own decisions during panic and euphoria', 'Brokerage', 'Inflation'], a: 1, e: 'The plan is written when you are calm precisely so it can be followed when you are not.' },
]

const T6 = [
  { q: 'Which of these is NOT a real Fibonacci ratio?', o: ['23.6%', '38.2%', '50%', '61.8%'], a: 2, e: 'Fifty percent is a Dow theory halfway level that traders kept out of habit. It is not derived from the sequence.' },
  { q: 'The Fibonacci golden zone that traders watch most for pullbacks is:', o: ['0 to 23.6%', '38.2% to 61.8%', '78.6% to 100%', 'Above 100%'], a: 1, e: 'Healthy trend pullbacks tend to stall in that band. A break well past 61.8% weakens the whole idea.' },
  { q: 'The standard pivot point is calculated as:', o: ['(High + Low + Close) / 3', '(Open + Close) / 2', 'High minus Low', '(High + Low) / 2'], a: 0, e: 'Support and resistance levels are then derived arithmetically from that pivot and the prior range.' },
  { q: 'A breakaway gap usually appears:', o: ['At the end of a trend', 'At the start of a new move, out of a base or range', 'Only on expiry day', 'Only in penny stocks'], a: 1, e: 'It signals a genuine shift and normally comes with a big volume expansion.' },
  { q: 'An exhaustion gap typically signals:', o: ['A trend is beginning', 'A trend may be ending', 'Nothing at all', 'A stock split'], a: 1, e: 'Late in an extended move, on huge volume, and then price fails to follow through. The last buyers just arrived.' },
  { q: 'Multi-timeframe analysis means:', o: ['Using ten indicators', 'Checking a higher timeframe for direction and a lower one for entry', 'Trading only weekly charts', 'Averaging two stocks'], a: 1, e: 'Direction from the higher timeframe, precision from the lower one. Fighting the higher timeframe is expensive.' },
  { q: 'On-balance volume adds volume on up days and subtracts it on down days to track:', o: ['Volatility', 'Accumulation or distribution pressure', 'Valuation', 'Dividend yield'], a: 1, e: 'Rising OBV while price goes sideways hints that someone is quietly accumulating.' },
  { q: 'A high delivery percentage on a big up move suggests:', o: ['Pure intraday churn', 'Buyers actually taking delivery, so more conviction', 'A circuit halt', 'Low volume'], a: 1, e: 'Delivery percentage is an Indian-market advantage. It separates real accumulation from intraday noise.' },
  { q: 'VWAP is calculated using:', o: ['Only closing prices', 'Price weighted by traded volume through the day', 'The pivot formula', 'The 200 DMA'], a: 1, e: 'Institutions benchmark execution against it, so intraday price often gravitates back toward VWAP.' },
  { q: 'A runaway or measuring gap in a strong trend usually means:', o: ['The move is over', 'The move is continuing with force, often near the midpoint', 'A reversal is certain', 'Volume dried up'], a: 1, e: 'Traders sometimes project the move from the gap, treating it as roughly the halfway mark.' },
]

const T7 = [
  { q: 'Buying a call option gives you:', o: ['An obligation to buy', 'The right, not the obligation, to buy at the strike', 'Ownership of the shares', 'A dividend'], a: 1, e: 'You pay a premium for that right. The most you can lose as a buyer is the premium.' },
  { q: 'The seller (writer) of an option faces:', o: ['Limited risk and unlimited profit', 'Limited profit and potentially very large risk', 'No risk', 'The same payoff as the buyer'], a: 1, e: 'The writer keeps the premium at best. That is exactly why writing needs margin and strict risk control.' },
  { q: 'Option premium is made up of:', o: ['Intrinsic value plus time value', 'Only intrinsic value', 'Strike minus lot size', 'Margin plus brokerage'], a: 0, e: 'Out of the money options are pure time value, which is why they decay to zero so reliably.' },
  { q: 'Theta measures the effect of:', o: ['Volatility', 'Passing time on the option price', 'Interest rates', 'The underlying move'], a: 1, e: 'Theta works against buyers every single day and accelerates sharply in the final week before expiry.' },
  { q: 'Delta of roughly 0.5 usually indicates an option that is:', o: ['Deep in the money', 'At the money', 'Far out of the money', 'Expired'], a: 1, e: 'Delta also loosely approximates the market-implied probability of finishing in the money.' },
  { q: 'Implied volatility rising sharply before an event does what to option premiums?', o: ['Lowers them', 'Raises them', 'No effect', 'Freezes them'], a: 1, e: 'After the event IV collapses. Buyers are often right on direction and still lose money to that crush.' },
  { q: 'Open interest measures:', o: ['Volume traded today', 'Total contracts currently outstanding', 'Number of traders', 'The lot size'], a: 1, e: 'Rising price with rising OI suggests fresh longs. Rising price with falling OI usually means short covering.' },
  { q: 'In a futures contract, mark to market means:', o: ['Profit or loss is settled in cash daily', 'You settle only at expiry', 'The exchange marks the stock', 'Delivery is compulsory daily'], a: 0, e: 'Your margin account is debited or credited every evening, which is why a losing position triggers margin calls.' },
  { q: 'Stock futures and options in India are settled at expiry by:', o: ['Cash only', 'Physical delivery of the shares', 'Rollover only', 'Whatever you choose'], a: 1, e: 'Since 2019 stock derivatives are physically settled. Index derivatives remain cash settled.' },
  { q: 'Repeated SEBI studies on individual traders in equity derivatives found that:', o: ['Most made money', 'The large majority lost money', 'Returns matched the index', 'Only institutions lost'], a: 1, e: 'Leverage multiplies whatever edge you have. Without an edge it simply multiplies losses and costs.' },
]

const T8 = [
  { q: 'A core tenet of Dow theory is that:', o: ['Volume is irrelevant', 'The averages must confirm each other', 'Trends never persist', 'Only weekly charts matter'], a: 1, e: 'Dow wanted the industrial and transport averages to agree. The modern version is index and breadth agreeing.' },
  { q: 'Market breadth measures:', o: ['How wide the price range is', 'How many stocks participate in a move, not just the index', 'The bid-ask spread', 'Total market cap'], a: 1, e: 'An index at a record high on narrow breadth means a handful of heavyweights are carrying everyone else.' },
  { q: 'The advance-decline line tracks:', o: ['Advancing minus declining stocks, accumulated over time', 'Volume only', 'Only Nifty 50 stocks', 'Option open interest'], a: 0, e: 'When the index rises while the A-D line falls, the rally is thinner than the headline number suggests.' },
  { q: 'Relative strength, in the sector rotation sense, compares:', o: ['A stock to its own past momentum', 'A stock or sector against a benchmark index', 'RSI to MACD', 'Volume to price'], a: 1, e: 'It is a different tool from RSI. Relative strength is a ratio chart of one thing divided by another.' },
  { q: 'Sector rotation describes how money tends to:', o: ['Leave the market entirely', 'Move between sectors as the economic cycle turns', 'Stay in one sector forever', 'Follow expiry dates'], a: 1, e: 'Rate-sensitive and cyclical names lead early, defensives take over late. Knowing the phase sets expectations.' },
  { q: 'Overfitting a backtest means the system was:', o: ['Tested on too much data', 'Tuned so tightly to past data that it fails on new data', 'Too simple', 'Never tested'], a: 1, e: 'Add enough parameters and you can make any strategy look perfect in hindsight. Out-of-sample testing exposes it.' },
  { q: 'Look-ahead bias in a backtest occurs when the system uses:', o: ['Only past data', 'Information that was not actually available at that moment', 'Weekly candles', 'Real brokerage'], a: 1, e: 'A classic case is using a quarterly result on the quarter-end date, weeks before it was actually published.' },
  { q: 'Expectancy per trade is calculated as:', o: ['(Win rate x average win) - (Loss rate x average loss)', 'Wins minus losses', 'Total profit / capital', 'Average holding period'], a: 0, e: 'A positive expectancy across a large sample is the only real evidence that an edge exists.' },
  { q: 'A trading system needs a written plan mainly because it:', o: ['Impresses others', 'Defines entry, exit, size and invalidation before emotion arrives', 'Reduces brokerage', 'Is required by SEBI'], a: 1, e: 'Every rule you did not write down in advance becomes negotiable at exactly the wrong moment.' },
  { q: 'Before risking real money, a new system should first be:', o: ['Scaled to full size immediately', 'Backtested, then paper traded or run at minimum size', 'Leveraged 10 times', 'Kept secret'], a: 1, e: 'Backtests miss slippage, liquidity and your own behaviour. Small live size reveals all three cheaply.' },
]

const F9 = [
  { q: 'A bank makes money primarily from:', o: ['Selling products at a markup', 'The gap between what it pays depositors and charges borrowers', 'Government grants', 'Trading its own shares'], a: 1, e: 'It rents money. That spread, measured against assets, is the net interest margin.' },
  { q: 'CASA stands for:', o: ['Capital and Statutory Assets', 'Current Account Savings Account', 'Cash and Secured Advances', 'Credit Approval Standard Assessment'], a: 1, e: 'These deposits pay little or no interest, so a high CASA ratio means cheap funding and a fatter margin.' },
  { q: 'Net interest margin is best described as:', o: ['Net profit over revenue', 'Net interest income over average earning assets', 'Deposits over loans', 'Interest paid over interest earned'], a: 1, e: 'NIM is the core profitability measure for a lender. Ordinary operating margins tell you almost nothing here.' },
  { q: 'A loan usually becomes a non-performing asset when interest or principal is overdue for:', o: ['30 days', '60 days', '90 days', '180 days'], a: 2, e: 'Ninety days is the RBI norm for most loans. Before that it is a special mention account, which is the early warning.' },
  { q: 'Net NPA differs from gross NPA because net NPA is:', o: ['Before provisions', 'After subtracting provisions already made', 'Only retail loans', 'Only restructured loans'], a: 1, e: 'A large gap between the two means the bank has already set aside money against the bad book.' },
  { q: 'Provision coverage ratio measures:', o: ['Loans over deposits', 'Provisions held against gross NPAs', 'Capital over assets', 'CASA over total deposits'], a: 1, e: 'High PCR means future write-offs are already funded. Low PCR means the pain is still ahead.' },
  { q: 'Credit cost refers to:', o: ['The interest a bank pays', 'Provisions for bad loans as a share of the loan book', 'The cost of opening branches', 'Brokerage on lending'], a: 1, e: 'It is the single line that turns a good lending year into a bad one, and it moves with the cycle.' },
  { q: 'Capital adequacy ratio exists to ensure a bank:', o: ['Pays dividends', 'Holds enough capital against its risk-weighted assets to absorb losses', 'Lends to everyone', 'Keeps NIM high'], a: 1, e: 'It is the regulatory buffer between depositors and a lending mistake, and RBI sets the floor.' },
  { q: 'For banks, price-to-book is usually preferred to price-to-earnings because:', o: ['Banks have no earnings', 'Earnings swing violently with provisions, while book value is more stable', 'PB is always lower', 'RBI requires it'], a: 1, e: 'One bad credit cycle can wipe out a year of profit. Book value per share moves far less abruptly.' },
  { q: 'An asset liability mismatch at a lender means:', o: ['Assets exceed liabilities', 'Borrowing short term to lend long term, creating refinancing risk', 'Too much CASA', 'NPAs are rising'], a: 1, e: 'This is what has repeatedly broken NBFCs. The loans are fine, the funding simply stops rolling over.' },
]

const F10 = [
  { q: 'A stock screener is best used to:', o: ['Pick the final stock to buy', 'Narrow thousands of companies to a shortlist worth reading about', 'Predict prices', 'Replace the annual report'], a: 1, e: 'A screen is a filter, not a decision. Everything that matters comes after the shortlist.' },
  { q: 'The management discussion and analysis section of an annual report contains:', o: ['Audited numbers only', 'Management explaining performance, industry conditions and outlook', 'The share price chart', 'Broker recommendations'], a: 1, e: 'Read it across three years side by side. Promises that quietly disappear are the useful signal.' },
  { q: 'An auditor qualification in the annual report means the auditor:', o: ['Is highly qualified', 'Has raised a reservation about the accounts', 'Approved everything', 'Resigned'], a: 1, e: 'A qualified opinion is the auditor putting a caveat in writing. It rarely appears without reason.' },
  { q: 'An earnings call is valuable mainly because:', o: ['Management reads the press release aloud', 'Analysts ask unscripted questions and you hear what management avoids', 'It moves the price', 'It replaces the annual report'], a: 1, e: 'Read the transcript. The questions that get deflected repeatedly are usually the ones that matter.' },
  { q: 'Rising promoter pledge across several quarters suggests:', o: ['Strong confidence', 'Promoters may be short of liquidity, and forced selling risk is building', 'Higher dividends', 'Lower debt'], a: 1, e: 'Track the trend, not one snapshot. A steadily rising pledge percentage is a governance warning.' },
  { q: 'Cash conversion, comparing operating cash flow with net profit, tells you:', o: ['How fast the share price moves', 'Whether reported profit is turning into actual cash', 'The dividend yield', 'The tax rate'], a: 1, e: 'Profit consistently far above operating cash flow, year after year, is the classic accounting warning.' },
  { q: 'Where in an annual report do you find related party transactions?', o: ['On the cover page', 'In the notes to accounts, with a dedicated schedule', 'In the chairman letter', 'They are not disclosed'], a: 1, e: 'They have their own note. Compare the rupee value against revenue rather than reading the list and moving on.' },
  { q: 'Shareholding pattern data is filed with the exchanges:', o: ['Daily', 'Quarterly', 'Yearly', 'Never'], a: 1, e: 'Watching promoter, FII, DII and public holding shift quarter by quarter is free and often revealing.' },
  { q: 'Contingent liabilities are important because they:', o: ['Are already in the P&L', 'May become real liabilities and sit only in the notes', 'Are always zero', 'Reduce tax'], a: 1, e: 'Disputed tax demands and guarantees live there. Compare their size to net worth before shrugging them off.' },
  { q: 'The most reliable order of research is:', o: ['Price chart, then tip, then buy', 'Screen, read the business, read the accounts, then judge the price', 'Buy first, research later', 'Follow whoever posts most'], a: 1, e: 'Valuation is the last question, not the first. A cheap price on a business you cannot explain is not an edge.' },
]

const T9 = [
  { q: 'A stop-loss market order differs from a stop-loss limit order because it:', o: ['Never triggers', 'Becomes a market order once triggered, so it fills but not at a guaranteed price', 'Guarantees your exact price', 'Only works intraday'], a: 1, e: 'SL-M prioritises getting out. SL with a limit can be skipped entirely in a fast move, leaving you still in the trade.' },
  { q: 'A bracket order attaches:', o: ['Only a target', 'A target and a stop-loss to the entry at the same time', 'Two entries', 'A dividend'], a: 1, e: 'The idea is that the exit plan exists before the trade does, rather than being improvised under pressure.' },
  { q: 'A GTT order is:', o: ['An exchange order valid for a year', 'A broker-side trigger that places the order when your price is hit', 'A type of IPO bid', 'A margin product'], a: 1, e: 'Good Till Triggered sits at the broker, not the exchange, so it depends on your broker systems being up.' },
  { q: 'An after market order (AMO) is:', o: ['Executed immediately at night', 'Queued after hours and sent to the exchange when the market next opens', 'Only for institutions', 'A block deal'], a: 1, e: 'It is a convenience for people who cannot watch the open. It does not get you a better price.' },
  { q: 'Impact cost measures:', o: ['Brokerage', 'How much the price moves against you when you execute a given size', 'The stamp duty', 'Circuit limits'], a: 1, e: 'NSE uses it to judge index eligibility. In an illiquid stock it can dwarf every visible charge.' },
  { q: 'Stocks placed in the Trade to Trade (T2T) segment:', o: ['Can be traded intraday freely', 'Must be taken in delivery, no intraday squaring off', 'Are delisted', 'Have no circuit limit'], a: 1, e: 'Exchanges move stocks there to curb speculation, usually after abnormal price moves.' },
  { q: 'ASM and GSM frameworks exist to:', o: ['Reward high volume stocks', 'Apply extra surveillance and margins to stocks showing unusual activity', 'Guarantee returns', 'Increase leverage'], a: 1, e: 'Landing in these lists raises margins and restricts trading, which frequently traps leveraged positions.' },
  { q: 'On a delivery equity trade, STT is charged:', o: ['Only on the buy side', 'On both buy and sell sides', 'Only on the sell side', 'Never'], a: 1, e: 'Intraday equity charges STT only on the sell side, which is one reason the two cost structures differ so much.' },
  { q: 'A trader making 30 small intraday trades a day should worry most about:', o: ['Dividend dates', 'Cumulative costs and slippage overwhelming a thin edge', 'Annual reports', 'Circuit filters'], a: 1, e: 'Brokerage, STT, exchange fees, GST, stamp duty and slippage compound. Many strategies are profitable only before costs.' },
  { q: 'A limit order placed far from the current price mainly risks:', o: ['Filling too fast', 'Never filling, so you miss the move entirely', 'Extra brokerage', 'Triggering a circuit'], a: 1, e: 'Limit orders trade price certainty for execution uncertainty. Market orders make the opposite trade.' },
]

const T10 = [
  { q: 'The NSE pre-open session collects orders between:', o: ['8:00 and 8:30', '9:00 and 9:08', '9:15 and 9:30', '9:30 and 10:00'], a: 1, e: 'Order entry runs 9:00 to 9:08, matching 9:08 to 9:12, then a buffer before the normal session opens at 9:15.' },
  { q: 'The pre-open session exists mainly to:', o: ['Let institutions trade first', 'Discover a fair opening price through a call auction instead of a chaotic open', 'Set circuit limits', 'Collect STT'], a: 1, e: 'Overnight news is absorbed in one auction rather than through a violent first few seconds of trading.' },
  { q: 'The official closing price of an NSE equity is:', o: ['The last traded price', 'A volume weighted average of trades in the last 30 minutes', 'The day high', 'The pre-open price'], a: 1, e: 'Using a weighted average makes the close far harder to manipulate with a single late trade.' },
  { q: 'The opening range breakout strategy uses:', o: ['The whole day range', 'The high and low of the first fixed window, often 15 or 30 minutes', 'Yesterday close only', 'The pre-open price alone'], a: 1, e: 'A break of that early range with volume is the setup. It also produces plenty of false breaks on quiet days.' },
  { q: 'The first hour of trading typically has:', o: ['The tightest spreads and lowest volatility', 'The widest spreads and highest volatility', 'No volume', 'Guaranteed direction'], a: 1, e: 'Overnight orders and news collide. It is where beginners are most often stopped out before the real move.' },
  { q: 'A bulk deal must be disclosed when a single client trades more than:', o: ['0.5% of listed shares of a company', '5% of listed shares', '10% of listed shares', '25% of listed shares'], a: 0, e: 'Bulk deals cross 0.5% and are disclosed the same day. Block deals happen in a separate window at negotiated size.' },
  { q: 'On monthly expiry day, index option premiums tend to:', o: ['Rise steadily', 'Decay very fast as time value collapses toward zero', 'Stay flat', 'Become risk free'], a: 1, e: 'Gamma and theta both go extreme near expiry. Positions can swing violently on small underlying moves.' },
  { q: 'Muhurat trading is:', o: ['A daily auction', 'A special short session held on Diwali', 'A settlement cycle', 'An IPO window'], a: 1, e: 'A symbolic hour-long session marking the start of the Hindu accounting year. Volumes are thin and mostly ceremonial.' },
  { q: 'Trading during the quiet mid-session usually means:', o: ['Larger, easier moves', 'Smaller ranges, so costs eat a bigger share of any profit', 'Zero risk', 'Higher leverage'], a: 1, e: 'Between roughly 11am and 2pm ranges compress. Strategies that need movement simply stop working.' },
  { q: 'Index derivatives in India are settled:', o: ['By physical delivery', 'In cash', 'In shares of the index constituents', 'Not at all'], a: 1, e: 'Index derivatives settle in cash. Single stock derivatives have been physically settled since 2019.' },
]

export const BANK = {
  fundamental: { 1: F1, 2: F2, 3: F3, 4: F4, 5: F5, 6: F6, 7: F7, 8: F8, 9: F9, 10: F10 },
  technical: { 1: T1, 2: T2, 3: T3, 4: T4, 5: T5, 6: T6, 7: T7, 8: T8, 9: T9, 10: T10 },
}
