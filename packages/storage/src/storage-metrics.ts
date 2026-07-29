/**
 * Metrics port for the storage adapter. The package stays framework-agnostic
 * (no `prom-client`) — the backend provides an impl that forwards to its
 * `APP_METRICS` registry and wires it into every `S3StorageService` it builds.
 * Optional: when absent, the adapter is a no-op (unit tests, the no-S3 dev mode).
 */

export type StorageOp = "put" | "delete" | "delete_prefix" | "sign" | "download";

/** Coarse, **bounded** content class for the Prometheus label — derived from the
 * (server-verified) MIME, not the key path. Bounded on purpose: never the tenant
 * id or the fine MIME (cardinality). */
export type TStorageKind = "audio" | "image" | "document" | "other";

export interface StorageOpRecord {
  op: StorageOp;
  result: "ok" | "error";
  /** Content class, derived from the key prefix (see {@link storageKindOf}). */
  kind: TStorageKind;
  durationMs: number;
  /** Bytes moved (put / download). */
  bytes?: number;
  /** Objects removed by a prefix delete. */
  deletedCount?: number;
}

export interface IStorageMetrics {
  record(rec: StorageOpRecord): void;
}

/**
 * Coarse content class from the **MIME** (the server-verified one — sniffed at
 * W1.2, carried as the op's content type). Content-based, so a new consumer is
 * classified automatically — no per-domain registry to edit. `undefined` (ops
 * with no MIME in hand: delete / prefix-delete) → `other`.
 */
export function kindFromMime(mime: string | undefined): TStorageKind {
  if (mime === undefined) {
    return "other";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime === "application/pdf") {
    return "document";
  }
  return "other";
}
