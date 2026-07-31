import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '@auth0/auth0-angular';

/**
 * Façade d'auth du shell. Le shell est le SEUL propriétaire de la session : le
 * template décide chrome-vs-login à partir d'ici, les remotes n'y touchent pas.
 * (Le shell étant browser-only, `AuthService` est toujours présent — pas de
 * garde `optional` comme côté B2B SSR.)
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly auth = inject(AuthService);

  private readonly loading = toSignal(this.auth.isLoading$, { initialValue: true });
  private readonly authed = toSignal(this.auth.isAuthenticated$, { initialValue: false });

  readonly isLoading = computed(() => this.loading());
  readonly isAuthenticated = computed(() => this.authed());

  login(): void {
    void this.auth.loginWithRedirect();
  }

  logout(): void {
    this.auth.logout({ logoutParams: { returnTo: window.location.origin } });
  }
}
