/** Pourquoi un appel au magasin des rayons n'a pas servi : le rayon vient alors de la base. */
export type ShelfFallbackReason = "timeout" | "error" | "unreadable" | "breaker_open";

/** L'appel au magasin qui a retombé. */
export type ShelfCacheOperation = "read" | "store" | "erase";

/**
 * **Ce que le cache des rayons pro donne à voir** (`plan-cache-du-catalogue.md`,
 * § 4 quater) : chaque nom est STABLE, c'est lui que la carte de santé (C5)
 * comptera. En renommer un, c'est éteindre une courbe sans que rien ne rougisse.
 *
 * Aucune donnée nominative : ni société, ni article — une étiquette bornée.
 */
export type ShelfCacheSignal =
  | { readonly name: "hit" }
  | { readonly name: "miss" }
  | { readonly name: "stored" }
  | { readonly name: "stale_refused" }
  | { readonly name: "not_kept" }
  | {
      readonly name: "fallback";
      readonly operation: ShelfCacheOperation;
      readonly reason: ShelfFallbackReason;
    }
  | { readonly name: "breaker_opened"; readonly failures: number }
  | { readonly name: "breaker_closed" }
  | { readonly name: "erased"; readonly scope: "all" | "companies"; readonly companies: number };

/**
 * Port de **sortie des compteurs** du cache des rayons pro. Ne lève jamais :
 * une sonde qui ferait échouer ce qu'elle mesure serait pire que pas de sonde.
 */
export abstract class ShelfCacheSignals {
  abstract emit(signal: ShelfCacheSignal): void;
}
