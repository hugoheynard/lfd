import { fillCart, go, openCart } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { VISITOR_WORLD } from './visitor-world';

/** Visiteur, panier sans lieu : le rayon, sa barre, et le panier ouvert (§6). */
export const VISITOR_CART_WITHOUT_PLACE: PreviewJourney = {
  id: 'visitor-cart-without-place',
  world: VISITOR_WORLD,
  enter: async (injector) => {
    await fillCart(injector);
    await go(injector, '/boutique');
    await openCart(injector);
  },
};
