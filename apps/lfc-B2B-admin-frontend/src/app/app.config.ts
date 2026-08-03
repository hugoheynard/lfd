import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideFoldToasts } from 'fold-ng';

import { routes } from './app.routes';
import { SuiteEmbed } from './suite-embed/suite-embed';

// App browser-only (pas de SSR — la suite est CSR). HttpClient en mode `fetch`
// pour appeler la surface `/admin/*` du backend B2B.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    // Toasts d'opération (succès/échec). Durées par défaut de fold : succès bref,
    // erreur **sticky** (à fermer, pas à rater).
    provideFoldToasts({}),
    // Vie embarquée dans la suite (hello + sync route + relais token). No-op en
    // standalone.
    provideAppInitializer(() => inject(SuiteEmbed).init()),
  ],
};
