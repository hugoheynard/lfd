import { Injectable } from "@nestjs/common";

import { Stopwatch } from "../../../platform/metrics/stopwatch.js";
import { TimingRecorder } from "../../../platform/metrics/timing-recorder.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import type { ShelfPurgeOrder } from "../../shared/shelf-changes/domain/shelf-purge-batch.js";
import { UnreadableShelfReplyError } from "../domain/errors/unreadable-shelf-reply.error.js";
import { ShelfCallDeadline } from "../domain/ports/shelf-call-deadline.js";
import {
  ShelfCacheSignals,
  type ShelfCacheOperation,
  type ShelfFallbackReason,
} from "../domain/ports/shelf-cache-signals.js";
import {
  ShopShelfCache,
  type ShelfKey,
  type ShelfLookup,
  type ShelfToStore,
} from "../domain/ports/shop-shelf-cache.js";
import { ShopShelfEraser } from "../domain/ports/shop-shelf-eraser.js";
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
 * **Le cache n'est jamais sur le chemin de la disponibilité** (Hugo,
 * 2026-11-04 : « la prod ne peut jamais tomber en panne », § 4 bis).
 *
 * Toute lecture ou tout rangement passe ici : délai court, disjoncteur, et
 * toute erreur, lenteur ou réponse illisible devient `null` — « calcule depuis
 * la base, sers, ne range rien ». Rien de ce qui sort d'ici ne lève.
 *
 * L'effacement passe aussi par le délai, mais **pas** par le disjoncteur :
 * une purge est rare (au plus une par seconde) et c'est la seule chose qui
 * rattrape un rayon devenu faux — la tenter coûte moins que la sauter.
 */
@Injectable()
export class ResilientShopShelfCache {
  private readonly breaker = new ShelfCacheBreaker();

  constructor(
    private readonly cache: ShopShelfCache,
    private readonly eraser: ShopShelfEraser,
    private readonly deadline: ShelfCallDeadline,
    private readonly wall: WallClock,
    private readonly stopwatch: Stopwatch,
    private readonly timings: TimingRecorder,
    private readonly signals: ShelfCacheSignals,
  ) {}

  /** Le rayon rangé, un raté avec la version, ou `null` : magasin indisponible. */
  async read(key: ShelfKey, now: Date): Promise<ShelfLookup | null> {
    const lookup = await this.guarded("read", () => this.cache.read(key, now), true);
    if (lookup !== null) {
      this.signals.emit({ name: lookup.kind });
    }
    return lookup;
  }

  /** Présente un rayon au rangement ; un refus ou une panne ne fait que se compter. */
  async store(entry: ShelfToStore): Promise<void> {
    const outcome = await this.guarded("store", () => this.cache.store(entry), true);
    if (outcome !== null) {
      this.signals.emit({ name: outcome === "stale" ? "stale_refused" : outcome });
    }
  }

  /** Efface des rayons ; une panne est comptée, la durée de vie de 30 s rattrape. */
  async erase(order: ShelfPurgeOrder): Promise<void> {
    const done = await this.guarded(
      "erase",
      () => this.eraser.erase(order).then(() => true),
      false,
    );
    if (done !== null) {
      this.signals.emit({
        name: "erased",
        scope: order.kind,
        companies: order.kind === "companies" ? order.companyIds.length : 0,
      });
    }
  }

  private async guarded<T>(
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
