import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PERSONAL_WORKSPACE, type CompanyView } from '@lfd/contracts';

import { OPEN_LOYALTY } from '../client-loyalty.fixture';
import { ClientLoyalty } from '../client-loyalty.service';

import { hydrateWith, TEST_CATALOGUE } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientCart } from '../cart/client-cart.service';
import { AccountService } from '../../account/account.service';
import { provideRecognised } from '../client-orders.fixture';
import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { LIVE_PICKUP } from '../mes-commandes/order-view.fixture';
import { ClientNav } from './client-nav.service';
import { ManageableSites } from '../site-menu/manageable-sites';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TOMMEUSES } from '../mon-compte/account.fixture';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { DEFAULT_LEVELS } from '../feature-access/feature-access.fixture';

/** De quoi naviguer : le routeur refuse une adresse qu'aucune route ne couvre. */
const ROUTES = [
  { path: 'boutique', children: [] },
  { path: 'commande/panier', children: [] },
  { path: 'mes-commandes', children: [] },
];

/** L'ordre que la réf FIGE, et qu'aucune surface n'a le droit de réarranger. */
/**
 * L'ordre du menu — CINQ destinations depuis le 2026-09-21. « Mon espace » en
 * était l'ancre ; son écran a disparu dans `/bienvenue`, qui est l'accueil et
 * non une destination du menu.
 */
const ORDER = ['shop', 'orders', 'invoices', 'baskets', 'account'];

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

  /**
   * Régression (latence de navigation, L1, 2026-11-04) : le compte des gabarits
   * appelait `/subscriptions/mine` à chaque page, pour une destination dont
   * aucune surface n'affiche le compte tant que son écran n'existe pas.
   */
  it('mène aux paniers récurrents, dont l’écran existe', () => {
    const baskets = TestBed.inject(ClientNav)
      .items()
      .find((i) => i.id === 'baskets');

    expect(baskets?.ready).toBe(true);
    expect(baskets?.route).toBe('/paniers-recurrents');
  });

  it('suit la NAVIGATION — l’onglet actif ne reste pas figé sur la première page', async () => {
    const nav = TestBed.inject(ClientNav);
    const router = TestBed.inject(Router);
    // ⚠️ Le vrai piège : `Router.url` est une propriété nue. Une dérivation qui
    // la lit sans dépendre des événements ne se recalcule jamais, et rien dans
    // un rendu isolé ne le montre — il faut naviguer pour le voir.
    await router.navigateByUrl('/commande/panier');
    expect(nav.current()).toBe('/commande/panier');

    await router.navigateByUrl('/mes-commandes');
    expect(nav.current()).toBe('/mes-commandes');
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
    expect(shop?.route).toBe('/boutique');
    expect(shop?.ready).toBe(true);
    // Aucun compteur : un rayon ne se compte pas, il se parcourt.
    expect(shop?.countShort).toBe('');

    await TestBed.inject(Router).navigateByUrl('/boutique');
    expect(nav.current()).toBe('/boutique');
  });

  it('toutes les destinations ont leur écran', () => {
    const nav = TestBed.inject(ClientNav);
    expect(nav.items().every((i) => i.ready)).toBe(true);
  });
});

/**
 * En perso, les écrans d'une SOCIÉTÉ n'ont rien à montrer (Hugo, 2026-09-15) —
 * mais seulement pour qui en a une : sans société, Mon compte est la porte pro.
 */
