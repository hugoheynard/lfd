import type { ShopCopyAudience } from '@lfd/contracts/shop-copy-preview';

import type { Injector } from '@angular/core';

import { go, openLabTime, settleSignedIn } from './journey-steps';
import type { PreviewJourney } from './preview-world';
import { PERSON_WORLD, PRO_WORLD } from './signed-in-worlds';
import { VISITOR_WORLD } from './visitor-world';

async function chooseTime(injector: Injector, signedIn: boolean): Promise<void> {
  await settleSignedIn(injector, signedIn);
  await go(injector, '/bienvenue');
  openLabTime(injector);
}

/**
 * **3 · Horaire** — le sélecteur de créneau du Labo. Pour le pro aussi : une
 * livraison n'a pas de grille d'heures (le dialogue d'adresse rend une fenêtre
 * complète, cf. `OrderDoors.delivery`), le seul créneau qu'un pro choisit est
 * celui d'un retrait.
 */
export const TIME: Readonly<Record<ShopCopyAudience, PreviewJourney>> = {
  visitor: { world: VISITOR_WORLD, enter: (injector) => chooseTime(injector, false) },
  personal: { world: PERSON_WORLD, enter: (injector) => chooseTime(injector, true) },
  pro: { world: PRO_WORLD, enter: (injector) => chooseTime(injector, true) },
};
