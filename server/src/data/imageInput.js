// What this server will accept as an uploaded image, and nothing past it.
//
// Every other input the analyzer takes is a short string that zod checks in one line.
// This one is a few megabytes of somebody else's bytes, so the posture is different:
// nothing here repairs, converts or guesses. A body that is not exactly what it claims
// to be is refused with the reason, because the alternative is handing a malformed
// file to a recogniser and then handing whatever it hallucinated to the analyzer.
//
// Three checks, and each catches something the others cannot:
//
//   the declared content type   catches an honest client sending the wrong thing
//   the magic bytes             catch a dishonest one, which is the only check that
//                               actually decides what the file IS
//   the dimensions              catch the decompression bomb: a 30000 x 30000 PNG of
//                               one flat colour is a few kilobytes on the wire and
//                               3.6 GB once something decodes it. The size cap alone
//                               does not see that coming.
//
// PNG and JPEG only. Not an arbitrary shortlist: those are what a phone screenshot and
// a broker app export actually produce, and they are what the shipped recogniser in
// ocr.js accepts. Accepting WebP here so it could be rejected one layer down would be
// a worse answer than saying so at the door.
//
// Pure. Nothing in this file fetches; it is handed a buffer and returns a verdict.
// Reading the inbound request stream is the one exception and it is inbound, not an
// outbound call, so the data-client rule is intact.

export const LIMITS = {
  // The transport cap. The recogniser may be tighter than this and the route takes the
  // smaller of the two, so the number quoted back to a person is the one that actually
  // applied to their upload.
  bytes: 5 * 1024 * 1024,
  // A phone screenshot is about 1290 x 2796. A scan at 600 dpi is about 5100 x 6600.
  // Twelve thousand a side clears both with room and still refuses the bomb.
  side: 12000,
  pixels: 40_000_000,
  // Enough for a form field or two beside the file. A body with more parts than this is
  // not a person uploading a screenshot.
  parts: 16,
  // RFC 2046 caps a multipart boundary at 70 characters.
  boundary: 70,
}

export const ACCEPTED = [
  { mime: 'image/png', label: 'PNG' },
  { mime: 'image/jpeg', label: 'JPEG' },
]

const ACCEPTED_LABEL = ACCEPTED.map((a) => a.label).join(' or ')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * PNG dimensions.
 *
 * IHDR is required by the spec to be the first chunk, so its position is fixed: eight
 * bytes of signature, a four byte length, the four byte type, then width and height.
 * The type is checked rather than assumed, because a file that opens with the PNG
 * signature and then does not carry IHDR is malformed and gets refused, not measured.
 */
function pngSize(bytes) {
  if (bytes.length < 24) return null
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * JPEG dimensions, by walking the segment chain to the frame header.
 *
 * There is no fixed offset to read: a JPEG out of a phone carries EXIF, an ICC profile
 * and a thumbnail ahead of the frame, and every one of those is a variable-length
 * segment. So the markers are walked.
 *
 * The range 0xC0 to 0xCF is start-of-frame EXCEPT for three squatters: 0xC4 is the
 * Huffman table, 0xC8 is a reserved JPEG extension and 0xCC is arithmetic coding
 * conditioning. Reading width and height out of a Huffman table returns a number, which
 * is exactly the kind of confident wrong answer this module exists to prevent.
 */
function jpegSize(bytes) {
  let at = 2
  while (at + 9 < bytes.length) {
    // Fill bytes between segments are legal and are a run of 0xFF.
    if (bytes[at] !== 0xff) {
      at++
      continue
    }
    const marker = bytes[at + 1]
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    // Start of scan. Past this point the file is entropy-coded image data and a byte
    // that looks like a marker is not one, so walking further would read noise.
    if (marker === 0xda) return null

    const length = bytes.readUInt16BE(at + 2)
    if (length < 2) return null

    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) }
    }
    at += 2 + length
  }
  return null
}

/**
 * Decide what a buffer actually is.
 *
 * Returns { ok: true, mime, label, width, height } or { ok: false, why }. The `why` is
 * written to be shown to the person who uploaded the file, because a rejected upload
 * with no stated reason reads as a broken feature.
 */
