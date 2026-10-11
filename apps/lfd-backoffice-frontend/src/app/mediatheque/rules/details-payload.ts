import {
  isMediaAltWritten,
  type LibraryMediaView,
  type MediaDetailsPayload,
} from '@lfd/pim-contracts';

import type { ImagePanelResult } from './image-description';

/**
 * **Le corps du `PUT /media`**, selon le geste qui écrit. L'écriture est un
 * REMPLACEMENT : chaque corps porte tous les champs, ceux qu'on ne touche
 * pas compris.
 */

/** Le corps du `PUT /media` : TOUS les champs, l'écriture est un remplacement. */
export function panelDetails(
  item: LibraryMediaView,
  result: ImagePanelResult,
): MediaDetailsPayload {
  return {
    url: item.url,
    name: result.name,
    tags: [...result.tags],
    // Une source vide veut dire « pas d'alternative » : le contrat la
    // refuserait, et le serveur retombe sur l'URL quand elle est
    // absente. On l'omet plutôt que d'envoyer un texte sans sa langue.
    ...(isMediaAltWritten(result.alt, item.url) ? { alt: result.alt } : {}),
    focal: result.focal,
    // La série part au MÊME enregistrement : un id rattache, `null` détache.
    seriesId: result.seriesId,
  };
}

/**
 * Le corps d'un geste qui ne touche QUE les mots-clés.
 *
 * 🔴 On renvoie `name`, `focal` et l'alternative INCHANGÉS : l'écriture est un
 * remplacement, pas une retouche. Le serveur lit une alternative ABSENTE comme
 * « effacée » et retombe sur l'URL — c'est ce que fait le panneau quand on
 * vide le champ. Ces gestes l'omettaient : poser ou retirer un mot depuis la
 * bande effaçait la description de l'image (corrigé le 2026-10-10).
 */
export function tagsOnly(item: LibraryMediaView, tags: readonly string[]): MediaDetailsPayload {
  return { url: item.url, name: item.name, tags: [...tags], alt: item.alt, focal: item.focal };
}
