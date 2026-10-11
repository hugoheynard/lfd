import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import type { Injector } from '@angular/core';

import { atShelf, openCart } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';
import { VISITOR_WORLD } from './visitor-world';

async function cartOpen(injector: Injector, signedIn: boolean): Promise<void> {
  await atShelf(injector, signedIn);
  await openCart(injector);
}

/**
 * **5 · Mon panier** — ouvert par-dessus le rayon : « qui passe cette
 * commande » (saisie invité ou connexion) pour le visiteur ; le panier du
 * particulier ; « au compte · carte » pour le pro.
 */
export const CART: Readonly<Record<ShopCopyAudience, PreviewJourney>> = {
  visitor: { world: VISITOR_WORLD, enter: (injector) => cartOpen(injector, false) },
  personal: { world: PERSON_WORLD, enter: (injector) => cartOpen(injector, true) },
  pro: { world: PRO_WORLD, enter: (injector) => cartOpen(injector, true) },
};
