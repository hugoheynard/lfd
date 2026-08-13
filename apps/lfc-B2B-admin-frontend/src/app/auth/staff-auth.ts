import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { filter, firstValueFrom, take } from 'rxjs';

import { STAFF_OWNS_SESSION } from './auth.providers';

/**
 * La session **staff de cette app**, quand elle tourne hors du shell.
 *
 * Unique propriétaire de l'`AuthService` d'Auth0 : ce service est
 * `providedIn: 'root'` ET pose son propre initialiseur d'app, donc l'injecter
 * depuis deux endroits crée un cycle (NG0200). Tout le reste — la porte d'entrée,
 * l'intercepteur — passe par ici.
 *
 * Embarquée dans la suite, la façade est **inerte** : Auth0 n'est pas fourni,
 * `inject(…, { optional: true })` rend `null`, et c'est le shell qui authentifie
 * (cf. `SuiteEmbed`). Un seul objet à interroger dans les deux vies.
 */
@Injectable({ providedIn: 'root' })
export class StaffAuth {
  private readonly auth = inject(AuthService, { optional: true });
  private readonly router = inject(Router);

  /** Vrai quand cette app porte sa propre session (standalone + configurée). */
  readonly ownsSession = STAFF_OWNS_SESSION && this.auth !== null;

  private readonly rawLoading = this.auth
    ? toSignal(this.auth.isLoading$, { initialValue: true })
    : signal(false);
  private readonly rawAuthed = this.auth
    ? toSignal(this.auth.isAuthenticated$, { initialValue: false })
    : signal(false);
  private readonly rawUser = this.auth
    ? toSignal(this.auth.user$, { initialValue: null })
    : signal(null);

  /** Vrai tant que le SDK résout la session initiale. Faux si inerte. */
  readonly isLoading = computed(() => this.ownsSession && this.rawLoading());
  /** Vrai si un membre du staff a prouvé son identité auprès d'Auth0. */
  readonly isAuthenticated = computed(() => this.ownsSession && this.rawAuthed());
  /** E-mail du jeton — de quoi montrer QUI est connecté, rien de plus. */
  readonly email = computed(() => this.rawUser()?.email ?? null);

  constructor() {
    // Restauration de la route demandée. Le retour du callback Auth0 est un
    // NOUVEAU chargement de page : `login()` n'est pas rappelé, et c'est le SDK
    // qui rend l'`appState` qu'on lui avait confié. D'où l'abonnement ici.
    this.auth?.appState$.subscribe((state: unknown) => {
      const target = readTarget(state);
      if (target !== null) {
        void this.router.navigateByUrl(target);
      }
    });
  }

  /** Part vers Auth0 ; `target` sera restauré au retour. */
  login(target: string): void {
    void this.auth?.loginWithRedirect({ appState: { target } }).subscribe();
  }

  /** Ferme la session Auth0 et revient sur l'app (qui remontrera la porte). */
  logout(): void {
    this.auth?.logout({ logoutParams: { returnTo: window.location.origin } }).subscribe();
  }

  /**
   * Jeton d'accès staff courant, ou `null`.
   *
   * `null` n'est pas une erreur ici : c'est l'état d'une app embarquée (le jeton
   * vient du shell) ou d'un poste de dev sans Auth0 configuré (le backend tourne
   * en bypass). Le mur reste le backend — un appel sans jeton s'y fera refuser.
   *
   * **On attend d'abord que le SDK ait fini de résoudre la session.** Sans cette
   * attente, « je ne sais pas encore » se dit `null`, c'est-à-dire exactement
   * comme « il n'y en a pas » — et l'appelant ne peut pas faire la différence.
   *
   * Ce n'était pas théorique : au retour du callback Auth0, le garde de route
   * appelle `ensureLoaded()` AVANT que la session soit restaurée (le composant
   * racine, lui, attend `isLoading` — le garde ne passe pas par là). L'appel
   * partait donc sans en-tête, prenait un 401, et le magasin de permissions
   * retenait ce refus SANS JAMAIS RÉESSAYER : « aucun accès » pour toute la
   * session, jusqu'à un rechargement manuel. Sur un appareil neuf, c'est-à-dire
   * à chaque première connexion. Constaté en production le 2026-08-13.
   */
  async token(): Promise<string | null> {
    if (!this.auth) {
      return null;
    }
    try {
      await firstValueFrom(
        this.auth.isLoading$.pipe(
          filter((loading) => !loading),
          take(1),
        ),
      );
      return await firstValueFrom(this.auth.getAccessTokenSilently());
    } catch (error: unknown) {
      // Une fois la session résolue, un échec est une VRAIE anomalie (audience
      // inconnue d'Auth0, refus de consentement, réseau). On part quand même
      // sans en-tête — le backend reste le mur — mais en le disant : sans cette
      // ligne, la cause est à trois couches du 401 qu'on finit par voir.
      console.warn('[staff-auth] jeton indisponible, appel sans en-tête', error);
      return null;
    }
  }
}

/** Extrait `target` de l'`appState` rendu par Auth0, sans cast. */
function readTarget(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('target' in state)) {
    return null;
  }
  const { target } = state;
  return typeof target === 'string' ? target : null;
}
