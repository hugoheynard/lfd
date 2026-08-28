import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideFoldCommonLabels, provideFoldToasts } from 'fold-ng';

import { routes } from './app.routes';
import { AUTH_CONFIG } from './auth/auth.config';
import { ADDRESS_WRITER, LFD_NOTIFY } from '@lfd/b2b-ui/panel';

import { AddressesService } from './legacy/entreprises/addresses.service';
import { NotifyService } from './notify.service';
import { provideAuth } from './auth/auth.providers';
import { provideSentry, provideWebVitals } from '@lfd/front-ops';

/** L'identifiant de CE front dans la topologie OPS — la couture avec la carte. */
const OPS_NODE = 'b2b-front';

// App **browser-only** (déployée en statique sur Cloudflare Pages, pas de SSR) :
// HttpClient en mode `fetch` (pas de polyfill xhr2), et Auth0 fourni directement
// ici — le SDK n'est pas isomorphe mais il n'y a plus de rendu serveur à ménager.
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
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideAuth(),
    // Toasts d'opération (succès/échec) : succès bref, erreur sticky (défauts fold).
    provideFoldToasts({}),
    // Le port de retour d'opération de `@lfd/b2b-ui` : les panneaux de la lib
    // annoncent succès et échec sans rien savoir de nos toasts ni du filtrage
    // d'erreurs de `@lfd/endpoints`.
    { provide: LFD_NOTIFY, useExisting: NotifyService },
    // L'écriture d'adresse, côté CLIENT : `/companies/:id/…`, murée par
    // l'adhésion de la personne à l'entreprise.
    { provide: ADDRESS_WRITER, useExisting: AddressesService },
    // Ce que les vraies personnes vivent, renvoyé à notre API : la sonde dit
    // que ce front est SERVI, ces trois mesures disent s'il est utilisable.
    provideWebVitals(OPS_NODE, AUTH_CONFIG.apiBaseUrl),
    // Ce qui casse dans leur navigateur, et qui ne laisse aucune trace chez
    // nous — ni 5xx, ni ligne de journal : une page blanche et quelqu'un qui
    // s'en va. Sans DSN, rien n'est branché, et le SDK n'est même pas chargé.
    ...provideSentry({
      dsn: AUTH_CONFIG.sentryDsn,
      release: AUTH_CONFIG.appRevision,
      front: OPS_NODE,
    }),
  ],
};
