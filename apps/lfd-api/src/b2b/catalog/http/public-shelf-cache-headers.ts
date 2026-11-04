import type { PublicShelfReply } from "../application/public-shelf-cacheability.js";

/**
 * La durée de vie d'un rayon public gardé : **30 secondes, fixes** (Hugo,
 * 2026-11-04, `plan-cache-du-catalogue.md` § 6). Ce qui change sans écriture
 * — une promotion qui s'ouvre à midi — n'est rattrapé que par elle.
 */
export const PUBLIC_SHELF_MAX_AGE_S = 30;

/**
 * `public` : la réponse se garde même pour une requête qui porte un jeton —
 * Workers Cache ne sert une requête avec `Authorization` que si la réponse le
 * dit. C'est juste parce que ces deux routes ne lisent jamais l'appelant.
 */
export const PUBLIC_SHELF_CACHE_CONTROL = `public, max-age=${PUBLIC_SHELF_MAX_AGE_S}`;

/**
 * L'étiquette que le Worker purge (`ctx.cache.purge({ tags })`) — la même que
 * `PUBLIC_SHELF_TAG` de `container/public-shelf.ts`.
 */
export const PUBLIC_SHELF_CACHE_TAG = "rayon-public";

/** La seule méthode de la réponse que la décision appelle. */
export interface PublicShelfHeaderSink {
  setHeader(name: string, value: string): unknown;
}

/**
 * **Offre la réponse à Workers Cache — ou ne touche à rien.** Une réponse non
 * cacheable garde l'en-tête du middleware (`cache-control-by-default`) :
 * `private`, jamais gardée.
 *
 * 🔴 Admis par `lint:cache-control` (2026-11-04), et lu par DEUX contrôleurs
 * seulement : `shop-catalogue.controller.ts` et `shop-featured.controller.ts`.
 * Toute autre route qui l'importerait est refusée par la porte : `public` sur
 * une route qui lit l'appelant servirait un rayon personnel à tous.
 */
export function offerPublicShelf(
  response: PublicShelfHeaderSink,
  reply: PublicShelfReply<unknown>,
): void {
  if (!reply.cacheable) {
    return;
  }
  response.setHeader("Cache-Control", PUBLIC_SHELF_CACHE_CONTROL);
  response.setHeader("Cache-Tag", PUBLIC_SHELF_CACHE_TAG);
}
