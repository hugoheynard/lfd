import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { NEVER, of } from 'rxjs';
import type { Observable } from 'rxjs';
import { filter, switchMap, take } from 'rxjs/operators';

import { appBaseUrl } from './app-base-url';
import { CUSTOMER_CONNECTION, FACEBOOK_CONNECTION, GOOGLE_CONNECTION } from './auth.config';
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

  /**
   * En bypass dev, « je me suis déconnecté ».
   *
   * Sans lui, le bypass rendait la déconnexion impossible : `logout()` partait
   * chez Auth0, revenait, et la façade se redéclarait authentifiée — puis
   * `/bienvenue`, qui renvoie ailleurs qui est déjà entré, se fermait aussitôt.
   * On ne pouvait donc jamais regarder la porte d'entrée en dev.
   *
   * Gardé dans le stockage local pour survivre à un rechargement ; levé par
   * `login()` ou `register()`. En production, `DEV_BYPASS_AUTH` vaut `false` en
   * tête de chaque lecture et ce signal n'est jamais consulté.
   */
  private readonly devSignedOut = signal(DEV_BYPASS_AUTH && this.isBrowser && readDevSignedOut());

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
    () => (DEV_BYPASS_AUTH && this.isBrowser && !this.devSignedOut()) || this.rawIsAuthenticated(),
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

  /**
   * La déclaration saisie sur la porte pro, retrouvée au retour d'Auth0.
   *
   * Même aller-retour que {@link pendingProfile}, et même mise en garde : rien
   * de secret n'a sa place ici. Elle a son signal à elle parce que `/bienvenue`
   * et la porte pro ne font pas le même geste au retour — l'une repose un
   * profil, l'autre déclare un établissement (`ProOnboarding`).
   */
  readonly pendingProRegistration = signal<ProRegistration | null>(null);

  /**
   * En bypass dev, l'inscription pro EN COURS sur l'écran d'Auth0 simulé.
   *
   * Pas d'aller-retour réel, donc pas d'`appState` : c'est ce signal qui porte
   * la déclaration entre la porte pro et l'écran simulé. En production, il
   * reste `null` — `DEV_BYPASS_AUTH` vaut `false` en tête de chaque écriture.
   */
  readonly devSignup = signal<{
    readonly target: string;
    readonly registration: ProRegistration;
  } | null>(null);

  /**
   * Termine l'inscription simulée : on est entré, la déclaration est retenue
   * comme au vrai retour d'Auth0, et l'on rend la cible où aller.
   *
   * `null` hors dev, ou sans inscription en cours (rechargement de l'écran).
   */
  completeDevSignup(): string | null {
    const signup = this.devSignup();
    if (!(DEV_BYPASS_AUTH && this.isBrowser) || signup === null) {
      return null;
    }
    writeDevSignedOut(false);
    this.devSignedOut.set(false);
    this.pendingProRegistration.set(signup.registration);
    this.devSignup.set(null);
    return signup.target;
  }

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
    // Un second abonnement plutôt qu'une ligne de plus dans le premier : le
    // parcours de `/bienvenue` reste intact, et le SDK rejoue le même état aux
    // deux abonnés.
    this.auth0?.appState$.subscribe((state: unknown) => {
      this.pendingProRegistration.set(readProRegistration(state));
    });
  }

  /**
   * Pour le guard : émet **une fois le SDK chargé** si l'utilisateur est
   * authentifié. Côté serveur (pas de SDK), laisse passer (`of(true)`) pour ne
   * pas bloquer le pré-rendu — la vraie garde s'applique au navigateur.
   */
  authGate$(): Observable<boolean> {
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      return of(!this.devSignedOut());
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
    // En bypass dev, se connecter, c'est lever la déconnexion : il n'y a pas de
    // session Auth0 à ouvrir, l'API impersonne déjà l'utilisateur du seed.
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      writeDevSignedOut(false);
      this.devSignedOut.set(false);
      void this.router.navigateByUrl(target);
      return;
    }
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
    // En bypass dev, même geste que `login()`. Le profil saisi n'est PAS reposé :
    // il écraserait celui de l'utilisateur du seed, que l'API impersonne.
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      writeDevSignedOut(false);
      this.devSignedOut.set(false);
      void this.router.navigateByUrl(target);
      return;
    }
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
   * **Entrer par Google** — connexion et inscription à la fois : le premier
   * passage crée le compte (provisionné par l'API à la première requête).
   *
   * Aucun profil ne voyage : prénom et téléphone ne viennent pas de Google, et
   * le parcours d'accueil les demande ensuite. En bypass dev, même geste que
   * {@link login} — il n'y a pas de Google à ouvrir.
   */
  continueWithGoogle(target: string): void {
    this.continueWith(GOOGLE_CONNECTION, target);
  }

  /**
   * **Entrer par Facebook** — même geste que {@link continueWithGoogle}, même
   * règle : le premier passage crée le compte, aucun profil ne voyage, et
   * l'API refuse un second compte sous une adresse déjà connue.
   *
   * ⚠️ Dépend d'un réglage de la console Auth0 que ce dépôt ne porte pas :
   * voir {@link FACEBOOK_CONNECTION}.
   */
  continueWithFacebook(target: string): void {
    this.continueWith(FACEBOOK_CONNECTION, target);
  }

  /**
   * Le geste commun aux deux fournisseurs : on part droit chez lui, sans passer
   * par l'écran d'Auth0.
   *
   * ⚠️ Un seul corps pour les deux, parce qu'ils ne diffèrent QUE par le nom de
   * la connexion. Deux copies auraient dérivé au premier paramètre ajouté — et
   * un `screen_hint` posé d'un seul côté ne se voit qu'à l'écran.
   */
  private continueWith(connection: string, target: string): void {
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      this.login(target);
      return;
    }
    void this.auth0
      ?.loginWithRedirect({ appState: { target }, authorizationParams: { connection } })
      .subscribe();
  }

  /**
   * L'inscription par la porte pro : le même geste que {@link register}
   * (onglet inscription, connexion nommée, e-mail soufflé), mais la déclaration
   * entière fait l'aller-retour, pour être déposée au retour par
   * `POST /me/establishment`.
   */
  registerPro(target: string, registration: ProRegistration): void {
    // En bypass dev, l'écran d'Auth0 est SIMULÉ : on y passe comme en
    // production, et c'est lui qui rend la main avec la déclaration retenue
    // (`completeDevSignup`). Sans cette étape, le parcours de dev sautait le
    // mot de passe et l'e-mail de vérification, qu'on ne voyait donc jamais.
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      this.devSignup.set({ target, registration });
      void this.router.navigateByUrl(DEV_AUTH0_SIGNUP_SCREEN);
      return;
    }
    void this.auth0
      ?.loginWithRedirect({
        appState: { target, proRegistration: registration },
        authorizationParams: {
          connection: CUSTOMER_CONNECTION,
          screen_hint: 'signup',
          ...loginHint(registration.email),
        },
      })
      .subscribe();
  }

  /**
   * Déconnexion Auth0 puis retour à l'app (le guard renverra vers /login).
   *
   * `appBaseUrl()` et non l'origine nue : sous un chemin de déploiement (c'était
   * `/pro` jusqu'au 2026-09-15), une origine nue déposerait la personne hors de
   * l'app. À la racine les deux coïncident ; la fonction reste la seule source.
   *
   * En bypass dev, aucun aller-retour Auth0 : on pose la déconnexion et on
   * revient sur la porte d'entrée, où l'on reste jusqu'à `login()`.
   */
  logout(): void {
    if (!this.isBrowser) {
      return;
    }
    if (DEV_BYPASS_AUTH) {
      writeDevSignedOut(true);
      this.devSignedOut.set(true);
      void this.router.navigateByUrl(DEV_SIGNED_OUT_LANDING);
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
    // Déconnecté, aucun appel ne part : comme sans session.
    if (DEV_BYPASS_AUTH && this.isBrowser) {
      return this.devSignedOut() ? NEVER : of('dev-impersonation');
    }
    return this.auth0?.getAccessTokenSilently() ?? NEVER;
  }
}

