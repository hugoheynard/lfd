import type { Injector } from '@angular/core';

import { go, settleSignedIn } from './journey-steps';
import type { PreviewJourney, PreviewWorld } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';

function screen(world: PreviewWorld, url: string): PreviewJourney {
  return {
    world,
    enter: async (injector: Injector) => {
      await settleSignedIn(injector, true);
      await go(injector, url);
    },
  };
}

/** **Hors commande, particulier** — « Mes commandes » et « Ma fidélité ». */
export const PERSONAL_OUTSIDE = {
  orders: screen(PERSON_WORLD, '/mes-commandes'),
  loyalty: screen(PERSON_WORLD, '/ma-fidelite'),
} as const;

/** **Hors commande, pro** — « Mes commandes » de la société et son compte. */
export const PRO_OUTSIDE = {
  orders: screen(PRO_WORLD, '/mes-commandes'),
  account: screen(PRO_WORLD, '/mon-compte'),
} as const;
