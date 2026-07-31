import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { providePimIcons } from './pim-icons';

// App browser-only (pas de SSR — la suite est CSR). HttpClient en mode `fetch`
// pour l'intégration Shopify (pas de polyfill xhr2) ; le reste du catalogue
// reste sur LocalDb. Icônes custom via `providePimIcons()` (partagé avec le
// remote-entry fédéré).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    providePimIcons(),
  ],
};
