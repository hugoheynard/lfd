import { DEMO_LOYALTY_CLOSED, DEMO_PRO } from '../demo-data/demo-accounts';
import { chooseLabTomorrow, fillCart, go, openCart, settleSignedIn } from './journey-steps';
import type { PreviewJourney } from './preview-world';

/**
 * Pro au compte : une société active, crédit mensuel accordé ; le panier
 * ouvert propose « au compte » ou la carte (§6). Une commande au compte ne
 * passe pas par Stripe : la passation simulée ne rend pas d'intention.
 */
export const PRO_ON_ACCOUNT: PreviewJourney = {
  id: 'pro-on-account',
  world: {
    account: DEMO_PRO,
    opening: { ordersOpenToB2b: true, ordersOpenToB2c: true },
    loyalty: DEMO_LOYALTY_CLOSED,
    placement: {},
  },
  enter: async (injector) => {
    await settleSignedIn(injector, true);
    await fillCart(injector);
    chooseLabTomorrow(injector);
    await go(injector, '/boutique');
    await openCart(injector);
  },
};
