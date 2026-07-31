import type { SuiteAppEntry } from './suite-app';

/**
 * Le **registre** de la suite : quelles apps composent l'outillage interne, dans
 * l'ordre du switcher. Ajouter une app = une ligne ici (son `appUrl`). Rien
 * d'autre côté shell — l'app tourne telle quelle en iframe.
 *
 * `pim` est la 1ʳᵉ app réelle. `b2b-admin` est une **tuile stub** (l'app admin
 * n'existe pas encore) — présente au switcher pour matérialiser la cible, mais
 * son montage affiche « bientôt disponible » tant que `appUrl` est absent.
 */
export const SUITE_APPS: readonly SuiteAppEntry[] = [
  {
    id: 'pim',
    title: 'PIM',
    icon: 'grid',
    routePath: 'pim',
    // ⚠️ URL de dev (localhost). En prod → l'URL Pages de l'app déployée.
    appUrl: 'http://localhost:7315',
  },
  {
    id: 'b2b-admin',
    title: 'B2B admin',
    icon: 'company',
    routePath: 'b2b-admin',
    // appUrl absent ⇒ stub (app pas encore construite).
  },
];
