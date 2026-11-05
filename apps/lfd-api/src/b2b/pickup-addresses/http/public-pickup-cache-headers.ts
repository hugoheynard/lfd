import type { Response } from "express";

import { PUBLIC_SETTINGS_CACHE_TAG } from "../../shared/public-settings-cache/domain/ports/public-settings-edge-cache.js";

/**
 * Combien de temps un cache (navigateur ou Workers Cache) sert la liste
 * publique des points sans redemander.
 *
 * **Sans `stale-while-revalidate`** (Hugo, 2026-11-05,
 * `documentation/caching-usage/plan-lectures-par-audience.md`) : la remise
 * affichée sur un point vient des promotions, jugées à l'heure, et une
 * promotion à horaires se ferme sans aucune écriture — donc sans purge. Au
 * plus 30 s après sa fin, la vitrine ne l'annonce plus.
 */
export const PUBLIC_PICKUPS_MAX_AGE_S = 30;

export const PUBLIC_PICKUPS_CACHE_CONTROL = `public, max-age=${PUBLIC_PICKUPS_MAX_AGE_S}`;

/**
 * La même étiquette que les réglages publics (`reglages-publics`) : la purge
 * existe déjà, partagée par le commerce (`PublicSettingsEdgeCache`), et la
 * liste fermée du Worker n'a pas à grandir pour une route de plus.
 */
export const PUBLIC_PICKUPS_CACHE_TAG = PUBLIC_SETTINGS_CACHE_TAG;

/**
 * Ouvre la liste publique des points à Workers Cache, étiquetée pour la purge.
 * Réservé à `GET /pickup-addresses` (liste `ADMITTED` de `lint:cache-control`),
 * qui ne lit pas l'appelant (`CALLER_BLIND`) ; jamais sur `:id/creneaux`, qui
 * dépend de l'heure.
 */
export function cachePublicPickups(response: Response): void {
  response.setHeader("Cache-Control", PUBLIC_PICKUPS_CACHE_CONTROL);
  response.setHeader("Cache-Tag", PUBLIC_PICKUPS_CACHE_TAG);
}
