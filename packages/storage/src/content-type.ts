/**
 * Magic-byte content sniffing — never trust a client-declared `Content-Type`.
 *
 * Returns the canonical MIME inferred from the file's leading bytes, or `null`
 * when the signature is unknown. Callers compare this against a per-use
 * allow-list (a hostile `.html`/`.svg` sniffs to `null` → rejected).
 *
 * Deliberately a small, dependency-free table covering exactly the types we
 * accept. ZIP-container formats (docx/xlsx) sniff to `application/zip` — they
 * are NOT distinguishable from any other zip by header alone; supporting them
 * would require inspecting the archive (e.g. the `file-type` lib). Out of scope
 * until a real need appears.
 */

interface MagicSignature {
  readonly offset: number;
  readonly magic: readonly number[];
  readonly mime: string;
}

const SIGNATURES: readonly MagicSignature[] = [
  { offset: 0, magic: [0x25, 0x50, 0x44, 0x46, 0x2d], mime: "application/pdf" }, // %PDF-
  { offset: 0, magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png" },
  { offset: 0, magic: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { offset: 0, magic: [0x47, 0x49, 0x46, 0x38], mime: "image/gif" }, // GIF8
  { offset: 0, magic: [0x66, 0x4c, 0x61, 0x43], mime: "audio/flac" }, // fLaC
  { offset: 0, magic: [0x4f, 0x67, 0x67, 0x53], mime: "audio/ogg" }, // OggS
  { offset: 0, magic: [0x49, 0x44, 0x33], mime: "audio/mpeg" }, // ID3 (mp3)
  { offset: 0, magic: [0x50, 0x4b, 0x03, 0x04], mime: "application/zip" }, // PK..
];

function matchesAt(buffer: Buffer, magic: readonly number[], offset: number): boolean {
  if (buffer.length < offset + magic.length) {
    return false;
  }
  for (let i = 0; i < magic.length; i += 1) {
    if (buffer[offset + i] !== magic[i]) {
      return false;
    }
  }
  return true;
}

export function sniffContentType(buffer: Buffer): string | null {
  // Container formats with a secondary marker.
  if (
    matchesAt(buffer, [0x52, 0x49, 0x46, 0x46], 0) &&
    matchesAt(buffer, [0x57, 0x41, 0x56, 0x45], 8)
  ) {
    return "audio/wav"; // RIFF....WAVE
  }
  if (
    matchesAt(buffer, [0x46, 0x4f, 0x52, 0x4d], 0) &&
    matchesAt(buffer, [0x41, 0x49, 0x46, 0x46], 8)
  ) {
    return "audio/aiff"; // FORM....AIFF
  }
  if (matchesAt(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    return "audio/mp4"; // ....ftyp (m4a / mp4)
  }

  for (const sig of SIGNATURES) {
    if (matchesAt(buffer, sig.magic, sig.offset)) {
      return sig.mime;
    }
  }

  // MP3 with no ID3 tag: an audio frame sync (11 bits set).
  const b1 = buffer[1];
  if (buffer[0] === 0xff && b1 !== undefined && (b1 & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  return null;
}
