import type { CacheCallReport, CacheReport } from "./cache.js";

/**
 * **Les chiffres d'un cache partagé sur une période** — comptés DANS l'objet
 * qui le garde, donc pour toute la flotte (`documentation/caching-usage/le-cache-du-back-office.md`, § 6).
 */
export interface SharedCacheFigures {
  /** Lectures servies depuis l'objet. */
  readonly hits: number;
  /** Lectures qui ont demandé une relecture de la base. */
  readonly misses: number;
  /** `hits / (hits + misses)`, entre 0 et 1 ; `null` sans aucune lecture. */
  readonly hitRate: number | null;
  readonly stores: number;
  /** Rangements refusés par l'objet parce que trop gros. */
  readonly tooLarge: number;
  /** La dernière taille rangée relevée, en octets ; `null` si jamais relevée. */
  readonly bytes: number | null;
  readonly entries: number | null;
  /**
   * Personnes distinctes servies — sur une heure ; sur plusieurs heures, le
   * plus fort compte d'une heure (des distincts horaires ne s'additionnent pas).
   */
  readonly persons: number;
}

/** Une heure d'un cache partagé. */
export interface SharedCachePoint extends SharedCacheFigures {
  /** Le début de l'heure, ISO. */
  readonly hour: string;
}

/** Un cache partagé : la tête et sa série horaire. */
export interface SharedCacheSeries {
  /** `day-versions`, `catalog-admin`, `pim-product`, `pro-shelves`… */
  readonly cache: string;
  /** L'objet qui le garde (`day-versions`, `pro-shelves`). */
  readonly object: string;
  /** L'heure en cours. */
  readonly lastHour: SharedCacheFigures;
  /** Les 24 heures qui finissent par l'heure en cours. */
  readonly last24h: SharedCacheFigures;
  /** Une entrée par heure qui a compté quelque chose ; la taille reportée d'heure en heure. */
  readonly points: readonly SharedCachePoint[];
}

/** Comment un objet a répondu à la lecture de ses compteurs. */
export type SharedObjectState = "read" | "unreachable" | "not-configured";

/** Le pic d'une heure : le plus de requêtes reçues par l'objet en une seconde. */
export interface ObjectPeakPoint {
  readonly hour: string;
  readonly perSecond: number;
}

/** Un objet partagé : son état et ses pics de requêtes. */
export interface SharedObjectReport {
  readonly object: string;
  readonly state: SharedObjectState;
  readonly lastHourPeakPerSecond: number | null;
  readonly last24hPeakPerSecond: number | null;
  readonly peaks: readonly ObjectPeakPoint[];
}

/** Les replis vers la base d'un magasin, vus par CETTE instance. */
export interface CacheFallbackCount {
  readonly store: string;
  /**
   * Lectures et rangements qui n'ont pas servi : abandonnés au délai, en
   * erreur, illisibles, ou coupés par le disjoncteur ouvert — la donnée est
   * venue de la base.
   */
  readonly count: number;
  /** Le même compte par raison ; une raison absente n'a rien compté. */
  readonly reasons: Readonly<Partial<Record<CacheFallbackReason, number>>>;
  /** Ouvertures du disjoncteur sur la fenêtre. */
  readonly breakerOpenings: number;
}

/** Pourquoi un appel au cache n'a pas servi, au mot du garde de l'API. */
export type CacheFallbackReason = "timeout" | "error" | "unreadable" | "breaker_open";

/** Ce que l'instance qui répond a mesuré elle-même, sur sa fenêtre. */
export interface InstanceCacheReport {
  readonly windowMinutes: number;
  readonly calls: readonly CacheCallReport[];
  readonly fallbacks: readonly CacheFallbackCount[];
  readonly outcomes: readonly CacheReport[];
}

/** `GET /admin/ops/caches?days=…` — l'onglet Cache de la santé. */
export interface CacheMetricsReport {
  readonly generatedAt: string;
  readonly days: number;
  /** Le début de l'heure en cours, ISO. */
  readonly lastHourStartedAt: string;
  readonly caches: readonly SharedCacheSeries[];
  readonly objects: readonly SharedObjectReport[];
  readonly instance: InstanceCacheReport;
}
