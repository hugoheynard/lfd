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

import { formatCents } from '../../format-money';
import { TOMMEUSES } from '../../mon-compte/account.fixture';
import {
  EMPTY_LOYALTY,
  loyaltyDouble,
  provideLoyalty,
  type LoyaltyDouble,
} from '../../client-loyalty.fixture';
import { ClientCart } from '../client-cart.service';
import { VoucherChoice } from '../voucher-choice.service';
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
    overrides: Partial<MyShopQuoteView> = {},
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
      deliveryVatMode: 'standard',
      vat: [],
      totalCents: 264,
      loyaltyPointsToEarn: points,
      voucherTotalEffectCents: 0,
      ...overrides,
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

  /** Plan TVA des frais de port, V5 : le port dit à quel taux il est taxé. */
  it.each([
    ['standard', 'TVA de la livraison : 20 %'],
    ['follows_goods', 'TVA de la livraison : au prorata des produits'],
  ] as const)('dit la TVA de la livraison en mode %s', (mode, label) => {
    const fixture = quoted(null, workspaceDouble(), {
      deliveryFeeCents: 1200,
      deliveryVatMode: mode,
    });
    expect(el(fixture).querySelector('.fee-vat')?.textContent).toBe(label);
  });

  it('ne dit pas la TVA d’une livraison qui ne coûte rien', () => {
    expect(el(quoted(null)).querySelector('.fee-vat')).toBeNull();
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

/** Plan des points, §13, E2.2 et E2.4 : le choix du bon, son effet, son reliquat. */
describe('CartSummary — le bon de fidélité', () => {
  let space: WorkspaceDouble;
  let loyalty: LoyaltyDouble;
  let fixture: ComponentFixture<CartSummary>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const QUOTE: MyShopQuoteView = {
    lines: [],
    subtotalHtCents: 1000,
    discountCents: 0,
    discountAdjustment: null,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: 'standard',
    vat: [],
    totalCents: 1055,
    loyaltyPointsToEarn: null,
    voucherTotalEffectCents: 0,
  };

  /** Laisse passer l'accalmie, puis rend la requête du décompte à flusher. */
  function nextQuote() {
    TestBed.tick();
    vi.advanceTimersByTime(400);
    TestBed.tick();
    return http.expectOne((r) => r.url.endsWith('/shop/quote/mine'));
  }

  function boot(): void {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CartSummary],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(space),
        provideRecognised(),
        provideLoyalty(loyalty),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(ClientCart).add('VIE-001');
    fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
    nextQuote().flush(QUOTE);
    fixture.detectChanges();
  }

  /** Choisit le bon de 5,00 € HT et rend le devis qui l'impute. */
  function pick(
    imputed: number,
    effect: number,
    shape: Partial<MyShopQuoteView> = {},
  ): Record<string, unknown> {
    TestBed.inject(VoucherChoice).select('v_available');
    const request = nextQuote();
    const body = request.request.body as Record<string, unknown>;
    request.flush({
      ...QUOTE,
      voucherDiscountCents: imputed,
      voucherTotalEffectCents: effect,
      ...shape,
    } satisfies MyShopQuoteView);
    fixture.detectChanges();
    return body;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    space = workspaceDouble();
    loyalty = loyaltyDouble();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('propose le choix, et aucune ligne tant qu’aucun bon n’est choisi', () => {
    boot();

    expect(el().querySelector('fold-listbox')?.textContent).toContain(
      'Utiliser un bon de fidélité',
    );
    expect(el().textContent).not.toContain('Bon de fidélité');
  });

  it('envoie le bon au devis et montre la baisse TTC rendue par le serveur', () => {
    boot();
    const body = pick(500, 528);

    expect(body['voucherId']).toBe('v_available');
    const line = [...el().querySelectorAll('.count .row')].find((row) =>
      (row.textContent ?? '').includes('Bon de fidélité'),
    );
    // La part HT en montant, la baisse TTC en mention — les lignes bouclent.
    expect(line?.querySelector('dd')?.textContent).toContain(`${formatCents(500)} HT`);
    expect(line?.querySelector('.voucher-effect')?.textContent).toContain(formatCents(528));
  });

  /**
   * Régression (2026-09-27) : la ligne du bon portait l'effet TTC, et le
   * décompte comptait deux fois l'écart de TVA — ses lignes ne retombaient pas
   * sur le total affiché.
   */
  it('retombe exactement sur le total : sous-total − remise − bon + frais + TVA', () => {
    boot();
    // 10,00 € HT, bon de 5,00 € HT, TVA 5,5 % sur 5,00 € = 0,28 € → 5,28 €.
    pick(500, 528, { vat: [{ rate: 5.5, amountCents: 28 }], totalCents: 528 });

    const cents = (text: string | null | undefined): number => {
      const digits = (text ?? '').replace(/[^\d,−-]/gu, '');
      const sign = /[−-]/u.test(digits) ? -1 : 1;
      return sign * Number(digits.replace(/[−-]/gu, '').replace(',', ''));
    };
    const amounts = [...el().querySelectorAll('.count .row:not(.grand) dd')].map((dd) =>
      cents(dd.textContent),
    );
    const total = cents(el().querySelector('.count .grand dd')?.textContent);

    expect(amounts).toEqual([1000, -500, 28]);
    expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(total);
  });

  it('annonce le reliquat d’un bon plus gros que le panier', () => {
    boot();
    pick(260, 274);

    expect(el().textContent).toContain(
      `Le reste, ${formatCents(240)} HT, vous sera rendu en bon une fois la commande réglée.`,
    );
  });

  it('n’annonce aucun reliquat quand le bon est entièrement imputé', () => {
    boot();
    pick(500, 528);

    expect(el().textContent).not.toContain('Le reste');
  });

  it('ne montre rien sans bon disponible', () => {
    loyalty = loyaltyDouble(EMPTY_LOYALTY);
    boot();

    expect(el().querySelector('fold-listbox')).toBeNull();
  });

  /** « Pas de fidélité en pro » (Hugo, 2026-09-27) : rien ne survit à la bascule. */
  it('retire le choix et la ligne dès la bascule vers une société', () => {
    boot();
    pick(500, 528);
    expect(el().textContent).toContain('Bon de fidélité');

    space.current.set('co_1');
    TestBed.tick();
    fixture.detectChanges();

    expect(el().querySelector('fold-listbox')).toBeNull();
    expect(el().textContent).not.toContain('Bon de fidélité');
  });
});

/**
 * F5 (plan `bons-et-facture-concordants`, Q2 oui) : un pro au compte ne lit que
 * le HT ; la TVA et le TTC sont sur la facture du mois.
 */
describe('CartSummary — un pro au compte (F5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** 2,50 € HT + 0,14 € de TVA = 2,64 € TTC. */
  const VIEW: MyShopQuoteView = {
    lines: [],
    subtotalHtCents: 250,
    discountCents: 0,
    discountAdjustment: null,
    voucherDiscountCents: 0,
    deliveryFeeCents: 1200,
    deliveryVatMode: 'follows_goods',
    vat: [{ rate: 5.5, amountCents: 14 }],
    totalCents: 1464,
    loyaltyPointsToEarn: null,
    voucherTotalEffectCents: 0,
  };

  function quotedIn(space: WorkspaceDouble): HTMLElement {
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
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url.includes('/shop/quote'))
      .flush(VIEW);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const grand = (el: HTMLElement): string =>
    el.querySelector('.row.grand')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';

  it('au compte : le total HT et la mention, sans ligne de TVA ni taux du port', () => {
    const el = quotedIn(workspaceDouble(TOMMEUSES.id, [TOMMEUSES]));

    // 14,64 € TTC − 0,14 € de TVA = 14,50 € HT.
    expect(grand(el)).toContain('Total HT');
    expect(grand(el)).toContain(formatCents(1450));
    expect(el.textContent).toContain('TVA et TTC sur la facture du mois');
    expect(el.querySelectorAll('.row.vat')).toHaveLength(0);
    expect(el.querySelector('.fee-vat')).toBeNull();
    expect(el.textContent).not.toContain(formatCents(1464));
  });

  it('prélèvement suspendu : le TTC reste, comme pour tout règlement par carte', () => {
    const blocked = { ...TOMMEUSES, directDebitBlocked: true };
    const el = quotedIn(workspaceDouble(blocked.id, [blocked]));

    expect(grand(el)).toContain('Total TTC');
    expect(grand(el)).toContain(formatCents(1464));
    expect(el.querySelectorAll('.row.vat')).toHaveLength(1);
    expect(el.textContent).not.toContain('facture du mois');
  });
});