describe('Les destinations du menu, selon l’espace', () => {
  const idsIn = (
    current: string,
    companies: readonly CompanyView[],
    sites: readonly CompanyView[] = [],
    plannerOpen = false,
  ): readonly string[] => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        provideWorkspace(workspaceDouble(current, companies)),
        // 🔴 `AccountService` doit être DOUBLÉ ici, sinon le cas « aucune
        // société » se testerait tout seul : le vrai service n'est `ready`
        // qu'après `/me`, donc `hasNoCompany()` resterait faux et la règle ne
        // s'appliquerait jamais. Le test passait — sans rien éprouver.
        {
          provide: AccountService,
          useValue: {
            companies: () => companies,
            hasNoCompany: () => companies.length === 0,
          },
        },
        { provide: ManageableSites, useValue: { sites: signal(sites) } },
      ],
    });
    TestBed.inject(ClientFeatureAccess).receive({
      ...DEFAULT_LEVELS,
      orderPlanner: plannerOpen ? 'open' : 'closed',
    });
    return TestBed.inject(ClientNav)
      .items()
      .map((i) => i.id);
  };

  it('retire Mon compte, Mes factures et les paniers récurrents en perso, pour qui a une société', () => {
    expect(idsIn(PERSONAL_WORKSPACE, [TOMMEUSES])).toEqual(['shop', 'orders']);
  });

  it('les rend dans l’espace de la société', () => {
    expect(idsIn(TOMMEUSES.id, [TOMMEUSES])).toEqual(ORDER);
  });

  /** `carte-des-sites.md` § 2 : « Mes sites », en dernier, au seul qui règle une carte. */
  it('ajoute Mes sites, en dernier, au principal qui règle la carte d’un site', () => {
    const chalet = { ...TOMMEUSES, id: 'cmp_chalet' };
    expect(idsIn(TOMMEUSES.id, [TOMMEUSES], [chalet])).toEqual([...ORDER, 'sites']);
  });

  /** Q7 du plan du planificateur : la clé `orderPlanner`, exemption comprise. */
  it('ajoute le planificateur après les paniers quand la clé est ouverte', () => {
    expect(idsIn(TOMMEUSES.id, [TOMMEUSES], [], true)).toEqual([
      'shop',
      'orders',
      'invoices',
      'baskets',
      'planner',
      'account',
    ]);
  });

  it('retire le planificateur en perso, même clé ouverte', () => {
    expect(idsIn(PERSONAL_WORKSPACE, [TOMMEUSES], [], true)).toEqual(['shop', 'orders']);
  });

  /**
   * 🔴 **Ils se ferment AUSSI sans société** (Hugo, 2026-09-22 : « mon compte
   * n'a pas d'entreprise et avait quand même accès à mon compte »).
   *
   * Ils restaient ouverts parce que `/mon-compte` portait la porte pro — la
   * carte « Compléter mon dossier ». Elle vit désormais sur `/mon-profil` ;
   * laisser le menu les proposer revenait à offrir l'ouverture d'un compte
   * professionnel à qui n'a rien demandé.
   */
  it('les ferme aussi à qui n’a aucune société', () => {
    expect(idsIn(PERSONAL_WORKSPACE, [])).toEqual(['shop', 'orders']);
  });
});

/**
 * « Ma fidélité » (plan des points, §12) : visible seulement si le service dit
 * le programme ouvert — ce qu'il ne fait qu'en espace personnel connecté (cf.
 * `client-loyalty.service.spec.ts`, qui éprouve l'espace et l'appel unique).
 */
describe('Le lien « Ma fidélité »', () => {
  function itemsWith(open: boolean): readonly string[] {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        { provide: ClientLoyalty, useValue: { isOpen: signal(open) } },
      ],
    });
    return TestBed.inject(ClientNav)
      .items()
      .map((i) => i.id);
  }

  it('paraît après les commandes quand le programme est ouvert', () => {
    expect(itemsWith(true)).toEqual([
      'shop',
      'orders',
      'loyalty',
      'invoices',
      'baskets',
      'account',
    ]);
  });

  it('n’existe pas quand il est fermé — rien ne dit « bientôt »', () => {
    expect(itemsWith(false)).toEqual(ORDER);
  });
});

describe('Le lien « Ma fidélité », branché sur le vrai service', () => {
  function boot(current: string): void {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(ROUTES),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRecognised(),
        provideWorkspace(workspaceDouble(current)),
      ],
    });
  }

  it('paraît en espace personnel quand `me/loyalty` le dit ouvert', async () => {
    boot(PERSONAL_WORKSPACE);
    const nav = TestBed.inject(ClientNav);
    TestBed.tick();
    await Promise.resolve();
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.endsWith('/me/loyalty'))
      .flush(OPEN_LOYALTY);
    await Promise.resolve();

    expect(nav.items().some((i) => i.id === 'loyalty')).toBe(true);
  });

  it('reste absent en espace société, sans rien demander', () => {
    boot('co_1');
    const nav = TestBed.inject(ClientNav);
    TestBed.tick();

    expect(nav.items().some((i) => i.id === 'loyalty')).toBe(false);
    expect(
      TestBed.inject(HttpTestingController).match((r) => r.url.endsWith('/me/loyalty')),
    ).toHaveLength(0);
  });
});
