import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { SubscriptionView } from '@lfd/contracts';

import { ClientSubscriptions } from '../client-subscriptions.service';

import { hydrateWith, TEST_CATALOGUE } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientCart } from '../cart/client-cart.service';
import { provideRecognised } from '../client-orders.fixture';
import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { LIVE_PICKUP } from '../mes-commandes/order-view.fixture';
import { ClientNav } from './client-nav.service';

/** De quoi naviguer : le routeur refuse une adresse qu'aucune route ne couvre. */
const ROUTES = [
  { path: 'mon-espace', children: [] },
  { path: 'nouvelle-commande/boutique', children: [] },
  { path: 'nouvelle-commande/panier', children: [] },
];

/** L'ordre que la réf FIGE, et qu'aucune surface n'a le droit de réarranger. */
const ORDER = ['espace', 'shop', 'orders', 'invoices', 'baskets', 'account'];

describe('Les destinations du menu', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  });

  it('garde le même ordre, panier vide comme panier plein', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);

    TestBed.inject(ClientCart).add('VIE-001');
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);
  });

  it('ne porte PAS le panier — il vit dans la barre, pas dans le menu', () => {
    const nav = TestBed.inject(ClientNav);
    TestBed.inject(ClientCart).add('VIE-001');
    // Une quantité qui change en permanence appartient au chrome permanent : si
    // le panier revenait ici, il y aurait deux endroits où lire le même nombre.
    expect(nav.items().some((i) => i.id === 'cart')).toBe(false);
  });

  /**
   * 🔴 Ce compteur lisait le `localStorage` pendant que l'écran qu'il annonce
   * lit le serveur : le badge pouvait dire « 0 » devant une liste pleine. Il
   * compte désormais ce que la MÊME source rend.
   */
  it('compte les commandes que le SERVEUR rend, pas celles du navigateur', () => {
    TestBed.inject(ClientOrderHistory).receive([LIVE_PICKUP]);

    const orders = TestBed.inject(ClientNav)
      .items()
      .find((i) => i.id === 'orders');
    expect(orders?.countShort).toBe('1');
  });

  /**
   * 🔴 Les factures portaient « 1 à régler », une constante, devant une
   * destination qui n'a aucun modèle : rien n'émet de facture. Une pastille
   * d'alerte devant un écran vide est la pire des maquettes — elle fait ouvrir
   * l'écran.
   */
  it('n’annonce AUCUNE facture, faute de facturation', () => {
    const invoices = TestBed.inject(ClientNav)
      .items()
      .find((i) => i.id === 'invoices');
    expect(invoices?.countShort).toBe('');
    expect(invoices?.warn).toBe(false);
  });

  it('compte les gabarits récurrents SANS les marquer — ils n’appellent rien', () => {
    TestBed.inject(ClientSubscriptions).receive([{}, {}] as SubscriptionView[]);

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

  /**
   * La boutique était atteignable et pourtant annoncée nulle part : il fallait
   * ouvrir « Nouvelle commande » et répondre à la question du mode de service
   * pour voir le catalogue — alors que le rayon se visite sans rien choisir.
   * Ce test fige l'adresse autant que la présence : pointer la tuile
   * `/nouvelle-commande` la ferait rentrer par la question qu'elle contourne.
   */
  it('mène AU RAYON, pas à la question du mode de service', async () => {
    const nav = TestBed.inject(ClientNav);
    const shop = nav.items().find((i) => i.id === 'shop');
    expect(shop?.route).toBe('/nouvelle-commande/boutique');
    expect(shop?.ready).toBe(true);
    // Aucun compteur : un rayon ne se compte pas, il se parcourt.
    expect(shop?.countShort).toBe('');

    await TestBed.inject(Router).navigateByUrl('/nouvelle-commande/boutique');
    expect(nav.current()).toBe('/nouvelle-commande/boutique');
  });

  it('déclare inertes les destinations dont l’écran n’existe pas encore', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().find((i) => i.id === 'espace')?.ready).toBe(true);
    // Les paniers récurrents sont la dernière destination sans écran. Le drapeau
    // ne retire PAS l'entrée : l'ordre des six ne bouge jamais d'une surface à
    // l'autre, et l'habitude du pouce avec.
    expect(nav.items().find((i) => i.id === 'baskets')?.ready).toBe(false);
  });
});
