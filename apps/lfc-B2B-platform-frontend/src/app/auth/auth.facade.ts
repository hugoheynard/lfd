import { HttpClient } from '@angular/common/http';
import {
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { NEVER, of } from 'rxjs';
import type { Observable } from 'rxjs';
import { filter, switchMap, take } from 'rxjs/operators';

import { AUTH_CONFIG } from './auth.config';
import type { Session } from './session.model';

/**
 * Façade d'authentification **SSR-safe** — l'unique frontière entre l'app et le
 * SDK `@auth0/auth0-angular` (qui n'existe qu'au navigateur, cf.
 * `auth.providers.ts`). Composants, guard et pages ne dépendent QUE d'ici :
 * ils lisent des signals et n'ont jamais à savoir si Auth0 est chargé.
 *
 * Côté serveur (pré-rendu), `inject(AuthService, { optional: true })` renvoie
 * `null` : les flux Auth0 retombent sur `NEVER` et la façade se fige en « en
 * cours de chargement / non authentifié » sans jamais toucher `window`.
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
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

  /** Identité autoritaire résolue par le backend (`GET /me`). */
  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();

  /** Message si `/me` échoue (backend éteint, compte non provisionné…). */
  private readonly _sessionError = signal<string | null>(null);
  readonly sessionError = this._sessionError.asReadonly();

  /** Email affichable : privilégie l'identité backend, retombe sur Auth0. */
  readonly displayEmail = computed(
    () => this._session()?.email ?? this.authUser()?.email ?? null,
  );

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

    // Dès qu'Auth0 confirme l'authentification, on résout l'identité *chez
    // nous* : le token ne dit que le `sub`, la base dit le reste (rôle,
    // société, statut). C'est le contrat DB-autoritaire, vu du front.
    effect(() => {
      if (this.isAuthenticated() && !this._session()) {
        this.loadSession();
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
    void this.auth0
      ?.loginWithRedirect({ appState: { target } })
      .subscribe();
  }

  /** Déconnexion Auth0 puis retour à l'origine (le guard renverra vers /login). */
  logout(): void {
    if (!this.isBrowser) {
      return;
    }
    void this.auth0
      ?.logout({ logoutParams: { returnTo: window.location.origin } })
      .subscribe();
  }

  /**
   * Appelle `GET /me` avec le jeton d'accès. Le SDK fournit le token via
   * `getAccessTokenSilently()` ; on l'attache manuellement plutôt que via
   * l'intercepteur DI du SDK (qui injecte `AuthService` et compliquerait la
   * garde SSR). Échec toléré : la démo affiche l'identité Auth0 même si le
   * backend local est éteint.
   */
  private loadSession(): void {
    this.auth0
      ?.getAccessTokenSilently()
      .pipe(
        switchMap((token) =>
          this.http.get<Session>(`${AUTH_CONFIG.apiBaseUrl}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ),
      )
      .subscribe({
        next: (session) => {
          this._session.set(session);
          this._sessionError.set(null);
        },
        error: () => {
          this._sessionError.set(
            'Identité backend indisponible (backend éteint ou compte non provisionné).',
          );
        },
      });
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
