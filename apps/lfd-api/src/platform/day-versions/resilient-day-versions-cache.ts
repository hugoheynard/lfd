import { Injectable } from "@nestjs/common";

import { BoundedCallGuard } from "../cache-calls/bounded-call-guard.js";
import { CallBreaker } from "../cache-calls/call-breaker.js";
import { CallDeadline } from "../cache-calls/call-deadline.js";
import { LoggingCallGuardListener } from "../cache-calls/logging-call-guard-listener.js";
import { Stopwatch } from "../metrics/stopwatch.js";
import { TimingRecorder } from "../metrics/timing-recorder.js";
import { WallClock } from "../time/wall-clock.js";
import { DayVersionsCache, type VersionsCard } from "./day-versions-cache.js";
import { UnreadableDayVersionsReplyError } from "./unreadable-day-versions-reply.error.js";

/** Le nom du cache, préfixe de ses mesures (`day_versions.round_trip`), lu par la carte de santé. */
export const DAY_VERSIONS_CACHE_NAME = "day_versions";

/** Le délai d'une lecture à l'objet — celui du rayon (`le-rayon-en-cache.md`, § 4 bis). */
export const DAY_VERSIONS_READ_LIMIT_MS = 400;

/** Le délai d'un rangement, qui part après la réponse : aucun onglet ne l'attend. */
export const DAY_VERSIONS_STORE_LIMIT_MS = 2000;

/** Échecs de suite qui ouvrent le disjoncteur — les seuils du rayon. */
export const DAY_VERSIONS_BREAKER_FAILURES = 5;

/** La pause d'un disjoncteur ouvert. */
export const DAY_VERSIONS_BREAKER_PAUSE_MS = 30_000;

type DayVersionsOperation = "read" | "store";

/**
 * **L'objet des journées n'est jamais sur le chemin de la disponibilité**
 * (`le-cache-du-back-office.md`, § 3) : objet injoignable, lent ou
 * disjoncteur ouvert → `null`, et le handler lit la base. Rien ne lève.
 */
@Injectable()
export class ResilientDayVersionsCache {
  private readonly guard: BoundedCallGuard<DayVersionsOperation>;

  constructor(
    private readonly cache: DayVersionsCache,
    deadline: CallDeadline,
    wall: WallClock,
    stopwatch: Stopwatch,
    timings: TimingRecorder,
  ) {
    this.guard = new BoundedCallGuard<DayVersionsOperation>({
      cache: DAY_VERSIONS_CACHE_NAME,
      limitMs: DAY_VERSIONS_READ_LIMIT_MS,
      breaker: new CallBreaker(DAY_VERSIONS_BREAKER_FAILURES, DAY_VERSIONS_BREAKER_PAUSE_MS),
      deadline,
      wall,
      stopwatch,
      timings,
      listener: new LoggingCallGuardListener<DayVersionsOperation>(DAY_VERSIONS_CACHE_NAME),
      isUnreadable: (error) => error instanceof UnreadableDayVersionsReplyError,
    });
  }

  /** La carte gardée ; `null` = aucune, ou objet indisponible — lis la base. */
  read(scope: string): Promise<VersionsCard | null> {
    return this.guard.call("read", () => this.cache.read(scope), true);
  }

  /**
   * Range sans faire attendre la réponse. Rien n'est avalé en silence : le
   * garde ne lève jamais, et une panne y est comptée et journalisée.
   */
  storeAfterReply(scope: string, card: VersionsCard): void {
    void this.guard.call(
      "store",
      () => this.cache.store(scope, card).then(() => true),
      true,
      DAY_VERSIONS_STORE_LIMIT_MS,
    );
  }
}
