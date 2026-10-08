import {
  inject,
  InjectionToken,
  provideEnvironmentInitializer,
  signal,
  type EnvironmentProviders,
  type Signal,
  type WritableSignal,
} from "@angular/core";
import { Router, RoutesRecognized } from "@angular/router";

import {
  fetchServedBuild,
  isNewBuild,
  NEW_VERSION_POLL_MS,
  newVersionModeOf,
  readBuildMeta,
  shouldReloadOnNavigation,
} from "./new-version.js";
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
 * navigation suivante.** Voir `new-version.ts`.
 *
 * On ne recharge jamais au milieu d'un écran — un formulaire en cours n'est pas
 * perdu : le rechargement attend que la personne change d'écran, et vise
 * l'adresse qu'elle demandait. La décision se prend à `RoutesRecognized`, le
 * premier événement qui connaît la route cible et donc sa `data`.
 */
export function provideNewVersionWatch(): EnvironmentProviders {
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

    const check = async (): Promise<void> => {
      if (state() || document.visibilityState !== "visible") {
        return;
      }
      if (
        isNewBuild(current, await fetchServedBuild((url, init) => fetch(url, init), Date.now()))
      ) {
        state.set(true);
      }
    };
    document.addEventListener("visibilitychange", () => void check());
    setInterval(() => void check(), NEW_VERSION_POLL_MS);

    router.events.subscribe((event) => {
      if (
        event instanceof RoutesRecognized &&
        shouldReloadOnNavigation(state(), newVersionModeOf(event.state.root)) &&
        shouldReload(sessionStorageOrNull(), Date.now())
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
