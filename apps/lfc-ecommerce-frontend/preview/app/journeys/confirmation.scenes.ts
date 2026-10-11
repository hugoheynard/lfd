import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import { ClientOrders } from '../../../src/app/client/client-orders.service';
import { DEMO_PAYMENT } from '../demo-data/demo-payment';
import { go, placeAsGuest, placeSignedIn } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';
import { VISITOR_WORLD } from './visitor-world';

/** Les points que la commande aurait rapportés avec un compte, et le bonus de bienvenue. */
const POINTS_WITH_ACCOUNT = 12;
const WELCOME_BONUS = 50;

/**
 * **7 · Confirmation** — la commande passée PAR LE VRAI CHEMIN, puis l'écran
 * qui le dit : l'invité, payé, avec l'invitation à créer son compte (points et
 * bonus) ; le particulier, payé ; le pro, au compte — rien à régler.
 */
export const CONFIRMATION: Readonly<Record<ShopCopyAudience, PreviewJourney>> = {
  visitor: {
    world: {
      ...VISITOR_WORLD,
      placement: {
        payment: DEMO_PAYMENT,
        loyaltyPointsWithAccount: POINTS_WITH_ACCOUNT,
        welcomeBonusPoints: WELCOME_BONUS,
      },
    },
    enter: async (injector) => {
      const order = await placeAsGuest(injector);
      if (order !== null) {
        injector.get(ClientOrders).markPaid(order.id);
      }
      await go(injector, '/confirmation-de-commande');
    },
  },
  personal: {
    world: PERSON_WORLD,
    enter: async (injector) => {
      const order = await placeSignedIn(injector, 'card');
      if (order !== null) {
        injector.get(ClientOrders).markPaid(order.id);
      }
      await go(injector, '/confirmation-de-commande');
    },
  },
  pro: {
    world: PRO_WORLD,
    enter: async (injector) => {
      await placeSignedIn(injector, 'account');
      await go(injector, '/confirmation-de-commande');
    },
  },
};
