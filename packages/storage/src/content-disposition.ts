/**
 * Build a safe `Content-Disposition: attachment` header value.
 *
 * Why this matters
 * ----------------
 * The download file-name is user-controlled (it's the original upload name,
 * stored verbatim on the entity). Interpolating it raw into the header opens
 * two holes:
 *
 * 1. **Header injection** — a `"`, `\`, CR or LF in the name breaks out of the
 *    quoted-string and lets an attacker forge arbitrary response headers.
 * 2. **Inline execution** — without `attachment`, a `.html`/`.svg` object is
 *    rendered by the browser in the bucket's origin context (stored XSS).
 *
 * Defence (RFC 6266 + RFC 5987):
 *
 * - Always `attachment` (force download, never inline).
 * - `filename="…"` carries an **ASCII-only, quote/backslash/control-stripped**
 *   fallback for legacy agents.
 * - `filename*=UTF-8''…` carries the full name **percent-encoded** per the
 *   RFC 5987 `attr-char` set, so non-ASCII names survive without ever putting a
 *   raw byte in the header.
 *
 * Passing no name (or an empty one) yields a bare `attachment` — still safe.
 */
export function contentDispositionAttachment(downloadFilename?: string): string {
  if (downloadFilename === undefined || downloadFilename.length === 0) {
    return "attachment";
  }

  // ASCII fallback: keep printable ASCII only (the `\x20-\x7e` range excludes
  // every control byte, incl. CR/LF), then neutralise the quote/backslash
  // breakout chars. No literal control char appears in the pattern.
  const asciiFallback = downloadFilename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  // A lone UTF-16 surrogate makes encodeURIComponent throw `URIError` — a
  // hostile filename could otherwise crash URL signing. Replace any unpaired
  // surrogate with U+FFFD before encoding.
  const wellFormed = downloadFilename.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "�",
  );

  // RFC 5987 ext-value: encodeURIComponent leaves `!'()*` un-encoded, but those
  // are NOT in the attr-char set — percent-encode them explicitly.
  const rfc5987 = encodeURIComponent(wellFormed).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987}`;
}
