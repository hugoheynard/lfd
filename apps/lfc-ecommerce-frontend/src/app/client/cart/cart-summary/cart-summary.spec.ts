import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DELIVERY_CLOSED_FOR_AUDIENCE, type MyShopQuoteView } from '@lfd/contracts';

import { AuthFacade } from '../../../auth/auth.facade';
import { provideRecognised } from '../../client-orders.fixture';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../../client-workspace.fixture';

import { ClientCart } from '../client-cart.service';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { CartSummary } from './cart-summary';

describe('CartSummary', () => {
  let fixture: ComponentFixture<CartSummary>;
  let cart: ClientCart;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CartSummary], providers: [provideHttpClient()] });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    cart = TestBed.inject(ClientCart);
    cart.clear();
    cart.add('VIE-001');
    cart.add('VIE-001');
    cart.add('VIE-002');
    fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
  });

  it('pose une ligne par référence, pas par pièce', () => {
    expect(el().querySelectorAll('.lines > li')).toHaveLength(2);
  });

  /**
   * 🔴 **La ligne est un `<li>`.** La liste est un `<ul>`, dont les seuls
   * enfants valides sont des `<li>` : un élément de composant intermédiaire
   * obligerait à un `display: contents`, qui retire l'élément de l'arbre
   * d'accessibilité chez certains lecteurs d'écran — la liste n'annoncerait
   * alors plus ses items. C'est pour ça que `CartProductLine` porte un
   * sélecteur d'attribut, et ce test est le seul endroit où ça se vérifie :
   * `TestBed` fabrique un hôte `div` quel que soit le sélecteur.
   */
  it('ne glisse aucun élément entre la liste et ses items', () => {
    const items = [...el().querySelectorAll('.lines > *')];

    // `every` sur un tableau vide rend `true` : sans ce compte, le test
    // passerait aussi bien si la liste ne contenait plus rien du tout.
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.tagName === 'LI')).toBe(true);
  });

  /**
   * Le décompte CÂBLE les gestes de la ligne : elle les remonte, il les
   * applique. C'est le partage habituel — la ligne ne connaît pas le panier.
   */
  it('applique le réglage de quantité venu d’une ligne', () => {
    // Le « + » du champ empilé, dans la PREMIÈRE ligne — pas dans la liste
    // entière, dont le dernier bouton appartiendrait à la seconde. `fold`
    // empile l'incrément AU-DESSUS du décrément, donc c'est le premier.
    const first = el().querySelector('.lines > li');
    const plus = first?.querySelectorAll<HTMLButtonElement>('fold-number-input button')[0];

    plus?.click();
    fixture.detectChanges();

    expect(cart.quantityOf('VIE-001')).toBe(3);
  });

  it('la corbeille d’une ligne retire la ligne, pas une pièce', () => {
    const bin = el().querySelector<HTMLButtonElement>('.drop');

    bin?.click();
    fixture.detectChanges();

    expect(cart.quantityOf('VIE-001')).toBe(0);
    expect(el().querySelectorAll('.lines > li')).toHaveLength(1);
  });

  /** Vider est une sortie : elle existe, et elle disparaît quand il n'y a rien. */
  it('offre de vider, et retire l’offre sur un panier vide', () => {
    el().querySelector<HTMLButtonElement>('.empty-out')?.click();
    fixture.detectChanges();

    expect(cart.isEmpty()).toBe(true);
    expect(el().querySelector('.empty-out')).toBeNull();
  });

  it('récapitule en HT et rend le total toutes taxes comprises', () => {
    const labels = [...el().querySelectorAll('.count dt')].map((dt) => dt.textContent?.trim());

    expect(labels[0]).toBe('Sous-total HT');
    expect(labels.at(-1)).toBe('Total TTC');
  });
});

/** Plan remise et livraison par clientèle, D5 : le refus se MONTRE dans le récapitulatif. */
describe('CartSummary — une livraison refusée', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('montre le message du serveur à la place des montants, et garde les lignes', () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CartSummary],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Un visiteur : la route publique, sans attendre `/me` ni un jeton.
        provideWorkspace(workspaceDouble()),
        { provide: AuthFacade, useValue: { isAuthenticated: () => false } },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    const cart = TestBed.inject(ClientCart);
    cart.add('VIE-001');
    const fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
    TestBed.tick();
    vi.advanceTimersByTime(400);
    TestBed.tick();

    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.endsWith('/shop/quote'))
      .flush(
        { code: DELIVERY_CLOSED_FOR_AUDIENCE, message: 'Choisissez le retrait.' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('fold-callout')?.textContent).toContain('Choisissez le retrait.');
    expect(el.querySelector('dl.count')).toBeNull();
    expect(el.querySelectorAll('.lines > li')).toHaveLength(1);
  });
});

/** Plan des points, E1.3 : la ligne n'existe que si le serveur annonce plus de zéro. */
describe('CartSummary — les points à gagner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function quoted(
    points: number | null,
    space: WorkspaceDouble = workspaceDouble(),
  ): ComponentFixture<CartSummary> {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CartSummary],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(space),
        provideRecognised(),
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(ClientCart).add('VIE-001');
    const fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
    TestBed.tick();
    vi.advanceTimersByTime(400);
    TestBed.tick();

    const view: MyShopQuoteView = {
      lines: [],
      subtotalHtCents: 250,
      discountCents: 0,
      discountAdjustment: null,
      voucherDiscountCents: 0,
      deliveryFeeCents: 0,
      vat: [],
      totalCents: 264,
      loyaltyPointsToEarn: points,
    };
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.endsWith('/shop/quote/mine'))
      .flush(view);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ComponentFixture<CartSummary>): HTMLElement =>
    fixture.nativeElement as HTMLElement;

  it('dit « Vous gagnerez N points » sous le total', () => {
    expect(el(quoted(1250)).querySelector('.points')?.textContent).toBe(
      'Vous gagnerez 1\u202f250 points',
    );
  });

  it.each([0, null])('se tait quand le serveur annonce %s', (points) => {
    expect(el(quoted(points)).querySelector('.points')).toBeNull();
  });

  /** « Pas de fidélité en pro » (Hugo, 2026-09-27) : le devis perso ne survit pas à la bascule. */
  it('retire la ligne dès la bascule vers une société, avant le nouveau devis', () => {
    const space = workspaceDouble();
    const fixture = quoted(1250, space);
    expect(el(fixture).querySelector('.points')).not.toBeNull();

    space.current.set('co_1');
    TestBed.tick();
    fixture.detectChanges();

    expect(el(fixture).querySelector('.points')).toBeNull();
  });
});
