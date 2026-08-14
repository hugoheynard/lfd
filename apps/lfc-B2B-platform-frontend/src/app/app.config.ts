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
    // Le seul glyphe encore absent du jeu fold : le téléphone (panneau contact).
    // Le panier est parti d'ici — fold a `shopping-cart`, qu'on nomme désormais.
    // ⚠️ `phone` entre dans fold à la prochaine version : cet enregistrement
    // disparaîtra avec elle.
    provideFoldIcons({
      phone:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 ' +
        '19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 ' +
        '2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    }),
  ],
};
