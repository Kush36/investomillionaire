// Run with: node --test test/
//
// Batch analysis and image intake. Same seam as test/analyze.test.js: the `deps` object
// the route exports is replaced, the engines underneath it are the real ones, and
// nothing in here needs NSE, Upstox or a recogniser to be up.
//
// Four claims carry the feature and each gets a case:
//
//   the batch cap is enforced, because an uncapped list is an unbounded number of
//     outbound fetches behind one button,
//   one failing stock does not fail the batch, because a watchlist where one delisted
//     holding blanks the other nine is worse than no batch at all,
//   a non-image upload is rejected, on the magic bytes rather than on what it claimed,
//   an oversized upload is rejected, both when the client says how big it is and when
//     it lies.
//
// The pure halves that those four ride on get their own cases too: the header parsers
// in imageInput.js, and the line-to-candidate rules in ocr.js. Both are ordinary
// functions over buffers and strings, so they are tested without a server at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { analyzeRouter, deps, BATCH_CAP } from '../src/routes/analyze.js'
import { sniffImage, filePartFrom, LIMITS } from '../src/data/imageInput.js'
import { register, tickerCandidates } from '../src/data/ocr.js'

const app = express()
app.use(express.json())
app.use('/api/analyze', analyzeRouter)
const server = app.listen(0)
const { port } = server.address()
const base = `http://127.0.0.1:${port}/api/analyze`
test.after(() => server.close())

const postJson = async (path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LISTED = {
  INE002A01018: { symbol: 'RELIANCE', name: 'Reliance Industries Limited', series: 'EQ', isin: 'INE002A01018', listedOn: '29-NOV-1995', faceValue: 10 },
  INE467B01029: { symbol: 'TCS', name: 'Tata Consultancy Services Limited', series: 'EQ', isin: 'INE467B01029', listedOn: '25-AUG-2004', faceValue: 1 },
  INE009A01021: { symbol: 'INFY', name: 'Infosys Limited', series: 'EQ', isin: 'INE009A01021', listedOn: '08-FEB-1995', faceValue: 5 },
}
// Well formed, and deliberately not on the list above.
const DELISTED = 'INE999Z01019'

function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function makeBars(count, { seed = 7, start = 1000 } = {}) {
  const rand = lcg(seed)
  const bars = []
  const day = 86400000
  let close = start
  for (let i = 0; i < count; i++) {
    close = close * (1 + 0.0004 + 0.02 * Math.sin(i / 23) * 0.05) + (rand() - 0.5) * 6
    const spread = close * 0.012
    bars.push({
      date: new Date(Date.UTC(2021, 0, 4) + i * day).toISOString().slice(0, 10),
      open: Number((close - spread / 3).toFixed(2)),
      high: Number((close + spread).toFixed(2)),
      low: Number((close - spread).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(500000 + rand() * 400000),
    })
  }
  return bars
}

const daily = makeBars(420)
const weekly = makeBars(220, { seed: 31, start: 900 })

function stubDeps({ loadUniverse, resolve } = {}) {
  deps.loadUniverse = loadUniverse ?? (async () => ({ byIsin: new Map(Object.entries(LISTED)) }))
  deps.resolve = resolve ?? (async () => ({ status: 'none', match: null, candidates: [] }))
  deps.candles = async (_isin, timeframe) => ({
    bars: timeframe === 'daily' ? daily : weekly,
    source: { name: 'Upstox historical candles', url: 'https://upstox.com/developer/api-documentation/' },
  })
  deps.randomWalkBaseline = () => ({ trials: 0, note: 'Stubbed in the batch test.' })
  // Every case below runs type 'technical', so the filing engine is never reached. If
  // one ever does reach it, it should fail loudly rather than silently return nothing.
  deps.quarterlySeries = async () => {
    throw new Error('the fundamental engine was not stubbed for this test')
  }
  deps.corporateInfo = async () => {
    throw new Error('the fundamental engine was not stubbed for this test')
  }
  // /extract is the one authenticated endpoint on this router.
  deps.requireAuth = (req, _res, next) => {
    req.user = { id: 'test-reader' }
    next()
  }
}

// ---------------------------------------------------------------------------
// Synthetic image headers.
//
// Real files are not needed and would be worse: sniffImage reads the signature and the
// frame header and nothing else, so a hand-built header exercises exactly the bytes it
// looks at and lets a case ask for 30000 x 30000 without producing a 30000 x 30000 file.
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function png(width, height, { pad = 0 } = {}) {
  const chunk = Buffer.alloc(25)
  chunk.writeUInt32BE(13, 0)
  chunk.write('IHDR', 4, 'latin1')
  chunk.writeUInt32BE(width, 8)
  chunk.writeUInt32BE(height, 12)
  chunk[16] = 8 // bit depth
  chunk[17] = 6 // truecolour with alpha
  return Buffer.concat([PNG_SIGNATURE, chunk, Buffer.alloc(pad)])
}

/**
 * A JPEG up to and including its frame header.
 *
 * `decoyFirst` puts a Huffman table ahead of the frame. 0xC4 sits inside the 0xC0 to
 * 0xCF start-of-frame range and is not a frame, so a parser that takes the range at
 * face value reads its width and height out of a table of code lengths.
 */
function jpeg(width, height, { decoyFirst = false } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])]
  if (decoyFirst) {
    const dht = Buffer.from([0xff, 0xc4, 0x00, 0x04, 0x00, 0x00])
    parts.push(dht)
  }
  const sof = Buffer.alloc(13)
  sof[0] = 0xff
  sof[1] = 0xc0
  sof.writeUInt16BE(11, 2) // segment length, excluding the marker
  sof[4] = 8 // sample precision
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 1 // one component
  sof[10] = 1
  sof[11] = 0x11
  sof[12] = 0
  parts.push(sof)
  return Buffer.concat(parts)
}

