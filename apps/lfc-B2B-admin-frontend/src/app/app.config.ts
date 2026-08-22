import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import {
  provideFoldCommonLabels,
  provideFoldInlineConfirmLabels,
  provideFoldToasts,
} from 'fold-ng';

import { provideSentry, provideWebVitals } from '@lfd/front-ops';

import { APP_REVISION_VALUE, B2B_API_BASE_VALUE, SENTRY_DSN_VALUE } from './api/api.env.generated';
import { routes } from './app.routes';
import { provideAppIcons } from './shared/icons/app-icons';
import { provideStaffAuth } from './auth/auth.providers';
import { staffAuthInterceptor } from './auth/staff-auth.interceptor';

// App browser-only (pas de SSR — la suite est CSR). HttpClient en mode `fetch`
// pour appeler la surface `/admin/*` du backend B2B.
/** L'identifiant de CE front dans la topologie OPS — la couture avec la carte. */
const OPS_NODE = 'b2b-admin-front';

export const appConfig: ApplicationConfig = {
  providers: [
    // Le catalogue d'icônes du référentiel — il en apporte que fold n'a pas.
    provideAppIcons(),
    // Ce que l'équipe vit vraiment sur cet écran, et ce qui casse dans son
    // navigateur : deux choses qu'aucune sonde ne peut constater du dehors.
    provideWebVitals(OPS_NODE, B2B_API_BASE_VALUE),
    ...provideSentry({
      dsn: SENTRY_DSN_VALUE,
      release: APP_REVISION_VALUE,
      front: OPS_NODE,
    }),
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
    // La confirmation sur place — celle que `fold-danger-zone` révèle sous un
    // bouton destructif. Ses défauts sont ANGLAIS : sans ce fournisseur, un
    // back-office entièrement français demande « Confirm / Cancel » au moment
    // précis où il faut être compris sans hésiter.
    provideFoldInlineConfirmLabels({
      confirm: 'Confirmer',
      cancel: 'Annuler',
      cancelAria: 'Annuler',
      busy: 'En cours…',
      group: 'Confirmation',
      secret: 'Saisissez pour confirmer',
      typePrompt: (match) => `Retapez « ${match} » pour confirmer`,
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
    // Session Auth0 propre à cette app. Cf. `auth.providers.ts`.
    provideStaffAuth(),
    // Toasts d'opération (succès/échec). Durées par défaut de fold : succès bref,
    // erreur **sticky** (à fermer, pas à rater).
    provideFoldToasts({}),
  ],
};
