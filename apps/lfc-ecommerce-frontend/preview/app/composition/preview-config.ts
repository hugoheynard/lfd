import { HttpBackend, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { ADDRESS_WRITER, LFD_NOTIFY } from '@lfd/b2b-ui/panel';
import { provideFoldCommonLabels, provideFoldToasts } from 'fold-ng';

import { routes } from '../../../src/app/app.routes';
import { AuthFacade } from '../../../src/app/auth/auth.facade';
import { workspaceInterceptor } from '../../../src/app/client/client-workspace.interceptor';
import { ClientCopyService } from '../../../src/app/client/copy/client-copy.service';
import { ClientFeatureAccess } from '../../../src/app/client/feature-access/client-feature-access.service';
import { StripeLoader } from '../../../src/app/client/stripe-loader.service';
import { AddressesService } from '../../../src/app/legacy/entreprises/addresses.service';
import { NotifyService } from '../../../src/app/notify.service';
import { CopyMarkers } from '../copy-picking/copy-markers';
import { MarkedCopyService } from '../copy-picking/marked-copy.service';
import { PREVIEW_WORLD, type PreviewWorld } from '../journeys/preview-world';
import { DemoAuthFacade } from './demo-auth.facade';
import { DemoHttpBackend } from './demo-http-backend';
import { DemoStripeLoader } from './demo-stripe-loader';

/**
 * Les quatre mots que fold dit de lui-même — RECOPIÉS de `app.config.ts`, et
 * c'est délibéré : les en extraire changeait le bundle de production de la
 * boutique (mesuré le 2026-10-11 : +10 octets, chunks renommés), et ce lot
 * promet de ne pas le toucher. Ils ne s'affichent que dans les champs
 * facultatifs, les bulles d'aide et les chargements.
 */
const FOLD_COMMON_LABELS = {
  optional: 'facultatif',
  info: 'En savoir plus',
  clear: 'Effacer',
  loading: 'Chargement…',
} as const;

/**
 * **La composition de l'aperçu** — celle de la boutique (`app.config.ts`),
 * moins tout ce qui touche le monde, plus ses remplaçants (plan
 * `plan-textes-de-la-boutique.md`, §10 B3).
 *
 * Ce qui est GARDÉ, à l'identique : le routeur et ses routes, les libellés de
 * fold, les toasts, l'intercepteur d'espace, l'accès aux fonctionnalités,
 * les ports de `@lfd/b2b-ui`.
 *
 * Ce qui est REMPLACÉ : l'authentification (`DemoAuthFacade`), le réseau
 * (`DemoHttpBackend` — le seul `HttpBackend`, donc la seule sortie, et elle
 * n'en est pas une), Stripe (`DemoStripeLoader`), les textes
 * (`MarkedCopyService` : les mêmes, marqués de leur clé).
 *
 * Ce qui est ABSENT, et c'est la frontière : Auth0 (`provideAuth`), Sentry,
 * les mesures (`provideWebVitals`), l'installation PWA, le rechargement d'un
 * bundle périmé et la veille de version, les deux intercepteurs qui
 * réagissent aux refus d'Auth0, et la lecture des textes publiés
 * (`ShopCopyLoader`) — l'éditeur les envoie par message.
 *
 * Aucune de ces différences n'est une branche dans le code de la boutique :
 * elles sont toutes ici.
 */
export function previewConfig(world: PreviewWorld, markers: CopyMarkers): ApplicationConfig {
  return {
    providers: [
      provideFoldCommonLabels(FOLD_COMMON_LABELS),
      provideBrowserGlobalErrorListeners(),
      provideRouter(routes),
      provideHttpClient(withInterceptors([workspaceInterceptor])),
      // APRÈS `provideHttpClient` : le dernier fournisseur d'un jeton l'emporte.
      { provide: HttpBackend, useClass: DemoHttpBackend },
      { provide: PREVIEW_WORLD, useValue: world },
      { provide: AuthFacade, useClass: DemoAuthFacade },
      { provide: StripeLoader, useClass: DemoStripeLoader },
      { provide: CopyMarkers, useValue: markers },
      { provide: ClientCopyService, useClass: MarkedCopyService },
      provideAppInitializer(() => {
        void inject(ClientFeatureAccess).load();
      }),
      provideFoldToasts({}),
      { provide: LFD_NOTIFY, useExisting: NotifyService },
      { provide: ADDRESS_WRITER, useExisting: AddressesService },
    ],
  };
}
