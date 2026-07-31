import type { SuiteAppEntry } from './suite-app';

/**
 * Le **registre** de la suite : quelles apps composent l'outillage interne, dans
 * l'ordre du switcher. Ajouter une app = une ligne ici + une entrée dans le
 * `federation.manifest.json`. Rien d'autre côté shell (contrat inversé : c'est
 * l'app qui expose `routes` + `menu`).
 *
 * `pim` est le 1er remote réel. `b2b-admin` est une **tuile stub** (l'app admin
 * n'existe pas encore) — présente au switcher pour matérialiser la cible, mais
 * son montage affiche « bientôt disponible » tant que `remoteName` est absent.
 */
export const SUITE_APPS: readonly SuiteAppEntry[] = [
  {
    id: 'pim',
    title: 'PIM',
    icon: 'grid',
    routePath: 'pim',
    remoteName: 'pim',
    exposedModule: './app',
  },
  {
    id: 'b2b-admin',
    title: 'B2B admin',
    icon: 'company',
    routePath: 'b2b-admin',
    // remoteName absent ⇒ stub (app pas encore construite).
  },
];
