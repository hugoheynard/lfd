import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideFoldIcons } from 'fold-ng';

import { routes } from './app.routes';

// Glyphe « sac » générique enregistré sous `shopify` — on évite de reproduire le
// logo Shopify (marque déposée). Rendu en currentColor comme les icônes fold.
const SHOPIFY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6 8h12l-.8 11.2A2 2 0 0 1 15.2 21H8.8a2 2 0 0 1-2-1.8L6 8Z"/>' +
  '<path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';

// Menu kebab : trois points verticaux.
const KEBAB_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor">' +
  '<circle cx="12" cy="5" r="1.7"/>' +
  '<circle cx="12" cy="12" r="1.7"/>' +
  '<circle cx="12" cy="19" r="1.7"/></svg>';

// POC frontend-only : plus aucun service ne fait de HTTP (tout passe par LocalDb),
// donc pas de provideHttpClient — ça évite d'embarquer le polyfill xhr2.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    provideFoldIcons({ shopify: SHOPIFY_ICON, kebab: KEBAB_ICON }),
  ],
};
