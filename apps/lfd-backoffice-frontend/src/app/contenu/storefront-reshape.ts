import {
  place,
  type PlacedBlock,
  type PlacementResult,
  type StorefrontShape,
} from './storefront-grid';
import { sideForShape } from './storefront-media';

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
 * - la nouvelle taille se vérifie sur CHACUN des rayons de l'objet, comme un
 *   déplacement ; un refus nomme le rayon et l'objet qui gênent, et l'objet
 *   garde sa forme.
 *
 * Vit à part de `storefront-grid.ts` parce qu'il a besoin de l'image, qui
 * dépend elle-même de la grille : l'y mettre ferait une boucle d'imports.
 */
export function reshape(
  blocks: readonly PlacedBlock[],
  rows: number,
  id: string,
  format: StorefrontShape,
): PlacementResult {
  const block = blocks.find((candidate) => candidate.id === id);
  if (block === undefined || block.format === format) {
    return { ok: true, blocks };
  }
  const reshaped: PlacedBlock =
    block.mediaSide === undefined
      ? { ...block, format }
      : { ...block, format, mediaSide: sideForShape(format, block.mediaSide) };
  return place(blocks, rows, reshaped);
}
