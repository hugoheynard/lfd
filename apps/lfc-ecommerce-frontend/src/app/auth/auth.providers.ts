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
 * de déploiement. La même build sert localhost:7316, lfc-ecommerce.pages.dev et
 * lafoliecoffee.info (à la racine depuis le 2026-09-15, sous /pro avant) —
 * chaque adresse listée côté Auth0. **Pas de SSR =
 * le SDK capte le `?code&state` du callback dans son APP_INITIALIZER avant toute
 * redirection de route.**
 *
 * ## 🔴 La session appartient à l'app, pas au cookie d'Auth0
 *
 * `useRefreshTokens` + `cacheLocation: 'localstorage'`, **alignés sur le
 * back-office le 2026-09-22** — il les porte depuis longtemps, avec sa raison
 * écrite : « pour que la session survive à un rechargement sans repasser par
 * une iframe `checkSession` que les navigateurs bloquent désormais ».
 *
 * La boutique ne les avait pas. La décision avait donc été prise, argumentée et
 * appliquée **sur une seule des deux apps** (vérifié le 2026-09-22 :
 * `apps/lfd-backoffice-frontend/src/app/auth/auth.providers.ts`). Ce n'est pas
 * un arbitrage qui restait à faire, c'est un alignement qui n'avait pas été
 * fait.
 *
 * **Ce que ça change, et ce n'est pas un détail de confort.** Sans jeton de
 * rafraîchissement, la mémoire de la session n'est PAS chez nous : chaque
 * amorçage (`checkSession`) et chaque `getAccessTokenSilently()` repartent en
 * iframe interroger le **cookie du tenant**. Deux conséquences, la première
 * déjà en production :
 *
 * - **Safari efface ce cookie au bout de sept jours** (ITP). Un client iPhone
 *   est donc déconnecté en silence, sans que rien ne le signale — ni à lui, ni
 *   à nous.
 * - **Toute seconde autorisation dans le même tenant réécrit ce cookie.** C'est
 *   ce qui rendait dangereux le rattachement Google depuis le profil : la
 *   popup fermée ou refusée laissait la boutique demander « c'est qui ? » et
 *   recevoir l'identité Google — donc un compte vide créé, ou la personne
 *   éjectée de son propre compte (plan
 *   `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md` §8.1).
 *
 * ⚠️ **`offline_access` est ce qui autorise le jeton de rafraîchissement.** Le
 * SDK ne le demande pas tout seul : sans lui dans le `scope`, `useRefreshTokens`
 * retombe **silencieusement** sur l'iframe qu'on voulait quitter. Les deux
 * autres valeurs (`openid profile email`) sont le défaut du SDK, qu'il faut
 * réécrire ici puisque poser `scope` le remplace entièrement.
 */
export function provideAuth(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuth0({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      useRefreshTokens: true,
      cacheLocation: 'localstorage',
      authorizationParams: {
        redirect_uri: appBaseUrl(),
        audience: AUTH_CONFIG.audience,
        scope: 'openid profile email offline_access',
      },
    }),
  ]);
}
