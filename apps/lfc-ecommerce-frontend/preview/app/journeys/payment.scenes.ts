import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import type { Injector } from '@angular/core';

import type { PlacedOrder } from '../../../src/app/client/client-orders.service';
import { DEMO_PAYMENT } from '../demo-data/demo-payment';
import { go, placeAsGuest, placeSignedIn } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';
import { VISITOR_WORLD } from './visitor-world';

async function toPayment(injector: Injector, order: PlacedOrder | null): Promise<void> {
  await go(injector, order === null ? '/boutique' : `/reglement/${order.id}`);
}

/**
 * **6 · Paiement** — l'écran de règlement, l'élément Stripe remplacé (§6).
 *
 * ⚠️ Au compte, il n'y a PAS d'étape de paiement : la commande passe droit à
 * la confirmation. Ce que montre la case pro est donc le règlement PAR CARTE
 * d'un pro — « payer comptant reste toujours possible » (`ClientOrders.place`)
 * — et l'éditeur le dit à côté de l'étape.
 */
export const PAYMENT: Readonly<Record<ShopCopyAudience, PreviewJourney>> = {
  visitor: {
    world: VISITOR_WORLD,
    enter: async (injector) => toPayment(injector, await placeAsGuest(injector)),
  },
  personal: {
    world: PERSON_WORLD,
    enter: async (injector) => toPayment(injector, await placeSignedIn(injector, 'card')),
  },
  pro: {
    world: { ...PRO_WORLD, placement: { payment: DEMO_PAYMENT } },
    enter: async (injector) => toPayment(injector, await placeSignedIn(injector, 'card')),
  },
};
