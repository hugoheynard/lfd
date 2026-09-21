import type { Routes } from '@angular/router';

import type { DevTool } from './dev-tool.model';

/**
 * Outillage de développement — variante **DEV**, injectée par `fileReplacements`
 * dans les configurations `development` et `e2e`. Jamais dans un build
 * `production` ou `cloudflare` : cf. `dev-tools.ts`, qui est le défaut.
 */

/**
 * L'écran de rechargement du jeu de données.
 *
 * **Aucun `permissionGuard`**, et c'est délibéré : le mur qui compte est côté
 * serveur, où la route est murée par `b2b_settings` ET refuse toute base qui
 * n'est pas locale. Un garde d'écran en plus donnerait l'illusion que c'est lui
 * qui protège, et masquerait le vrai — celui qui rend le geste inexprimable en
 * production.
 */
export const DEV_TOOLS_ROUTES: Routes = [
  {
    path: 'dev',
    title: 'Jeu de données — LFC B2B admin',
    loadComponent: () => import('./seed-page/seed-page').then((m) => m.DevSeedPage),
  },
];

/**
 * L'entrée de rail. Rangée en dernier du corps, sous les modules de travail :
 * ce n'est pas un module, c'est un atelier.
 */
export const DEV_TOOLS: readonly DevTool[] = [
  { label: 'Jeu de données', icon: 'wrench', route: '/dev' },
];
