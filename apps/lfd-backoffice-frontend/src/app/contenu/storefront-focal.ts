import type { StorefrontFocal } from '@lfd/contracts';

/** Faute de point, le centre — ce que la boutique a toujours fait. */
const CENTERED = '50% 50%';

/**
 * **Où recadrer un aperçu de la vitrine** : l'`object-position` (ou le
 * `background-position`, même syntaxe) que la boutique pose sur la même image.
 *
 * Le même calcul que `objectPositionOf` de la boutique
 * (`lfc-ecommerce-frontend/src/app/client/shop/shelf-display.ts`, relu le
 * 2026-10-11) : des pourcentages au dixième, le centre faute de point. Deux
 * applications ne partagent pas de code de rendu ; si l'une change d'arrondi,
 * l'aperçu montrera un cadrage que la boutique ne sert pas.
 *
 * En `cover`, un pourcentage d'`object-position` aligne le même point de
 * l'image et du cadre que le `background-position` de la porte : l'aperçu en
 * `<img>` et la porte en fond CSS gardent la même partie de la photo.
 */
export function focalPositionOf(focal: StorefrontFocal | null | undefined): string {
  if (focal === null || focal === undefined) {
    return CENTERED;
  }
  return `${percent(focal.x)} ${percent(focal.y)}`;
}

function percent(fraction: number): string {
  return `${String(Math.round(fraction * 1000) / 10)}%`;
}
