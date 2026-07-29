import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFoldIcons } from 'fold-ng';

import { routes } from './app.routes';

// La plateforme B2B parlera à un backend (Prisma) : HttpClient en mode `fetch`
// (pas de polyfill xhr2), prêt à câbler dès que l'API existe.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    // Aucune icône custom pour l'instant — le shell n'utilise que le jeu fold
    // intégré (home, contracts, company, folder, settings, logout, menu, close).
    provideFoldIcons({}),
  ],
};
