import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideFoldToasts } from 'fold-ng';

import { routes } from './app.routes';
import { provideAuth } from './auth/auth.providers';

// App **browser-only** (déployée en statique sur Cloudflare Pages, pas de SSR) :
// HttpClient en mode `fetch` (pas de polyfill xhr2), et Auth0 fourni directement
// ici — le SDK n'est pas isomorphe mais il n'y a plus de rendu serveur à ménager.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideAuth(),
    // Toasts d'opération (succès/échec) : succès bref, erreur sticky (défauts fold).
    provideFoldToasts({}),
  ],
};
