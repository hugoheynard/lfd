import { sideForShape, type StorefrontShape } from '@lfd/storefront-layout';

import type { EditorBlock } from './storefront-block';
import { type AcrossResult, placeAcross, type RowsOf } from './storefront-placement';

/**
 * Change la forme d'un objet posé, sans perdre ses réglages (Hugo, 2026-09-24).
 *
 * - le coin haut-gauche reste où il est ;
 * - tout ce qui a un sens sur la nouvelle forme est gardé : ton, cadrage,
 *   rayons, option mobile, contenus et défilement ;
 * - le côté d'image est gardé s'il est permis par la nouvelle forme, sinon il
 *   repasse au défaut de celle-ci (`sideForShape`) ;
 * - passer à la Carte n'efface pas l'option mobile : elle devient sans objet,
 *   et revient telle quelle si l'objet regrandit ;
 * - la nouvelle taille se vérifie sur CHACUN des rayons de l'objet, avec les
 *   rangées de chacun ; un refus nomme le rayon et l'objet qui gênent, et
 *   l'objet garde sa forme.
 *
 * Le paquet `@lfd/storefront-layout` n'a pas ce geste : il vit donc ici.
 */
export function reshape(
  blocks: readonly EditorBlock[],
  rowsOf: RowsOf,
  id: string,
  format: StorefrontShape,
): AcrossResult<EditorBlock> {
  const block = blocks.find((candidate) => candidate.id === id);
  if (block === undefined || block.format === format) {
    return { ok: true, blocks };
  }
  const reshaped: EditorBlock =
    block.mediaSide === undefined
      ? { ...block, format }
      : { ...block, format, mediaSide: sideForShape(format, block.mediaSide) };
  return placeAcross(blocks, rowsOf, reshaped);
}
