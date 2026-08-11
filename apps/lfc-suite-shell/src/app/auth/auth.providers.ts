import { makeEnvironmentProviders } from "@angular/core";
import type { EnvironmentProviders } from "@angular/core";
import { provideAuth0 } from "@auth0/auth0-angular";

import { SUITE_AUTH_CONFIG } from "./auth.config";

/**
 * Providers Auth0 du shell. Le shell est browser-only (pas de SSR), donc pas de
 * garde d'isomorphisme à ménager ici : `window.location.origin` est toujours
 * défini. La même build sert localhost:7300 et l'origine Pages — chaque origine
 * juste listée côté Auth0.
 *
 * **Jetons de rafraîchissement, pas silent-auth iframe.** Le shell détient UNE
 * session mais adresse N backends (un `audience` chacun). L'échange par iframe
 * (`prompt=none`) est mort sur navigateur moderne (blocage cookies tiers), donc :
 *
 * - `audience` par défaut = `self` (api-suite) : le login mint DIRECTEMENT le
 *   jeton d'entitlements, dont la claim `permissions` dessine le launcher — zéro
 *   iframe au démarrage.
 * - `useRefreshTokens` + `offline_access` : chaque autre audience (pim, b2b) est
 *   obtenue par le grant `refresh_token` (POST first-party, pas d'iframe). Voir
 *   `AuthFacade.getToken`. Chaque API doit avoir « Allow Offline Access » activé.
 * - `cacheLocation: 'localstorage'` : le refresh token survit au rechargement,
 *   sinon un cache mémoire forcerait de nouveau l'iframe `checkSession` au reload.
 */
export function provideSuiteAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuth0({
      domain: SUITE_AUTH_CONFIG.domain,
      clientId: SUITE_AUTH_CONFIG.clientId,
      useRefreshTokens: true,
      cacheLocation: "localstorage",
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: SUITE_AUTH_CONFIG.audiences.self,
        scope: "openid profile email offline_access",
      },
    }),
  ]);
}
