# Stock Analyzer — architecture and build plan

> **Reader:** the owner (product/legal calls) and the one developer who builds this.
> **Decision in one line:** ship a **retrospective, as-of-date evidence report** built on free NSE archives and Upstox candles, with every number sourced and no aggregate action label, because SEBI's 30-day price-data lag rule (effective 1 July 2026) makes the live analyzer in the spec undeliverable on a non-registered education site, and the retrospective version is both legal and the better teaching product.
> Implements the owner's "Stock Analyzer" spec. Supersedes nothing; extends the IPO feature's house patterns (`verdict.js`, `gmp.js`, `ipo.js`) and honours the decisions already taken in `docs/design/DESIGN-worldclass-genz.md` §3.5 and Q5.

Date: 2026-09-20

---

## 0. What this touches (signal scan)

| Signal | Finding |
|---|---|
| **input** | Two user-controlled inputs: a stock name/ticker string, and analysis-type + horizon enum picks. The string is hostile (typos, wrong company, injection into an LLM prompt). Everything else entering the system is upstream exchange data, parsed as hostile (schema drift, split/bonus, missing rows). |
| **boundary** | Internal → external on every source fetch (NSE archives, Upstox, NSE corporate API). Data → public on every rendered number. The LLM stage is a trust boundary: model output is untrusted and post-filtered before it reaches the page. |
| **data** | Public exchange filings and prices only. No new PII. Existing `User.mobileEnc` (AES-256-GCM) is untouched. Report cache is public, per (symbol, as-of, type, horizon), no user identity attached — this is deliberate (see reg rule R8, no personalisation). |
| **money** | No charge, no paywall, no ad, no affiliate. That is not a UX choice; it is the load-bearing compliance fact (reg rule R1). A wrong *price* costs the site its accuracy claim, which is the whole product. |
| **control** | The presentation-policy chokepoint is a control: one module gates all output against the SEBI research-services blocklist. Inverse risk: a bug there is a silent recommendation leak, so it is enforced by a build-time throw (Stat.jsx) and a deterministic post-filter, not by prompt or review. |
| **execution** | Sync request → async job. A 13-stage pipeline plus an LLM call cannot run inside a Render free-tier request (15-min sleep, 30s cold start). Submit returns a signed report id; the pipeline runs and persists; the client polls. Nightly ingest runs from an external scheduler, at-least-once, so ingest must be idempotent per (symbol, date). |

**Size: Large.** New service surface (ingest + analyzer routes + pipeline + report page), a schema change (new collections), a new external dependency (Upstox), and an LLM integration. Multi-month build; the first shippable slice is days.

**Gate this forces:** `gate:arch` (owner must approve the retrospective reframing before code — it changes the output contract), and a hard **egress-reachability preflight** before any NSE-sourced data is committed to (the `boundary` line — the production host's IP is untested against NSE's Akamai wall).

---

## 1. The load-bearing decision: retrospective, as-of-date

**Chosen:** the analyzer runs *as of* a date, defaulting to **T-30 trading days**. The ingest job only ever writes bars and filings older than 30 days, so a live report is unreachable even by bug. A report shows what was knowable on the as-of date, and — the differentiator — what actually happened next.

Three independent forces converge here:

