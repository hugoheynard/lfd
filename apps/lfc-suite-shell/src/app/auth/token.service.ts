import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';

import { SUITE_AUTH_CONFIG } from './auth.config';

/** Backends adressables par la suite — une audience Auth0 chacun. */
export type SuiteAudience = keyof typeof SUITE_AUTH_CONFIG.audiences;

/**
 * Émetteur de jetons **multi-audience**. Le shell détient une session Auth0
 * unique ; ce service échange, à la demande, un access token ciblé pour le
 * backend d'un remote donné (`api://b2b`, `api://pim`). C'est LE singleton
 * partagé que les remotes consomment (voir la baseline de partage fédérée) :
 * un login, N murs d'API, aucun remote ne connaît le SDK Auth0.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly auth = inject(AuthService);

  /** Access token pour le backend `audience`. Auth0 met en cache par audience. */
  getToken(audience: SuiteAudience): Promise<string> {
    return firstValueFrom(
      this.auth.getAccessTokenSilently({
        authorizationParams: { audience: SUITE_AUTH_CONFIG.audiences[audience] },
      }),
    );
  }
}
