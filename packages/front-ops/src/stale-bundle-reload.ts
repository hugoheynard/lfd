import { inject, provideEnvironmentInitializer } from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";
import { NavigationError, Router } from "@angular/router";

import { isStaleBundleError, shouldReload, type ReloadGuardStore } from "./stale-bundle.js";

/**
 * **Un onglet resté sur une version retirée se recharge une fois, tout seul.**
 *
 * Voir `stale-bundle.ts` pour la cause. Deux chemins mènent à l'échec, et on
 * écoute les deux :
 *
 * - la **navigation** vers un écran chargé à la demande — le routeur la rend en
 *   `NavigationError` ;
 * - un **import dynamique hors routeur** — il ressort en promesse rejetée non
 *   traitée.
 *
 * Le rechargement vise l'adresse que la personne demandait, pas celle qu'elle
 * quittait : une navigation ratée ne l'a pas encore changée dans la barre.
 */
export function provideStaleBundleReload(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    // SSR : pas de navigateur, pas de morceau à recharger.
    if (typeof window === "undefined") {
      return;
    }
    const router = inject(Router);
    router.events.subscribe((event) => {
      if (event instanceof NavigationError && isStaleBundleError(event.error)) {
        reload(event.url);
      }
    });
    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      if (isStaleBundleError(event.reason)) {
        reload(null);
      }
    });
  });
}

function reload(targetUrl: string | null): void {
  if (!shouldReload(sessionStorageOrNull(), Date.now())) {
    return;
  }
  if (targetUrl === null) {
    window.location.reload();
  } else {
    window.location.assign(targetUrl);
  }
}

function sessionStorageOrNull(): ReloadGuardStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
