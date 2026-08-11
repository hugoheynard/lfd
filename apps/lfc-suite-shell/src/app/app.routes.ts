import type { Route, Routes } from "@angular/router";

import { SUITE_APPS } from "./suite/suite-registry";
import { appUrlFor } from "./suite/suite-app";
import type { SuiteAppEntry } from "./suite/suite-app";
import { AppFrame } from "./suite/app-frame/app-frame";
import { AppUnavailable } from "./suite/app-unavailable/app-unavailable";

/**
 * Routing de 1er niveau : une branche par app du registre, montée sous son
 * `routePath` (`/pim/**`).
 *
 * - App avec URL (env) → `AppFrame` (iframe durcie). Le `**` capture le
 *   sous-chemin (deep-link) ; l'instance est réutilisée sur back/forward grâce à
 *   `SuiteReuseStrategy` (pas de reload de l'iframe).
 * - App sans URL → tuile **stub** `AppUnavailable[stub]`.
 */
function branchFor(app: SuiteAppEntry): Route {
  const data = { appId: app.id, routePath: app.routePath, appTitle: app.title };
  if (appUrlFor(app.id) === undefined) {
    return {
      path: app.routePath,
      loadComponent: () => Promise.resolve(AppUnavailable),
      data: { reason: "stub", appTitle: app.title },
    };
  }
  return {
    path: app.routePath,
    children: [{ path: "**", loadComponent: () => Promise.resolve(AppFrame), data }],
  };
}

const [firstApp] = SUITE_APPS;
if (!firstApp) {
  throw new Error("SUITE_APPS doit déclarer au moins une app.");
}

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: firstApp.routePath },
  ...SUITE_APPS.map(branchFor),
  { path: "**", redirectTo: firstApp.routePath },
];
