import {
  DEMO_LOYALTY_CLOSED,
  DEMO_LOYALTY_OPEN,
  DEMO_PERSON,
  DEMO_PRO,
} from '../demo-data/demo-accounts';
import { DEMO_PAYMENT } from '../demo-data/demo-payment';
import type { PreviewWorld } from './preview-world';

/**
 * Le monde d'un PARTICULIER connecté : la boutique ouverte aux deux
 * clientèles, la fidélité ouverte, une commande qui se règle en ligne.
 */
export const PERSON_WORLD: PreviewWorld = {
  account: DEMO_PERSON,
  opening: { ordersOpenToB2b: true, ordersOpenToB2c: true },
  loyalty: DEMO_LOYALTY_OPEN,
  placement: { payment: DEMO_PAYMENT },
};

/**
 * Le monde d'un PRO dans l'espace de sa société, au compte : la fidélité
 * fermée (pas de fidélité en pro, Hugo 2026-09-27), et une passation qui ne
 * rend pas d'intention de paiement — la commande est facturée au compte.
 */
export const PRO_WORLD: PreviewWorld = {
  account: DEMO_PRO,
  opening: { ordersOpenToB2b: true, ordersOpenToB2c: true },
  loyalty: DEMO_LOYALTY_CLOSED,
  placement: { settlement: 'account' },
};
