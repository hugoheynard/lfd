import { inject, provideEnvironmentInitializer } from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";
import { NavigationError, Router } from "@angular/router";

import { trackSkipLocationChange } from "./skip-location-change.js";
import {
  isStaleBundleError,
  reloadTargetOf,
  shouldReload,
  type ReloadGuardStore,
} from "./stale-bundle.js";

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
 * quittait : une navigation ratée ne l'a pas encore changée dans la barre. Sauf
 * une navigation qui ne touche pas l'adresse (`reloadTargetOf`) : on recharge
 * alors ce que montre la barre. La garde anti-boucle est par adresse : au
 * second échec sur la même adresse, l'erreur suit son cours normal.
 */
export function provideStaleBundleReload(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    // SSR : pas de navigateur, pas de morceau à recharger.
    if (typeof window === "undefined") {
      return;
    }
    const router = inject(Router);
    const skippedLocation = trackSkipLocationChange(router);
    router.events.subscribe((event) => {
      if (event instanceof NavigationError && isStaleBundleError(event.error)) {
        reload(reloadTargetOf(event.url, skippedLocation(event.id), shownUrl()));
      }
    });
    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      if (isStaleBundleError(event.reason)) {
        reload(shownUrl());
      }
    });
  });
}

function reload(target: string): void {
  if (!shouldReload(sessionStorageOrNull(), Date.now(), target)) {
    return;
  }
  // `assign` de l'adresse affichée, à une ancre près, ne recharge rien.
  if (target === shownUrl()) {
    window.location.reload();
  } else {
    window.location.assign(target);
  }
}

function shownUrl(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

function sessionStorageOrNull(): ReloadGuardStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
