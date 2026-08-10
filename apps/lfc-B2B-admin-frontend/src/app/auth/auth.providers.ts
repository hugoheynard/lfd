import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { provideAuth0 } from '@auth0/auth0-angular';

import { isEmbedded } from '../suite-embed/hosted';
import { STAFF_AUTH_CONFIG, STAFF_AUTH_CONFIGURED } from './auth.config';

/**
 * Cette app tient-elle sa **propre** session Auth0 ?
 *
 * Non quand elle est **embarquée** : le shell possède la session de la suite et
 * relaie un jeton par `postMessage`. Fournir Auth0 dans le cadre ferait tourner
 * `checkSession()` en iframe tierce — bloqué par les navigateurs sur les cookies
 * tiers — donc un échec bruyant pour une session qu'on a déjà par ailleurs.
 *
 * Non plus quand la configuration manque : voir `STAFF_AUTH_CONFIGURED`.
 *
 * Évalué **au module**, pas dans un service : `app.config.ts` doit trancher avant
 * qu'aucun contexte d'injection n'existe.
 */
export const STAFF_OWNS_SESSION =
  typeof window !== 'undefined' && !isEmbedded(window) && STAFF_AUTH_CONFIGURED;

/**
 * Providers Auth0 de l'app admin — **uniquement en standalone**.
 *
 * `redirect_uri` = l'origine courante, évaluée à l'appel : la même build sert
 * `127.0.0.1:7317` et l'origine Pages, chaque origine étant simplement listée
 * côté Auth0.
 *
 * `audience` = l'API staff, demandée **dès le login** : le jeton dont l'app a
 * besoin est minté par le flux d'autorisation lui-même, sans aller-retour
 * silencieux ensuite. `cacheLocation: 'localstorage'` + jetons de rafraîchissement
 * pour que la session survive à un rechargement sans repasser par une iframe
 * `checkSession` que les navigateurs bloquent désormais.
 */
export function provideStaffAuth(): EnvironmentProviders {
  if (!STAFF_OWNS_SESSION) {
    return makeEnvironmentProviders([]);
  }
  return makeEnvironmentProviders([
    provideAuth0({
      domain: STAFF_AUTH_CONFIG.domain,
      clientId: STAFF_AUTH_CONFIG.clientId,
      useRefreshTokens: true,
      cacheLocation: 'localstorage',
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: STAFF_AUTH_CONFIG.audience,
        scope: 'openid profile email offline_access',
      },
    }),
  ]);
}
