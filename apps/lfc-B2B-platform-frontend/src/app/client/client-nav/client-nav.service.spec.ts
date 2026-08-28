import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ClientCart } from '../client-cart.service';
import { ClientOrder, type ServiceChoice } from '../client-order.service';
import { ClientOrders } from '../client-orders.service';
import { ClientNav } from './client-nav.service';

const AT_THE_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  discount: 10,
  fee: 0,
  slot: '7 h – 8 h',
};

/** De quoi naviguer : le routeur refuse une adresse qu'aucune route ne couvre. */
const ROUTES = [
  { path: 'commande/boutique', children: [] },
  { path: 'commande/panier', children: [] },
];

/** L'ordre que la réf FIGE, et qu'aucune surface n'a le droit de réarranger. */
const ORDER = ['shop', 'cart', 'orders', 'invoices', 'account'];

describe('Les destinations du menu', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter(ROUTES)] });
  });

  it('garde le même ordre, panier vide comme panier plein', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);

    const cart = TestBed.inject(ClientCart);
    cart.add('croissant');
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);
  });

  it('ne montre AUCUNE pastille sur un panier vide — pas une pastille à zéro', () => {
    const nav = TestBed.inject(ClientNav);
    const cart = nav.items().find((i) => i.id === 'cart');
    expect(cart?.count).toBe('');
    expect(cart?.countShort).toBe('');
  });

  it('écrit le compteur long avec le montant, et le court sans', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('croissant');
    cart.add('croissant');

    const item = TestBed.inject(ClientNav)
      .items()
      .find((i) => i.id === 'cart');
    expect(item?.countShort).toBe('2');
    // Le long porte le montant : seul le menu pleine page a la largeur de l'écrire.
    expect(item?.count).toContain('2 · ');
    expect(item?.count).toContain('€');
  });

  it('compte les commandes réellement passées, pas une valeur tenue à part', () => {
    TestBed.inject(ClientOrder).choice.set(AT_THE_LABO);
    TestBed.inject(ClientCart).add('croissant');
    TestBed.inject(ClientOrders).place();

    const orders = TestBed.inject(ClientNav)
      .items()
      .find((i) => i.id === 'orders');
    expect(orders?.countShort).toBe('1');
  });

  it('marque la facture en attente — c’est ce qui APPELLE une action', () => {
    const invoices = TestBed.inject(ClientNav)
      .items()
      .find((i) => i.id === 'invoices');
    expect(invoices?.warn).toBe(true);
    expect(invoices?.count).toContain('1');
  });

  it('suit la NAVIGATION — l’onglet actif ne reste pas figé sur la première page', async () => {
    const nav = TestBed.inject(ClientNav);
    const router = TestBed.inject(Router);
    // ⚠️ Le vrai piège : `Router.url` est une propriété nue. Une dérivation qui
    // la lit sans dépendre des événements ne se recalcule jamais, et rien dans
    // un rendu isolé ne le montre — il faut naviguer pour le voir.
    await router.navigateByUrl('/commande/panier');
    expect(nav.current()).toBe('/commande/panier');

    await router.navigateByUrl('/commande/boutique');
    expect(nav.current()).toBe('/commande/boutique');
  });

  it('déclare inertes les destinations dont l’écran n’existe pas encore', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().find((i) => i.id === 'shop')?.ready).toBe(true);
    expect(nav.items().find((i) => i.id === 'account')?.ready).toBe(false);
  });
});
