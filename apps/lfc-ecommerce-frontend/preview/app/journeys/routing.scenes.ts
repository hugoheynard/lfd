import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import type { Injector } from '@angular/core';

import { OrderDoors } from '../../../src/app/client/shop/order-doors';
import { go, settleSignedIn } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';
import { VISITOR_WORLD } from './visitor-world';

/**
 * Ouvre une porte d'acheminement depuis l'accueil — sans l'attendre : le
 * dialogue rend la main à sa fermeture. Choisir une maison y enchaîne « quand ».
 */
async function openDoor(injector: Injector, signedIn: boolean, delivery: boolean): Promise<void> {
  await settleSignedIn(injector, signedIn);
  await go(injector, '/bienvenue');
  const doors = injector.get(OrderDoors);
  void (delivery ? doors.delivery(null) : doors.pickup(null));
}

/**
 * **2 · Acheminement** — le dialogue « où ». Le visiteur et le particulier
 * voient les maisons du retrait ; le pro, la livraison et son carnet
 * d'adresses (la porte du coursier de `OrderDoors`).
 */
export const ROUTING: Readonly<Record<ShopCopyAudience, PreviewJourney>> = {
  visitor: { world: VISITOR_WORLD, enter: (injector) => openDoor(injector, false, false) },
  personal: { world: PERSON_WORLD, enter: (injector) => openDoor(injector, true, false) },
  pro: { world: PRO_WORLD, enter: (injector) => openDoor(injector, true, true) },
};
