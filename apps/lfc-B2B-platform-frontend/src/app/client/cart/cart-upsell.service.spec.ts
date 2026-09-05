import { TestBed } from '@angular/core/testing';

import { CartUpsell } from './cart-upsell.service';
import { ClientCart } from './client-cart.service';
import { SHOP_PRODUCTS } from '../mock-shop';

/** Toutes les gourmandises proposables, dans l'ordre du rayon. */
const TREATS = SHOP_PRODUCTS.filter((p) => p.category === 'choco' || p.category === 'patis');

describe('La relance du panier', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('propose une gourmandise sur un panier vide', () => {
    expect(TestBed.inject(CartUpsell).suggestion()).toEqual(TREATS[0] ?? null);
  });

  /** Proposer ce qu'on a déjà se lit comme un bug, pas comme une suggestion. */
  it('ne propose jamais ce qui est déjà au panier', () => {
    const upsell = TestBed.inject(CartUpsell);
    const cart = TestBed.inject(ClientCart);
    const first = upsell.suggestion();
    expect(first).not.toBeNull();

    cart.add(first?.id ?? '');

    expect(upsell.suggestion()?.id).not.toBe(first?.id);
  });

  /** Plus rien à proposer : la carte disparaît au lieu de tourner à vide. */
  it('rend null quand toutes les gourmandises sont au panier', () => {
    const cart = TestBed.inject(ClientCart);
    for (const treat of TREATS) {
      cart.add(treat.id);
    }

    expect(TestBed.inject(CartUpsell).suggestion()).toBeNull();
  });

  /** Une gourmandise retirée redevient proposable — la relance suit le panier. */
  it('repropose ce qu’on vient de retirer', () => {
    const upsell = TestBed.inject(CartUpsell);
    const cart = TestBed.inject(ClientCart);
    const first = upsell.suggestion();
    cart.add(first?.id ?? '');
    cart.remove(first?.id ?? '');

    expect(upsell.suggestion()?.id).toBe(first?.id);
  });

  it('ne propose pas un article salé, qui ne se rajoute pas par gourmandise', () => {
    expect(TestBed.inject(CartUpsell).suggestion()?.category).not.toBe('sale');
  });
});
