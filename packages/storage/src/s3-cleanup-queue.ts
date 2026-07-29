import type { IStorageService } from "./IStorageService.js";

/**
 * A single S3 object whose deletion has been requested but not yet
 * acknowledged by the storage layer. The queue is the persistent half
 * of an S3 cleanup loop: when a delete refused to drop synchronously
 * (or when a caller wants the delete deferred to a later TTL), the
 * key lands here and a processor retries it out-of-band.
 *
 * The shape is intentionally minimal — no domain semantics, just
 * "this S3 key is owed a delete". `attempts` / `last_error` exist so
 * the processor can back off and so ops can spot stuck keys.
 */
export type TS3CleanupRecord = {
  /** Stable id (string, prefixed) so it stays consistent with other
   *  Mongo repos in the host app. */
  id: string;
  /** The S3 key to delete. The bucket is implicit — every storage
   *  service in the host app is bound to one bucket per env. */
  s3_key: string;
  /** Free-form context — typically the source aggregate id, so
   *  debugging "why is this still here?" is cheap. */
  source: string;
  attempts: number;
  /** Stringified Error.message from the last failed delete. Optional
   *  on the first enqueue. */
  last_error?: string;
  queued_at: Date;
  /** Set just before deletion of the queue row — saves a roundtrip
   *  and lets the host keep an audit log if it switches from
   *  delete-on-success to soft-delete. */
  resolved_at?: Date;
  next_attempt_at: Date;
};

/**
 * Persistence port. Implementations live next to the host app's other
 * repositories — the queue is generic but the chosen DB/ORM is not.
 */
export type IS3CleanupQueueRepository = {
  enqueue(record: TS3CleanupRecord): Promise<TS3CleanupRecord>;
  /** Pending records due for retry (`next_attempt_at <= now` and
   *  `resolved_at` absent). Capped at `limit` so a backed-up queue
   *  does not blow the processor tick. */
  findDue(now: Date, limit: number): Promise<TS3CleanupRecord[]>;
  remove(id: string): Promise<void>;
  /** Remove the row holding `s3_key`, if any. Used by callers that
   *  successfully sync-deleted a key they had pre-enqueued for TTL
   *  cleanup — they want to drop the row eagerly rather than wait
   *  for the processor to discover it has nothing to do. */
  removeByS3Key(s3_key: string): Promise<void>;
  /** Increment attempts + push a backoff. Returns the updated record
   *  so the caller can decide whether to give up at the next tick. */
  recordFailure(input: {
    id: string;
    error: string;
    nextAttemptAt: Date;
  }): Promise<TS3CleanupRecord | null>;
};

/** Stats returned by a single processor run — useful for logging
 *  and alerting. */
export type TS3CleanupRunStats = {
  scanned: number;
  drained: number;
  deferred: number;
  abandoned: number;
};

export type S3CleanupQueueProcessorOptions = {
  /** Soft cap per tick — a healthy queue should drain in one or two
   *  ticks; a runaway is contained. Defaults to 50. */
  batchSize?: number;
  /** After this many failures the row stops being retried but stays
   *  visible — flip a metric/alarm on `attempts >= maxAttempts`.
   *  Defaults to 10. */
  maxAttempts?: number;
};

/**
 * Framework-agnostic drain loop for an S3 cleanup queue. Hosts wire
 * it under whichever scheduler they use (Nest @Cron, plain cron,
 * Lambda, …) and call {@link runOnce} on each tick.
 *
 * The processor is idempotent on input (each row is independent) and
 * only mutates queue state via the injected repository.
 */
export class S3CleanupQueueProcessor {
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly queue: IS3CleanupQueueRepository,
    private readonly storage: IStorageService,
    opts: S3CleanupQueueProcessorOptions = {},
  ) {
    this.batchSize = opts.batchSize ?? 50;
    this.maxAttempts = opts.maxAttempts ?? 10;
  }

  async runOnce(now: Date = new Date()): Promise<TS3CleanupRunStats> {
    const due = await this.queue.findDue(now, this.batchSize);
    let drained = 0;
    let deferred = 0;
    let abandoned = 0;

    for (const row of due) {
      if (row.attempts >= this.maxAttempts) {
        abandoned += 1;
        continue;
      }
      try {
        await this.storage.delete(row.s3_key);
        await this.queue.remove(row.id);
        drained += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const nextAttemptAt = new Date(now.getTime() + this.backoffMs(row.attempts));
        await this.queue.recordFailure({
          id: row.id,
          error: message,
          nextAttemptAt,
        });
        deferred += 1;
      }
    }

    return { scanned: due.length, drained, deferred, abandoned };
  }

  /** Exponential backoff capped at 24h. Attempt N → 2^N minutes. */
  private backoffMs(attempts: number): number {
    const minutes = Math.min(2 ** attempts, 60 * 24);
    return minutes * 60_000;
  }
}
