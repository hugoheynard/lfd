import type { FoldViewToggleOption } from 'fold-ng';

/**
 * Comment le catalogue rend ses produits — **au choix du client** (persisté) :
 * - `cards` : grille de cartes riches (découverte visuelle, défaut desktop) ;
 * - `shelves` : rayons horizontaux par catégorie (découverte) ;
 * - `list` : liste order-pad compacte par catégorie (réappro dense).
 *
 * La forme vient des CONTRATS : la préférence est persistée côté API
 * (`nav_prefs`), donc l'union voyage. Elle était écrite trois fois — ici, dans
 * un value-object backend, et dans les contrats. Ce fichier garde ce qui est
 * bien à lui : les SEGMENTS du sélecteur, qui sont de l'écran.
 */
export type { CatalogueView } from '@lfd/contracts';
import type { CatalogueView } from '@lfd/contracts';

/** Segments du sélecteur de vue **desktop** (fold-view-toggle) : les trois vues. */
export const CATALOGUE_VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'cards', icon: 'grid', label: 'Grille' },
  { value: 'shelves', icon: 'package', label: 'Rayons' },
  { value: 'list', icon: 'list', label: 'Liste' },
];

/**
 * Segments **mobile** : la grille paginée (`cards`) disparaît — sur petit écran
 * les rayons *sont* la grille, donc `shelves` reprend le libellé « Grille ». Il
 * ne reste que deux vues : découverte (rayons) et réappro (liste).
 */
export const CATALOGUE_VIEW_OPTIONS_MOBILE: readonly FoldViewToggleOption[] = [
  { value: 'shelves', icon: 'grid', label: 'Grille' },
  { value: 'list', icon: 'list', label: 'Liste' },
];

/** Ramène une valeur brute du toggle vers l'union `CatalogueView` (défaut `cards`). */
export function toCatalogueView(value: string): CatalogueView {
  return value === 'shelves' || value === 'list' ? value : 'cards';
}

/**
 * Vue **effective** compte tenu de la largeur : sur mobile la grille paginée
 * (`cards`) n'existe pas, on retombe sur les rayons (`shelves`) — qui y portent
 * le libellé « Grille ». Garde le toggle et la vue rendue toujours cohérents.
 */
export function resolveCatalogueView(view: CatalogueView, narrow: boolean): CatalogueView {
  return narrow && view === 'cards' ? 'shelves' : view;
}
