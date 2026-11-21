import type { FoldViewToggleOption } from 'fold-ng';

/** Les réglages d'affichage de la fiche d'atelier. */

/**
 * 🔴 **Le seuil du fournil — 1024 px, pas les 640 px du back-office.**
 *
 * La bascule est structurelle, pas cosmétique : au-dessus, les onglets de
 * catégorie et la colonne d'initiales tiennent ; en dessous, les onglets
 * deviennent un menu qu'on ouvre par erreur les mains sales. C'est la largeur
 * où la barre d'onglets cesse de tenir sur une ligne qui décide.
 *
 * ⚠️ La même valeur est écrite dans `fiche-atelier-page.scss` (une media query ne lit
 * pas un `const`). Les deux bougent ensemble ou l'écran se coupe en deux.
 */
export const WORKSHOP_NARROW = '(max-width: 1023px)';

/** Les deux lectures de la fiche (plan fournée v3, §4.1). */
export type WorkshopView = 'product' | 'slot';

export const VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'product', label: 'Par produit' },
  { value: 'slot', label: 'Par tranche' },
];

/** Combien de temps « Annuler la dernière » reste offert (plan fournée v3, §4.5). */
export const UNDO_MS = 8000;
