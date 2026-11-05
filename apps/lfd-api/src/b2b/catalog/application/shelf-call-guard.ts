import { Injectable } from "@nestjs/common";

import { Stopwatch } from "../../../platform/metrics/stopwatch.js";
import { TimingRecorder } from "../../../platform/metrics/timing-recorder.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import { UnreadableShelfReplyError } from "../domain/errors/unreadable-shelf-reply.error.js";
import { ShelfCallDeadline } from "../domain/ports/shelf-call-deadline.js";
import {
  ShelfCacheSignals,
  type ShelfCacheOperation,
  type ShelfFallbackReason,
} from "../domain/ports/shelf-cache-signals.js";
import { ShelfCacheBreaker } from "./shelf-cache-breaker.js";

/**
 * Le délai d'un appel au magasin des rayons. ~100 ms (`plan-cache-du-catalogue.md`,
 * § 4 bis) : au-delà, recalculer depuis la base coûte moins que d'attendre.
 * À ajuster sur l'aller-retour mesuré (`shelf_cache.round_trip`).
 */
export const SHELF_CALL_LIMIT_MS = 100;

/**
 * Le délai d'un **rangement**, qui part après la réponse (2026-11-05) : aucun
 * client ne l'attend plus, et l'abandonner à 100 ms compterait `timeout` — et
 * nourrirait le disjoncteur — un rangement qui aurait abouti. Il prend donc le
 * filet du socket de l'adaptateur (`SHELF_SOCKET_TIMEOUT_MS`,
 * `durable-object-shop-shelf-cache.ts`, 2000 ms, vérifié le 2026-11-05) : au
 * delà, l'appel est coupé de toute façon.
 */
export const SHELF_STORE_LIMIT_MS = 2000;

/**
 * Le nom de la mesure de durée d'un aller-retour, lu par la carte de santé (C5).
 * Étiquettes : `operation`, et `outcome` — `in_time`, `late` (durée jusqu'à
 * l'abandon) ou `error`.
 */
export const SHELF_ROUND_TRIP_TIMING = "shelf_cache.round_trip";

/**
 * La durée FINALE d'un appel abandonné au délai, quand il finit par aboutir
 * (`outcome: settled`) ou par échouer (`failed`) — ce que l'objet a vraiment
 * mis, que la mesure arrêtée à l'abandon ne dit pas (C5, 2026-11-05).
 */
export const SHELF_LATE_FINISH_TIMING = "shelf_cache.late_finish";

/** L'issue d'un aller-retour, telle que la mesure l'étiquette. */
type RoundTripOutcome = "in_time" | "late" | "error";

/**
 * **Le délai et le disjoncteur de TOUT appel au chemin `rayons.interne`** —
 * rayons pro (C2) comme rayon public (C3). Sorti de `ResilientShopShelfCache`
 * le 2026-11-04 pour être partagé : un seul disjoncteur, parce qu'il n'y a
 * qu'un chemin et qu'un objet derrière. Une panne vue par le rayon pro
 * épargne donc aussi le délai au rayon public, et l'inverse.
 *
 * Toute erreur, lenteur ou réponse illisible devient `null`, comptée sous un
 * nom stable. Rien de ce qui sort d'ici ne lève (§ 4 bis : « la prod ne peut
 * jamais tomber en panne »).
 *
 * `gated` : l'appel respecte-t-il le disjoncteur ? Les lectures oui ; les
 * effacements non — une purge est rare et c'est la seule chose qui rattrape
 * un rayon devenu faux.
 */
@Injectable()
export class ShelfCallGuard {
  private readonly breaker = new ShelfCacheBreaker();

  constructor(
    private readonly deadline: ShelfCallDeadline,
    private readonly wall: WallClock,
    private readonly stopwatch: Stopwatch,
    private readonly timings: TimingRecorder,
    private readonly signals: ShelfCacheSignals,
  ) {}

  /** @param limitMs le délai de l'appel — {@link SHELF_CALL_LIMIT_MS}, sauf pour un rangement. */
  async call<T>(
    operation: ShelfCacheOperation,
    work: () => Promise<T>,
    gated: boolean,
    limitMs: number = SHELF_CALL_LIMIT_MS,
  ): Promise<T | null> {
    if (gated && !this.breaker.allows(this.wallMs())) {
      this.signals.emit({ name: "fallback", operation, reason: "breaker_open" });
      return null;
    }
    const elapsed = this.stopwatch.start();
    try {
      const pending = work();
      const outcome = await this.deadline.within(pending, limitMs);
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
      const reason = error instanceof UnreadableShelfReplyError ? "unreadable" : "error";
      return this.fallen(operation, reason, gated);
    }
  }

  private roundTrip(operation: ShelfCacheOperation, outcome: RoundTripOutcome, ms: number): void {
    this.timings.record(SHELF_ROUND_TRIP_TIMING, { operation, outcome }, ms, 1);
  }

  /**
   * Mesure jusqu'au bout un appel abandonné : son résultat reste ignoré, sa
   * durée seule est retenue. Non attendu, et c'est le but — `void` comme le
   * journal des transitions de `ops/health/ops-health.service.ts` (vérifié le
   * 2026-11-05) ; les deux issues sont tenues, rien ne peut rejeter.
   */
  private followLate<T>(
    operation: ShelfCacheOperation,
    pending: Promise<T>,
    elapsed: () => number,
  ): void {
    const finish = (outcome: "settled" | "failed") => (): void => {
      this.timings.record(SHELF_LATE_FINISH_TIMING, { operation, outcome }, elapsed(), 1);
    };
    void pending.then(finish("settled"), finish("failed"));
  }

  private fallen(
    operation: ShelfCacheOperation,
    reason: ShelfFallbackReason,
    gated: boolean,
  ): null {
    this.signals.emit({ name: "fallback", operation, reason });
    if (gated && this.breaker.failed(this.wallMs()) === "opened") {
      this.signals.emit({ name: "breaker_opened", failures: this.breaker.consecutiveFailures() });
    }
    return null;
  }

  private recovered(gated: boolean): void {
    if (gated && this.breaker.succeeded() === "closed") {
      this.signals.emit({ name: "breaker_closed" });
    }
  }

  private wallMs(): number {
    return this.wall.elapsedNow().getTime();
  }
}