1. **Legal (hard blocker).** SEBI circular HO/47/17/12(11)2025-MRD-POD3/I/11107/2026, effective 1 July 2026, imposes a uniform 30-day lag on market price data used by "entities solely engaged in education" to name or display specific securities in a manner indicating future movement. The site self-describes as exactly that class (`Disclaimer.jsx`: "general educational material", "not SEBI registered"). A live per-stock analyzer is what this rule was written to stop.
2. **The site already decided the smaller version of this.** `DESIGN-worldclass-genz.md` §3.5 instructs deleting the IPO verdict verbs (APPLY/CONSIDER/RISKY/AVOID); Q5 recommends deleting the live broker-call feed because "the site cannot say it never recommends a stock on one page and publish price targets on another." The analyzer is a stronger version of the same conflict. Consistency requires the same answer.
3. **Product.** Retrospective mode is the only version whose pattern engine can ship at all (a completed double bottom with the 40 days that followed is a worked example; the same output on today's chart is a trade call), and it is the only version that can answer "does this work?" with a backtested number — which no finfluencer tool publishes.

**Rejected — live analyzer with strong disclaimers.** A disclaimer does not change substance. SEBI's "trading calls" definition (reg 2(1)(zc), inserted Dec 2024) explicitly catches "any recommendation related to securities that are not personalized or investor specific" — a description of a public analyzer. Phrasing cannot fix it.

**Rejected — register as a Research Analyst.** Registration triggers on *consideration* (reg 2(1)(fa)), and the site earns nothing today. Registration is a business decision the owner has not made, it imposes reg 20/25 record-keeping, and it forecloses the "consideration-free education" posture that keeps the finfluencer-association bar (Aug 2024) from closing off every future revenue door. Not the developer's call to make by default.

**Consequences.** No aggregate action-shaped label anywhere. No horizon "verdict." The scorer keeps `verdict.js`'s transparent-rules shape but loses the `BANDS` action labels — it becomes a *signal tally / data-coverage score* named something inert, never ranked against other stocks. The pattern engine publishes geometry and history, never a projected "target zone" or "invalidation level" as forward-looking levels (reg rule R6).

---

## 2. Data reality — what ships real, what ships "Data unavailable"

Honesty is the product. A report that says which numbers it verified and which it could not is more trustworthy than one that guesses, and it matches the spec's own no-fabrication rule.

| Spec area | Ships as | Source (verified) |
|---|---|---|
| Daily OHLCV, VWAP, trade count | **Real** | `nsearchives` full bhavcopy (`sec_bhavdata_full_DDMMYYYY.csv`), non-curl UA |
| **Delivery quantity / delivery %** | **Real** | same file (`DELIV_QTY`, `DELIV_PER`) |
| Multi-timeframe candles (D/W/M), 2015+ | **Real** | Upstox `v3/historical-candle` (unauth) — fast path; bhavcopy is the durable owned copy |
| EMA 20/50/100/200, RSI, MACD, ATR, RVOL, market structure | **Real** (with warmup gates) | computed from the above |
| Pattern geometry (double/triple bottom, parallel channel + registry) | **Real** (geometry only) | computed |
| Bulk / block deals | **Real, forward-only** | `nsearchives` `bulk.csv`/`block.csv` (current day only — no backfill; capture from day one) |
| Sector / peer classification | **Real for 756 Nifty-Total-Market names**, else "sector unclassified" | `ind_niftytotalmarket_list.csv` |
| Corporate announcements + order-book category | **Real** (reachability-gated — see §7) | `/api/corporate-announcements` (category `Bagging/Receiving of orders/contracts`) |
| Quarterly shareholding, promoter pledge, FII/DII deltas | **Real** (reachability-gated; v3) | `/api/corporate-share-holdings-master` + SHP XBRL |
| Quarterly P&L, revenue, EPS, margins | **Real, two-format seam** (reachability-gated; v3) | `integrated-filing-results` (2025+) stitched with `corporates-financial-results` (2005–2024) |
| Balance sheet, debt, CFO-vs-PAT | **Real, half-yearly only** (reachability-gated; v3) | INDAS annual/half-yearly XBRL |
| Banking GNPA/NNPA/NII/provisions | **Real** (v3) | BANKING XBRL |
| **NIM, CASA, CAR, NBFC AUM, IT attrition/utilisation, FMCG volume growth, insurance combined ratio/solvency** | **"Data unavailable"** | Not in any free structured source; PDF-only. Owner must choose LLM-extract-with-source or leave unavailable |
| Market-wide FII/DII net flow | **Real** (context only, not per-stock) | `/api/fiidiiTradeReact` |
| Per-stock institutional daily flow ("FIIs bought ₹X of this stock") | **"Data unavailable"** | Does not exist free in India |
| **Intraday** anything | **Cut** | No free source; Upstox unauth is days/weeks/months only |

**Rule:** a missing field renders the literal string "Data unavailable", plus the source that was checked and when. Never an interpolation, never a silent omission.

---

## 3. Regulatory rules the design enforces

These are engineering constraints, not style guidance. The line moved on 16 Dec 2024: registration triggers on *consideration*, and "research services" is an explicit blocklist (reg 2(1)(wa)).

- **R1 — No consideration.** No paywall, ad slot, broker referral, affiliate link, or paid-tier gating anywhere in the analyzer flow. A comment at the top of the analyzer route states this so no one quietly adds AdSense. Monetising this page means registering first.
- **R2 — Blocklist in code.** One `presentation-policy` module is the only thing that renders analyzer output. It enforces reg 2(1)(wa): no buy/sell/hold in any synonym, no price target, no stop loss, no model portfolio, no trading call, no opinion on a public offer. Clause (viii) ("similar nature or character") defeats renaming BUY to "Strong" or a green glyph — the test is substance.
- **R3 — The verb rule.** Output may contain *is, was, stands at, crossed, closed, rose, fell, measured, detected*. It may never contain *should, consider, recommend, suggests you, book, enter, exit, accumulate, avoid, buy, sell, target, stop loss*, or *overbought/oversold as a conclusion*. Terms of art attach to a number as a definition: "RSI(14) = 71.3 on 19 Sep 2026; readings above 70 are conventionally described as overbought. That describes the indicator, not what to do." Enforced as a regex deny-list at the render boundary — the inverse of `brokers.js` `RATINGS`, which already matches BUY/ACCUMULATE/SELL/TP phrasing.
- **R4 — Statistical-summary lane.** Computed ratios, growth, margins, shareholding deltas, pattern geometry are publishable facts (reg 2(1)(w) carve-out — the lane Screener has occupied 16 years). The carve-out survives computation and arrangement; it dies on a conclusion.
- **R5 — Score without a call.** Keep `verdict.js`'s rules array (`{label, detail, points, min, max}`), delete `BANDS`. Publish "+7 of 14 possible across 9 rules" with all nine on screen. Name it inert ("signal tally"), never a word mapping to an action, never a cross-stock leaderboard.
- **R6 — Pattern = geometry, not projection.** Publishable: the lows with dates/prices, neckline price, breakout close date/price, breakout-day volume vs 20-day median, retest low/date, measured formation height in ₹ and %, session count. **Not publishable as forward levels:** "target ₹X", "invalidation below ₹Y". If the measured move is shown, it is framed as a textbook fact with no security-specific expectation: "this shape's measured height is ₹84; chart convention projects that from the neckline; this site does not publish projected levels for individual stocks."
- **R7 — Horizon is a display filter, never a voice change.** Intraday/Short/Swing/Medium/Long/Multi-Year change which timeframe's indicators appear, nothing else. Prose must be byte-identical across horizons for the same stock, or it is a call. "Intraday" is relabelled "Intraday data" and, per §2, dropped in v1.
- **R8 — Never personalised.** No risk profile, goals, income, capital amount, allocation, portfolio upload, or per-user saved analysis. Every user who types RELIANCE + Long Term sees identical output. This is what keeps the site in the RA regime's media proviso and out of the Investment Advisers Regulations.
- **R9 — Third-party ratings pass through, never aggregated.** If the `/reco`-style broker feed survives, each card carries broker name, publication, date, link, and reads "as reported by [publication]". The page never computes a consensus, an average target, or a "6 of 8 say buy" tally — that tally is the site's own recommendation assembled from others'.
- **R10 — No performance claims.** Never publish the scorer's hit-rate, the pattern engine's win-rate, or "stocks this screen flagged returned X%". A performance claim independently triggers the finfluencer-association bar. The backtest exists internally for eval (§6) and for the retrospective outcome-reveal of a *single named historical example*, never as an aggregate return statistic.
- **R11 — LLM controlled by post-filter, not prompt.** (a) input is the validated numbers object only, never raw web text; (b) it may not emit a numeral absent from its input, checked by extracting every number and set-comparing; (c) output passes R3's deny-list or is regenerated, falling back to a template after two failures; (d) every model paragraph carries a visible model-name label (reg 19(vii) AI-usage disclosure).
- **R12 — Provenance is the compliance artefact.** Every datapoint is `{value, unit, periodOrAsOf, sourceName, sourceUrl, fetchedAt, computedFrom}`. Raw upstream payloads are stored keyed by fetch time so any on-screen number traces to received bytes. Generalises `gmp.js`'s `matchConfidence`: stage-1 identification returns a confidence and refuses below threshold rather than analysing the wrong company.
- **R13 — Red flags are anchored questions.** A flag renders as (i) the measured divergence, (ii) periods covered, (iii) the primary document + page + link, (iv) a neutral question, (v) what would resolve it. Never an allegation; never the words fraud/manipulation/cooking. A flag that cannot name its primary document does not render. Arithmetic flags only (CFO-vs-PAT, receivable-days trend, pledge %) — never a free-text flag from the model. Risk here is defamation, not SEBI.

A machine-generated disclosure panel (per-report) and a permanent methodology page (defining every term, indicator period, and scoring rule with its points) turn the score into a *published method* rather than an opinion. Verbatim per-report disclaimer text is in the regulatory research memo and drops into `StockAnalyzer.jsx` unchanged.

---

## 4. Architecture — modules and contracts

The "13 stages" are a data flow, not 13 modules or folders. Naming them in the UI is the teaching value; naming them in the directory tree creates a coordination problem. Target for v1: **six server files + one page**, matching the shape the IPO feature already proves.

### 4.1 Data flow

```
                    external scheduler (GitHub Actions cron, ~19:00 IST)
                                    │  POST /api/analyzer/refresh  (x-admin-token)
                                    ▼
  ┌──────────── INGEST (writes only bars/filings older than 30 trading days) ────────────┐
  │  sources/*  (adapter per source, all behind one provenance interface)                │
  │    bhavcopy.js  ──► daily OHLCV + delivery   (nsearchives, non-curl UA, owned copy)   │
  │    upstox.js    ──► D/W/M candles backfill   (fast bootstrap; verify split-adjust)    │
  │    universe.js  ──► symbol↔ISIN↔sector map   (EQUITY_L + niftytotalmarket)            │
  │    deals.js     ──► bulk/block (forward-only, capture from day one)                   │
  │    corporate.js ──► announcements/XBRL       (v3, reachability-gated)                 │
  └──────────────────────────────────┬───────────────────────────────────────────────────┘
                                      ▼  Mongo (bars, identity, deals, rawPayloads)
  request:  POST /api/analyzer  {query, type, horizon, asOf?}
        │  stage 1 identify (ISIN-first, ranked candidates, confidence gate) ──► ambiguous? 409 + candidate list
        │  stage 2-4 collect/validate/normalise (adjust splits, warmup gates, liquidity floor)
        │  stage 5-11 engines (pure functions over bars): indicators, patterns[], structure, deals, risk
        │  stage 12 score (verdict.js shape, no bands)
        │  stage 13 render objects → presentation-policy → report JSON  (+ optional LLM prose, post-filtered)
        ▼  persist report keyed (symbol, asOf, type, horizon); return signed report id
  client polls GET /api/analyzer/report/:id  ──► IpoDetail-style page + Stat.jsx + outcome reveal
```

No cycles. Engines never call each other; they each take the normalised series and return a plain data object. Presentation-policy is the single sink.

### 4.2 File map (v1 = technical + pattern; fundamentals render "Data unavailable")

| File | Responsibility | Reuses |
|---|---|---|
| `server/src/lib/cache.js` (new) | one shared TTL+in-flight-dedup cache envelope `{value, asOf, stale, source}` | generalises the 4 copies in ipo/news/reco/gmp |
| `server/src/middleware/auth.js` (extend) | move `requireAdmin` here (deduped from admin.js + reco.js) | existing pattern |
| `server/src/data/sources/*.js` (new) | one adapter per source, all returning provenance-wrapped rows | `ipo.js` fetch shape (drop Chrome UA → honest `InvestoMillionaire/1.0 (education; contact@…)`) |
| `server/src/data/identify.js` (new) | ISIN/exact-symbol first, then fuzzy; ranked candidates + confidence gate | **not** `gmp.js` (see §7); borrows only its confidence-surfacing idea |
| `server/src/data/normalise.js` (new) | corporate-action adjustment, warmup gates, liquidity floor, trading-calendar indexing | new (algorithms memo) |
| `server/src/data/indicators.js` (new) | EMA/RSI(Wilder)/MACD/ATR/RVOL/structure, each with a warmup gate | new |
| `server/src/data/patterns/` (new) | registry of detectors behind one contract (§4.4) | new |
| `server/src/data/stockScore.js` (new) | `verdict.js` rules-array shape, no bands, adds `asOf`+`source` per rule | **generalises `verdict.js`** |
| `server/src/data/presentationPolicy.js` (new) | the render chokepoint: verb deny-list + number-whitelist + geometry-not-target framing | inverts `brokers.js` RATINGS |
| `server/src/routes/analyzer.js` (new) | submit → signed id → poll; refresh (admin) | `quiz.js` JWT + `ipo.js` route shape |
| `client/src/pages/StockAnalyzer.jsx` (new) | report page assembled from existing primitives | `IpoDetail.jsx` layout |
| `client/src/components/Stat.jsx` (new, from design Phase 2) | `{value, period, source, freshness}` with dev-mode throw on missing src/date | design doc §11 Phase 2 |

Charts are **2D canvas/SVG**, never three.js: a neckline/breakout/retest is read against a price axis, `OrbitControls` lets a reader rotate it into nonsense, and the motion gate (`check-motion.mjs`) bans `autoRotate`, `infinite`, and linear easing. Reuse only `Towers3D` (bars contract) for shareholding/peer bars and `LessonScene`'s `useNearViewport` lazy boundary. Animate values via the sanctioned `--dur-data`/`--ease-data` width transition.

### 4.3 Source-adapter provenance interface

Every source returns rows wrapped so swapping a source (free → licensed) is a config change, and R12 is satisfied by construction:

```
fetchSeries(symbolOrIsin, opts) → {
  rows: [...],                       // raw, typed
  provenance: { sourceName, sourceUrl, fetchedAt, uaUsed },
  asOf: <source's own published date>,
}
```

### 4.4 Pattern-detector contract (the extension seam)

The spec is truncated after "Parallel Channel", so the seam must be a **policy chokepoint plus a data-only contract**, not a guess at the missing patterns. Every detector takes a candle series + ATR and returns measured facts only — no display strings, no level *called* a target:

```
detect(series, atr, horizonProfile) → {
  componentPoints: [{date, price, role}],
  neckline: {price, date} | null,
  breakout: {date, close, rvolVsMedian} | null,
  retest: {date, low, held} | null,
  measuredHeight: {rupees, percent},   // a fact about the shape, not a forecast
  provisional: bool,                    // last pivot confirms in up to k more sessions
  geometryScore: {rules:[...], normalised},  // verdict.js shape, labelled "geometry quality", NOT a probability
}
```

Adding a pattern is one new file plus one registry line. A new detector *cannot* emit a recommendation because it cannot emit text — presentation-policy owns all prose. Ask the owner to re-send the truncated spec tail before committing v3 scope.

---

## 5. Schemas

### 5.1 Mongo collections (Atlas M0, 512 MB — the binding constraint)

Full-universe one-doc-per-bar is ~2.5M docs and blows M0. Store **one doc per symbol-per-year with parallel arrays** (~10k docs, ~120 MB full; ~30 MB if v1 caps to Nifty 500). Backfill lazily on first analysis; the nightly job applies the day's bhavcopy as a delta only to symbols already held; evict least-recently-analysed.

```
analyzer_bars        { _id, symbol, isin, year,
                       dates:[...], o:[], h:[], l:[], c:[], v:[], deliverPct:[], trades:[],
                       adjFactor:[], adjSource, lastBar, updatedAt }      // per-symbol-year
analyzer_identity    { _id: isin, symbol, bseCode, name, sector, listingDate, aliases:[] } // ISIN is the join key
analyzer_deals       { _id, symbol, date, kind:'bulk'|'block', client, side, qty, price, source } // forward-only
analyzer_reports     { _id: hash(symbol,asOf,type,horizon), payload:<report JSON>, model, builtAt } // permanent cache
analyzer_raw         { _id, sourceName, key, fetchedAt, bytes }          // provenance backstop (TTL/cap by size)
analyzer_meta        { _id:'ingest', lastBhavDate, lastRunAt, formatVersion, unexplainedJumps:[] } // schema-drift alarm
```

Ingest is idempotent: a bar keyed (symbol, date) is upserted, so at-least-once cron delivery cannot duplicate. A `formatVersion` check fails the ingest loudly rather than writing nulls (the July-2024 UDiFF break is the warning).

### 5.2 Report JSON shape (what the page renders)

```
{
  identity:   { symbol, isin, name, sector, matchConfidence, alternativesShown:[] },
  asOf:       "2026-08-21",  outcomeThrough: "2026-09-20",   // retrospective window
  requested:  { type:'technical'|'fundamental'|'both-side-by-side', horizon },
  sections: [ {
      id, title, stageLabel,                    // stage name shown for teaching
      stats: [ { value, unit, periodOrAsOf, sourceName, sourceUrl, fetchedAt, computedFrom, available:bool } ],
      note: <presentation-policy-approved prose | null>,
  } ],
  patterns:   [ <detector output §4.4, geometry only> ],
  score:      { rules:[{label,detail,points,min,max,asOf,source}], score, best, worst, normalised, confidence }, // NO band, NO action label
  outcome:    { pricePath:[...], note },        // "here is what happened next" — single example, never an aggregate stat
  disclosures:{ sources:[...], unavailableCount, unavailableList:[...], identificationConfidence, model, holdingsStatement },
  aiProse:    { model, text, label } | null,
}
```

---

## 6. Cost model

- **v1 (technical + pattern, no LLM):** data ₹0 (free official archives), hosting ₹0 (existing free Vercel/Render/Atlas M0). Incremental monthly cost **≈ ₹0**.
- **v2 (LLM prose):** Sonnet default (Opus buys nothing when the model is forbidden from computing numbers). ~10k input + ~3k output per report ≈ $0.05/report. Cached per (symbol, as-of, type, horizon); demand is top-heavy (~30 large caps), so realistic spend **$20–50/mo**. Batch API halves it.
- **Egress-IP mitigation (contingent — see §7):** if NSE is unreachable from the production host, an Indian VPS (DigitalOcean BLR / AWS ap-south-1) as an ingest worker writing into Mongo, **~$6–12/mo**.
- **v3 fundamentals:** ₹0 data, but **10–14 weeks of developer time** parsing XBRL. There is no cheap-and-citable shortcut; scraper APIs (Apify/Screener) violate ToS and carry no SLA.

Do **not** precompute the universe nightly through the LLM — that costs more than serving demand.

---

## 7. Contested finding + the egress gate (skeptical triage)

The data-sources researcher and the codebase researcher disagree on whether NSE's `/api/corporate-*` endpoints are open. This gates the entire fundamentals half, so it must be resolved, not averaged.

- **R1 (premise):** data-sources cited specific 200s with byte counts *and parsed field values* (JPPOWER pledge 72.99%, RELIANCE integrated-filing revenue). The codebase researcher's "every NSE corporate endpoint is blocked" cited no `corporate-*` probe — it generalised from `quote-equity` 403 and BSE 302s. Evidence favours data-sources on a residential IP. **VALID (corporate-* open from residential).**
- **R2 (verify):** the 72.99% independently matched Screener's "73.0%" — external corroboration, not a lone claim. Grep-equivalent confirmed. **VALID.**
- **R3 (missed angle):** both researchers measured from the same Indian residential IP (AS45609 Airtel). Neither tested the production egress. NSE fronts `www.nseindia.com` with Akamai and is widely reported to block datacenter and non-Indian IPs. Render free publishes no fixed egress and is a US/EU datacenter. So `corporate-*` may be open from residential and 403 from production **regardless of who is right**. **The real gate is egress, not the endpoint.**
- **Arbiter:** `corporate-*` is open from Indian residential IPs (verified with parsed values); reachability from the production host is **unknown and is the actual dependency**. Confidence 67% on the endpoint question; 100% that egress is untested.

**Design consequence (hard):** before committing the v3 fundamentals build, run a one-off preflight from the *actual production egress IP* against `nsearchives` (non-curl UA), Upstox, and `/api/corporate-share-holdings-master`. Build v1 on `bhavcopy` + Upstox, which are separately verified open and — for bhavcopy — accumulate-and-own, so v1 does not depend on the contested endpoint at all. If the preflight fails, the mitigation is an Indian-VPS ingest worker (§6); the app servers never call NSE directly, they read Mongo.

---

## 8. Build order — shippable in days, each phase stands alone

| Phase | Work | Effort |
|---|---|---|
| **0 — Preflight** | From the real production egress IP, probe `nsearchives` bhavcopy, Upstox candles, and one `corporate-*` endpoint. Also ship the design-doc Phase-0 items (8s AbortController, cold-start empty state). Decide egress path before writing ingest. | hours |
| **1 — Spine + identity** | `sources/bhavcopy.js` + `universe.js`; `analyzer_bars` (symbol-year arrays) + `analyzer_identity`; `identify.js` (ISIN-first, ranked candidates, confidence gate, ambiguity → 409). Cap universe to Nifty 500. Lazy backfill via Upstox. GitHub Actions cron → admin `/refresh`. | days |
| **2 — Indicators + normalise** | `normalise.js` (split/bonus adjust, warmup gates, liquidity floor, calendar indexing, unexplained-jump alarm); `indicators.js` (Wilder RSI, EMA warmup refusal, ATR locked-bar flag, median RVOL). Refuse-not-fabricate on insufficient bars. | days |
| **3 — Pattern engine + registry** | detector contract; double bottom, triple bottom, parallel channel (distinct-touch rule); `stockScore.js` (geometry-quality, no band); this is the genuinely hard 2 weeks. | weeks |
| **4 — Report page + policy** | `presentationPolicy.js`; `StockAnalyzer.jsx` from IpoDetail primitives; `Stat.jsx` with dev throw; the **outcome reveal**; per-report disclosure panel + methodology page. **First shippable product: real technical + pattern, fundamentals honestly absent.** | days |
| **5 — LLM prose (v2)** | Sonnet, input=numbers-only, number-whitelist + verb post-filter, template fallback, model label; 50-pack eval with 3 binary graders gated before ship. | weeks |
| **6 — Fundamentals (v3)** | *Gated on §7 preflight.* XBRL pipeline: integrated-filing + corporates-financial-results stitched at the Dec-2024 seam; shareholding + pledge (read contextRef, not first match); CFO-vs-PAT; ratios with history; banking sector pack first as the modular proof. | weeks |

Phase 1's `cache.js` and `requireAdmin` extraction have four existing callers on day one, so they are generalisations, not speculative abstractions.

---

## 9. Cut or deferred

- **Intraday horizon — cut.** No free source; Upstox unauth rejects `minutes/*`. Remove from the picker or relabel and back with daily data *while saying so*. Do not ship intraday backed by daily candles silently.
- **Order-book materiality grading — cut/deferred.** Order value lives only in free text/PDF; render the announcement as a quoted extract with the PDF link, never a computed materiality figure.
- **"Both" as one merged report — cut.** Render technical and fundamental side by side; asking the LLM to reconcile them is where it manufactures a narrative.
- **Sector metric packs (NIM/CASA/CAR/AUM/attrition/volume-growth/combined-ratio) — deferred to v3+.** Not in any free structured source. Ship banking (GNPA/NNPA/NII) first as the modular proof; the rest render "Data unavailable" until the owner rules on PDF LLM-extraction.
- **Pattern target zone / invalidation level — cut as forward levels.** Publishable only as neutral geometry (R6). Measured expectancy on pure noise is +0.004R, so these levels also carry no demonstrated forecasting value.
- **News "why it matters / potential impact" — deferred.** The existing `news.js` RSS + `brokers.js` entity detection can attach dated sourced headlines today; the impact sentence is speculation.
- **Weekly EMA200 / monthly EMA50 on long horizons — cut.** Need 16 years / 14 years of history the archive lacks; render "Data unavailable — needs 16 years of weekly bars, have 6" rather than compute on a short seed.

---

## 10. Open questions (owner only)

1. **Approve the retrospective, as-of-date reframing?** It changes the output contract of stages 12–13 and cannot be deferred past design. (Recommended: yes.)
2. **Sector metrics: leave "Data unavailable", or authorise LLM extraction from investor-presentation PDFs** (source URL + page, marked extracted-not-computed, breaking the "all numbers computed programmatically" rule)? Only the owner can trade that off.
3. **Does the `/reco` broker feed stay?** Design-doc Q5 already recommends deleting it. If it stays, R9 governs it.
4. **Confirm the 170 KiB per-route brotli budget** — the codebase researcher found it written nowhere in the repo. A report route with three.js cannot fit it; 2D charts assume it holds.
5. **Universe scope for v1: Nifty 500 (~30 MB, covers what learners type) or full 756 Nifty-Total-Market (~120 MB)?** M0 headroom favours 500.
6. **Fix the live IPO exposure in the same release?** `IpoDetail.jsx` renders APPLY/CONSIDER/RISKY/AVOID — "offering an opinion concerning public offer" is reg 2(1)(wa)(v) verbatim. Drawing traffic to the site makes this worse.
7. **Worth a SEBI Informal Guidance application** describing exactly what renders (score with rules, no labels, geometry without targets, no monetisation)? Converts the position from defensible to documented, before any monetisation.

---

## 11. Requirements checklist (QA verifies each)

- [ ] REQ-1: pipeline computes all numbers programmatically; LLM only interprets, and cannot emit a number absent from its input (post-filter proven by test).
- [ ] REQ-2: every rendered datapoint carries value + period + source + freshness, or the literal "Data unavailable" + what was checked and when (Stat.jsx dev throw enforces).
- [ ] REQ-3: no analyzer output contains a buy/sell/hold synonym, price target, stop loss, or action verb (presentation-policy deny-list test).
- [ ] REQ-4: pattern output is geometry only; no forward "target"/"invalidation" level renders.
- [ ] REQ-5: identical (symbol, type, horizon) input at a given as-of produces byte-identical output (no personalisation).
- [ ] REQ-6: ambiguous name (e.g. Tata Motors → TMCV/TMPV) stops the pipeline and returns a ranked candidate list, never a silent pick.
- [ ] REQ-7: indicators refuse to compute below their warmup/liquidity gates and say so.
- [ ] REQ-8: split/bonus adjustment runs before any indicator; an unexplained-jump alarm queues review and marks the series degraded.
- [ ] REQ-9: ingest writes only bars/filings older than 30 trading days (SEBI lag), verified by test.
- [ ] REQ-10: report is computed-then-cached; nothing heavy runs in the request path; cold-start empty state renders.

## 12. Safeguards (non-negotiable, ticked at review)

- [ ] **Data integrity:** ingest is idempotent per (symbol, date); a `formatVersion` mismatch fails loudly, never writes nulls; every stored number traces to a raw payload.
- [ ] **Compliance chokepoint:** presentation-policy is the *only* render path; new engines return data objects, never display strings; the deny-list and number-whitelist run before any prose reaches the client.
- [ ] **No consideration:** the analyzer route carries a comment forbidding ads/paywall/affiliate; CI could later grep for a payment SDK on that route.
- [ ] **Egress gate:** no NSE-sourced data is committed to production without the §7 preflight from the real egress IP.
- [ ] **Contract stability:** the report JSON shape (§5.2) is the boundary between pipeline and page; new sections extend `sections[]`, they do not change existing keys.

---

## Definition of Done (v1)

A user enters an Indian stock, picks technical (or technical of "both"), picks a horizon, and receives a retrospective report as of T-30 trading days: real OHLCV/delivery/indicators/pattern-geometry with every number sourced and dated, fundamentals shown as "Data unavailable" with the reason, an outcome reveal of what happened next, a transparent no-band signal tally, and a machine-generated disclosure panel — with no action label, no price target, and byte-identical output for identical input.
