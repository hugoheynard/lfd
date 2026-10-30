import { InjectionToken } from '@angular/core';

import { SHOP_PUBLIC_URL_VALUE } from '../../api/api.env.generated';

/**
 * L'adresse publique de la boutique, injectée au build (`SHOP_PUBLIC_URL`, cf.
 * `scripts/generate-api-config.mjs` — en déployé la variable `LFC_BOUTIQUE_URL`,
 * la même que `CLIENT_BASE_URL` de l'API). Par injection : un test la pose
 * sans rebâtir.
 */
export const SHOP_PUBLIC_URL_TOKEN = new InjectionToken<string>('SHOP_PUBLIC_URL', {
  providedIn: 'root',
  factory: (): string => SHOP_PUBLIC_URL_VALUE,
});

/** Le paramètre que la boutique lit (`pickup-link.ts` de la boutique). */
const PICKUP_PARAM = 'retrait';

/**
 * **Le lien direct d'un point de retrait** — `https://…/boutique?retrait=<id>`,
 * le bouton « Commander » d'une fiche Google My Business. La boutique s'ouvre
 * avec ce point déjà retenu, puis retire le paramètre de son adresse.
 *
 * `null` quand l'adresse de la boutique est vide ou mal formée : un lien
 * relatif ne mène nulle part chez Google, on n'en fabrique pas.
 */
export function pickupDirectLink(shopUrl: string, pickupId: string): string | null {
  if (shopUrl.trim() === '') {
    return null;
  }
  try {
    const url = new URL('/boutique', shopUrl);
    url.searchParams.set(PICKUP_PARAM, pickupId);
    return url.origin === 'null' ? null : url.toString();
  } catch {
    return null;
  }
}
