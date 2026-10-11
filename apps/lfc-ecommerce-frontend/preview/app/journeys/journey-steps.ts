import { effect, type Injector, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCart } from '../../../src/app/client/cart/client-cart.service';
import { ClientWorkspace } from '../../../src/app/client/client-workspace.service';
import { ShopCatalogue } from '../../../src/app/client/shop/shop-catalogue.store';
import { formatHour } from '../../../src/app/client/format-hour';
import { OrderContextStore } from '../../../src/app/client/order-context.store';
import { DEMO_CART } from '../demo-data/demo-catalogue';
import { demoDay } from '../demo-data/demo-days';
import { DEMO_LAB_ID, DEMO_PICKUP_ADDRESSES } from '../demo-data/demo-places';

/**
 * **Les gestes des parcours** — chacun passe par une API PUBLIQUE de la
 * boutique (un store, un dialogue, le routeur), comme un client le ferait.
 * Aucun n'écrit l'état d'un écran par en dessous : un parcours qui ne se
 * jouerait plus dirait qu'un écran a changé, au lieu de le masquer.
 */

/**
 * Le plus longtemps qu'un parcours attend un état (le catalogue, la personne) :
 * au-delà, il continue avec ce qu'il a — un aperçu figé vaut moins qu'un
 * aperçu incomplet. Le backend de démonstration répond en une tâche.
 */
const SETTLE_MS = 3000;

/** Attend qu'une condition sur des signaux soit vraie (au plus {@link SETTLE_MS}). */
export function until(injector: Injector, ready: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, SETTLE_MS);
    const watcher = effect(
      () => {
        if (ready()) {
          untracked(done);
        }
      },
      { injector, manualCleanup: true },
    );
    function done(): void {
      clearTimeout(timer);
      watcher.destroy();
      resolve();
    }
  });
}

/** Va à un écran de la boutique. */
export async function go(injector: Injector, url: string): Promise<void> {
  await injector.get(Router).navigateByUrl(url);
}

/**
 * Attend que l'espace de la personne soit connu (`GET /me`). Un visiteur n'en
 * a pas : rien à attendre. Le panier et le lieu se posent APRÈS — un
 * changement d'espace les effacerait.
 */
export async function settleSignedIn(injector: Injector, signedIn: boolean): Promise<void> {
  if (signedIn) {
    const workspace = injector.get(ClientWorkspace);
    await until(injector, () => workspace.current() !== null);
  }
}

/**
 * Remplit le panier de démonstration — APRÈS le catalogue, comme un client :
 * le panier refuse une référence que le rayon n'a pas encore montrée.
 */
export async function fillCart(injector: Injector): Promise<void> {
  const cart = injector.get(ClientCart);
  const catalogue = injector.get(ShopCatalogue);
  void catalogue.hydrate();
  await until(injector, () => catalogue.status() === 'ready');
  for (const [sku, quantity] of Object.entries(DEMO_CART)) {
    cart.setQuantity(sku, quantity);
  }
}

/** Le panier chiffré : le catalogue est arrivé, le devis aussi. */
export async function settleCart(injector: Injector): Promise<void> {
  const cart = injector.get(ClientCart);
  await until(injector, () => cart.lines().length > 0 && cart.pricing() === 'ready');
}

const LAB = DEMO_PICKUP_ADDRESSES.find((point) => point.id === DEMO_LAB_ID);

/** Choisit le Labo, demain à 8 h — ce que les dialogues « où » puis « quand » auraient posé. */
export function chooseLabTomorrow(injector: Injector): void {
  if (LAB === undefined) {
    return;
  }
  injector.get(OrderContextStore).choice.set({
    mode: 'pickup',
    place: LAB.label,
    at: 'au Labo',
    address: `${LAB.ligne1}, ${LAB.ville}`,
    pickupAddressId: LAB.id,
    slot: formatHour('08:00'),
    window: { start: '08:00', end: '08:30' },
    date: demoDay(1),
  });
}

/** Ouvre le panier par-dessus le rayon, comme la pastille de la barre. */
export async function openCart(injector: Injector): Promise<void> {
  const { CartDialog } = await import('../../../src/app/client/cart/cart-dialog/cart-dialog');
  CartDialog.open(injector.get(FoldPanelHostService));
}
