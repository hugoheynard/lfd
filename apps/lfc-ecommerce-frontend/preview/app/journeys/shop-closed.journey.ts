import { fillCart, go, openCart } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { VISITOR_WORLD } from './visitor-world';

/** Boutique fermée : les commandes fermées aux deux clientèles ; le rayon et le panier le disent (§6). */
export const SHOP_CLOSED: PreviewJourney = {
  id: 'shop-closed',
  world: { ...VISITOR_WORLD, opening: { ordersOpenToB2b: false, ordersOpenToB2c: false } },
  enter: async (injector) => {
    await fillCart(injector);
    await go(injector, '/boutique');
    await openCart(injector);
  },
};
