import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import { go, settleSignedIn } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';
import { VISITOR_WORLD } from './visitor-world';

/** **1 · Bienvenue** — l'accueil public, l'accueil connecté, l'accueil de l'espace société. */
export const WELCOME: Readonly<Record<ShopCopyAudience, PreviewJourney>> = {
  visitor: { world: VISITOR_WORLD, enter: (injector) => go(injector, '/bienvenue') },
  personal: {
    world: PERSON_WORLD,
    enter: async (injector) => {
      await settleSignedIn(injector, true);
      await go(injector, '/bienvenue');
    },
  },
  pro: {
    world: PRO_WORLD,
    enter: async (injector) => {
      await settleSignedIn(injector, true);
      await go(injector, '/bienvenue');
    },
  },
};
