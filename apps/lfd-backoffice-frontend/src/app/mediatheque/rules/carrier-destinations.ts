import type { MediaCarrierView } from '@lfd/pim-contracts';

/**
 * Où mène un porteur, et comment il se nomme — une entrée par `kind`.
 *
 * Une table plutôt qu'un ternaire : un porteur de plus est une ligne de plus.
 * Les chemins des fiches et des familles ont été vérifiés dans
 * `pim/pim.routes.ts` le 2026-09-23 : enfants DIRECTS de `pim`, et « familles »
 * se dit `categories` dans l'URL. La vitrine vit en `/vitrine`, hors de
 * l'espace B2B (`documentation/commandes/boutique-rayon-layout.md`, D7).
 * Les opérations datées (2026-09-24) mènent à `/operations/<clé>` : la
 * route naît avec l'écran de préparation, au lot front du plan
 * `documentation/operations-datees/architecture-operations-datees.md`.
 */
const CARRIER_DESTINATIONS: Readonly<
  Record<
    MediaCarrierView['kind'],
    { readonly word: string; readonly path: (id: string) => readonly string[] }
  >
> = {
  product: { word: 'Fiche', path: (id) => ['/pim', 'produits', id] },
  category: { word: 'Famille', path: (id) => ['/pim', 'categories', id] },
  storefront: { word: 'Vitrine', path: () => ['/vitrine'] },
  operation: { word: 'Opération', path: (key) => ['/operations', key] },
};

/** Le mot qui précède le libellé d'un porteur : « Fiche », « Famille », « Vitrine ». */
export function carrierWord(carrier: MediaCarrierView): string {
  return CARRIER_DESTINATIONS[carrier.kind].word;
}

/** Le chemin du routeur qui ouvre un porteur. */
export function carrierPath(carrier: MediaCarrierView): readonly string[] {
  return CARRIER_DESTINATIONS[carrier.kind].path(carrier.id);
}
