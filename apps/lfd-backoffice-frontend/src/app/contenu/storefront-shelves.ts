import type { ShelfKey } from './storefront-grid';

/**
 * Les rayons de la vitrine — 🔴 DOUBLURE LOCALE (2026-09-24). Les vrais
 * viendront du catalogue ; cette liste fixe ne sert qu'à éprouver l'éditeur
 * « Vitrine », qui n'enregistre rien.
 */
export const STOREFRONT_SHELVES: readonly { readonly key: ShelfKey; readonly label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'viennoiserie', label: 'Viennoiseries' },
  { key: 'bread', label: 'Pains' },
  { key: 'pastry', label: 'Pâtisseries' },
  { key: 'savoury', label: 'Salé & traiteur' },
  { key: 'chocolate', label: 'Chocolat & confiserie' },
];

export function shelfLabel(key: ShelfKey): string {
  return STOREFRONT_SHELVES.find((shelf) => shelf.key === key)?.label ?? key;
}
