import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';

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
   */
  async token(): Promise<string | null> {
    if (!this.auth) {
      return null;
    }
    try {
      return await firstValueFrom(this.auth.getAccessTokenSilently());
    } catch {
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
