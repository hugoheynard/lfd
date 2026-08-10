import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { provideFoldToasts } from 'fold-ng';

import { routes } from './app.routes';
import { provideStaffAuth } from './auth/auth.providers';
import { SuiteEmbed } from './suite-embed/suite-embed';

// App browser-only (pas de SSR — la suite est CSR). HttpClient en mode `fetch`
// pour appeler la surface `/admin/*` du backend B2B.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // `withComponentInputBinding` : un segment de route arrive dans un `input()`
    // du composant, sans passer par `ActivatedRoute`. C'est ce qui permet à une
    // page de détail de se charger depuis son ADRESSE, donc de survivre à un
    // rafraîchissement et à un lien partagé.
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Sans ça, un enfant de `comptes-clients/:id` ne verrait PAS le paramètre
      // du parent : `withComponentInputBinding` lit la route du composant, et
      // les paramètres ne descendent pas par défaut. Les quatre vues d'un compte
      // échoueraient à l'exécution sur un `input.required` non fourni — invisible
      // au build, visible au premier clic.
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    provideHttpClient(withFetch()),
    // Session Auth0 **propre à cette app**, fournie uniquement quand elle tourne
    // hors du shell (sinon la suite authentifie, et une iframe tierce ne peut de
    // toute façon pas rejouer `checkSession`). Cf. `auth.providers.ts`.
    provideStaffAuth(),
    // Toasts d'opération (succès/échec). Durées par défaut de fold : succès bref,
    // erreur **sticky** (à fermer, pas à rater).
    provideFoldToasts({}),
    // Vie embarquée dans la suite (hello + sync route + relais token). No-op en
    // standalone.
    provideAppInitializer(() => inject(SuiteEmbed).init()),
  ],
};
