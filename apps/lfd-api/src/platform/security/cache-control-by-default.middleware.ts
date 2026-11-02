import type { NextFunction, Request } from "express";

/** La seule méthode de la réponse que le middleware appelle. */
export interface HeaderSink {
  setHeader(name: string, value: string): unknown;
}

/** Une réponse à une personne identifiée : ni cache partagé, ni disque du navigateur. */
export const PERSONAL_CACHE_CONTROL = "private, no-store";

/**
 * Une réponse à un visiteur : aucun cache partagé, mais le navigateur la garde
 * et la revalide par l'ETag d'Express — un 304 au lieu du corps entier.
 */
export const ANONYMOUS_CACHE_CONTROL = "private, no-cache";

/**
 * Pose le `Cache-Control` par défaut de TOUTE réponse de l'API, avant le
 * handler — plan `documentation/caching-usage/plan-aucun-cache-sur-le-personnel.md`.
 *
 * La règle se décide sur la **requête**, pas sur la route : une route
 * `@Public()` à jeton facultatif répond selon l'appelant sans que son nom le
 * dise, et une liste de routes se périme. Avec un `Authorization`, la réponse
 * est celle d'une personne ; sans, elle est la même pour tous les visiteurs.
 *
 * Une route qui pose son propre en-tête (`@Header()` après le handler,
 * `res.setHeader()` dedans) remplace celui-ci ; `lint:cache-control` borne ce
 * qu'elle a le droit d'écrire. Branché dans `AppModule.configure()`, et non
 * dans `main.ts`, pour que les e2e, qui bootent l'`AppModule`, l'éprouvent.
 */
export function cacheControlByDefault(
  req: Pick<Request, "headers">,
  res: HeaderSink,
  next: NextFunction,
): void {
  const personal = req.headers.authorization !== undefined;
  res.setHeader("Cache-Control", personal ? PERSONAL_CACHE_CONTROL : ANONYMOUS_CACHE_CONTROL);
  next();
}
