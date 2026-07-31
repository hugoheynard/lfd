import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { provideSuiteAuth } from './auth/auth.providers';

/**
 * Config de l'app hôte. Browser-only (pas de SSR), donc Auth0 est fourni
 * directement ici — pas de garde d'isomorphisme à ménager. Le shell détient la
 * session ; les remotes n'apportent aucun provider d'auth.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    provideSuiteAuth(),
  ],
};
