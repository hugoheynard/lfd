import type { OrderPaymentIntent } from '@lfd/contracts';

import { DEMO_CART } from './demo-catalogue';
import { DEMO_LAB_ID } from './demo-places';
import { demoQuote } from './demo-quote';

/**
 * L'intention de paiement des parcours qui règlent en ligne. Le secret et la
 * clé sont des chaînes que personne ne lit : l'aperçu ne charge pas Stripe
 * (`demo-stripe-loader.ts`). Le montant est celui du panier de démonstration
 * retiré au Labo, pour que le bouton « Payer » dise un nombre cohérent.
 */
export const DEMO_PAYMENT: OrderPaymentIntent = {
  clientSecret: 'apercu_sans_secret',
  publishableKey: 'pk_apercu',
  amountCents: demoQuote({
    lines: Object.entries(DEMO_CART).map(([sku, quantity]) => ({ sku, quantity })),
    fulfillment: { method: 'pickup', pickupAddressId: DEMO_LAB_ID },
  }).totalCents,
};
