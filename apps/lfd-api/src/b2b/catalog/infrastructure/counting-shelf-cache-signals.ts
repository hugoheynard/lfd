import { Injectable } from "@nestjs/common";

import { CacheOutcomeRecorder } from "../../../platform/metrics/cache-outcome-recorder.js";
import { ShelfCacheSignals, type ShelfCacheSignal } from "../domain/ports/shelf-cache-signals.js";
import { LoggingShelfCacheSignals } from "./logging-shelf-cache-signals.js";

/** Les trois caches que la carte de santé compte pour les rayons (C5). */
export const SHELF_CACHE_NAMES = {
  /** Une lecture du rayon pro : servi, raté, ou magasin indisponible. */
  read: "shelf.read",
  /** Un rangement : gardé, refusé car périmé, pas gardé, ou retombé. */
  store: "shelf.store",
  /** Une réponse du rayon public : offerte à Workers Cache, ou pourquoi pas. */
  public: "shelf.public",
} as const;

/** Une issue comptée : sous quel cache, sous quel mot. */
interface CountedOutcome {
  readonly cache: string;
  readonly outcome: string;
}

/**
 * **Les signaux du rayon, journalisés ET comptés** (`le-rayon-en-cache.md`,
 * C5). Le journal reste ce qu'il était ({@link LoggingShelfCacheSignals}) ; ce
 * second abonné verse les signaux qui disent comment une lecture, un rangement
 * ou une réponse publique a été servi dans le compteur de `platform`, que la
 * carte de santé lit sans connaître le catalogue.
 *
 * Les autres signaux (purges, interrupteur, disjoncteur) sont des événements,
 * pas des issues : ils n'ont pas de taux, et restent au seul journal.
 */
@Injectable()
export class CountingShelfCacheSignals extends ShelfCacheSignals {
  constructor(
    private readonly journal: LoggingShelfCacheSignals,
    private readonly outcomes: CacheOutcomeRecorder,
  ) {
    super();
  }

  emit(signal: ShelfCacheSignal): void {
    this.journal.emit(signal);
    const counted = countedOutcomeOf(signal);
    if (counted !== null) {
      this.outcomes.record(counted.cache, counted.outcome);
    }
  }
}

/** Le signal en issue de cache, ou `null` s'il n'en est pas une. */
export function countedOutcomeOf(signal: ShelfCacheSignal): CountedOutcome | null {
  if (signal.name === "hit" || signal.name === "miss") {
    return { cache: SHELF_CACHE_NAMES.read, outcome: signal.name };
  }
  if (signal.name === "stored" || signal.name === "stale_refused" || signal.name === "not_kept") {
    return { cache: SHELF_CACHE_NAMES.store, outcome: signal.name };
  }
  if (signal.name === "fallback" && (signal.operation === "read" || signal.operation === "store")) {
    return { cache: SHELF_CACHE_NAMES[signal.operation], outcome: `fallback_${signal.reason}` };
  }
  if (signal.name === "public_cacheable") {
    return { cache: SHELF_CACHE_NAMES.public, outcome: "cacheable" };
  }
  if (signal.name === "public_not_cacheable") {
    return { cache: SHELF_CACHE_NAMES.public, outcome: `not_cacheable_${signal.reason}` };
  }
  return null;
}
