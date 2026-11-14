/**
 * **Les mesures des routes publiques**, lancées depuis la Santé
 * (`documentation/ops/mesures-privees.md`, § 4).
 *
 * L'API appelle elle-même, à travers la passerelle et avec le secret de
 * diagnostic, une liste fixe de routes publiques, deux fois de suite : le
 * premier passage dit le cache tel qu'il est, le second le cache chaud.
 * Le secret n'apparaît jamais ici.
 */

/**
 * `measured` : les routes ont été appelées. `secret-missing` et
 * `base-url-missing` : rien n'est parti, faute de `DIAGNOSTIC_SECRET` ou de
 * `DIAGNOSTIC_BASE_URL` sur l'API — l'écran le nomme tel quel.
 */
export type RouteTimingsState = "measured" | "secret-missing" | "base-url-missing";

/** Une marque `Server-Timing` analysée : `app;dur=12.3;desc="…"`. */
export interface ServerTimingMark {
  readonly name: string;
  /** En millisecondes ; `null` si la marque n'en porte pas. */
  readonly durationMs: number | null;
  readonly description: string | null;
}

/** Pourquoi un passage n'a pas de réponse. */
export type RouteTimingFailure = "timeout" | "unreachable";

/** Un appel d'une route. */
export interface RouteTimingPass {
  /** `1` : le cache tel qu'il est ; `2` : juste après, le cache chaud. */
  readonly pass: 1 | 2;
  /** Statut HTTP ; `null` si aucune réponse n'est revenue. */
  readonly status: number | null;
  /** Durée totale vue de l'API, en millisecondes, arrondie au dixième. */
  readonly totalMs: number;
  /** Les marques de la réponse, dans l'ordre de l'en-tête ; vide si absent. */
  readonly marks: readonly ServerTimingMark[];
  /** `X-Shelf-Cache` tel que servi (`hit`, `miss`…), ou `null`. */
  readonly shelfCache: string | null;
  readonly failure: RouteTimingFailure | null;
}

/** Une route mesurée et ses deux passages. */
export interface RouteTiming {
  /** Identifiant stable (`shelf-public`, `featured-pro`, `shop-copy`, `health`). */
  readonly key: string;
  /** Le chemin appelé, requête comprise (`/shop/catalogue`). */
  readonly path: string;
  readonly passes: readonly RouteTimingPass[];
}

export interface RouteTimingsReport {
  readonly generatedAt: string;
  readonly state: RouteTimingsState;
  /** Vide tant que l'état n'est pas `measured`. */
  readonly routes: readonly RouteTiming[];
}
