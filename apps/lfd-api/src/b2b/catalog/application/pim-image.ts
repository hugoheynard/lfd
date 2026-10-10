import type { SyncMedia } from "@lfd/catalog-sync";

import type { PimImage } from "../domain/entities/catalog-item.js";

/**
 * Un visuel du FIL → le visuel tel que le commerce le range.
 *
 * Le seul endroit qui traduit, pour les trois lecteurs du fil : l'ingestion,
 * la comparaison d'une arrivée, et la projection des visuels. Trois
 * traductions finiraient par diverger sur le détail qui compte ici — un point
 * focal ABSENT (envoi d'avant L4, ou livraison en attente) se lit `null`,
 * « au centre », jamais autrement. Sans quoi le premier push après le
 * déploiement signalerait un changement sur toutes les fiches.
 */
export function pimImageOf(media: SyncMedia | null | undefined): PimImage | null {
  if (media === null || media === undefined) {
    return null;
  }
  return {
    url: media.url,
    alt: media.alt,
    width: media.width,
    height: media.height,
    focal: media.focal ?? null,
  };
}
