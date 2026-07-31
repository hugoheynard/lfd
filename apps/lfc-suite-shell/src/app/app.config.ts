import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { provideSuiteAuth } from './auth/auth.providers';
import { DEV_BYPASS_AUTH } from './auth/dev-flags';
import { SuiteBridge } from './suite/suite-bridge';

/**
 * Config de l'app hôte. Browser-only (pas de SSR), donc Auth0 est fourni
 * directement ici — pas de garde d'isomorphisme à ménager. Le shell détient la
 * session ; les remotes n'apportent aucun provider d'auth.
 *
 * En bypass de dev, Auth0 n'est PAS fourni (const `DEV_BYPASS_AUTH` repliée à
 * `false` en prod → `provideSuiteAuth()` réintégré et DCE retire la branche
 * vide) : ni SDK, ni checkSession, ni placeholder-clientId qui pédale.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    ...(DEV_BYPASS_AUTH ? [] : [provideSuiteAuth()]),
    // Le bridge postMessage écoute dès le boot (relais de token + sync d'URL).
    provideAppInitializer(() => inject(SuiteBridge).start()),
  ],
};
