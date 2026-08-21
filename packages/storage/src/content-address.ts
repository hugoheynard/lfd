import { createHash } from "crypto";

/**
 * Content addressing — the object's key IS the digest of its bytes.
 *
 * This is what makes an aggressive cache honest. With
 * `Cache-Control: immutable, max-age=31536000`, a key must never be reused for
 * different content; deriving it from the content makes that unrepresentable.
 * Replacing an image produces a new key, so there is nothing to purge and no
 * "I replaced it but the old one still shows" — the failure that only ever
 * appears in production, for one customer, on a Friday.
 *
 * Two consequences worth stating: identical bytes deduplicate to a single
 * object for free, and no part of a user-supplied file name ever reaches a
 * public URL.
 */
export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The canonical extension for a MIME we have **already validated**, or `null`.
 *
 * The extension is cosmetic — R2 serves the stored `Content-Type`, not a guess
 * from the key — but it makes a bucket listing readable, and lets a browser
 * that saves the file name it something sensible. It is derived from the
 * sniffed type, never from what the client called the file.
 */
export function extensionForMime(mime: string): string | null {
  return EXTENSIONS[mime] ?? null;
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/**
 * A content-addressed storage key: `{prefix}/{digest}.{ext}`.
 *
 * The prefix names the USE (`products`), not the owner — an object is shared by
 * construction here, since the same bytes always land on the same key. Callers
 * that need a tenancy wall in the path must not use this function: a wall and
 * content addressing are mutually exclusive, and public product imagery has no
 * wall to hold.
 */
export function contentAddressedKey(prefix: string, bytes: Buffer, mime: string): string | null {
  const extension = extensionForMime(mime);
  return extension === null ? null : `${prefix}/${sha256Hex(bytes)}.${extension}`;
}
