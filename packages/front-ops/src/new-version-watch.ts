import {
  inject,
  InjectionToken,
  provideEnvironmentInitializer,
  signal,
  type EnvironmentProviders,
  type Signal,
  type WritableSignal,
} from "@angular/core";
import { GuardsCheckEnd, NavigationStart, Router } from "@angular/router";

import {
  fetchServedBuild,
  isNewBuild,
  isReadStale,
  NEW_VERSION_POLL_MS,
  newVersionModeOf,
  readBuildMeta,
  shouldReloadAfterGuards,
  type NewVersionWatchOptions,
} from "./new-version.js";
import { trackSkipLocationChange } from "./skip-location-change.js";
import { shouldReload, type ReloadGuardStore } from "./stale-bundle.js";

const NEW_VERSION_STATE = new InjectionToken<WritableSignal<boolean>>("lfd.new-version-state", {
  providedIn: "root",
  factory: () => signal(false),
});

/**
 * Vrai dès qu'un build différent de celui de l'onglet est servi. Lu par les
 * écrans qui affichent un bandeau au lieu de recharger (`data.newVersion ===
 * "banner"`) ; `front-ops` n'a pas d'interface, il ne fournit que le signal.
 */
export const NEW_VERSION = new InjectionToken<Signal<boolean>>("lfd.new-version", {
  providedIn: "root",
  factory: () => inject(NEW_VERSION_STATE).asReadonly(),
});

/**
 * **Un onglet apprend qu'une nouvelle version est en ligne, et la prend à la
 * navigation suivante, sans qu'on s'en rende compte.** Voir `new-version.ts`.
 *
 * On relit le fichier de version au retour de l'onglet au premier plan, toutes
 * les 5 min onglet visible, et au départ d'une navigation si la dernière
 * lecture date ({@link isReadStale}).
 *
 * On ne recharge jamais au milieu d'un écran : le rechargement attend que la
 * personne change d'écran, et vise l'adresse qu'elle demandait. La décision se
 * prend à `GuardsCheckEnd` (2026-11-06 ; c'était `RoutesRecognized`, AVANT les
 * gardes) : un `canDeactivate` peut encore refuser, et une redirection d'une
 * garde se recharge à sa propre navigation. Une navigation qui ne touche pas
 * l'adresse ne recharge pas — la boutique en traverse une à chaque bascule
 * d'espace, et la charger en entier laissait sur un écran vide.
 *
 * `{ reloadOnNavigation: false }` coupe ce rechargement : seul le signal
 * {@link NEW_VERSION} parle.
 */
export function provideNewVersionWatch(options: NewVersionWatchOptions = {}): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    // SSR : pas de navigateur, pas d'onglet à tenir à jour.
    if (typeof window === "undefined") {
      return;
    }
    const current = readBuildMeta(document);
    if (current === null) {
      return;
    }
    const state = inject(NEW_VERSION_STATE);
    const router = inject(Router);
    const skippedLocation = trackSkipLocationChange(router);
    let lastReadMs: number | null = null;

    const check = async (): Promise<void> => {
      if (state() || document.visibilityState !== "visible") {
        return;
      }
      lastReadMs = Date.now();
      if (
        isNewBuild(current, await fetchServedBuild((url, init) => fetch(url, init), lastReadMs))
      ) {
        state.set(true);
      }
    };
    document.addEventListener("visibilitychange", () => void check());
    setInterval(() => void check(), NEW_VERSION_POLL_MS);

    router.events.subscribe((event) => {
      if (event instanceof NavigationStart && isReadStale(lastReadMs, Date.now())) {
        void check();
        return;
      }
      if (
        event instanceof GuardsCheckEnd &&
        shouldReloadAfterGuards(
          state(),
          {
            shouldActivate: event.shouldActivate,
            skipLocationChange: skippedLocation(event.id),
            targetMode: newVersionModeOf(event.state.root),
          },
          options,
        ) &&
        shouldReload(sessionStorageOrNull(), Date.now(), event.urlAfterRedirects)
      ) {
        window.location.assign(event.urlAfterRedirects);
      }
    });
  });
}

function sessionStorageOrNull(): ReloadGuardStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
