import { DEMO_LOYALTY_OPEN } from '../demo-data/demo-accounts';
import { DEMO_PAYMENT } from '../demo-data/demo-payment';
import type { PreviewWorld } from './preview-world';

/**
 * Le monde d'un VISITEUR : personne de connecté, la boutique ouverte aux deux
 * clientèles, une commande qui se règle en ligne. Les parcours visiteurs n'en
 * changent que ce qui les distingue.
 */
export const VISITOR_WORLD: PreviewWorld = {
  account: null,
  opening: { ordersOpenToB2b: true, ordersOpenToB2c: true },
  loyalty: DEMO_LOYALTY_OPEN,
  placement: { payment: DEMO_PAYMENT },
};
