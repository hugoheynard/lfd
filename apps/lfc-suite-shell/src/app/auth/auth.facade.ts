import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';

import { SUITE_AUTH_CONFIG, type SuiteAudience } from './auth.config';
import { DEV_BYPASS_AUTH } from './dev-flags';

/** Jeton factice rendu en bypass de dev (aucun backend réel n'est appelé). */
const DEV_TOKEN = 'dev-token';

/**
 * Façade d'auth du shell — **seul propriétaire** de l'`AuthService` Auth0.
 *
 * C'est délibéré : l'`AuthService` d'Auth0 est `providedIn: 'root'` ET enregistre
 * son propre `APP_INITIALIZER`, donc l'injecter depuis DEUX endroits crée un
 * cycle d'injection (NG0200). En le concentrant ici (singleton unique), tout le
 * reste — le gate du template, le bridge (relais de token) — consomme CETTE
 * façade en injection normale, sans lazy ni service-locator.
 *
 * En bypass de dev, Auth0 n'est pas fourni (`inject(..., optional)` = null) :
 * authentifié d'office, jeton factice.
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly auth = inject(AuthService, { optional: true });

  private readonly loading = this.auth
    ? toSignal(this.auth.isLoading$, { initialValue: true })
    : signal(false);
  private readonly authed = this.auth
    ? toSignal(this.auth.isAuthenticated$, { initialValue: false })
    : signal(true);

  readonly isLoading = computed(() => (DEV_BYPASS_AUTH ? false : this.loading()));
  readonly isAuthenticated = computed(() => (DEV_BYPASS_AUTH ? true : this.authed()));

  login(): void {
    if (DEV_BYPASS_AUTH) {
      return;
    }
    void this.auth?.loginWithRedirect();
  }

  logout(): void {
    if (DEV_BYPASS_AUTH) {
      return;
    }
    this.auth?.logout({ logoutParams: { returnTo: window.location.origin } });
  }

  /**
   * Access token pour le backend `audience` (relayé aux apps embarquées par le
   * bridge). Auth0 met en cache par audience. Jeton factice en bypass.
   */
  getToken(audience: SuiteAudience): Promise<string> {
    if (DEV_BYPASS_AUTH || !this.auth) {
      return Promise.resolve(DEV_TOKEN);
    }
    return firstValueFrom(
      this.auth.getAccessTokenSilently({
        authorizationParams: { audience: SUITE_AUTH_CONFIG.audiences[audience] },
      }),
    );
  }
}
