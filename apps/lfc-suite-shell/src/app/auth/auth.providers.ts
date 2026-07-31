import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { provideAuth0 } from '@auth0/auth0-angular';

import { SUITE_AUTH_CONFIG } from './auth.config';

/**
 * Providers Auth0 du shell. Le shell est browser-only (pas de SSR), donc pas de
 * garde d'isomorphisme à ménager ici : `window.location.origin` est toujours
 * défini. La même build sert localhost:7300 et l'origine Pages — chaque origine
 * juste listée côté Auth0.
 *
 * On ne fixe PAS d'`audience` par défaut : le shell demande un jeton par
 * audience à la volée (voir `token.service.ts`), un backend à la fois.
 */
export function provideSuiteAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuth0({
      domain: SUITE_AUTH_CONFIG.domain,
      clientId: SUITE_AUTH_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: window.location.origin,
      },
    }),
  ]);
}
