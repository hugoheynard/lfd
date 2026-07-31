import type { SuiteAppEntry } from './suite-app';

/**
 * Le **registre** de la suite : quelles apps composent l'outillage interne, dans
 * l'ordre du switcher. Ajouter une app = une ligne ici + son URL dans
 * `suite-config(.dev).ts`. L'app tourne telle quelle en iframe.
 *
 * `pim` est la 1ʳᵉ app réelle. `b2b-admin` est une **tuile stub** (pas d'URL en
 * config) — présente au switcher pour matérialiser la cible ; son montage affiche
 * « bientôt disponible » tant qu'elle n'a pas d'URL.
 */
export const SUITE_APPS: readonly SuiteAppEntry[] = [
  { id: 'pim', title: 'PIM', icon: 'grid', routePath: 'pim' },
  { id: 'b2b-admin', title: 'B2B admin', icon: 'company', routePath: 'b2b-admin' },
];