/** L'écran d'Auth0 simulé, en dev — la route n'existe pas en production. */
export const DEV_AUTH0_SIGNUP_SCREEN = '/dev/inscription-auth0';

/**
 * Où l'on atterrit en se déconnectant en dev : **l'accueil public**.
 *
 * ⚠️ L'adresse n'a pas changé, son sens si (2026-09-16) : `/bienvenue` portait
 * l'inscription — d'où « la porte d'entrée », ce que disait cette ligne — et
 * porte désormais ce que voit un visiteur sans compte. Qui se déconnecte
 * retombe donc sur la boutique plutôt que sur un formulaire, ce qui est mieux.
 * La porte d'entrée, elle, est `/inscription`.
 */
const DEV_SIGNED_OUT_LANDING = '/bienvenue';

/** La clé de stockage local de la déconnexion dev. */
const DEV_SIGNED_OUT_KEY = 'lfc-dev-signed-out';

/**
 * Le stockage local peut être refusé (navigation privée, réglage du
 * navigateur) : on retombe alors sur « connecté », le comportement d'avant.
 */
function readDevSignedOut(): boolean {
  try {
    return localStorage.getItem(DEV_SIGNED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDevSignedOut(signedOut: boolean): void {
  try {
    if (signedOut) {
      localStorage.setItem(DEV_SIGNED_OUT_KEY, '1');
    } else {
      localStorage.removeItem(DEV_SIGNED_OUT_KEY);
    }
  } catch {
    // Stockage refusé : la déconnexion tient jusqu'au prochain rechargement.
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

/**
 * Ce que la porte pro retient le temps de l'aller-retour Auth0 : la personne
 * et son enseigne. Le mot de passe, lui, se pose chez Auth0 et n'y figure pas.
 */
export interface ProRegistration {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly enseigne: string;
}

/** Prédicat de garde : `state` porte-t-il une `proRegistration` ? (sans cast). */
function hasProRegistration(state: unknown): state is { proRegistration: unknown } {
  return typeof state === 'object' && state !== null && 'proRegistration' in state;
}

/** La valeur d'un champ, seulement si c'est une chaîne. */
function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Extrait la déclaration pro de l'`appState`. Elle revient du stockage du
 * navigateur : chacun des cinq champs est vérifié, et **un seul manquant rend
 * `null`**. Contrairement au profil de `/bienvenue`, une déclaration partielle
 * ne se complète pas par du vide — le serveur la refuserait, et la carte
 * « Compléter mon dossier » est là pour la reprendre en entier.
 */
function readProRegistration(state: unknown): ProRegistration | null {
  if (!hasProRegistration(state) || !isRecord(state.proRegistration)) {
    return null;
  }
  const source = state.proRegistration;
  const firstName = stringField(source, 'firstName');
  const lastName = stringField(source, 'lastName');
  const email = stringField(source, 'email');
  const phone = stringField(source, 'phone');
  const enseigne = stringField(source, 'enseigne');
  if (
    firstName === null ||
    lastName === null ||
    email === null ||
    email === '' ||
    phone === null ||
    enseigne === null
  ) {
    return null;
  }
  return { firstName, lastName, email, phone, enseigne };
}