export function sniffImage(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return { ok: false, why: 'The upload was empty.' }
  }

  let mime = null
  let label = null
  let size = null

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    mime = 'image/png'
    label = 'PNG'
    size = pngSize(bytes)
  } else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = 'image/jpeg'
    label = 'JPEG'
    size = jpegSize(bytes)
  } else {
    return {
      ok: false,
      why: `The uploaded file does not begin with a ${ACCEPTED_LABEL} header, so it is not one, whatever it was named or declared as. Upload a screenshot as ${ACCEPTED_LABEL}.`,
    }
  }

  if (!size || !size.width || !size.height) {
    return { ok: false, why: `The file starts as a ${label} but its header is malformed, so its dimensions could not be read.` }
  }
  if (size.width > LIMITS.side || size.height > LIMITS.side) {
    return {
      ok: false,
      why: `The image is ${size.width} by ${size.height} pixels and the cap is ${LIMITS.side} on a side.`,
    }
  }
  if (size.width * size.height > LIMITS.pixels) {
    return {
      ok: false,
      why: `The image is ${(size.width * size.height / 1e6).toFixed(1)} megapixels and the cap is ${LIMITS.pixels / 1e6}.`,
    }
  }

  return { ok: true, mime, label, width: size.width, height: size.height }
}

/**
 * Pull the one file part out of a multipart/form-data body.
 *
 * Hand-written rather than pulled in as a dependency, and that is a deliberate trade
 * worth naming: this reads ONE part out of a body that has already been capped at a few
 * megabytes, under a field count limit, and it hands the bytes straight to sniffImage
 * which decides what they are from the magic bytes alone. It never writes to disk, never
 * trusts the filename and never trusts the declared type. There is nothing here for a
 * malformed body to corrupt except this function's own return value.
 *
 * Returns { ok: true, bytes, filename, declared } or { ok: false, why }.
 */
export function filePartFrom(body, contentTypeHeader) {
  const header = String(contentTypeHeader ?? '')
  if (!/^multipart\/form-data/i.test(header)) {
    return {
      ok: false,
      why: 'Send the image as multipart/form-data with a single file field. Nothing else is read from this endpoint.',
    }
  }

  const found = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(header)
  const boundary = (found?.[1] ?? found?.[2] ?? '').trim()
  if (!boundary || boundary.length > LIMITS.boundary) {
    return { ok: false, why: 'The multipart boundary is missing or malformed, so the body cannot be split into parts.' }
  }

  const delimiter = Buffer.from(`--${boundary}`, 'latin1')
  let at = body.indexOf(delimiter)
  if (at === -1) return { ok: false, why: 'The body declared a multipart boundary that does not appear in it.' }

  for (let seen = 0; seen < LIMITS.parts; seen++) {
    const start = at + delimiter.length
    // The closing delimiter is the boundary followed by two hyphens. Anything after it
    // is epilogue and is ignored by the spec.
    if (body.subarray(start, start + 2).toString('latin1') === '--') break

    const next = body.indexOf(delimiter, start)
    if (next === -1) return { ok: false, why: 'The multipart body ended without its closing boundary, so the upload is truncated.' }
    at = next

    const part = body.subarray(start, next)
    const blank = part.indexOf('\r\n\r\n')
    if (blank === -1) continue

    // Headers are ASCII by the spec. latin1 is used rather than utf8 so a stray high
    // byte cannot become a replacement character and shift the offsets.
    const headers = part.subarray(0, blank).toString('latin1')
    const filename = /filename\*?="?([^"\r\n;]*)"?/i.exec(headers)?.[1]
    // A part with no filename is an ordinary form field, not the upload.
    if (filename == null) continue

    // The part's payload runs from the blank line to the CRLF that precedes the next
    // delimiter. That CRLF belongs to the framing, not to the file.
    let end = part.length
    if (end >= 2 && part[end - 2] === 0x0d && part[end - 1] === 0x0a) end -= 2

    return {
      ok: true,
      bytes: Buffer.from(part.subarray(blank + 4, end)),
      filename: filename || null,
      declared: /Content-Type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim().toLowerCase() ?? null,
    }
  }

  return { ok: false, why: 'No file field was found in the upload.' }
}

/**
 * Read the request body, refusing anything over the cap.
 *
 * The cap is enforced twice on purpose. Content-Length catches an honest client before a
 * byte is buffered, which is most of them. The running total catches a client that lied
 * about it, and on that path the stream is drained rather than destroyed: destroying the
 * request takes the response socket with it, and the caller would get a dropped
 * connection where a 413 explaining the cap is the useful answer.
 */
export function readCappedBody(req, max = LIMITS.bytes) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => {
      const err = new Error(`The upload is larger than the ${(max / 1024 / 1024).toFixed(1)} MB cap.`)
      err.tooLarge = true
      return err
    }

    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > max) {
      req.resume()
      return reject(tooLarge())
    }

    const chunks = []
    let size = 0
    let settled = false

    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > max) {
        settled = true
        chunks.length = 0
        req.resume()
        return reject(tooLarge())
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!settled) {
        settled = true
        resolve(Buffer.concat(chunks))
      }
    })
    req.on('error', (err) => {
      if (!settled) {
        settled = true
        reject(err)
      }
    })
  })
}
