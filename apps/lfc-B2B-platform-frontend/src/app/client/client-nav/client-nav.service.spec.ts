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
  { path: 'mon-espace', children: [] },
  { path: 'nouvelle-commande/panier', children: [] },
];

/** L'ordre que la réf FIGE, et qu'aucune surface n'a le droit de réarranger. */
const ORDER = ['espace', 'orders', 'invoices', 'baskets', 'account'];

describe('Les destinations du menu', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter(ROUTES)] });
  });

  it('garde le même ordre, panier vide comme panier plein', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);

    TestBed.inject(ClientCart).add('croissant');
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);
  });

  it('ne porte PAS le panier — il vit dans la barre, pas dans le menu', () => {
    const nav = TestBed.inject(ClientNav);
    TestBed.inject(ClientCart).add('croissant');
    // Une quantité qui change en permanence appartient au chrome permanent : si
    // le panier revenait ici, il y aurait deux endroits où lire le même nombre.
    expect(nav.items().some((i) => i.id === 'cart')).toBe(false);
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

  it('compte les gabarits récurrents SANS les marquer — ils n’appellent rien', () => {
    const baskets = TestBed.inject(ClientNav)
      .items()
      .find((i) => i.id === 'baskets');
    expect(baskets?.countShort).toBe('2');
    expect(baskets?.warn).toBe(false);
  });

  it('suit la NAVIGATION — l’onglet actif ne reste pas figé sur la première page', async () => {
    const nav = TestBed.inject(ClientNav);
    const router = TestBed.inject(Router);
    // ⚠️ Le vrai piège : `Router.url` est une propriété nue. Une dérivation qui
    // la lit sans dépendre des événements ne se recalcule jamais, et rien dans
    // un rendu isolé ne le montre — il faut naviguer pour le voir.
    await router.navigateByUrl('/nouvelle-commande/panier');
    expect(nav.current()).toBe('/nouvelle-commande/panier');

    await router.navigateByUrl('/mon-espace');
    expect(nav.current()).toBe('/mon-espace');
  });

  it('déclare inertes les destinations dont l’écran n’existe pas encore', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().find((i) => i.id === 'espace')?.ready).toBe(true);
    // Les paniers récurrents sont la dernière destination sans écran. Le drapeau
    // ne retire PAS l'entrée : l'ordre des cinq ne bouge jamais d'une surface à
    // l'autre, et l'habitude du pouce avec.
    expect(nav.items().find((i) => i.id === 'baskets')?.ready).toBe(false);
  });
});
