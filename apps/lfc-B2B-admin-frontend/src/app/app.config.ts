import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { provideFoldCommonLabels, provideFoldToasts } from 'fold-ng';

import { routes } from './app.routes';
import { provideStaffAuth } from './auth/auth.providers';
import { staffAuthInterceptor } from './auth/staff-auth.interceptor';
import { SuiteEmbed } from './suite-embed/suite-embed';

// App browser-only (pas de SSR — la suite est CSR). HttpClient en mode `fetch`
// pour appeler la surface `/admin/*` du backend B2B.
export const appConfig: ApplicationConfig = {
  providers: [
    // Les quatre mots que fold dit de lui-même, traduits UNE fois. Sans ce
    // fournisseur, chaque champ répétait `optionalLabel="facultatif"` (25 fois
    // dans 9 fichiers), et « More information » partait en anglais au lecteur
    // d'écran sur chaque bulle d'aide.
    provideFoldCommonLabels({
      optional: 'facultatif',
      info: 'En savoir plus',
      clear: 'Effacer',
      loading: 'Chargement…',
    }),
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
    // Un seul point d'attache du jeton staff, pour que treize services n'aient
    // pas à s'en souvenir chacun (sept l'avaient oublié). Cf. `staff-auth.interceptor.ts`.
    provideHttpClient(withFetch(), withInterceptors([staffAuthInterceptor])),
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
