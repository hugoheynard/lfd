import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CartStore } from '../cart/cart.store';
import { ShopCartSync } from '../cart/shop-cart-sync.service';
import { OrderContextStore } from '../order-context.store';
import { SignOutForgetting } from './sign-out-forgetting';

/** Ce que l'app range pour une personne — chaque ligne doit disparaître. */
const ERASED_LOCAL = [
  'lfc.cart',
  'lfc.cart.savedAt',
  'lfc.cart.units',
  'lfc.cart.ws.cmp_a',
  'lfc.cart.ws.cmp_a.savedAt',
  'lfc.cart.ws.cmp_a.units',
  'lfc.order.choice',
  'lfc.order.houseDraft',
  'lfc.guest.identity',
  'lfc-last-connection',
  'lfc-b2b-commerce-company-v1',
  'lfc-b2b-cart-v1',
];

/** L'anti-double-paiement, et l'état de sortie du bypass dev. */
const KEPT_LOCAL = [
  'lfc.orders',
  'lfc.orders.cmp_a',
  'lfc.order-attempt.cmp_a',
  'lfc.order-attempt.cmp_a.voucher.v1',
  'lfc.cart-awaiting-payment.cmp_a',
  'lfc-dev-signed-out',
  '@@auth0spajs@@::client::default',
];

/** Les avis posés juste avant `logout()` survivent ; la vieille visite pro, non. */
const KEPT_SESSION = ['lfc-invitation-expired', 'lfc-identity-link-required'];

describe('SignOutForgetting — l’oubli à la déconnexion', () => {
  let halted: number;
  let cartForgot: number;
  let orderForgot: number;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    halted = 0;
    cartForgot = 0;
    orderForgot = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ShopCartSync, useValue: { halt: () => (halted += 1) } },
        { provide: CartStore, useValue: { forget: () => (cartForgot += 1) } },
        { provide: OrderContextStore, useValue: { forget: () => (orderForgot += 1) } },
      ],
    });
  });

  it('efface toutes les clés de la liste et garde l’anti-double-paiement', () => {
    for (const key of [...ERASED_LOCAL, ...KEPT_LOCAL]) {
      localStorage.setItem(key, '"x"');
    }
    for (const key of [...KEPT_SESSION, 'lfd.shop.pro-visit']) {
      sessionStorage.setItem(key, '1');
    }

    TestBed.inject(SignOutForgetting).forget();

    expect(ERASED_LOCAL.filter((key) => localStorage.getItem(key) !== null)).toEqual([]);
    expect(KEPT_LOCAL.filter((key) => localStorage.getItem(key) === null)).toEqual([]);
    expect(KEPT_SESSION.filter((key) => sessionStorage.getItem(key) === null)).toEqual([]);
    expect(sessionStorage.getItem('lfd.shop.pro-visit')).toBeNull();
  });

  it('coupe l’envoi du panier et vide la mémoire avant d’effacer', () => {
    TestBed.inject(SignOutForgetting).forget();

    expect([halted, cartForgot, orderForgot]).toEqual([1, 1, 1]);
  });

  it('une clé inconnue, hors de l’app, n’est pas touchée', () => {
    localStorage.setItem('autre-site', '1');

    TestBed.inject(SignOutForgetting).forget();

    expect(localStorage.getItem('autre-site')).toBe('1');
  });
});
