# InvestoMillionaire

The Indian stock market, taught through diagrams you can rotate.

Two learning tracks (fundamentals and technicals), ten gated levels each, a 3D diagram per lesson,
200 server-scored quiz questions, an IPO tracker wired to the NSE issue feed, and a live market news
feed pulled from Indian financial desks. React on the front, Express and MongoDB behind it.

**Not a SEBI registered entity.** Everything here is educational material. The site gives no
investment advice and recommends no stock. See `client/src/pages/Disclaimer.jsx` for the full text
that ships on the site.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, Vite, Tailwind v4, Framer Motion |
| 3D | react-three-fiber, drei, three.js |
| API | Express 5, JWT auth, Zod validation, rate limiting |
| Data | MongoDB via Mongoose |
| News | RSS from Economic Times, Livemint, Business Standard, BusinessLine |
| IPO | NSE public issue API, InvestorGain for GMP, IPO Watch and ET for coverage |
| Broker calls | ET Stock Recos and market feeds, attributed by firm name |

## Running it

You need Node 20 or newer and a MongoDB you can reach. The fastest local database is Docker:

```bash
docker run -d --name investo-mongo -p 27017:27017 mongo:7
```

Then start the API:

```bash
cd server
cp .env.example .env      # fill in JWT_SECRET before you deploy anywhere real
npm install
npm run dev               # http://localhost:5050
```

And the site, in a second terminal:

```bash
cd client
npm install
npm run dev               # http://localhost:5173
```

Vite proxies `/api` to port 5050, so nothing else needs configuring in development.

## Environment

`server/.env`:

| Key | Meaning |
| --- | --- |
| `PORT` | API port, defaults to 5050 |
| `MONGODB_URI` | Connection string, local or Atlas |
| `JWT_SECRET` | Signs both login tokens and quiz session tokens. Use a long random string. |
| `CLIENT_ORIGIN` | Comma separated list of allowed CORS origins |
| `FIELD_ENCRYPTION_KEY` | 32 bytes of hex. Encrypts mobile numbers at rest. Generate with `openssl rand -hex 32`. |
| `RESEND_API_KEY` | Sends the OTP email over Resend's HTTPS API. Leave blank in dev. |
| `MAIL_FROM` | Sender address. Has to sit on a domain verified in Resend. |
| `ADMIN_TOKEN` | Shared secret for the admin endpoint that can decrypt mobile numbers. |

Losing `FIELD_ENCRYPTION_KEY` means every stored mobile number becomes unreadable. There is no
recovery path, by design. Back it up somewhere you would back up a database password.

The client reads an optional `VITE_API_URL` if you host the API on a different domain.

## How the pieces fit

**Lessons** live in `client/src/data/lessons.js` as structured content, not markup. Each one names a
`scene`, and `three/LessonScene.jsx` maps that to one of twelve reusable WebGL components: candlestick
charts with five overlay presets (plain, support and resistance, moving averages, head and shoulders,
Fibonacci), comparison towers, a balance-sheet scale, an order book, a moat diagram, a risk-return
scatter, compounding bars, a Black-Scholes option payoff surface, a sector rotation wheel, a bank
spread flow, a research funnel, and a trading-session timeline.
Adding a lesson means adding an object, not writing a new scene.

**Quizzes** never send answers to the browser. `GET /api/quiz/:track/:level` shuffles the question
pool, signs the chosen order into a short-lived JWT, and returns the questions with the answer key
stripped. The browser posts back its picks plus that token, and the server rescores from its own
copy of the bank. Levels unlock only after the previous one clears 70 percent, enforced on the API
rather than in the UI.

**IPOs** come from the NSE public endpoints, the same numbers the exchange shows on its own site:
`/api/ipo-current-issue` for live subscription, `/api/all-upcoming-issues` for the announced pipeline,
and `/api/ipo-active-category` for the category split behind each issue. Published stories from ET,
Livemint and IPO Watch are matched to each company by name tokens and shown as links.

Grey market premium comes from the feed behind InvestorGain's public GMP report, matched to each NSE
issue by company name with a confidence score. It also supplies lot size, post-issue P/E and the
allotment and listing dates, none of which the exchange feed carries. Every GMP figure on the site
ships with its source link and the timestamp the source itself published, because GMP is quoted in an
unregulated off-exchange market that SEBI has cautioned investors about, and no two publishers agree.
The page proves the point on its own: on the day this was written our source quoted one issue at
+107% while two Economic Times headlines on the same page said 90% and 73%.

