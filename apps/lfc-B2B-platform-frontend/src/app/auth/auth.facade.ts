import { Injectable, PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { NEVER, of } from 'rxjs';
import type { Observable } from 'rxjs';
import { filter, switchMap, take } from 'rxjs/operators';

/**
 * Façade d'authentification **SSR-safe** — l'unique frontière entre l'app et le
 * SDK `@auth0/auth0-angular` (qui n'existe qu'au navigateur, cf.
 * `auth.providers.ts`). Composants, guard et pages ne dépendent QUE d'ici :
 * ils lisent des signals et n'ont jamais à savoir si Auth0 est chargé.
 *
 * Côté serveur (pré-rendu), `inject(AuthService, { optional: true })` renvoie
 * `null` : les flux Auth0 retombent sur `NEVER` et la façade se fige en « en
 * cours de chargement / non authentifié » sans jamais toucher `window`.
 *
 * Elle ne répond **que** d'Auth0 — « ce porteur a prouvé ce `sub` ». Ce que nous
 * savons de la personne (profil, entreprises) appartient à `AccountService`, qui
 * le lit dans notre base. Cette séparation évite d'en faire un fourre-tout, et
 * garde la dépendance à sens unique : le service compte connaît la façade, jamais
 * l'inverse.
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  /** `null` côté serveur : Auth0 n'est fourni qu'au navigateur. */
  private readonly auth0 = inject(AuthService, { optional: true });

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Vrai tant que le SDK résout la session initiale (`checkSession`). */
  readonly isLoading = toSignal(this.auth0?.isLoading$ ?? NEVER, {
    initialValue: true,
  });

  /** Vrai si un utilisateur a prouvé son identité auprès d'Auth0. */
  readonly isAuthenticated = toSignal(this.auth0?.isAuthenticated$ ?? NEVER, {
    initialValue: false,
  });

  /** Profil Auth0 (claims du token) — « qui a prouvé son sub ». */
  readonly authUser = toSignal(this.auth0?.user$ ?? NEVER, {
    initialValue: null,
  });

  /**
   * E-mail connu d'Auth0. C'est un **repli** : l'e-mail que l'app affiche vient
   * de notre base, via `AccountService` (autoritaire). Celui-ci ne sert que le
   * temps que `GET /me` réponde, ou si l'appel échoue.
   */
  readonly authEmail = computed(() => this.authUser()?.email ?? null);

  constructor() {
    // Restauration de la route demandée : au **retour** du callback Auth0 (un
    // nouveau chargement de page), le SDK émet l'`appState` passé à
    // `loginWithRedirect`. On s'abonne ici, au constructeur, car `login()`
    // n'est pas rappelé sur ce second chargement.
    this.auth0?.appState$.subscribe((state: unknown) => {
      const target = readTarget(state);
      if (target) {
        void this.router.navigateByUrl(target);
      }
    });
  }

  /**
   * Pour le guard : émet **une fois le SDK chargé** si l'utilisateur est
   * authentifié. Côté serveur (pas de SDK), laisse passer (`of(true)`) pour ne
   * pas bloquer le pré-rendu — la vraie garde s'applique au navigateur.
   */
  authGate$(): Observable<boolean> {
    const auth = this.auth0;
    if (!auth) {
      return of(true);
    }
    return auth.isLoading$.pipe(
      filter((loading) => !loading),
      take(1),
      switchMap(() => auth.isAuthenticated$.pipe(take(1))),
    );
  }

  /** Redirige vers Auth0 ; `target` sera restauré au retour (`appState`). */
  login(target: string): void {
    void this.auth0?.loginWithRedirect({ appState: { target } }).subscribe();
  }

  /** Déconnexion Auth0 puis retour à l'origine (le guard renverra vers /login). */
  logout(): void {
    if (!this.isBrowser) {
      return;
    }
    void this.auth0?.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }

  /**
   * Jeton d'accès courant, pour appeler notre API.
   *
   * Exposé ici parce que le SDK Auth0 est **confiné à cette façade** : les
   * services métier obtiennent un jeton sans jamais injecter `AuthService`, ce
   * qui les garde SSR-safe. On attache l'en-tête à la main plutôt que via
   * l'intercepteur DI du SDK, qui injecterait `AuthService` partout et
   * compliquerait la garde de pré-rendu.
   *
   * Côté serveur (pas de SDK), l'observable n'émet **jamais** : les appels API
   * ne partent tout simplement pas pendant le pré-rendu.
   */
  accessToken$(): Observable<string> {
    return this.auth0?.getAccessTokenSilently() ?? NEVER;
  }
}

/** Prédicat de garde : `state` porte-t-il un `target` chaîne ? (sans cast). */
function hasTarget(state: unknown): state is { target: unknown } {
  return typeof state === 'object' && state !== null && 'target' in state;
}

/** Extrait `target` de l'`appState` renvoyé par Auth0. */
function readTarget(state: unknown): string | null {
  if (hasTarget(state) && typeof state.target === 'string') {
    return state.target;
  }
  return null;
}
