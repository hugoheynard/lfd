// Les compteurs horaires des objets partagés (`documentation/caching-usage/
// le-cache-du-back-office.md`, § 6) : par cache et par heure, les lectures servies,
// les ratés, les rangements, les refus de rangement trop gros, et la taille
// rangée. Les objets sont le seul endroit commun à toutes les instances de
// l'API : compter ici, c'est compter pour toute la flotte.
//
// Zéro import, des fonctions pures ; le SQL est dans `hourly-cache-metrics.ts`.

/** Le chemin de lecture des compteurs, appelé par l'API seulement. */
export const CACHE_METRICS_PATH = "/metrics";

/** Au-delà, une heure est oubliée à l'écriture suivante. */
export const METRICS_KEEP_DAYS = 30;

export const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const SECOND_MS = 1000;

/** Le cache des numéros de l'objet des journées. */
export const DAY_VERSIONS_METRICS_CACHE = "day-versions";

/** Les rayons pro (société ou espace perso) de l'objet `ProShelves`. */
export const PRO_SHELVES_METRICS_CACHE = "pro-shelves";

/** Ce qu'un compteur compte. */
export type CacheMetricEvent = "hit" | "miss" | "store" | "too_large";

/** Une valeur de cellule SQLite, sous Workers comme sous Node. */
export type MetricsSqlValue = ArrayBuffer | string | number | null;

/** Le stockage SQLite, réduit à ce que les compteurs appellent. */
export interface MetricsSql {
  exec<T extends Record<string, MetricsSqlValue>>(
    query: string,
    ...bindings: MetricsSqlValue[]
  ): { toArray(): T[] };
}

/**
 * L'en-tête de l'empreinte de la personne servie, posé par l'API
 * (`src/platform/cache-calls/served-person.ts`, même nom). Une empreinte
 * irréversible : l'objet compte des personnes distinctes sans savoir qui.
 */
export const SERVED_PERSON_HEADER = "x-cache-person";

const PERSON = /^[0-9a-f]{64}$/u;

/** L'empreinte d'un appel ; `null` sans personne (cron, visiteur) ou mal formée. */
export function servedPersonOf(headers: Headers): string | null {
  const person = headers.get(SERVED_PERSON_HEADER);
  return person !== null && PERSON.test(person) ? person : null;
}

/** Une heure d'un cache, telle que l'objet la rend. */
export interface CacheMetricsRow {
  readonly cache: string;
  /** Le début de l'heure, en millisecondes. */
  readonly hourMs: number;
  readonly hits: number;
  readonly misses: number;
  readonly stores: number;
  readonly tooLarge: number;
  /** La taille rangée relevée pendant l'heure ; `null` si rien ne l'a relevée. */
  readonly bytes: number | null;
  readonly entries: number | null;
  /** Les personnes distinctes servies pendant l'heure (lectures portant une empreinte). */
  readonly persons: number;
}

/** Le pic d'une heure : le plus de requêtes reçues par l'objet en une seconde. */
export interface ObjectPeakRow {
  readonly hourMs: number;
  readonly perSecond: number;
}

/** Ce que `GET /metrics` rend. */
export interface CacheMetricsReply {
  readonly rows: readonly CacheMetricsRow[];
  readonly peaks: readonly ObjectPeakRow[];
}

/** Une seconde close, et le nombre de requêtes qu'elle a reçues. */
export interface ClosedSecond {
  readonly secondMs: number;
  readonly requests: number;
}

/**
 * **Le compteur par seconde, en mémoire de l'objet.** Une requête d'une
 * seconde nouvelle clôt la précédente et la rend, pour que son compte soit
 * porté au pic de son heure. La mémoire se perd à l'endormissement : la
 * seconde en cours aussi, et elle n'était pas un pic.
 */
export class PerSecondCounter {
  private secondMs = -1;
  private requests = 0;

  /** Compte une requête ; rend la seconde close s'il y en a une. */
  tick(nowMs: number): ClosedSecond | null {
    const second = Math.floor(nowMs / SECOND_MS) * SECOND_MS;
    if (second === this.secondMs) {
      this.requests += 1;
      return null;
    }
    const closed = this.current();
    this.secondMs = second;
    this.requests = 1;
    return closed;
  }

  /** La seconde en cours, comptée jusqu'ici ; `null` avant toute requête. */
  current(): ClosedSecond | null {
    return this.secondMs === -1 ? null : { secondMs: this.secondMs, requests: this.requests };
  }
}

/** La taille rangée d'un cache. */
export interface CacheSize {
  readonly bytes: number;
  readonly entries: number;
}

/** Le début de l'heure d'un instant. */
export function hourOf(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

/** La première heure gardée : celles d'avant ont plus de {@link METRICS_KEEP_DAYS} jours. */
export function oldestKeptHour(nowMs: number): number {
  return hourOf(nowMs - METRICS_KEEP_DAYS * DAY_MS);
}

/** Lit `GET /metrics?since=<ms>` ; `null` = ce n'est pas une lecture des compteurs. */
export function parseMetricsCall(method: string, url: URL): { readonly sinceMs: number } | null {
  if (method !== "GET" || url.pathname !== CACHE_METRICS_PATH) {
    return null;
  }
  const raw = url.searchParams.get("since") ?? "0";
  const sinceMs = /^\d+$/u.test(raw) ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(sinceMs) ? { sinceMs } : null;
}

/**
 * Le cache d'une clé de contenu : son préfixe avant `:` (`pim-product:<id>`
 * → `pim-product`), ou la clé entière (`catalog-admin`). C'est l'appelant qui
 * nomme son cache, en préfixant ses clés.
 */
export function contentCacheOf(key: string): string {
  const separator = key.indexOf(":");
  return separator === -1 ? key : key.slice(0, separator);
}

/** Le cache d'une clé de contenu RANGÉE (`r:<révision>/<clé>`), quelle que soit la révision. */
export function storedContentCacheOf(storedKey: string): string {
  const separator = storedKey.startsWith("r:") ? storedKey.indexOf("/") : -1;
  return contentCacheOf(separator === -1 ? storedKey : storedKey.slice(separator + 1));
}

/** La taille rangée par cache, les contenus regroupés par préfixe. */
export function sizesByContentCache(
  rows: readonly { readonly key: string; readonly bytes: number }[],
): ReadonlyMap<string, CacheSize> {
  const sizes = new Map<string, CacheSize>();
  for (const row of rows) {
    const cache = storedContentCacheOf(row.key);
    const kept = sizes.get(cache) ?? { bytes: 0, entries: 0 };
    sizes.set(cache, { bytes: kept.bytes + row.bytes, entries: kept.entries + 1 });
  }
  return sizes;
}

const CONTENT_PATH = /^\/contents\/([^/]+)$/u;

/** Le cache d'un appel `/contents/<clé>` ; la clé entière si elle n'a pas de préfixe. */
export function contentCacheOfPath(pathname: string): string {
  const segment = CONTENT_PATH.exec(pathname)?.[1] ?? "";
  try {
    return contentCacheOf(decodeURIComponent(segment));
  } catch {
    return contentCacheOf(segment);
  }
}
