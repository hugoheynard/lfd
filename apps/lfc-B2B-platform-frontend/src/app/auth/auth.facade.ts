import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { NEVER, of } from 'rxjs';
import type { Observable } from 'rxjs';
import { filter, switchMap, take } from 'rxjs/operators';

import { appBaseUrl } from './app-base-url';
import { CUSTOMER_CONNECTION } from './auth.config';
import { DEV_BYPASS_AUTH } from './dev-flags';

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

  /*
   * Bypass d'auth de **développement**, effectif au navigateur.
   *
   * La sûreté prod ne repose PAS sur un contrôle d'hôte runtime mais sur le
   * **build** : `DEV_BYPASS_AUTH` est un const de module valant `false` en
   * production/cloudflare (via `fileReplacements`), `true` seulement en config
   * `development` (`ng serve`). Placé **en tête** de chaque `&&` ci-dessous,
   * `false && …` est plié par esbuild et toute la branche de bypass (jeton
   * placeholder compris) est **éliminée** du bundle prod — pas seulement gardée à
   * l'exécution : absente. On l'inline à chaque usage (plutôt qu'un champ lu par
   * `this.`) précisément pour laisser ce pliage opérer. `this.isBrowser` évite
   * juste que le bypass s'active au pré-rendu SSR ; il n'a aucun rôle de sécurité.
   */

  private readonly rawIsLoading = toSignal(this.auth0?.isLoading$ ?? NEVER, {
    initialValue: true,
  });
  /** Vrai tant que le SDK résout la session initiale (`checkSession`). */
  readonly isLoading = computed(() =>
    DEV_BYPASS_AUTH && this.isBrowser ? false : this.rawIsLoading(),
  );

  private readonly rawIsAuthenticated = toSignal(this.auth0?.isAuthenticated$ ?? NEVER, {
    initialValue: false,
  });
  /** Vrai si un utilisateur a prouvé son identité auprès d'Auth0 (ou bypass dev). */
  readonly isAuthenticated = computed(
    () => (DEV_BYPASS_AUTH && this.isBrowser) || this.rawIsAuthenticated(),
  );

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

  /**
   * Le profil saisi AVANT le départ chez Auth0, retrouvé au retour.
   *
   * Prénom et téléphone n'existent nulle part chez Auth0 : ils sont saisis sur
   * notre page, puis la personne part poser sa passkey — un vrai rechargement de
   * page, qui efface toute mémoire vive. `appState` fait l'aller-retour avec
   * elle, et c'est le seul endroit prévu pour ça.
   *
   * ⚠️ Rien de secret n'a sa place ici : le SDK range l'`appState` dans le
   * stockage du navigateur le temps de la redirection.
   */
  readonly pendingProfile = signal<PendingProfile | null>(null);

  constructor() {
    // Restauration de la route demandée : au **retour** du callback Auth0 (un
    // nouveau chargement de page), le SDK émet l'`appState` passé à
    // `loginWithRedirect`. On s'abonne ici, au constructeur, car `login()`
    // n'est pas rappelé sur ce second chargement.
    this.auth0?.appState$.subscribe((state: unknown) => {
      this.pendingProfile.set(readProfile(state));
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
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      return of(true);
    }
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

  /**
   * Redirige vers Auth0 ; `target` sera restauré au retour (`appState`).
   *
   * `hint` préremplit l'identifiant sur l'écran d'Auth0 : quelqu'un qui vient de
   * taper son e-mail chez nous n'a pas à le retaper chez lui.
   */
  login(target: string, hint?: string): void {
    void this.auth0
      ?.loginWithRedirect({
        appState: { target },
        authorizationParams: { connection: CUSTOMER_CONNECTION, ...loginHint(hint) },
      })
      .subscribe();
  }

  /**
   * Comme {@link login}, mais ouvre directement l'onglet **inscription** de
   * l'Universal Login (`screen_hint: 'signup'`). La connexion est NOMMÉE : c'est
   * elle qui porte la passkey, et la laisser deviner par l'application fait
   * retomber l'écran sur un mot de passe. L'ouverture réelle des créations de
   * compte dépend de cette connexion (sign-ups activés). Le nouveau compte arrive en base au 1er `GET /me` (statut invité).
   */
  register(target: string, profile?: PendingProfile): void {
    void this.auth0
      ?.loginWithRedirect({
        appState: { target, profile },
        authorizationParams: {
          connection: CUSTOMER_CONNECTION,
          screen_hint: 'signup',
          ...loginHint(profile?.email),
        },
      })
      .subscribe();
  }

  /**
   * Déconnexion Auth0 puis retour à l'app (le guard renverra vers /login).
   *
   * `appBaseUrl()` et non l'origine nue : sous `/pro`, une origine nue déposerait
   * la personne à la racine du domaine, hors de l'app.
   */
  logout(): void {
    if (!this.isBrowser) {
      return;
    }
    void this.auth0?.logout({ logoutParams: { returnTo: appBaseUrl() } }).subscribe();
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
    // En bypass dev, l'API ignore le jeton (impersonation backend) : on évite
    // `getAccessTokenSilently()`, qui lèverait faute de session Auth0.
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      return of('dev-impersonation');
    }
    return this.auth0?.getAccessTokenSilently() ?? NEVER;
  }
}

/** Ce que l'app retient d'une personne le temps de l'aller-retour Auth0. */
export interface PendingProfile {
  readonly firstName: string;
  readonly email: string;
  readonly phone: string;
}

/** `login_hint` seulement s'il y a quelque chose à souffler. */
function loginHint(email: string | undefined): { login_hint?: string } {
  return email !== undefined && email.trim() !== '' ? { login_hint: email.trim() } : {};
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

/** Prédicat de garde : `state` porte-t-il un `profile` ? (sans cast). */
function hasProfile(state: unknown): state is { profile: unknown } {
  return typeof state === 'object' && state !== null && 'profile' in state;
}

/** Un objet quelconque, dont les champs restent à vérifier un par un. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Extrait le profil de l'`appState`. Il revient du stockage du navigateur : on
 * vérifie ses trois champs plutôt que de lui faire confiance. Sans e-mail il n'y
 * a rien à poser, donc rien à retenir.
 */
function readProfile(state: unknown): PendingProfile | null {
  if (!hasProfile(state) || !isRecord(state.profile)) {
    return null;
  }
  const email = readString(state.profile, 'email');
  return email === ''
    ? null
    : {
        firstName: readString(state.profile, 'firstName'),
        email,
        phone: readString(state.profile, 'phone'),
      };
}
