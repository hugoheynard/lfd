import type { PublicStorefrontPageView } from '@lfd/contracts';
import { composeShelf, hasComposedObject } from '@lfd/storefront-layout';

import { withServedAnnouncements } from './served-announcements';

/**
 * Les cases composées d'une page de vitrine, ou `null` quand elle ne pose
 * aucun objet affichable — le rayon d'aujourd'hui, ou, pour l'Accueil, rien.
 *
 * Une fonction et pas une méthode de la grille : l'Accueil doit savoir AVANT
 * de la poser si elle aura quelque chose à montrer — posée vide, la grille
 * dirait « aucun article », ce qui n'a pas de sens sur une page qui n'est pas
 * un rayon.
 */
export function composedCells(
  page: PublicStorefrontPageView,
  shelfSkus: readonly string[],
  servedSkus: ReadonlySet<string>,
  operationShown: (operationKey: string) => boolean,
) {
  const cells = composeShelf(withServedAnnouncements(page, operationShown), shelfSkus, servedSkus);
  return hasComposedObject(cells) ? cells : null;
}
