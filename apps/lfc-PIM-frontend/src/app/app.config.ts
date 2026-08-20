import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { provideSentry, provideWebVitals } from '@lfd/front-ops';

import { routes } from './app.routes';
import { OPS_BASE_URL_VALUE, SENTRY_DSN_VALUE } from './data/api.env.generated';
import { providePimIcons } from './pim-icons';
import { SuiteEmbed } from './suite-embed/suite-embed';
import { staffTokenInterceptor } from './data/staff-token.interceptor';
import { provideFoldCommonLabels } from 'fold-ng';

// App browser-only (pas de SSR — la suite est CSR). HttpClient en mode `fetch`
// (pas de polyfill xhr2) : catalogue, publication et intégrations parlent tous
// à l'API, sous son préfixe `/pim`. Icônes custom via `providePimIcons()`.
/** L'identifiant de CE front dans la topologie OPS — la couture avec la carte. */
const OPS_NODE = 'pim-front';

export const appConfig: ApplicationConfig = {
  providers: [
    // La collecte vit à la RACINE de l'API, pas sous le préfixe `/pim` : elle
    // appartient à OPS. La dérivation est faite une fois, au générateur.
    provideWebVitals(OPS_NODE, OPS_BASE_URL_VALUE),
    ...provideSentry(SENTRY_DSN_VALUE, OPS_NODE),
    // Les quatre mots que fold dit de lui-même, traduits UNE fois. Sans ce
    // fournisseur, chaque champ répétait `optionalLabel="facultatif"` (25 fois
    // dans 9 fichiers), et « More information » partait en anglais au lecteur
    // d'écran sur chaque bulle d'aide.
    provideFoldCommonLabels({
      optional: 'facultatif',
      info: 'En savoir plus',
      clear: 'Effacer',
      loading: 'Chargement…',
    }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // `withInterceptors` : le jeton staff est attaché aux appels d'API. Le
    // référentiel n'en envoyait aucun tant que ses routes étaient ouvertes.
    provideHttpClient(withFetch(), withInterceptors([staffTokenInterceptor])),
    providePimIcons(),
    // Vie embarquée dans la suite (hello + sync route + relais token). No-op en
    // standalone.
    provideAppInitializer(() => inject(SuiteEmbed).init()),
  ],
};
