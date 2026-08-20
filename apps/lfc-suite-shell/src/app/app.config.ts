import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideFoldCommonLabels } from "fold-ng";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";

import { provideSentry } from "@lfd/front-ops";

import { routes } from "./app.routes";
import { AUTH_ENV } from "./auth/auth.env.generated";
import { provideSuiteAuth } from "./auth/auth.providers";
import { DEV_BYPASS_AUTH } from "./auth/dev-flags";

/**
 * Config de l'app hôte. Browser-only (pas de SSR), donc Auth0 est fourni
 * directement ici — pas de garde d'isomorphisme à ménager. Le shell détient la
 * session ; les remotes n'apportent aucun provider d'auth.
 *
 * En bypass de dev, Auth0 n'est PAS fourni (const `DEV_BYPASS_AUTH` repliée à
 * `false` en prod → `provideSuiteAuth()` réintégré et DCE retire la branche
 * vide) : ni SDK, ni checkSession, ni placeholder-clientId qui pédale.
 */
/** L'identifiant de CE front dans la topologie OPS — la couture avec la carte. */
const OPS_NODE = "suite-shell";

export const appConfig: ApplicationConfig = {
  providers: [
    // Sentry SEUL, pas de vitals : le shell n'appelle aucune API — il héberge
    // des iframes, et ce sont elles qui rapportent leur propre expérience. Lui
    // donner une adresse d'API pour trois nombres ajouterait une variable à la
    // chaîne de déploiement pour mesurer un cadre.
    ...provideSentry({
      dsn: AUTH_ENV.sentryDsn,
      release: AUTH_ENV.appRevision,
      front: OPS_NODE,
    }),
    // Les quatre mots que fold dit de lui-même, traduits UNE fois. Sans ce
    // fournisseur, chaque champ répétait `optionalLabel="facultatif"` (25 fois
    // dans 9 fichiers), et « More information » partait en anglais au lecteur
    // d'écran sur chaque bulle d'aide.
    provideFoldCommonLabels({
      optional: "facultatif",
      info: "En savoir plus",
      clear: "Effacer",
      loading: "Chargement…",
    }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    ...(DEV_BYPASS_AUTH ? [] : [provideSuiteAuth()]),
    // Le bridge postMessage est démarré depuis `App` (post-bootstrap), pas ici :
    // en APP_INITIALIZER, résoudre AuthFacade→AuthService trop tôt casse (NG0200).
  ],
};
