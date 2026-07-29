import type { Readable } from "stream";

/**
 * Options for a presigned download URL.
 *
 * The signed response is **always** forced to `attachment` (the implementation
 * never serves inline). `downloadFilename` and `contentType` are baked into the
 * presigned response so a hostile object can neither execute inline nor inject
 * a response header — see {@link IStorageService.getSignedDownloadUrl}.
 */
export interface SignedDownloadOptions {
  /** URL lifetime in seconds (default: 1 hour). */
  expiresInSeconds?: number;
  /** Display name for the download (encoded RFC 5987 — safe for any input). */
  downloadFilename?: string;
  /** Response `Content-Type` — pass the **server-validated** mime, never the raw client one. */
  contentType?: string;
}

/**
 * Read surface of the object store (ISP). A consumer that only serves
 * downloads — e.g. a signed-URL handler — depends on this, and can be wired
 * with a **read-only** R2 credential (see storage-hardening W4.2).
 */
export interface IStorageReader {
  /** Download a file from storage as a Buffer. */
  downloadToBuffer(key: string): Promise<Buffer>;

  /**
   * Get a presigned download URL. The signed response always forces
   * `Content-Disposition: attachment` (never inline) to defeat stored-XSS.
   */
  getSignedDownloadUrl(key: string, options?: SignedDownloadOptions): Promise<string>;
}

/**
 * Write surface of the object store (ISP). Mutating paths (upload, delete,
 * compensation) depend on this and require a read-write credential.
 */
export interface IStorageWriter {
  /** Upload a file to storage. */
  upload(key: string, body: Buffer | Readable, contentType: string): Promise<void>;

  /** Delete a file from storage. */
  delete(key: string): Promise<void>;

  /**
   * Delete **every** object under a key prefix; returns the number removed.
   * The basis for GDPR erasure / tenant cascade — `deleteByPrefix('owner/{id}/')`
   * wipes everything a user owns. The prefix must be wall-anchored (built by the
   * ScopedStorage facade from a verified context), never a bare client string.
   */
  deleteByPrefix(prefix: string): Promise<number>;
}

/**
 * Generic S3-compatible storage service interface — the full read+write
 * surface. Prefer depending on the narrower {@link IStorageReader} /
 * {@link IStorageWriter} when a consumer only reads or only writes.
 *
 * Consumers build their own key conventions (e.g. `tracks/{owner}/{version}/{file}`).
 * This service only deals with raw keys — no domain-specific logic.
 */
export interface IStorageService extends IStorageReader, IStorageWriter {}
