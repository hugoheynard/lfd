import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import { atShelf } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';
import { VISITOR_WORLD } from './visitor-world';

/** **4 · Boutique** — le rayon avec un panier en cours : TTC, TTC, et HT dans l'espace société. */
export const SHOP: Readonly<Record<ShopCopyAudience, PreviewJourney>> = {
  visitor: { world: VISITOR_WORLD, enter: (injector) => atShelf(injector, false) },
  personal: { world: PERSON_WORLD, enter: (injector) => atShelf(injector, true) },
  pro: { world: PRO_WORLD, enter: (injector) => atShelf(injector, true) },
};
