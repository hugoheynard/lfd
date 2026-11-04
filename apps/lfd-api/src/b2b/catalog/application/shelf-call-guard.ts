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

/** Le nom de la mesure de durée d'un aller-retour, lu par la carte de santé (C5). */
export const SHELF_ROUND_TRIP_TIMING = "shelf_cache.round_trip";

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

  async call<T>(
    operation: ShelfCacheOperation,
    work: () => Promise<T>,
    gated: boolean,
  ): Promise<T | null> {
    if (gated && !this.breaker.allows(this.wallMs())) {
      this.signals.emit({ name: "fallback", operation, reason: "breaker_open" });
      return null;
    }
    const elapsed = this.stopwatch.start();
    try {
      const outcome = await this.deadline.within(work(), SHELF_CALL_LIMIT_MS);
      this.timings.record(SHELF_ROUND_TRIP_TIMING, { operation }, elapsed(), 1);
      if (outcome.kind === "late") {
        return this.fallen(operation, "timeout", gated);
      }
      this.recovered(gated);
      return outcome.value;
    } catch (error) {
      this.timings.record(SHELF_ROUND_TRIP_TIMING, { operation }, elapsed(), 1);
      const reason = error instanceof UnreadableShelfReplyError ? "unreadable" : "error";
      return this.fallen(operation, reason, gated);
    }
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
