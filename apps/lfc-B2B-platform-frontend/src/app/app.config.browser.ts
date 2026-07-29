import { mergeApplicationConfig, type ApplicationConfig } from '@angular/core';

import { appConfig } from './app.config';
import { provideAuth } from './auth/auth.providers';

/**
 * Config **navigateur** = config partagée + Auth0.
 *
 * Importée uniquement par `main.ts` (l'entrée client). Le pré-rendu serveur
 * passe par `app.config.server.ts` → `appConfig` seul, sans Auth0 : c'est ce
 * qui garantit que le SDK (non isomorphe) n'est jamais instancié hors
 * navigateur.
 */
export const browserConfig: ApplicationConfig = mergeApplicationConfig(appConfig, {
  providers: [provideAuth()],
});
