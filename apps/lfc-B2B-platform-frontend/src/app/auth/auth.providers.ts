import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { provideAuth0 } from '@auth0/auth0-angular';

import { AUTH_CONFIG } from './auth.config';

/**
 * Providers Auth0 — à n'inclure QUE dans la config **navigateur**
 * (`app.config.browser.ts`, importée seulement par `main.ts`).
 *
 * Pourquoi pas dans `app.config.ts` : cette config est fusionnée par
 * `app.config.server.ts` pour le pré-rendu. Or le SDK n'est pas isomorphe — le
 * constructeur d'`AuthService` lance immédiatement `checkSession()` qui lit
 * `window`. On isole donc Auth0 dans l'entrée navigateur ; côté serveur,
 * `AuthService` n'est pas fourni (l'`inject(..., { optional: true })` de la
 * façade renvoie `null`).
 *
 * On n'utilise volontairement AUCUN `inject(PLATFORM_ID)` ici : cette fonction
 * est appelée à la construction du tableau de providers, hors contexte
 * d'injection (NG0203). La garde SSR est structurelle (fichier séparé), pas
 * runtime.
 *
 * `redirect_uri` = `window.location.origin`, évalué à l'appel : sûr car cette
 * fonction n'est jamais chargée côté serveur. La même build sert donc
 * localhost:4200 et lfc-b2b.pages.dev — chaque origine juste listée côté Auth0.
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuth0({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: AUTH_CONFIG.audience,
      },
    }),
  ]);
}
