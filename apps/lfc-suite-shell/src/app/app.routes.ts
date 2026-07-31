import type { Route, Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';

import { SUITE_APPS } from './suite/suite-registry';
import type { SuiteAppEntry, SuiteRemoteModule } from './suite/suite-app';
import { AppUnavailable } from './suite/app-unavailable/app-unavailable';

/**
 * Routing de 1er niveau : une branche par app du registre, montée sous son
 * `routePath` (`/pim/**`, `/b2b-admin/**`).
 *
 * - App avec `remoteName` → `loadRemoteModule(...).routes`, **entourée d'une
 *   error boundary** : si le remote est injoignable (deploy KO / réseau), on
 *   retombe sur `AppUnavailable[error]` au lieu de casser toute la suite. C'est
 *   l'isolation des pannes : les autres apps restent accessibles.
 * - App sans `remoteName` → tuile **stub** `AppUnavailable[stub]`.
 */

/** Routes de repli montées quand un remote ne charge pas (ou n'existe pas). */
function fallbackRoutes(appTitle: string, reason: 'stub' | 'error'): Routes {
  const data = { reason, appTitle };
  return [
    { path: '', loadComponent: () => Promise.resolve(AppUnavailable), data },
    { path: '**', loadComponent: () => Promise.resolve(AppUnavailable), data },
  ];
}

function branchFor(app: SuiteAppEntry): Route {
  if (app.remoteName === undefined) {
    // Stub : app pas encore construite.
    return {
      path: app.routePath,
      loadChildren: () => Promise.resolve(fallbackRoutes(app.title, 'stub')),
    };
  }
  const remoteName = app.remoteName;
  const exposedModule = app.exposedModule ?? './app';
  return {
    path: app.routePath,
    loadChildren: () =>
      loadRemoteModule(remoteName, exposedModule)
        .then((m: SuiteRemoteModule) => m.routes)
        .catch((err: unknown) => {
          console.error(`[suite] remote « ${app.id} » indisponible`, err);
          return fallbackRoutes(app.title, 'error');
        }),
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