const BOUNDARY = '----investomillionaire-test'

function multipart(bytes, { filename = 'holdings.png', contentType = 'image/png', extraField = true } = {}) {
  const parts = []
  if (extraField) {
    // An ordinary form field ahead of the file. The parser must walk past it rather
    // than treating the first part it finds as the upload.
    parts.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="note"\r\n\r\nmy holdings\r\n`, 'latin1'))
  }
  parts.push(
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      'latin1'
    )
  )
  parts.push(bytes)
  parts.push(Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'latin1'))
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${BOUNDARY}` }
}

const upload = async (bytes, options) => {
  const { body, type } = multipart(bytes, options)
  const res = await fetch(`${base}/extract`, { method: 'POST', headers: { 'Content-Type': type }, body })
  return { status: res.status, body: await res.json() }
}

/** A recogniser that returns fixed lines, installed for one case and removed after. */
function stubRecogniser({ lines = [], maxBytes = 64 * 1024, throws = null } = {}) {
  return register({
    name: 'Stub recogniser',
    url: 'https://example.invalid/stub',
    maxBytes,
    configured: () => true,
    read: async () => {
      if (throws) throw new Error(throws)
      return { text: lines.join('\n'), lines }
    },
  })
}

// ---------------------------------------------------------------------------
// The batch
// ---------------------------------------------------------------------------

test(`the batch cap is enforced, and the cap it enforced is stated`, async () => {
  stubDeps()
  const tooMany = Array.from({ length: BATCH_CAP + 1 }, (_, i) => `INE${String(i).padStart(3, '0')}A01011`)
  const { status, body } = await postJson('/batch', { isins: tooMany, type: 'technical', horizon: 'swing' })

  assert.equal(status, 400)
  assert.equal(body.cap, BATCH_CAP)
  assert.match(body.detail.join(' '), new RegExp(`At most ${BATCH_CAP}`))
  assert.equal('results' in body, false, 'an over-cap batch ran anyway')

  // An empty list is refused for the same reason the cap exists: it is not a request.
  const empty = await postJson('/batch', { isins: [], type: 'technical', horizon: 'swing' })
  assert.equal(empty.status, 400)
})

