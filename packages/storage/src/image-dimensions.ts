/**
 * Intrinsic pixel size of an image, read from its **header** — no decoding, no
 * native dependency.
 *
 * Why this exists at all: without dimensions a gallery cannot reserve a slot
 * before the bytes arrive, so every product page reflows as its images load.
 * Storing them at upload time is the only moment they are free — later it costs
 * a download.
 *
 * Deliberately header-only. A resize/re-encode library (sharp) would pull a
 * platform-specific binary into the container image for a number that lives in
 * the first 32 bytes of every format we accept. Transformations, when they come,
 * belong at the edge — not in the upload path.
 *
 * Returns `null` when the header is unknown or truncated. `null` means "not
 * measured", never "zero" — callers must not coerce it to a size.
 */
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

export function imageDimensions(buffer: Buffer): ImageDimensions | null {
  return (
    pngDimensions(buffer) ??
    gifDimensions(buffer) ??
    webpDimensions(buffer) ??
    jpegDimensions(buffer)
  );
}

/**
 * PNG: IHDR is always the first chunk — width/height at 16, big-endian u32.
 *
 * The full 8-byte signature is required, not just the first four: the trailing
 * `0d 0a 1a 0a` is what catches a file mangled by a CRLF-translating transfer,
 * and matching on four bytes would let `sniffContentType` and this disagree
 * about what a PNG is.
 */
function pngDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) {
    return null;
  }
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** GIF: logical screen descriptor at 6, little-endian u16. */
function gifDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString("latin1") !== "GIF") {
    return null;
  }
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

/**
 * WebP: three incompatible layouts under one RIFF container, and they disagree
 * on both offset and bit packing. `VP8 ` (lossy) and `VP8L` (lossless) are the
 * ones a camera or an export produces; `VP8X` carries the extended header.
 */
function webpDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30 || buffer.subarray(0, 4).toString("latin1") !== "RIFF") {
    return null;
  }
  if (buffer.subarray(8, 12).toString("latin1") !== "WEBP") {
    return null;
  }
  const chunk = buffer.subarray(12, 16).toString("latin1");
  if (chunk === "VP8 ") {
    // 14 bits each, after the 3-byte start code at 23.
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // 14 bits each, packed across 4 bytes at 21, minus one.
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    // 24-bit little-endian, minus one.
    return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
  }
  return null;
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset) | ((buffer[offset + 2] ?? 0) << 16);
}

/**
 * JPEG: the size lives in a start-of-frame marker that can sit anywhere, after
 * an arbitrary number of metadata segments (EXIF thumbnails, colour profiles).
 * We walk the segment chain rather than guessing an offset.
 *
 * `SOF0`…`SOF15` all carry the dimensions, EXCEPT `DHT`/`JPG`/`DAC`
 * (`0xc4`/`0xc8`/`0xcc`), which fall inside the same numeric range and do not.
 */
function jpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return null; // Chaîne rompue : on ne devine pas.
    }
    const marker = buffer[offset + 1] ?? 0;
    const length = buffer.readUInt16BE(offset + 2);
    if (isStartOfFrame(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (length < 2) {
      // Longueur impossible. L'offset avancerait quand même (2 + 0), donc ce
      // n'est pas une garde anti-boucle : c'est un refus de lire une chaîne
      // dont on sait déjà qu'elle ment.
      return null;
    }
    offset += 2 + length;
  }
  return null;
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}