Each issue also carries a verdict, one of APPLY, CONSIDER, RISKY or AVOID. It is a fixed rule set in
`server/src/data/verdict.js` scoring GMP, QIB and overall subscription, anchor allotment, P/E, board
and issue size. Every rule that fires is returned with its own points and rendered on the page, so a
reader can see exactly what produced the label and discard any part of it. Two guards keep it honest:
an issue that has not opened bidding can never reach APPLY, because there is no order book to read
yet, and a rule fires against issues where the grey market is euphoric while institutions have not
shown up. The score reads exchange and grey market numbers. It has read nothing about the business,
and it is not advice from a registered adviser.

The six-point prospectus checklist sits alongside it, held in the reader's own browser.

**Broker calls** are pulled from ET's stock recommendation feed and the market desks, then filtered
down to items where a named research firm is actually attached to the view. `server/src/data/brokers.js`
detects the firm, the rating and any target price from the headline, and separates a rated *call* from
a general *view*. Firm detection uses word boundaries rather than substring matching, which matters
more than it sounds: a plain `includes()` found "UBS" inside "subscribe" and would find "Citi" inside
"city". Every card names the desk and links to the story. None of it is our view.

**Desk notes** are the one place the site owner publishes their own thinking, through
`POST /api/reco/picks` behind the admin token, or `npm run pick` for an interactive prompt. A thesis
of at least thirty characters is required by the schema, and there is a field for what would prove the
idea wrong. That constraint is deliberate. A bare ticker with no reasoning is a tip, and the site does
not publish tips. Notes render as study notes with a stance of watching, studying or avoiding, never
as a call to buy.

**News** is filtered to stories that actually touch this market. The desks these feeds come from still
carry foreign wire copy, so an item has to name an Indian index, regulator, currency or company to
survive, and a story that is really about another market is dropped even if it mentions India in
passing. News is cached server side for ten minutes and deduplicated by headline. Each story gets a
bullish, bearish or neutral tag from a keyword pass over the title. Moneycontrol is deliberately
absent from the source list because its RSS endpoints answer 403 to anything that is not a browser.

**Accounts** verify the email before they exist. `POST /auth/signup/start` validates the details,
hashes the password, encrypts the mobile number and parks all of it on an OTP record, then emails a
six digit code. Only `POST /auth/signup/verify` writes a row to the users collection, so an
unverified address never becomes an account. Codes are stored as a SHA-256 hash with a ten minute
expiry, a five attempt ceiling and a sixty second resend gap, and Mongo sweeps expired ones with a
TTL index. Password reset runs the same machinery with `purpose: 'reset'`, and `POST /auth/forgot`
answers identically whether or not the address exists so it cannot be used to discover who has an
account.

Without `RESEND_API_KEY` the mailer prints the code to the server log instead of sending it, so the
whole flow is testable on a laptop with no mail account. Mail goes over HTTPS rather than SMTP
because Render blocks outbound SMTP ports on free instances.

**Mobile numbers** are encrypted with AES-256-GCM before they touch the database. The column is
`select: false`, `publicProfile()` omits it, and no public endpoint returns it in any form. Alongside
the ciphertext sits an HMAC fingerprint, which lets a duplicate number be detected without decrypting
anything, and the last four digits for display. The only path back to plain text is
`GET /api/admin/users?reveal=true` behind the `x-admin-token` header, compared in constant time, and
that endpoint answers 404 rather than 401 to anyone without the token.

**Progress** is XP driven. Reading a lesson is worth 15, each correct answer 10, a first clear 50,
and a perfect score another 25. Streaks are counted on Indian calendar days, so a session at
11pm IST and one the next morning count as consecutive.

## Layout

```
server/
  src/data/quizBank.js     200 questions, answer key never leaves this file
  src/data/gmp.js          grey market feed, name matching, source attribution
  src/data/verdict.js      the scoring rules behind every APPLY/AVOID label
  src/routes/              auth, news, ipo, reco, quiz, progress, admin
  src/models/              User, Attempt, Otp, Pick
  src/lib/crypto.js        AES-256-GCM field encryption, HMAC blind index, OTP hashing
  src/lib/mailer.js        OTP email over the Resend API, falls back to the server log
  src/data/brokers.js      research firm, rating and target detection
  src/scripts/pick.js      npm run pick, add or remove a desk note
client/
  src/three/               twelve reusable 3D scenes plus the canvas wrapper
  src/data/lessons.js      all lesson content
  src/pages/               one file per route
```

## Deploying

Build the client with `npm run build` in `client/` and serve `dist/` from any static host. Run the
API anywhere that can hold a Node process, point `MONGODB_URI` at Atlas, and set `CLIENT_ORIGIN` to
your real domain. Set a genuine `JWT_SECRET` first: the example value in `.env.example` would let
anyone forge both logins and quiz scores.

## Contact

investomillionaire@gmail.com
