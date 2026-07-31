import type { Route, Routes } from '@angular/router';

import { SUITE_APPS } from './suite/suite-registry';
import type { SuiteAppEntry } from './suite/suite-app';
import { AppFrame } from './suite/app-frame/app-frame';
import { AppUnavailable } from './suite/app-unavailable/app-unavailable';

/**
 * Routing de 1er niveau : une branche par app du registre, montée sous son
 * `routePath` (`/pim/**`, `/b2b-admin/**`).
 *
 * - App avec `appUrl` → `AppFrame` (iframe plein content) : l'app tourne telle
 *   quelle, panels et chrome compris. Le `**` interne reste dans le cadre.
 * - App sans `appUrl` → tuile **stub** `AppUnavailable[stub]`.
 */
function branchFor(app: SuiteAppEntry): Route {
  if (app.appUrl === undefined) {
    return {
      path: app.routePath,
      loadComponent: () => Promise.resolve(AppUnavailable),
      data: { reason: 'stub', appTitle: app.title },
    };
  }
  const data = { url: app.appUrl, appTitle: app.title };
  return {
    // Toutes les sous-routes de l'app restent dans le cadre : on matche `**`.
    path: app.routePath,
    children: [{ path: '**', loadComponent: () => Promise.resolve(AppFrame), data }],
  };
}

const [firstApp] = SUITE_APPS;
if (!firstApp) {
  throw new Error('SUITE_APPS doit déclarer au moins une app.');
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: firstApp.routePath },
  ...SUITE_APPS.map(branchFor),
  { path: '**', redirectTo: firstApp.routePath },
];
