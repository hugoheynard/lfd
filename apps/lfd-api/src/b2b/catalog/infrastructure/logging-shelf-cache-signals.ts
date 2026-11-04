import { Injectable, Logger } from "@nestjs/common";

import { ShelfCacheSignals, type ShelfCacheSignal } from "../domain/ports/shelf-cache-signals.js";

/** Le préfixe stable des compteurs : `shelf_cache.hit`, `shelf_cache.fallback`… */
export const SHELF_CACHE_METRIC_PREFIX = "shelf_cache.";

/**
 * **Les compteurs du cache des rayons pro, en journaux structurés** — une
 * ligne par signal, avec un champ `metric` STABLE que la carte de santé (C5)
 * agrégera (`plan-cache-du-catalogue.md`, § 4 quater). Comment `ops` les lira
 * sans importer le catalogue reste à trancher en C5 ; le nom, lui, est fixé ici.
 *
 * Au niveau `warn` ce qui demande un regard (repli, disjoncteur ouvert), `log`
 * pour le reste.
 */
@Injectable()
export class LoggingShelfCacheSignals extends ShelfCacheSignals {
  private readonly logger = new Logger("ShelfCache");

  emit(signal: ShelfCacheSignal): void {
    const { name, ...fields } = signal;
    const line = {
      message: `Cache des rayons pro : ${name}`,
      metric: `${SHELF_CACHE_METRIC_PREFIX}${name}`,
      ...fields,
    };
    if (name === "fallback" || name === "breaker_opened") {
      this.logger.warn(line);
      return;
    }
    this.logger.log(line);
  }
}
