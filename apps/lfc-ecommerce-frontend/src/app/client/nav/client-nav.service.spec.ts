import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  PERSONAL_WORKSPACE,
  type CompanyView,
  type ShopLevel,
  type SubscriptionView,
} from '@lfd/contracts';

import { ClientSubscriptions } from '../client-subscriptions.service';

import { hydrateWith, TEST_CATALOGUE } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientCart } from '../cart/client-cart.service';
import { provideRecognised } from '../client-orders.fixture';
import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { LIVE_PICKUP } from '../mes-commandes/order-view.fixture';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { DEFAULT_SURFACES, openShopAt } from '../feature-access/feature-access.fixture';
import { ClientNav } from './client-nav.service';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TOMMEUSES } from '../mon-compte/account.fixture';

/** De quoi naviguer : le routeur refuse une adresse qu'aucune route ne couvre. */
const ROUTES = [
  { path: 'mon-espace', children: [] },
  { path: 'commande/boutique', children: [] },
  { path: 'commande/panier', children: [] },
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
    // Ces cas décrivent le menu COMPLET : la boutique permet de commander.
    openShopAt('order');
  });

  it('garde le même ordre, panier vide comme panier plein', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);

    TestBed.inject(ClientCart).add('VIE-001');
    expect(nav.items().map((i) => i.id)).toEqual(ORDER);
  });

  /** Masquées en admin, les deux destinations partent ; les autres gardent leur ordre. */
  it('retire commandes et factures quand l’admin les masque', () => {
    TestBed.inject(ClientFeatureAccess).receive({
      shop: 'order',
      ...DEFAULT_SURFACES,
      orders: 'hidden',
      invoices: 'hidden',
    });

    expect(
      TestBed.inject(ClientNav)
        .items()
        .map((i) => i.id),
    ).toEqual(['espace', 'shop', 'baskets', 'account']);
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
    await router.navigateByUrl('/commande/panier');
    expect(nav.current()).toBe('/commande/panier');

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
    expect(shop?.route).toBe('/commande/boutique');
    expect(shop?.ready).toBe(true);
    // Aucun compteur : un rayon ne se compte pas, il se parcourt.
    expect(shop?.countShort).toBe('');

    await TestBed.inject(Router).navigateByUrl('/commande/boutique');
    expect(nav.current()).toBe('/commande/boutique');
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

/** Plan `plan-inscription-pro-seule.md` §4 : le menu suit ce que la boutique permet. */
describe('Les destinations du menu, selon la boutique', () => {
  function boot(): void {
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
  }

  const SHOWN: Readonly<Record<ShopLevel, readonly string[]>> = {
    closed: ['orders', 'invoices', 'account'],
    browse: ['espace', 'shop', 'orders', 'invoices', 'account'],
    order: ORDER,
  };

  for (const level of ['closed', 'browse', 'order'] as const) {
    it(`boutique « ${level} » : retire des destinations, n’en réordonne aucune`, () => {
      boot();
      openShopAt(level);

      const ids = TestBed.inject(ClientNav)
        .items()
        .map((i) => i.id);
      expect(ids).toEqual(SHOWN[level]);
      // Ce qui reste suit l'ordre figé : c'est une sous-suite, jamais un
      // réarrangement.
      expect(ids).toEqual(ORDER.filter((id) => ids.includes(id)));
    });
  }

  /** Tant que les niveaux ne sont pas lus, on ne promet rien de ce qui peut être fermé. */
  it('pendant la lecture, et après son échec, montre le menu de `closed`', () => {
    boot();
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().map((i) => i.id)).toEqual(SHOWN.closed);
  });

  /**
   * Plan §9 : « le menu réduit ne lit plus ce qu'il ne montre pas ». Les paniers
   * récurrents partaient lire `/subscriptions/mine` même quand leur destination
   * n'était pas montrée.
   */
  it('ne lit les paniers récurrents qu’au niveau où il les montre', async () => {
    const asked = async (): Promise<number> => {
      TestBed.inject(ClientNav).items();
      TestBed.tick();
      // Le jeton, puis la requête : deux micro-tâches.
      await Promise.resolve();
      await Promise.resolve();
      return TestBed.inject(HttpTestingController).match((r) =>
        r.url.endsWith('/subscriptions/mine'),
      ).length;
    };

    boot();
    openShopAt('browse');
    expect(await asked()).toBe(0);

    // Le témoin : au niveau `order`, la lecture part bien — sans lui, le zéro
    // ci-dessus ne prouverait rien.
    boot();
    openShopAt('order');
    expect(await asked()).toBe(1);
  });
});

/**
 * En perso, les écrans d'une SOCIÉTÉ n'ont rien à montrer (Hugo, 2026-09-15) —
 * mais seulement pour qui en a une : sans société, Mon compte est la porte pro.
 */
describe('Les destinations du menu, selon l’espace', () => {
  const idsIn = (current: string, companies: readonly CompanyView[]): readonly string[] => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        provideWorkspace(workspaceDouble(current, companies)),
      ],
    });
    openShopAt('order');
    return TestBed.inject(ClientNav)
      .items()
      .map((i) => i.id);
  };

  it('retire Mon compte, Mes factures et les paniers récurrents en perso, pour qui a une société', () => {
    expect(idsIn(PERSONAL_WORKSPACE, [TOMMEUSES])).toEqual(['espace', 'shop', 'orders']);
  });

  it('les rend dans l’espace de la société', () => {
    expect(idsIn(TOMMEUSES.id, [TOMMEUSES])).toEqual(ORDER);
  });

  it('les garde à qui n’a aucune société', () => {
    expect(idsIn(PERSONAL_WORKSPACE, [])).toEqual(ORDER);
  });
});
