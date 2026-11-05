import { inject, Injectable, type Provider } from '@angular/core';

import { BEFORE_SIGN_OUT } from '../../auth/before-sign-out';
import { CartStore } from '../cart/cart.store';
import { ContextKeyedMemory } from '../context-keyed/context-keyed';
import { ShopCartSync } from '../cart/shop-cart-sync.service';
import { OrderContextStore } from '../order-context.store';
import { ERASED_ON_SIGN_OUT, KEPT_ON_SIGN_OUT, matches } from './stored-keys';

/**
 * **L'oubli à la déconnexion** (plan `caching-usage/dans-quel-espace-est-le-client.md`,
 * lot a) : ce que la boutique a rangé dans ce navigateur pour la personne ne
 * survit pas à sa sortie — décision de Hugo du 2026-11-05, « supprimons le
 * maximum du local à la déconnexion ». La liste est {@link ERASED_ON_SIGN_OUT} ;
 * ce qui reste, et pourquoi, est {@link KEPT_ON_SIGN_OUT}.
 *
 * L'ordre compte, et c'est tout le geste :
 *
 * 1. **couper l'envoi différé du panier** — une écriture en attente ou en vol
 *    ne doit plus rien reposer ;
 * 2. **vider la mémoire** (panier, mode de service, lectures rangées par clé
 *    de contexte — `context-keyed/`) — un écran encore monté
 *    réécrirait sinon ce qu'il tient ;
 * 3. **effacer le stockage**, local et de session.
 *
 * ⚠️ **Une session EXPIRÉE n'oublie rien** : elle ne passe pas par `logout()`
 * (un 401, ou un visiteur au réveil). C'est hors de ce lot ; le plan le note
 * (§ 00 bis, « Session expirée »).
 *
 * Rendu serveur : `logout()` n'appelle pas les crochets hors navigateur, et
 * chaque accès au stockage est gardé ici quand même.
 */
@Injectable({ providedIn: 'root' })
export class SignOutForgetting {
  private readonly sync = inject(ShopCartSync);
  private readonly cart = inject(CartStore);
  private readonly order = inject(OrderContextStore);
  private readonly keyed = inject(ContextKeyedMemory);

  forget(): void {
    this.sync.halt();
    this.cart.forget();
    this.order.forget();
    this.keyed.clear();
    for (const store of browserStores()) {
      eraseFrom(store);
    }
  }
}

/** Branche l'oubli sur {@link BEFORE_SIGN_OUT}. */
export function provideSignOutForgetting(): Provider {
  return {
    provide: BEFORE_SIGN_OUT,
    multi: true,
    useFactory: () => {
      const forgetting = inject(SignOutForgetting);
      return () => forgetting.forget();
    },
  };
}

/** Les deux stockages, ceux que le navigateur accorde — aucun côté serveur. */
function browserStores(): Storage[] {
  const stores: Storage[] = [];
  for (const read of [() => localStorage, () => sessionStorage]) {
    try {
      if (typeof window !== 'undefined') {
        stores.push(read());
      }
    } catch {
      // Stockage refusé (mode privé strict) : il n'y a rien à effacer.
    }
  }
  return stores;
}

/** Relevé AVANT d'effacer : retirer une clé décale les index de `key(i)`. */
function eraseFrom(store: Storage): void {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key !== null) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    if (matches(ERASED_ON_SIGN_OUT, key) && !matches(KEPT_ON_SIGN_OUT, key)) {
      store.removeItem(key);
    }
  }
}
