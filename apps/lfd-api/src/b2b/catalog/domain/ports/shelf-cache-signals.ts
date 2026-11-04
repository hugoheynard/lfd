import type { PublicShelfRefusal } from "../public-shelf-rules.js";

/** Pourquoi un appel au magasin des rayons n'a pas servi : le rayon vient alors de la base. */
export type ShelfFallbackReason = "timeout" | "error" | "unreadable" | "breaker_open";

/** L'appel au magasin qui a retombé ; `public_*` depuis C3. */
export type ShelfCacheOperation = "read" | "store" | "erase" | "public_state" | "public_purge";

/**
 * **Ce que le cache des rayons donne à voir** — pro, et public depuis C3 (`plan-cache-du-catalogue.md`,
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
  | { readonly name: "erased"; readonly scope: "all" | "companies"; readonly companies: number }
  /** L'interrupteur a été actionné (« L'interrupteur ») : l'état et la version qui en résultent. */
  | { readonly name: "switched"; readonly enabled: boolean; readonly version: number }
  /** Vidé à la main par l'interrupteur — distinct de `erased`, qui suit une écriture. */
  | { readonly name: "purged_manually"; readonly version: number }
  /** Rayon public (C3) : la réponse s'offre à Workers Cache. */
  | { readonly name: "public_cacheable" }
  /** Rayon public : la réponse garde l'en-tête du middleware, et pourquoi. */
  | { readonly name: "public_not_cacheable"; readonly reason: PublicShelfRefusal }
  /** Workers Cache purgé de l'étiquette `rayon-public`. */
  | { readonly name: "public_purged" }
  /** La purge publique n'a pas abouti : la durée de 30 s rattrape. */
  | { readonly name: "public_purge_failed" }
  /** Purge publique sautée : le drapeau public est éteint, rien n'a pu se garder. */
  | { readonly name: "public_purge_skipped" }
  /** Le drapeau public a basculé (`public-on`, `public-off`). */
  | { readonly name: "public_switched"; readonly enabled: boolean; readonly version: number };

/**
 * Port de **sortie des compteurs** du cache des rayons pro. Ne lève jamais :
 * une sonde qui ferait échouer ce qu'elle mesure serait pire que pas de sonde.
 */
export abstract class ShelfCacheSignals {
  abstract emit(signal: ShelfCacheSignal): void;
}