test('one stock that cannot be analysed does not take the other two down', async () => {
  stubDeps()
  const { status, body } = await postJson('/batch', {
    isins: ['INE002A01018', DELISTED, 'INE467B01029'],
    type: 'technical',
    horizon: 'swing',
  })

  assert.equal(status, 200, JSON.stringify(body).slice(0, 400))
  assert.equal(body.results.length, 3)
  assert.equal(body.analysed, 2)
  assert.equal(body.failed, 1)

  const failed = body.results.find((r) => r.status === 'failed')
  assert.equal(failed.isin, DELISTED, 'the wrong stock failed')
  assert.equal(failed.httpStatus, 404)
  assert.match(failed.error, /not on the NSE equity list/i)

  // The two that worked produced whole reports, not stubs standing in for one.
  for (const ok of body.results.filter((r) => r.status === 'ok')) {
    assert.equal(ok.report.identity.isin, ok.isin, 'a report came back under the wrong ISIN')
    assert.ok(ok.report.scorecard.rules.length >= 4, 'a batched report ran a thinner pipeline than a single one')
    assert.ok(ok.report.technical.daily.rsi.value > 0)
  }

  // Order is the order it was asked in. A reader ticking rows off a list against the
  // list they sent should not have to match them up by identifier.
  assert.deepEqual(body.results.map((r) => r.isin), ['INE002A01018', DELISTED, 'INE467B01029'])
  assert.match(body.note, /1 of 3/)
  assert.ok(body.disclosure.registration)
})

test('a batch where every stock throws still answers, with the reason against each one', async () => {
  // The equity list being unreachable is the ordinary way this happens, and the message
  // carries a forbidden phrase because a message from somewhere else is not prose this
  // codebase controls. It must not be published as written and must not take the
  // response down either.
  stubDeps({
    loadUniverse: async () => {
      throw new Error('upstream refused: strong buy side proxy rejected the connection')
    },
  })

  // Both uncached. A report the cache already holds is answered before loadUniverse is
  // reached, so reusing an ISIN from an earlier case here would test the cache instead.
  const { status, body } = await postJson('/batch', { isins: ['INE009A01021', 'INE562A01011'], type: 'technical', horizon: 'swing' })

  assert.equal(status, 200, 'a batch where everything failed returned an error instead of a result per stock')
  assert.equal(body.analysed, 0)
  assert.equal(body.failed, 2)
  for (const row of body.results) {
    assert.equal(row.status, 'failed')
    assert.ok(row.error.length > 20, 'a stock failed without saying why')
    assert.equal(/strong buy/i.test(row.error), false, 'a forbidden phrase from an upstream message was published verbatim')
    assert.match(row.error, /server log/i)
  }
})

test('duplicates are dropped and the drop is declared', async () => {
  stubDeps()
  const { status, body } = await postJson('/batch', {
    isins: ['INE002A01018', 'INE002A01018', 'INE009A01021'],
    type: 'technical',
    horizon: 'swing',
  })

  assert.equal(status, 200)
  assert.equal(body.results.length, 2)
  assert.equal(body.request.duplicatesDropped, 1)
})

// ---------------------------------------------------------------------------
// The upload
// ---------------------------------------------------------------------------

test('with no recogniser configured, the endpoint says so and invents nothing', async () => {
  stubDeps()
  const { status, body } = await upload(png(800, 1200))

  assert.equal(status, 503)
  assert.match(body.error, /not configured/i)
  assert.equal(body.analysed, false)
  assert.equal('rows' in body, false, 'an unconfigured server returned candidates anyway')
  assert.match(body.instead, /resolve/i, 'the refusal does not say what to do instead')
})

test('a non-image upload is rejected on its bytes, not on what it called itself', async () => {
  stubDeps()
  const remove = stubRecogniser()
  try {
    // A PDF, named and declared as a PNG. Only the magic bytes can tell.
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(2048, 0x20)])
    const { status, body } = await upload(pdf, { filename: 'holdings.png', contentType: 'image/png' })

    assert.equal(status, 415)
    assert.match(body.why, /does not begin with a PNG or JPEG header/i)
    assert.equal(body.declared, 'image/png', 'the declared type was not reported back alongside the refusal')
    assert.deepEqual(body.accepted, ['PNG', 'JPEG'])
    assert.equal('rows' in body, false, 'a rejected file produced candidates anyway')
  } finally {
    remove()
  }
})

