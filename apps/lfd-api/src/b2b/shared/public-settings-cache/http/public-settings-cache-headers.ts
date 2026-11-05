import type { Response } from "express";

import { PUBLIC_SETTINGS_CACHE_TAG } from "../domain/ports/public-settings-edge-cache.js";

/**
 * Combien de temps un cache (navigateur ou Workers Cache) sert un réglage
 * public sans redemander. Plus court que les textes (60 s) : un réglage
 * d'ouverture ou de livraison ne doit pas traîner si une purge se perd.
 */
export const PUBLIC_SETTINGS_MAX_AGE_S = 30;

/**
 * Au-delà, combien de temps une copie périmée se sert tout de suite pendant
 * qu'elle se revalide : au pire 1 min 30 au total sans purge.
 */
export const PUBLIC_SETTINGS_STALE_WHILE_REVALIDATE_S = 60;

/**
 * L'étiquette que Workers Cache attache à la réponse, et que chaque écriture
 * d'un des quatre réglages purge (`PublicSettingsEdgeCache`).
 */
export { PUBLIC_SETTINGS_CACHE_TAG };

export const PUBLIC_SETTINGS_CACHE_CONTROL = `public, max-age=${PUBLIC_SETTINGS_MAX_AGE_S}, stale-while-revalidate=${PUBLIC_SETTINGS_STALE_WHILE_REVALIDATE_S}`;

/**
 * Ouvre la réponse à Workers Cache, étiquetée pour la purge. Réservé aux
 * quatre routes des réglages publics (liste `ADMITTED` de
 * `lint:cache-control`) : aucune ne lit l'appelant (`CALLER_BLIND`).
 */
export function cachePublicSettings(response: Response): void {
  response.setHeader("Cache-Control", PUBLIC_SETTINGS_CACHE_CONTROL);
  response.setHeader("Cache-Tag", PUBLIC_SETTINGS_CACHE_TAG);
}
