import type { Routes } from '@angular/router';

import { SUITE_APPS } from './suite/suite-registry';
import { AppUnavailable } from './suite/app-unavailable/app-unavailable';

/**
 * Le routing de 1er niveau : une branche par app du registre, montée sous son
 * `routePath` (`/pim/**`, `/b2b-admin/**`).
 *
 * ⚠️ Étape 1 (ce commit) : le shell BUILDE sans Native Federation, donc chaque
 * app monte le stub. Étape 2 (tâche #21) : les apps avec `remoteName` basculent
 * sur `loadRemoteModule(remoteName, exposedModule).routes`, entourées d'une
 * error boundary qui retombe sur `AppUnavailable[reason=error]`. Les apps sans
 * `remoteName` (stub) restent sur `AppUnavailable[reason=stub]`.
 */
const [firstApp] = SUITE_APPS;
if (!firstApp) {
  throw new Error('SUITE_APPS doit déclarer au moins une app.');
}
const firstPath = firstApp.routePath;

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: firstPath },
  ...SUITE_APPS.map((app) => ({
    path: app.routePath,
    loadComponent: () => Promise.resolve(AppUnavailable),
    data: { reason: app.remoteName ? 'error' : 'stub', appTitle: app.title },
  })),
  { path: '**', redirectTo: firstPath },
];