test('an oversized upload is rejected, whether or not the client admits its size', async () => {
  stubDeps()
  const cap = 32 * 1024
  const remove = stubRecogniser({ maxBytes: cap })
  try {
    // Honest client: Content-Length is over the cap, so nothing is buffered at all.
    const big = await upload(png(800, 1200, { pad: cap * 2 }))
    assert.equal(big.status, 413)
    assert.equal(big.body.cap, cap, 'the cap quoted back is not the one that applied')
    assert.match(big.body.why, /Stub recogniser/, 'the refusal does not say which limit bound')

    // Lying client: chunked, no Content-Length, so only the running total catches it.
    const chunked = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 6; i++) controller.enqueue(new Uint8Array(16 * 1024))
        controller.close()
      },
    })
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` },
      body: chunked,
      duplex: 'half',
    })
    assert.equal(res.status, 413, 'a body with no declared length got past the cap')
  } finally {
    remove()
  }
})

test('what was read is resolved and handed back for confirmation, never analysed', async () => {
  stubDeps({
    resolve: async (text) => {
      if (/reliance/i.test(text)) return { status: 'exact', match: LISTED.INE002A01018, candidates: [] }
      if (/indian bank/i.test(text)) {
        return {
          status: 'ambiguous',
          match: null,
          candidates: [
            { symbol: 'INDIANB', name: 'Indian Bank', series: 'EQ', isin: 'INE562A01011', confidence: 0.917 },
            { symbol: 'BANKINDIA', name: 'Bank of India', series: 'EQ', isin: 'INE084A01016', confidence: 0.875 },
          ],
        }
      }
      return { status: 'none', match: null, candidates: [] }
    },
  })

  const remove = stubRecogniser({
    lines: [
      'Symbol        LTP       Chng',
      'RELIANCE    1,384.20   -0.45%',
      'Indian Bank   612.05   +1.10%',
      // A broker app column heading that policy.js reads as a recommendation. It came
      // off somebody's screenshot, so it must survive as quoted text rather than
      // withholding the whole response.
      'BUY           250       0',
      'ZQXVT          10.00    0.00%',
    ],
  })

  try {
    const { status, body } = await upload(jpeg(1170, 2532), { filename: 'zerodha.jpg', contentType: 'image/jpeg' })

    assert.equal(status, 200, JSON.stringify(body).slice(0, 400))
    assert.equal(body.analysed, false, 'the upload path analysed something')
    assert.equal(body.image.format, 'JPEG')
    assert.equal(body.image.width, 1170)
    assert.equal(body.image.height, 2532)

    const read = body.rows.map((r) => r.read.headline)
    assert.deepEqual(read, ['RELIANCE', 'Indian Bank', 'ZQXVT'], 'the column headings were read as companies')

    const [reliance, indianBank, unknown] = body.rows
    assert.equal(reliance.status, 'exact')
    assert.equal(reliance.match.isin, 'INE002A01018')
    assert.equal(indianBank.status, 'ambiguous')
    assert.equal(indianBank.match, null, 'an ambiguous line was resolved to one company anyway')
    assert.equal(indianBank.candidates.length, 2)
    assert.equal(unknown.status, 'none')

    assert.deepEqual(body.counts, { exact: 1, ambiguous: 1, none: 1 })
    assert.match(body.action, /Confirm/i)
    assert.ok(body.rows.every((r) => r.read.source.name.includes('Stub recogniser')), 'read text was published unattributed')
  } finally {
    remove()
  }
})

test('a recogniser that fails produces no tickers at all', async () => {
  stubDeps()
  const remove = stubRecogniser({ throws: 'the service is down' })
  try {
    const { status, body } = await upload(png(800, 1200))
    assert.equal(status, 502)
    assert.equal('rows' in body, false, 'a failed read still produced candidates')
    assert.match(body.why, /nothing here will guess/i)
  } finally {
    remove()
  }
})

// ---------------------------------------------------------------------------
// The parsers, without a server
// ---------------------------------------------------------------------------

test('image headers are read, and a decompression bomb is refused before anything decodes it', () => {
  const p = sniffImage(png(1170, 2532))
  assert.deepEqual({ ok: p.ok, mime: p.mime, width: p.width, height: p.height }, { ok: true, mime: 'image/png', width: 1170, height: 2532 })

  const j = sniffImage(jpeg(4032, 3024))
  assert.deepEqual({ ok: j.ok, mime: j.mime, width: j.width, height: j.height }, { ok: true, mime: 'image/jpeg', width: 4032, height: 3024 })

  // The Huffman table sits in the start-of-frame marker range. Reading dimensions out
  // of it is the confident wrong answer this parser exists to avoid.
  const decoy = sniffImage(jpeg(1024, 768, { decoyFirst: true }))
  assert.equal(decoy.width, 1024)
  assert.equal(decoy.height, 768)

  // A handful of kilobytes on the wire, gigabytes once decoded.
  const bomb = sniffImage(png(30000, 30000))
  assert.equal(bomb.ok, false)
  assert.match(bomb.why, new RegExp(`${LIMITS.side} on a side`))

  assert.equal(sniffImage(Buffer.alloc(0)).ok, false)
  assert.equal(sniffImage(Buffer.from('GIF89a')).ok, false, 'a format the recogniser cannot read was accepted')
  // A PNG signature with no IHDR behind it is malformed, not a zero-by-zero image.
  assert.equal(sniffImage(Buffer.concat([PNG_SIGNATURE, Buffer.alloc(16)])).ok, false)
})

test('the multipart reader takes the file part and nothing else', () => {
  const image = png(100, 200)
  const { body, type } = multipart(image)

  const part = filePartFrom(body, type)
  assert.equal(part.ok, true, part.why)
  assert.equal(part.filename, 'holdings.png')
  assert.equal(part.declared, 'image/png')
  assert.ok(part.bytes.equals(image), 'the extracted bytes are not the bytes that were sent')

  assert.match(filePartFrom(body, 'application/json').why, /multipart\/form-data/)
  assert.match(filePartFrom(body, 'multipart/form-data').why, /boundary is missing/)
  assert.match(filePartFrom(body, `multipart/form-data; boundary=${'x'.repeat(71)}`).why, /boundary is missing or malformed/)
  // Declared one boundary, framed with another.
  assert.match(filePartFrom(body, 'multipart/form-data; boundary=notinthebody').why, /does not appear/)
  // Every part is an ordinary form field, so there is no upload in it.
  const fieldsOnly = Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhi\r\n--${BOUNDARY}--\r\n`, 'latin1')
  assert.match(filePartFrom(fieldsOnly, type).why, /No file field/)
})

test('column headings and table figures are not read as companies', () => {
  const lines = [
    'Symbol      LTP      Chng      Chng%',
    'RELIANCE  1,384.20   -6.25     -0.45%',
    'BAJAJ-AUTO 8,901.00  +12.00    +0.13%',
    '3M India  28,450.55   0.00      0.00%',
    'Total     ₹1,24,500  +2,310    +1.89%',
    'TCS        3,102.40   -4.10     -0.13%',
    'TCS        3,102.40   -4.10     -0.13%',
  ]

  assert.deepEqual(tickerCandidates(lines), ['RELIANCE', 'BAJAJ-AUTO', '3M India', 'TCS'])

  // The cap holds, and it holds on distinct names rather than on lines read.
  assert.equal(tickerCandidates(Array.from({ length: 50 }, (_, i) => `COMPANY${i} 10.00`), { max: 4 }).length, 4)
  assert.deepEqual(tickerCandidates([]), [])
  assert.deepEqual(tickerCandidates(['', '   ', '1,234.00', '%'] ), [])
})
