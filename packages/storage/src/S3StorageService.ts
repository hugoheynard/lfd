import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";
import type { IStorageService, SignedDownloadOptions } from "./IStorageService.js";
import { contentDispositionAttachment } from "./content-disposition.js";
import {
  kindFromMime,
  type IStorageMetrics,
  type StorageOp,
  type StorageOpRecord,
  type TStorageKind,
} from "./storage-metrics.js";

export interface S3StorageConfig {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * S3/R2-compatible storage service. **The universal chokepoint** — every real
 * R2 op (facade, per-domain wrappers, downloads, deletes) lands here, so the
 * optional {@link IStorageMetrics} port instruments them all in one place.
 *
 * Framework-agnostic — no NestJS dependency.
 * Consumers wrap this in their own DI provider (NestJS module, factory, etc.).
 */
export class S3StorageService implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    config: S3StorageConfig,
    private readonly metrics?: IStorageMetrics,
  ) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region ?? "auto",
      // Only pass `endpoint` when set — exactOptionalPropertyTypes rejects an
      // explicit `undefined`, and the SDK falls back to the AWS default anyway.
      ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /** Time + record one R2 op (ok/error). `kind` is content-derived from the MIME
   *  the op has in hand (`other` when none) — never reverse-engineered from the key. */
  private async track<T>(
    op: StorageOp,
    kind: TStorageKind,
    run: () => Promise<T>,
    extra?: (result: T) => Pick<StorageOpRecord, "bytes" | "deletedCount">,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await run();
      this.metrics?.record({
        op,
        result: "ok",
        kind,
        durationMs: Date.now() - start,
        ...extra?.(result),
      });
      return result;
    } catch (e) {
      this.metrics?.record({ op, result: "error", kind, durationMs: Date.now() - start });
      throw e;
    }
  }

  async upload(key: string, body: Buffer | Readable, contentType: string): Promise<void> {
    const bytes = Buffer.isBuffer(body) ? body.length : undefined;
    await this.track(
      "put",
      kindFromMime(contentType),
      () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        ),
      () => (bytes !== undefined ? { bytes } : {}),
    );
  }

  async delete(key: string): Promise<void> {
    // No MIME in hand on a delete — kind stays `other`.
    await this.track("delete", "other", () =>
      this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
    );
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    // Safety floor: refuse a suspiciously broad prefix. A bare wall (`owner/`)
    // or empty string would wipe far more than one tenant. A legitimate prefix
    // is at least `wall/{id}/` (two non-empty segments + trailing slash) — the
    // ScopedStorage facade always produces exactly that.
    if (!/^[^/]+\/[^/]+\//.test(prefix)) {
      throw new Error(`Refusing deleteByPrefix on a too-broad prefix: ${JSON.stringify(prefix)}`);
    }
    return this.track(
      "delete_prefix",
      "other",
      () => this.runDeleteByPrefix(prefix),
      (deleted) => ({ deletedCount: deleted }),
    );
  }

  private async runDeleteByPrefix(prefix: string): Promise<number> {
    let continuationToken: string | undefined;
    let deleted = 0;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      // One ListObjectsV2 page is ≤ 1000 keys — exactly DeleteObjects' batch cap.
      const objects = (listed.Contents ?? []).flatMap((o) =>
        o.Key !== undefined ? [{ Key: o.Key }] : [],
      );
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        deleted += objects.length;
      }
      continuationToken = listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    return deleted;
  }

  async downloadToBuffer(key: string): Promise<Buffer> {
    // The buffered-download path (audio-processor) doesn't read the stored
    // content-type → kind stays `other`. Egress-by-type is marginal here
    // (user downloads are presigned, direct to client).
    return this.track(
      "download",
      "other",
      async () => {
        const response = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        if (!response.Body) {
          throw new Error(`Empty response body for key: ${key}`);
        }
        // The SDK helper fully consumes AND destroys the stream — no half-read
        // socket left dangling.
        const bytes = await response.Body.transformToByteArray();
        return Buffer.from(bytes);
      },
      (buf) => ({ bytes: buf.length }),
    );
  }

  async getSignedDownloadUrl(key: string, options: SignedDownloadOptions = {}): Promise<string> {
    // The download handlers pass the stored mime → kind when present, else `other`.
    return this.track("sign", kindFromMime(options.contentType), () => {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // Always force download — a hostile object must never render inline.
        ResponseContentDisposition: contentDispositionAttachment(options.downloadFilename),
        ...(options.contentType !== undefined ? { ResponseContentType: options.contentType } : {}),
      });
      return getSignedUrl(this.client, command, { expiresIn: options.expiresInSeconds ?? 3600 });
    });
  }
}
