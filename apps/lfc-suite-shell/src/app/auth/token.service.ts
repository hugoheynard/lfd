import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';

import { SUITE_AUTH_CONFIG } from './auth.config';
import { DEV_BYPASS_AUTH } from './dev-flags';

/** Backends adressables par la suite — une audience Auth0 chacun. */
export type SuiteAudience = keyof typeof SUITE_AUTH_CONFIG.audiences;

/** Jeton factice rendu en bypass de dev (aucun backend réel n'est appelé). */
const DEV_TOKEN = 'dev-token';

/**
 * Émetteur de jetons **multi-audience**. Le shell détient une session Auth0
 * unique ; ce service échange, à la demande, un access token ciblé pour le
 * backend d'un remote donné. C'est LE singleton que le bridge postMessage
 * relaie aux apps embarquées — un login, N murs d'API, aucune app ne connaît
 * le SDK Auth0.
 *
 * En bypass de dev, Auth0 n'est pas fourni (`inject(..., optional)` = null) →
 * on rend un jeton factice pour que le handshake fonctionne sans backend.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly auth = inject(AuthService, { optional: true });

  /** Access token pour le backend `audience`. Auth0 met en cache par audience. */
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
