import { DEMO_LOYALTY_OPEN, DEMO_PERSON } from '../demo-data/demo-accounts';
import { DEMO_PAYMENT } from '../demo-data/demo-payment';
import { chooseLabTomorrow, fillCart, go, openCart, settleSignedIn } from './journey-steps';
import type { PreviewJourney } from './preview-world';

/**
 * Particulier connecté : lieu, heure, panier ; le panier ouvert. « Payer » y
 * mène au règlement (élément de paiement remplacé) puis, refusé en aperçu,
 * reste sur place (§6).
 */
export const CUSTOMER_SIGNED_IN: PreviewJourney = {
  id: 'customer-signed-in',
  world: {
    account: DEMO_PERSON,
    opening: { ordersOpenToB2b: true, ordersOpenToB2c: true },
    loyalty: DEMO_LOYALTY_OPEN,
    placement: { payment: DEMO_PAYMENT },
  },
  enter: async (injector) => {
    await settleSignedIn(injector, true);
    await fillCart(injector);
    chooseLabTomorrow(injector);
    await go(injector, '/boutique');
    await openCart(injector);
  },
};
