import { Injectable, Logger } from "@nestjs/common";

import { BoundedCallGuard } from "../cache-calls/bounded-call-guard.js";
import { CallBreaker } from "../cache-calls/call-breaker.js";
import { CallDeadline } from "../cache-calls/call-deadline.js";
import { LoggingCallGuardListener } from "../cache-calls/logging-call-guard-listener.js";
import { Stopwatch } from "../metrics/stopwatch.js";
import { TimingRecorder } from "../metrics/timing-recorder.js";
import { WallClock } from "../time/wall-clock.js";
import { type PackedContent, packContent, unpackContent } from "./content-compression.js";
import { type DaySubjectVersion, dayContentTagOf } from "./day-content-tag.js";
import { type DayContentAddress, DayContentsCache } from "./day-contents-cache.js";
import {
  DAY_VERSIONS_BREAKER_FAILURES,
  DAY_VERSIONS_BREAKER_PAUSE_MS,
  DAY_VERSIONS_READ_LIMIT_MS,
  DAY_VERSIONS_STORE_LIMIT_MS,
} from "./resilient-day-versions-cache.js";
import { UnreadableDayVersionsReplyError } from "./unreadable-day-versions-reply.error.js";
import type { ContentGuard } from "./versioned-contents.js";

/** Le nom du cache, préfixe de ses mesures (`day_contents.round_trip`). */
export const DAY_CONTENTS_CACHE_NAME = "day_contents";

/** Au-delà, une charge n'est pas rangée — le plafond de l'objet, mesuré compressé. */
export const DAY_CONTENT_MAX_BYTES = 1_048_576;

type DayContentOperation = "read" | "store";

/** Ce qu'un écran demande : sa journée, et les numéros lus en base AVANT ses données. */
export interface DayContentRequest {
  /** Le nom de l'écran, `[a-z][a-z0-9-]*` — compté `day-<écran>` dans l'onglet Cache. */
  readonly screen: string;
  /** La journée de service, `AAAA-MM-JJ`. */
  readonly day: string;
  readonly versions: readonly DaySubjectVersion[];
}

/** Ce que `contentOf` sait d'un contenu : le reconnaître relu, et savoir s'il peut se ranger. */
export interface DayContentRules<T> {
  readonly accepts: ContentGuard<T>;
  /** `false` pour un contenu dégradé (lecture en échec, valeur absente) : servi, jamais rangé. */
  readonly storable: (content: T) => boolean;
}

/**
 * **Le contenu d'un écran de journée, servi depuis l'objet tant que ses
 * numéros ne bougent pas** (`le-cache-du-back-office.md`, § 3.1). Le droit
 * reste à la porte de la route : ce qui entre ici est ce que tous les
 * appelants de la route reçoivent pour cette journée.
 *
 * - étiquette égale rangée → la charge, sans la base ;
 * - sinon UNE lecture par (écran, journée, étiquette) et par instance, les
 *   appels concurrents l'attendent, puis rangement après la réponse ;
 * - contenu non `storable`, ou compressé au-delà de
 *   {@link DAY_CONTENT_MAX_BYTES} → servi, pas rangé ;
 * - objet injoignable, lent, illisible ou disjoncteur ouvert → la base.
 *   Rien ne lève de l'objet ; une erreur de `load` remonte telle quelle.
 */
@Injectable()
export class DayContents {
  private readonly guard: BoundedCallGuard<DayContentOperation>;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly logger = new Logger("DayContents");

  constructor(
    private readonly cache: DayContentsCache,
    deadline: CallDeadline,
    wall: WallClock,
    stopwatch: Stopwatch,
    timings: TimingRecorder,
  ) {
    this.guard = new BoundedCallGuard<DayContentOperation>({
      cache: DAY_CONTENTS_CACHE_NAME,
      limitMs: DAY_VERSIONS_READ_LIMIT_MS,
      breaker: new CallBreaker(DAY_VERSIONS_BREAKER_FAILURES, DAY_VERSIONS_BREAKER_PAUSE_MS),
      deadline,
      wall,
      stopwatch,
      timings,
      listener: new LoggingCallGuardListener<DayContentOperation>(DAY_CONTENTS_CACHE_NAME),
      isUnreadable: (error) => error instanceof UnreadableDayVersionsReplyError,
    });
  }

  /** @throws {InvalidDayContentTagError} des numéros qui ne forment pas une étiquette. */
  async contentOf<T>(
    request: DayContentRequest,
    load: () => Promise<T>,
    rules: DayContentRules<T>,
  ): Promise<T> {
    const address: DayContentAddress = {
      screen: request.screen,
      day: request.day,
      tag: dayContentTagOf(request.versions),
    };
    const kept = await this.kept(address, rules.accepts);
    if (kept !== null) {
      return kept;
    }
    const flight = `${address.screen}/${address.day}@${address.tag}`;
    const pending = this.inFlight.get(flight);
    if (pending !== undefined) {
      const shared = await pending;
      if (rules.accepts(shared)) {
        return shared;
      }
    }
    const loading = this.loadAndStore(address, load, rules.storable);
    this.inFlight.set(flight, loading);
    try {
      return await loading;
    } finally {
      this.inFlight.delete(flight);
    }
  }

  private async kept<T>(address: DayContentAddress, accepts: ContentGuard<T>): Promise<T | null> {
    const bytes = await this.guard.call("read", () => this.cache.read(address), true);
    if (bytes === null) {
      return null;
    }
    const body = await unpackContent(bytes);
    const parsed = body === null ? null : parsedOrNull(body);
    if (accepts(parsed)) {
      return parsed;
    }
    this.logger.warn({
      message: `Contenu de journée ${address.screen} ${address.day} illisible dans l'objet : relu en base`,
      metric: `${DAY_CONTENTS_CACHE_NAME}.unreadable`,
      screen: address.screen,
      bytes: bytes.byteLength,
    });
    return null;
  }

  private async loadAndStore<T>(
    address: DayContentAddress,
    load: () => Promise<T>,
    storable: (content: T) => boolean,
  ): Promise<T> {
    const content = await load();
    if (!storable(content)) {
      return content;
    }
    const packed = await this.packed(address, content);
    if (packed !== null) {
      void this.guard.call(
        "store",
        () => this.cache.store(address, packed).then(() => true),
        true,
        DAY_VERSIONS_STORE_LIMIT_MS,
      );
    }
    return content;
  }

  /** La charge compressée, ou `null` si elle ne se range pas (trop lourde). */
  private async packed(
    address: DayContentAddress,
    content: unknown,
  ): Promise<PackedContent | null> {
    const packed = await packContent(JSON.stringify(content));
    const bytes = packed.bytes.byteLength;
    if (bytes > DAY_CONTENT_MAX_BYTES) {
      this.logger.warn({
        message: `Contenu de journée ${address.screen} ${address.day} trop lourd pour l'objet : servi depuis la base, pas rangé`,
        metric: `${DAY_CONTENTS_CACHE_NAME}.too_large`,
        screen: address.screen,
        bytes,
        rawBytes: packed.rawBytes,
        limit: DAY_CONTENT_MAX_BYTES,
      });
      return null;
    }
    return packed;
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
