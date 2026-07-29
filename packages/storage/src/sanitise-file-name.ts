/** Maximum length of the sanitised base (extension preserved on top). */
const MAX_FILENAME_LENGTH = 100;
/** Default fallback when the input is empty after sanitisation. */
const DEFAULT_FALLBACK = "file";

/**
 * Sanitise a user-supplied file name into a safe storage-key segment.
 *
 * The caller controls the file name (it comes from the multipart upload).
 * Concatenated raw into a key it would let `../etc/passwd` traverse the prefix
 * structure, non-canonical UTF-8 break downstream tools, zero-width runs bloat
 * the key, and `Mix (1).wav` / `Mix _1_.wav` collide silently.
 *
 * Rules (idempotent — running twice is a no-op):
 * 1. NFKD-normalise then strip combining marks (`é` → `e`).
 * 2. Replace anything outside `[A-Za-z0-9._-]` with `_`.
 * 3. Collapse runs of `_` and of `.` (so `..`/`...` cannot survive).
 * 4. Strip leading `._-` (no hidden-file / traversal segments).
 * 5. Truncate the base to {@link MAX_FILENAME_LENGTH}, preserving the extension.
 * 6. Empty result → `fallback`.
 *
 * Output charset: `[A-Za-z0-9._-]`.
 */
export function sanitiseFileName(input: string, fallback: string = DEFAULT_FALLBACK): string {
  if (typeof input !== "string") {
    return fallback;
  }

  const normalised = input.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const filtered = normalised.replace(/[^A-Za-z0-9._-]/g, "_");
  const collapsed = filtered.replace(/_+/g, "_").replace(/\.{2,}/g, ".");
  const trimmed = collapsed.replace(/^[._-]+/, "");

  if (trimmed.length === 0) {
    return fallback;
  }

  const lastDot = trimmed.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1;
  const base = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  const ext = hasExt ? trimmed.slice(lastDot) : "";
  const truncatedBase =
    base.length > MAX_FILENAME_LENGTH ? base.slice(0, MAX_FILENAME_LENGTH) : base;

  const result = truncatedBase + ext;
  return result.length === 0 ? fallback : result;
}
