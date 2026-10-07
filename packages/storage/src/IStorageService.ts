import type { Readable } from "stream";

/**
 * Read surface of the object store (ISP). A consumer that only serves
 * downloads depends on this, and can be wired
 * with a **read-only** R2 credential (see storage-hardening W4.2).
 */
export interface IStorageReader {
  /** Download a file from storage as a Buffer. */
  downloadToBuffer(key: string): Promise<Buffer>;
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
