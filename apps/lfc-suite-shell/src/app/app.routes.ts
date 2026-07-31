import type { Route, Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';

import { SUITE_APPS } from './suite/suite-registry';
import type { SuiteAppEntry, SuiteRemoteModule } from './suite/suite-app';
import { AppUnavailable } from './suite/app-unavailable/app-unavailable';

/**
 * Routing de 1er niveau : une branche par app du registre, montée sous son
 * `routePath` (`/pim/**`, `/b2b-admin/**`).
 *
 * - App avec `remoteEntry` → `loadRemoteModule({ remoteEntry, exposedModule })`,
 *   chargé **à la demande depuis l'URL** (init robuste : pas de dépendance au
 *   pré-enregistrement du manifest au boot), **entouré d'une error boundary** :
 *   remote injoignable (deploy KO / réseau) → `AppUnavailable[error]` au lieu de
 *   casser toute la suite. C'est l'isolation des pannes.
 * - App sans `remoteEntry` → tuile **stub** `AppUnavailable[stub]`.
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
  if (app.remoteEntry === undefined) {
    // Stub : app pas encore construite.
    return {
      path: app.routePath,
      loadChildren: () => Promise.resolve(fallbackRoutes(app.title, 'stub')),
    };
  }
  const remoteEntry = app.remoteEntry;
  const exposedModule = app.exposedModule ?? './app';
  return {
    path: app.routePath,
    loadChildren: () =>
      loadRemoteModule({ remoteEntry, exposedModule })
        .then((m: SuiteRemoteModule) => m.routes)
        .catch((err: unknown) => {
          const detail =
            err instanceof Error
              ? `${err.message}\n${err.stack ?? ''}`
              : JSON.stringify(err, Object.getOwnPropertyNames(err ?? {}));
          console.error(`[suite] remote « ${app.id} » indisponible — ${detail}`);
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
