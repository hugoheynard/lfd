/**
 * Les routes que la Santé mesure : publiques et en `GET`, donc sans jeton à
 * fabriquer (`documentation/ops/mesures-privees.md`, § 4.1). La liste
 * est fixe et nommée : une mesure qu'on compare d'un jour à l'autre doit
 * appeler les mêmes chemins.
 */
export interface MeasuredRoute {
  readonly key: string;
  readonly path: string;
}

export const MEASURED_ROUTES: readonly MeasuredRoute[] = [
  { key: "shelf-public", path: "/shop/catalogue" },
  { key: "featured-pro", path: "/shop/featured?audience=pro" },
  { key: "shop-copy", path: "/shop/copy?locale=fr" },
  { key: "health", path: "/health" },
];

/** Deux passages à la suite : le premier dit le cache tel qu'il est, le second le cache chaud. */
export const PASSES = [1, 2] as const;
