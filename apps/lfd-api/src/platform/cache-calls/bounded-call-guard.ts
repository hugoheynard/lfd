import type { Stopwatch } from "../metrics/stopwatch.js";
import type { TimingRecorder } from "../metrics/timing-recorder.js";
import type { WallClock } from "../time/wall-clock.js";
import type { CallBreaker } from "./call-breaker.js";
import type { CallDeadline } from "./call-deadline.js";
import { cacheCallTimingNames, type CacheCallTimingNames } from "./cache-call-timings.js";

/** Pourquoi un appel au cache n'a pas servi : la donnée vient alors de la base. */
export type CallFallbackReason = "timeout" | "error" | "unreadable" | "breaker_open";

/**
 * Ce que le garde donne à voir. Ne lève jamais : une sonde qui ferait échouer
 * ce qu'elle mesure serait pire que pas de sonde.
 */
export interface CallGuardListener<Operation extends string> {
  fallback(operation: Operation, reason: CallFallbackReason): void;
  breakerOpened(failures: number): void;
  breakerClosed(): void;
}

/** Les pièces d'un garde : un cache nommé, son délai, son disjoncteur, ses mesures. */
export interface BoundedCallGuardParts<Operation extends string> {
  /** Le nom du cache — préfixe des mesures (`shelf_cache`, `day_versions`). */
  readonly cache: string;
  /** Le délai par défaut d'un appel. */
  readonly limitMs: number;
  readonly breaker: CallBreaker;
  readonly deadline: CallDeadline;
  readonly wall: WallClock;
  readonly stopwatch: Stopwatch;
  readonly timings: TimingRecorder;
  readonly listener: CallGuardListener<Operation>;
  /** Une erreur qui dit « réponse illisible » plutôt que « panne ». */
  readonly isUnreadable: (error: unknown) => boolean;
}

/** L'issue d'un aller-retour, telle que la mesure l'étiquette. */
type RoundTripOutcome = "in_time" | "late" | "error";

/**
 * **Un appel borné à un cache qui n'est jamais sur le chemin de la
 * disponibilité** (`le-rayon-en-cache.md`, § 4 bis) : délai, disjoncteur, et
 * toute erreur, lenteur ou réponse illisible devient `null` — « lis la base ».
 * Rien de ce qui sort d'ici ne lève.
 *
 * `gated` : l'appel respecte-t-il le disjoncteur ? Un appel rare et seul
 * capable de rattraper une donnée fausse (une purge) peut le contourner.
 *
 * Mesuré sous `<cache>.round_trip` (`operation`, `outcome` : `in_time`,
 * `late`, `error`) et `<cache>.late_finish` (`settled`, `failed`).
 */
export class BoundedCallGuard<Operation extends string> {
  private readonly names: CacheCallTimingNames;

  constructor(private readonly parts: BoundedCallGuardParts<Operation>) {
    this.names = cacheCallTimingNames(parts.cache);
  }

  async call<T>(
    operation: Operation,
    work: () => Promise<T>,
    gated: boolean,
    limitMs: number = this.parts.limitMs,
  ): Promise<T | null> {
    if (gated && !this.parts.breaker.allows(this.wallMs())) {
      this.parts.listener.fallback(operation, "breaker_open");
      return null;
    }
    const elapsed = this.parts.stopwatch.start();
    try {
      const pending = work();
      const outcome = await this.parts.deadline.within(pending, limitMs);
      if (outcome.kind === "late") {
        this.roundTrip(operation, "late", elapsed());
        this.followLate(operation, pending, elapsed);
        return this.fallen(operation, "timeout", gated);
      }
      this.roundTrip(operation, "in_time", elapsed());
      this.recovered(gated);
      return outcome.value;
    } catch (error) {
      this.roundTrip(operation, "error", elapsed());
      return this.fallen(operation, this.parts.isUnreadable(error) ? "unreadable" : "error", gated);
    }
  }

  private roundTrip(operation: Operation, outcome: RoundTripOutcome, ms: number): void {
    this.parts.timings.record(this.names.roundTrip, { operation, outcome }, ms, 1);
  }

  /**
   * Mesure jusqu'au bout un appel abandonné : son résultat reste ignoré, sa
   * durée seule est retenue. Non attendu, et c'est le but ; les deux issues
   * sont tenues, rien ne peut rejeter.
   */
  private followLate<T>(operation: Operation, pending: Promise<T>, elapsed: () => number): void {
    const finish = (outcome: "settled" | "failed") => (): void => {
      this.parts.timings.record(this.names.lateFinish, { operation, outcome }, elapsed(), 1);
    };
    void pending.then(finish("settled"), finish("failed"));
  }

  private fallen(operation: Operation, reason: CallFallbackReason, gated: boolean): null {
    this.parts.listener.fallback(operation, reason);
    if (gated && this.parts.breaker.failed(this.wallMs()) === "opened") {
      this.parts.listener.breakerOpened(this.parts.breaker.consecutiveFailures());
    }
    return null;
  }

  private recovered(gated: boolean): void {
    if (gated && this.parts.breaker.succeeded() === "closed") {
      this.parts.listener.breakerClosed();
    }
  }

  private wallMs(): number {
    return this.parts.wall.elapsedNow().getTime();
  }
}
