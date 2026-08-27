import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { provideAuth0 } from '@auth0/auth0-angular';

import { appBaseUrl } from './app-base-url';
import { AUTH_CONFIG } from './auth.config';

/**
 * Providers Auth0 de l'app. L'app est **browser-only** (statique sur Cloudflare
 * Pages, pas de SSR), donc Auth0 est fourni directement dans `app.config.ts` :
 * aucun rendu serveur à ménager, le SDK (non isomorphe, `checkSession()` lit
 * `window`) tourne toujours au navigateur.
 *
 * On n'utilise volontairement AUCUN `inject(PLATFORM_ID)` ici : cette fonction
 * est appelée à la construction du tableau de providers, hors contexte
 * d'injection (NG0203).
 *
 * `redirect_uri` = {@link appBaseUrl}, évalué à l'appel : l'origine ET le chemin
 * de déploiement. La même build sert localhost:7316, lfc-b2b.pages.dev et
 * lafoliecoffee.info/pro — chaque adresse juste listée côté Auth0. **Pas de SSR =
 * le SDK capte le `?code&state` du callback dans son APP_INITIALIZER avant toute
 * redirection de route.**
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuth0({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: appBaseUrl(),
        audience: AUTH_CONFIG.audience,
      },
    }),
  ]);
}
