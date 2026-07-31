import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';

import { routes } from './app.routes';
import { providePimIcons } from './pim-icons';

// L'intégration Shopify parle au backend : on active HttpClient en mode `fetch`
// (pas de polyfill xhr2). Le reste du catalogue reste sur LocalDb. Les icônes
// custom passent par `providePimIcons()` (partagé avec le remote-entry fédéré).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    providePimIcons(),
  ],
};
