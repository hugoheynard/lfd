import { InjectionToken } from '@angular/core';

import { SHOP_PREVIEW_URL_VALUE } from '../../api/api.env.generated';

/**
 * L'adresse de l'application d'aperçu (`plan-textes-de-la-boutique.md`, §10
 * B3), injectée au build (`SHOP_PREVIEW_URL`, cf.
 * `scripts/generate-api-config.mjs`). Vide : l'aperçu est indisponible.
 *
 * Annotée `string` à dessein, comme `B2B_API_BASE` : le type dit ce que la
 * valeur PEUT être selon l'environnement, pas ce qu'elle vaut dans ce build.
 */
export const SHOP_PREVIEW_URL: string = SHOP_PREVIEW_URL_VALUE;

/**
 * L'origine de l'aperçu — la seule dont on accepte un message et la seule à
 * qui l'on écrit. `null` quand l'adresse est vide ou mal formée : sans origine
 * sûre, on ne parle à personne.
 */
export function previewOrigin(url: string): string | null {
  if (url.trim() === '') {
    return null;
  }
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/** L'adresse de l'aperçu, par injection : un test la pose sans rebâtir. */
export const SHOP_PREVIEW_URL_TOKEN = new InjectionToken<string>('SHOP_PREVIEW_URL', {
  providedIn: 'root',
  factory: () => SHOP_PREVIEW_URL,
});
