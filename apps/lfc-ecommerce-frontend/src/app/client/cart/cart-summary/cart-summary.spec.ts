import { FR } from '../../copy/fr';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  DELIVERY_CLOSED_FOR_AUDIENCE,
  type CartSuggestionView,
  type MyShopQuoteView,
} from '@lfd/contracts';

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
import { ProductAudience } from '../../audience/product-audience.service';
import { ClientCart } from '../client-cart.service';
import { StaffCartSuggestion } from '../staff-cart-suggestion.service';
import { shelfPriceLabel, ShopPriceBasis } from '../../shop/shop-price-basis.service';
import { VoucherChoice } from '../voucher-choice.service';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { Router } from '@angular/router';

import { PieceRequest } from '../../shop/piece-request.service';
import { OrderContextStore } from '../../order-context.store';
import { ServicePoints } from '../../shop/pickup-points.store';
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
    // Le « + » du champ, dans la PREMIÈRE ligne — pas dans la liste entière,
    // dont le dernier bouton appartiendrait à la seconde. Les boutons
    // encadrent le champ (`controls="outside"`) : « − » puis « + ».
    const first = el().querySelector('.lines > li');
    const plus = [
      ...(first?.querySelectorAll<HTMLButtonElement>('fold-number-input button') ?? []),
    ].at(-1);

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
      pretaxCents: 250,
      totalCents: 264,
      loyaltyPointsToEarn: points,
      voucherTotalEffectCents: 0,
      voucherRemainderCents: null,
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

  /** Le total atténué pendant le devis en vol (Hugo, 2026-11-06). */
  describe('le total pendant le calcul', () => {
    const grand = (f: ComponentFixture<CartSummary>): HTMLElement | null =>
      (f.nativeElement as HTMLElement).querySelector('.grand dd');

    /** Une pièce de plus : le devis repart, la requête attend d'être rendue. */
    function another(f: ComponentFixture<CartSummary>) {
      TestBed.inject(ClientCart).add('VIE-001');
      TestBed.tick();
      f.detectChanges();
      const before = grand(f);
      vi.advanceTimersByTime(400);
      TestBed.tick();
      const request = TestBed.inject(HttpTestingController).expectOne((r) =>
        r.url.endsWith('/shop/quote/mine'),
      );
      return { before, request };
    }

    it('net une fois le devis rendu', () => {
      const dd = grand(quoted(0));
      expect(dd?.classList.contains('pending')).toBe(false);
      expect(dd?.getAttribute('aria-busy')).toBeNull();
    });

    it('atténué et occupé pendant le calcul, l’ancien montant gardé', () => {
      const f = quoted(0);
      const { before, request } = another(f);
      f.detectChanges();
      const dd = grand(f);
      expect(before?.classList.contains('pending')).toBe(true);
      expect(dd?.classList.contains('pending')).toBe(true);
      expect(dd?.getAttribute('aria-busy')).toBe('true');
      expect(dd?.textContent?.trim()).toBe(formatCents(264));
      expect(dd?.querySelector('[aria-live]')).toBeNull();
      request.flush({
        lines: [],
        subtotalHtCents: 500,
        discountCents: 0,
        discountAdjustment: null,
        voucherDiscountCents: 0,
        deliveryFeeCents: 0,
        deliveryVatMode: 'standard',
        vat: [],
        pretaxCents: 500,
        totalCents: 528,
        loyaltyPointsToEarn: 0,
        voucherTotalEffectCents: 0,
        voucherRemainderCents: null,
      } satisfies MyShopQuoteView);
      f.detectChanges();
      expect(grand(f)?.classList.contains('pending')).toBe(false);
      expect(grand(f)?.getAttribute('aria-busy')).toBeNull();
    });

    it('net après un échec du calcul', () => {
      const f = quoted(0);
      const { request } = another(f);
      request.flush(null, { status: 500, statusText: 'Server Error' });
      f.detectChanges();
      expect(grand(f)?.classList.contains('pending')).toBe(false);
      expect(grand(f)?.getAttribute('aria-busy')).toBeNull();
    });
  });

  it.each([0, null])('se tait quand le serveur annonce %s', (points) => {
    expect(el(quoted(points)).querySelector('.points')).toBeNull();
  });

  /**
   * Le taux du port ne se dit plus sous la ligne de livraison (Hugo,
   * 2026-10-27).
   */
  /** La ligne du coursier nomme sa zone (Hugo, 2026-10-27). */
  it('nomme la zone de livraison à côté de « Coursier »', () => {
    const fixture = quoted(null, workspaceDouble(), { deliveryFeeCents: 1200 });
    TestBed.inject(ServicePoints).receive(
      [],
      [
        {
          id: 'z1',
          postalPrefixes: ['73150'],
          label: 'Val d’Isère',
          fee: { mode: 'amount', cents: 1200 },
          audience: 'b2c',
          freeDeliveryThresholdCents: null,
        },
      ],
    );
    TestBed.inject(OrderContextStore).choice.set({
      mode: 'delivery',
      place: 'La Folie Douce',
      at: 'à La Folie Douce',
      address: 'La Daille, 73150',
      codePostal: '73150',
      deliveryAddress: {
        label: '',
        ligne1: 'La Daille',
        ligne2: '',
        codePostal: '73150',
        ville: 'Val d’Isère',
        pays: 'FR',
      },
      deliveryAddressId: null,
      slot: 'avant 7 h 30',
      window: { start: '06:00', end: '07:30' },
      date: new Date().toISOString().slice(0, 10),
    });
    fixture.detectChanges();

    expect(el(fixture).textContent).toContain('Coursier (Val d’Isère)');
  });

  it('ne dit pas la TVA de la livraison', () => {
    const fixture = quoted(null, workspaceDouble(), {
      deliveryFeeCents: 1200,
      deliveryVatMode: 'standard',
    });
    expect(el(fixture).textContent).not.toContain('TVA de la livraison');
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
    pretaxCents: 1000,
    totalCents: 1055,
    loyaltyPointsToEarn: null,
    voucherTotalEffectCents: 0,
    voucherRemainderCents: null,
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

  /**
   * Régression : le reliquat se disait « HT » alors qu'un bon ne sert qu'à un
   * particulier, dont la valeur du bon est un TTC (2026-11-04).
   */
  it('annonce le reliquat d’un bon plus gros que le panier, sans le dire HT', () => {
    boot();
    pick(260, 274, { voucherRemainderCents: 240 });

    expect(el().textContent).toContain(
      `Le reste, ${formatCents(240)}, vous sera rendu en bon une fois la commande réglée.`,
    );
    expect(el().textContent).not.toContain(`${formatCents(240)} HT`);
  });

  /** Plan L6 : le reliquat est compté par le serveur ; l'écran ne soustrait plus rien. */
  it('lit le reliquat du serveur tel quel, sans le recalculer', () => {
    boot();
    pick(260, 274, { voucherRemainderCents: 123 });

    expect(el().textContent).toContain(`Le reste, ${formatCents(123)},`);
    expect(el().textContent).not.toContain(formatCents(240));
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
    pretaxCents: 1450,
    totalCents: 1464,
    loyaltyPointsToEarn: null,
    voucherTotalEffectCents: 0,
    voucherRemainderCents: null,
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

  it('au compte : le total HT et la mention, sans ligne de TVA', () => {
    const el = quotedIn(workspaceDouble(TOMMEUSES.id, [TOMMEUSES]));

    // 14,64 € TTC − 0,14 € de TVA = 14,50 € HT.
    expect(grand(el)).toContain('Total HT');
    expect(grand(el)).toContain(formatCents(1450));
    expect(el.textContent).toContain('TVA et TTC sur la facture du mois');
    expect(el.querySelectorAll('.row.vat')).toHaveLength(0);
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

/** Une suggestion du staff servie à la main, et les gestes comptés. */
class StaffPickDouble {
  readonly shown = signal<readonly CartSuggestionView[]>([]);
  readonly taken: CartSuggestionView[] = [];
  readonly clicked: CartSuggestionView[] = [];
  opened = 0;
  open(): void {
    this.opened += 1;
  }
  close(): void {
    this.opened -= 1;
  }
  take(view: CartSuggestionView): void {
    this.taken.push(view);
  }
}

describe('CartSummary — la carte de suggestion (RS2)', () => {
  let fixture: ComponentFixture<CartSummary>;
  let pick: StaffPickDouble;
  let recorded: { sku: string; event: string }[];
  /** L'assiette du rayon, réglée à la main : la règle elle-même est éprouvée par la vignette. */
  const showsTtc = signal(true);

  const card = (): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.suggestion');
  const button = (name: 'add' | 'pitch'): HTMLButtonElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`.suggestion .${name}`);

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    pick = new StaffPickDouble();
    recorded = [];
    showsTtc.set(true);
    TestBed.configureTestingModule({
      imports: [CartSummary],
      providers: [
        provideHttpClient(),
        {
          provide: StaffCartSuggestion,
          useValue: {
            shown: pick.shown,
            open: () => pick.open(),
            close: () => pick.close(),
            taken: (view: CartSuggestionView) => pick.take(view),
            opened: (view: CartSuggestionView) => pick.clicked.push(view),
          },
        },
        { provide: ShopPriceBasis, useValue: { showsTtc } },
        {
          provide: ProductAudience,
          useValue: { record: (sku: string, event: string) => recorded.push({ sku, event }) },
        },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(ClientCart).add('VIE-001');
    fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
  });

  it('ouvre la demande de suggestion avec le panier', () => {
    expect(pick.opened).toBe(1);
  });

  /** La relance codée en dur est retirée (Hugo, 2026-10-18) : pas de remplissage. */
  it('sans règle applicable, aucune carte de suggestion', () => {
    expect(card()).toBeNull();
    expect(recorded).toEqual([]);
  });

  it('montre la suggestion du staff, avec sa phrase, et l’ajoute au « + »', () => {
    const baguette = TestBed.inject(ShopCatalogue).itemOf('PAI-001');
    if (baguette === null) {
      throw new RangeError('la fixture du catalogue n’a plus de PAI-001');
    }
    const view: CartSuggestionView = {
      sku: 'PAI-001',
      item: baguette,
      reason: {
        source: 'staff',
        ruleId: '01jrule',
        phrase: { fr: 'Avec un croissant, la baguette' },
      },
    };
    pick.shown.set([view]);
    fixture.detectChanges();

    expect(card()?.textContent).toContain('Avec un croissant, la baguette');
    // Un visiteur lit le TTC servi, comme sur la vignette.
    expect(card()?.textContent).toContain(`${formatCents(baguette.unitPriceTtcCents)} TTC`);
    button('add')?.click();

    expect(pick.taken).toEqual([view]);
    expect(pick.clicked).toEqual([]);
    // Le taux d'ajout global inclut les suggestions (Hugo, 2026-10-18).
    expect(recorded).toEqual([{ sku: 'PAI-001', event: 'added_to_cart' }]);
    expect(TestBed.inject(ClientCart).quantityOf('PAI-001')).toBe(1);
  });

  it('un clic sur la carte demande la fiche de l’article, sans l’ajouter', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const baguette = TestBed.inject(ShopCatalogue).itemOf('PAI-001');
    if (baguette === null) {
      throw new RangeError('la fixture du catalogue n’a plus de PAI-001');
    }
    const view: CartSuggestionView = {
      sku: 'PAI-001',
      item: baguette,
      reason: { source: 'staff', ruleId: '01jrule', phrase: null },
    };
    pick.shown.set([view]);
    fixture.detectChanges();

    button('pitch')?.click();

    expect(pick.clicked).toEqual([view]);
    expect(pick.taken).toEqual([]);
    expect(TestBed.inject(PieceRequest).latest()?.sku).toBe('PAI-001');
    expect(TestBed.inject(ClientCart).quantityOf('PAI-001')).toBe(0);
    expect(recorded).toEqual([]);
  });

  it('écrit le prix HT à un pro, comme la vignette', () => {
    const baguette = TestBed.inject(ShopCatalogue).itemOf('PAI-001');
    if (baguette === null) {
      throw new RangeError('la fixture du catalogue n’a plus de PAI-001');
    }
    showsTtc.set(false);
    pick.shown.set([
      {
        sku: 'PAI-001',
        item: baguette,
        reason: { source: 'staff', ruleId: '01jrule', phrase: null },
      },
    ]);
    fixture.detectChanges();

    expect(card()?.textContent).toContain(
      shelfPriceLabel(baguette, false, 'HT', FR.product.perKilogram),
    );
  });

  it('R2 : la calculée suit la décidée, et dit « Souvent pris avec » l’article du panier', () => {
    const baguette = TestBed.inject(ShopCatalogue).itemOf('PAI-001');
    const coffee = TestBed.inject(ShopCatalogue).itemOf('VIE-002');
    if (baguette === null || coffee === null) {
      throw new RangeError('la fixture du catalogue n’a plus PAI-001 ou VIE-002');
    }
    pick.shown.set([
      { sku: 'PAI-001', item: baguette, reason: { source: 'staff', ruleId: '01j', phrase: null } },
      {
        sku: 'VIE-002',
        item: coffee,
        reason: { source: 'data', kind: 'bought_with', withSku: 'VIE-001', withName: 'Croissant' },
      },
    ]);
    fixture.detectChanges();

    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.suggestion');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain('Notre conseil');
    expect(cards[1]?.textContent).toContain('Souvent pris avec Croissant');
  });

  it('sans phrase, dit « Notre conseil »', () => {
    const baguette = TestBed.inject(ShopCatalogue).itemOf('PAI-001');
    if (baguette === null) {
      throw new RangeError('la fixture du catalogue n’a plus de PAI-001');
    }
    pick.shown.set([
      {
        sku: 'PAI-001',
        item: baguette,
        reason: { source: 'staff', ruleId: '01jrule', phrase: null },
      },
    ]);
    fixture.detectChanges();

    expect(card()?.textContent).toContain('Notre conseil');
    // « Vous aimerez aussi » est le défaut de la FICHE, pas du panier (Hugo, 2026-10-18).
    expect(card()?.textContent).not.toContain('Vous aimerez aussi');
  });
});

/**
 * Plan `remise-retrait-par-clientele-et-exclusions`, lot C : quand une ligne
 * est exclue, la remise dit son assiette et la ligne porte une marque.
 */
describe('CartSummary — une remise de retrait sur une partie du panier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const BASE_VIEW: MyShopQuoteView = {
    lines: [],
    subtotalHtCents: 410,
    discountCents: 25,
    discountAdjustment: { mode: 'percent', bp: 1000 },
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: 'standard',
    vat: [],
    pretaxCents: 385,
    totalCents: 406,
    loyaltyPointsToEarn: null,
    voucherTotalEffectCents: 0,
    voucherRemainderCents: null,
  };

  function quoted(view: MyShopQuoteView, space = workspaceDouble()): HTMLElement {
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
    TestBed.inject(OrderContextStore).choice.set({
      mode: 'pickup',
      place: 'Le Labo',
      at: 'au Labo',
      address: 'Route de la Balme',
      pickupAddressId: 'pick_labo',
      slot: '7 h – 8 h',
      window: { start: '07:00', end: '08:00' },
      date: new Date().toISOString().slice(0, 10),
    });
    const cart = TestBed.inject(ClientCart);
    cart.add('VIE-001');
    cart.add('VIE-002');
    const fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
    TestBed.tick();
    vi.advanceTimersByTime(400);
    TestBed.tick();
    TestBed.inject(HttpTestingController)
      .match((r) => r.url.includes('/shop/quote'))
      .forEach((request) => request.flush(view));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const saved = (el: HTMLElement): string =>
    el.querySelector('.row.saved dt')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';

  it('dit l’assiette TTC à un particulier, marque la ligne exclue et l’explique une fois', () => {
    const el = quoted({
      ...BASE_VIEW,
      pickupDiscountBase: {
        eligibleHtCents: 250,
        eligibleTtcCents: 264,
        excludedSkus: ['VIE-002'],
      },
    });

    expect(saved(el)).toBe(`Remise retrait au Labo −10 % sur ${formatCents(264)} TTC éligibles`);
    const lines = [...el.querySelectorAll('.lines > li')];
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.querySelector('.excluded') !== null)).toEqual([false, true]);
    // Le `*` ne se lit pas : l'exclusion se dit dans le texte masqué du nom (lot A5).
    expect(lines[1]?.querySelector('.name .sr-only')?.textContent?.trim()).toBe(
      'Pain au chocolat, non concerné par la remise retrait',
    );
    expect(el.querySelectorAll('.excluded-note')).toHaveLength(1);
  });

  it('dit l’assiette HT à un pro', () => {
    const el = quoted(
      {
        ...BASE_VIEW,
        pickupDiscountBase: {
          eligibleHtCents: 250,
          eligibleTtcCents: 264,
          excludedSkus: ['VIE-002'],
        },
      },
      workspaceDouble(TOMMEUSES.id, [TOMMEUSES]),
    );

    expect(saved(el)).toBe(`Remise retrait au Labo −10 % sur ${formatCents(250)} HT éligibles`);
  });

  it('sans exclusion, ni assiette, ni marque, ni renvoi', () => {
    const el = quoted(BASE_VIEW);

    expect(saved(el)).toBe('Remise retrait au Labo −10 %');
    expect(el.querySelector('.excluded')).toBeNull();
    expect(el.querySelector('.excluded-note')).toBeNull();
  });
});

/**
 * Lot d (2026-11-05) : pendant la relecture du catalogue d'un espace jamais vu,
 * les lignes sont vides sans que le panier le soit — l'écran disait « Panier
 * vide », un vide qui ment. Il dit maintenant qu'il charge.
 */
describe('CartSummary — pendant la relecture du catalogue', () => {
  it('montre un chargement, jamais « panier vide », jusqu’au catalogue de l’espace', () => {
    localStorage.clear();
    const space = workspaceDouble();
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
    const catalogue = TestBed.inject(ShopCatalogue);
    hydrateWith(catalogue, TEST_CATALOGUE);
    const cart = TestBed.inject(ClientCart);
    cart.clear();
    cart.add('VIE-001');
    const fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.lines > li')).toHaveLength(1);

    space.current.set('cmp_1');
    fixture.detectChanges();
    expect(host.querySelector('fold-loading')?.textContent).toContain(FR.shop.cartLoading);
    expect(host.querySelector('.empty')).toBeNull();

    hydrateWith(catalogue, TEST_CATALOGUE);
    fixture.detectChanges();
    // Le catalogue de l'espace est là : le panier dit ce qu'il contient pour
    // cet espace — ses lignes, ou un vide qui, cette fois, est vrai.
    expect(host.querySelector('fold-loading')).toBeNull();
    expect(
      host.querySelectorAll('.lines > li').length > 0 || host.querySelector('.empty') !== null,
    ).toBe(true);
  });
});

/**
 * Plan `plan-livraison-offerte.md`, 1c : la livraison offerte telle que le
 * devis la juge — « Coursier offert » sans montant, « Plus que… » aux pros.
 */
describe('CartSummary — la livraison offerte (1c)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const VIEW: MyShopQuoteView = {
    lines: [],
    subtotalHtCents: 4000,
    discountCents: 0,
    discountAdjustment: null,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: 'standard',
    vat: [],
    pretaxCents: 4000,
    totalCents: 4220,
    loyaltyPointsToEarn: null,
    voucherTotalEffectCents: 0,
    voucherRemainderCents: null,
  };

  function quotedIn(
    space: WorkspaceDouble,
    view: MyShopQuoteView,
    availability: { openToB2b?: boolean; openToB2c?: boolean } | null = null,
  ): HTMLElement {
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
    if (availability !== null) {
      TestBed.inject(ServicePoints).receive([], [], [], availability);
    }
    TestBed.inject(ClientCart).add('VIE-001');
    const fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
    TestBed.tick();
    vi.advanceTimersByTime(400);
    TestBed.tick();
    TestBed.inject(HttpTestingController)
      .match((r) => r.url.includes('/shop/quote'))
      .forEach((request) => request.flush(view));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const PRO = (): WorkspaceDouble => workspaceDouble(TOMMEUSES.id, [TOMMEUSES]);

  it('dit « Coursier offert », avec l’icône du coursier et sans montant', () => {
    const el = quotedIn(PRO(), { ...VIEW, freeDelivery: { status: 'offered' } });

    const row = el.querySelector('.courier-offered')?.closest('.row');
    expect(row?.textContent?.trim()).toBe(FR.cart.courierOffered);
    expect(row?.querySelector('fold-icon')).not.toBeNull();
    expect(row?.querySelector('dd')).toBeNull();
  });

  it('dit au pro ce qu’il manque, tel que le serveur le sert', () => {
    const el = quotedIn(PRO(), {
      ...VIEW,
      freeDelivery: { status: 'short', remainingCents: 1200 },
    });

    expect(el.textContent).toContain(`Plus que ${formatCents(1200)} HT pour la livraison offerte`);
    expect(el.querySelector('.courier-offered')).toBeNull();
  });

  it('dit au particulier ce qu’il manque en TTC, « environ », tel que servi', () => {
    const el = quotedIn(workspaceDouble(), {
      ...VIEW,
      freeDelivery: { status: 'short', remainingCents: 1200, remainingTtcCents: 1266 },
    });

    expect(el.textContent).toContain(
      `Plus qu’environ ${formatCents(1266)} pour la livraison offerte`,
    );
    expect(el.textContent).not.toContain(`${formatCents(1200)} HT`);
  });

  it('ne dit rien au particulier quand le TTC n’est pas servi', () => {
    const el = quotedIn(workspaceDouble(), {
      ...VIEW,
      freeDelivery: { status: 'short', remainingCents: 1200 },
    });

    expect(el.textContent).not.toContain('Plus qu');
  });

  /** Hugo, 2026-11-05 : rien de la livraison offerte à qui le coursier est fermé. */
  it('ni « Coursier offert » ni « Plus que » au pro quand la livraison lui est fermée', () => {
    for (const freeDelivery of [
      { status: 'offered' } as const,
      { status: 'short', remainingCents: 1200 } as const,
    ]) {
      const el = quotedIn(PRO(), { ...VIEW, freeDelivery }, { openToB2b: false });
      expect(el.querySelector('.courier-offered')).toBeNull();
      expect(el.textContent).not.toContain('Plus que');
    }
  });

  it('ni « Plus qu’environ » au particulier quand la livraison lui est fermée', () => {
    const el = quotedIn(
      workspaceDouble(),
      { ...VIEW, freeDelivery: { status: 'short', remainingCents: 1200, remainingTtcCents: 1266 } },
      { openToB2c: false },
    );
    expect(el.textContent).not.toContain('Plus qu');
  });

  it('ne dit rien sans jugement de livraison offerte', () => {
    const el = quotedIn(PRO(), VIEW);

    expect(el.querySelector('.courier-offered')).toBeNull();
    expect(el.textContent).not.toContain('Plus que');
    expect(el.textContent).not.toContain(FR.cart.courierOffered);
  });
});

/**
 * **Une ligne en attente** (2026-11-06) : seule la ligne dont la quantité
 * attend son décompte s'atténue ; aucun montant n'est calculé à l'écran.
 */
describe('CartSummary — la ligne qui attend son décompte', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const QUOTE = (r: { url: string }): boolean => r.url.endsWith('/shop/quote');
  const ANSWER = {
    lines: [],
    subtotalHtCents: 300,
    discountCents: 0,
    discountAdjustment: null,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: 'standard',
    vat: [],
    pretaxCents: 300,
    totalCents: 300,
  };

  function settle(): void {
    TestBed.tick();
    vi.advanceTimersByTime(400);
    TestBed.tick();
  }

  function boot(): {
    fixture: ComponentFixture<CartSummary>;
    cart: ClientCart;
    http: HttpTestingController;
  } {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CartSummary],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspaceDouble()),
        { provide: AuthFacade, useValue: { isAuthenticated: () => false } },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    const cart = TestBed.inject(ClientCart);
    const http = TestBed.inject(HttpTestingController);
    cart.add('VIE-001');
    cart.add('VIE-002');
    const fixture = TestBed.createComponent(CartSummary);
    fixture.detectChanges();
    settle();
    http.expectOne(QUOTE).flush(ANSWER);
    fixture.detectChanges();
    return { fixture, cart, http };
  }

  const pendingSums = (fixture: ComponentFixture<CartSummary>): Element[] => [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll('.lines > li .sum.pending'),
  ];

  const lineOf = (fixture: ComponentFixture<CartSummary>, index: number): Element | undefined =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('.lines > li')][index];

  it('atténue la seule ligne changée, sans région vivante', () => {
    const { fixture, cart, http } = boot();
    expect(pendingSums(fixture)).toHaveLength(0);

    cart.setQuantity('VIE-001', 4);
    TestBed.tick();
    fixture.detectChanges();

    const pending = pendingSums(fixture);
    expect(pending).toHaveLength(1);
    expect(lineOf(fixture, 0)?.querySelector('.sum.pending fold-spinner')).not.toBeNull();
    expect(lineOf(fixture, 1)?.querySelector('.sum.pending')).toBeNull();
    expect(pending[0]?.getAttribute('aria-busy')).toBe('true');
    // Le spinner est décoratif : rien n'est annoncé à chaque clic.
    expect(pending[0]?.querySelector('[aria-live], [role="status"]')).toBeNull();

    settle();
    http.expectOne(QUOTE).flush(ANSWER);
  });

  it('plus rien d’atténué au retour du devis', () => {
    const { fixture, cart, http } = boot();
    cart.setQuantity('VIE-001', 4);
    settle();
    http.expectOne(QUOTE).flush(ANSWER);
    fixture.detectChanges();

    expect(pendingSums(fixture)).toHaveLength(0);
    expect(lineOf(fixture, 0)?.querySelector('fold-spinner')).toBeNull();
  });

  it('un devis en échec ne laisse pas l’indicateur', () => {
    const { fixture, cart, http } = boot();
    cart.setQuantity('VIE-001', 4);
    settle();
    http.expectOne(QUOTE).error(new ProgressEvent('boom'));
    fixture.detectChanges();

    expect(pendingSums(fixture)).toHaveLength(0);
  });
});
