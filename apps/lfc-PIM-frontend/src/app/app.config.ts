import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { providePimIcons } from './pim-icons';
import { SuiteEmbed } from './suite-embed/suite-embed';
import { provideFoldCommonLabels } from 'fold-ng';

// App browser-only (pas de SSR — la suite est CSR). HttpClient en mode `fetch`
// (pas de polyfill xhr2) : catalogue, publication et intégrations parlent tous
// au backend PIM. Icônes custom via `providePimIcons()`.
export const appConfig: ApplicationConfig = {
  providers: [
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
    provideHttpClient(withFetch()),
    providePimIcons(),
    // Vie embarquée dans la suite (hello + sync route + relais token). No-op en
    // standalone.
    provideAppInitializer(() => inject(SuiteEmbed).init()),
  ],
};
