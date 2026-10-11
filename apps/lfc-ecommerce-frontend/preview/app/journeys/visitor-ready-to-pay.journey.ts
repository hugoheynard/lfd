import { chooseLabTomorrow, fillCart, go, openCart } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { VISITOR_WORLD } from './visitor-world';

/**
 * Visiteur, prêt à payer : lieu, heure et deux articles ; le panier ouvert
 * pose les deux portes — la saisie invité et la connexion (§6).
 */
export const VISITOR_READY_TO_PAY: PreviewJourney = {
  id: 'visitor-ready-to-pay',
  world: VISITOR_WORLD,
  enter: async (injector) => {
    await fillCart(injector);
    chooseLabTomorrow(injector);
    await go(injector, '/boutique');
    await openCart(injector);
  },
};
