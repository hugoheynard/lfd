import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideFoldIcons, provideFoldToasts } from 'fold-ng';

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
    // Icône panier (absente du jeu fold intégré), enregistrée pour le
    // déclencheur d'en-tête et le panneau panier.
    provideFoldIcons({
      cart:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
        '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    }),
  ],
};
