import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '@auth0/auth0-angular';

import { DEV_BYPASS_AUTH } from './dev-flags';

/**
 * Façade d'auth du shell. Le shell est le SEUL propriétaire de la session : le
 * template décide chrome-vs-login à partir d'ici, les remotes n'y touchent pas.
 *
 * Bypass de dev : `DEV_BYPASS_AUTH` (const de module, `false` en prod → branches
 * repliées par DCE) court-circuite le gate ET rend `AuthService` optionnel — en
 * bypass, Auth0 n'est pas fourni (cf. `app.config`), donc on ne l'injecte qu'en
 * option et le fallback signals suffisent.
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
}
