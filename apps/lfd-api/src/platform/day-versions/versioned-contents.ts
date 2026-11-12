import { Injectable, Logger } from "@nestjs/common";

import { BoundedCallGuard } from "../cache-calls/bounded-call-guard.js";
import { CallBreaker } from "../cache-calls/call-breaker.js";
import { CallDeadline } from "../cache-calls/call-deadline.js";
import { LoggingCallGuardListener } from "../cache-calls/logging-call-guard-listener.js";
import { Stopwatch } from "../metrics/stopwatch.js";
import { TimingRecorder } from "../metrics/timing-recorder.js";
import { WallClock } from "../time/wall-clock.js";
import {
  DAY_VERSIONS_BREAKER_FAILURES,
  DAY_VERSIONS_BREAKER_PAUSE_MS,
  DAY_VERSIONS_READ_LIMIT_MS,
  DAY_VERSIONS_STORE_LIMIT_MS,
} from "./resilient-day-versions-cache.js";
import { UnreadableDayVersionsReplyError } from "./unreadable-day-versions-reply.error.js";
import { VersionedContentCache } from "./versioned-content-cache.js";

/** Le nom du cache, préfixe de ses mesures (`versioned_contents.round_trip`). */
export const VERSIONED_CONTENTS_CACHE_NAME = "versioned_contents";

/** Au-delà, une charge n'est pas rangée — le plafond de l'objet (`CONTENT_MAX_BYTES`). */
export const VERSIONED_CONTENT_MAX_BYTES = 1_048_576;

type ContentOperation = "read" | "store";

/** Reconnaît une charge relue de l'objet ; `false` = la relire en base. */
export type ContentGuard<T> = (raw: unknown) => raw is T;

/**
 * **Un contenu servi depuis l'objet tant que son numéro ne bouge pas**
 * (`le-cache-du-back-office.md`, § 4.5) — la porte que les blocs
 * appellent ; `platform` ne sait pas ce qu'elle garde.
 *
 * - même numéro rangé → la charge, sans la base ;
 * - numéro changé ou absent → UNE lecture par (clé, numéro) et par instance,
 *   les appels concurrents l'attendent (single-flight), puis rangement après
 *   la réponse ;
 * - charge au-delà de {@link VERSIONED_CONTENT_MAX_BYTES} → servie, pas
 *   rangée, et l'écart journalisé ;
 * - objet injoignable, lent, illisible ou disjoncteur ouvert → la base. Rien
 *   ne lève de l'objet ; une erreur de `load` remonte telle quelle.
 */
@Injectable()
export class VersionedContents {
  private readonly guard: BoundedCallGuard<ContentOperation>;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly logger = new Logger("VersionedContents");

  constructor(
    private readonly cache: VersionedContentCache,
    deadline: CallDeadline,
    wall: WallClock,
    stopwatch: Stopwatch,
    timings: TimingRecorder,
  ) {
    this.guard = new BoundedCallGuard<ContentOperation>({
      cache: VERSIONED_CONTENTS_CACHE_NAME,
      limitMs: DAY_VERSIONS_READ_LIMIT_MS,
      breaker: new CallBreaker(DAY_VERSIONS_BREAKER_FAILURES, DAY_VERSIONS_BREAKER_PAUSE_MS),
      deadline,
      wall,
      stopwatch,
      timings,
      listener: new LoggingCallGuardListener<ContentOperation>(VERSIONED_CONTENTS_CACHE_NAME),
      isUnreadable: (error) => error instanceof UnreadableDayVersionsReplyError,
    });
  }

  async contentOf<T>(
    key: string,
    version: number,
    load: () => Promise<T>,
    accepts: ContentGuard<T>,
  ): Promise<T> {
    const kept = await this.kept(key, version, accepts);
    if (kept !== null) {
      return kept;
    }
    const flight = `${key}@${version}`;
    const pending = this.inFlight.get(flight);
    if (pending !== undefined) {
      const shared = await pending;
      if (accepts(shared)) {
        return shared;
      }
    }
    const loading = this.loadAndStore(key, version, load);
    this.inFlight.set(flight, loading);
    try {
      return await loading;
    } finally {
      this.inFlight.delete(flight);
    }
  }

  private async kept<T>(key: string, version: number, accepts: ContentGuard<T>): Promise<T | null> {
    const body = await this.guard.call("read", () => this.cache.read(key, version), true);
    if (body === null) {
      return null;
    }
    const parsed = parsedOrNull(body);
    return accepts(parsed) ? parsed : null;
  }

  private async loadAndStore<T>(key: string, version: number, load: () => Promise<T>): Promise<T> {
    const content = await load();
    const body = JSON.stringify(content);
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > VERSIONED_CONTENT_MAX_BYTES) {
      this.logger.warn({
        message: `Contenu ${key} trop lourd pour l'objet : servi depuis la base, pas rangé`,
        metric: `${VERSIONED_CONTENTS_CACHE_NAME}.too_large`,
        key,
        bytes,
        limit: VERSIONED_CONTENT_MAX_BYTES,
      });
      return content;
    }
    void this.guard.call(
      "store",
      () => this.cache.store(key, version, body).then(() => true),
      true,
      DAY_VERSIONS_STORE_LIMIT_MS,
    );
    return content;
  }
}

function parsedOrNull(body: string): unknown {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed;
  } catch {
    return null;
  }
}
