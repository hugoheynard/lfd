import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  CompanyView,
  ProductSuggestionView as ShopSuggestion,
  ShopItemView,
} from '@lfd/contracts';

import { ClientCompany } from '../../client-company.service';
import { FR } from '../../copy/fr';
import {
  hydrateWith,
  operationCatalogue,
  TEST_ITEMS,
  testOperationItem,
} from '../shop-catalogue.fixture';
import { ShopCatalogue } from '../shop-catalogue.store';
import type { ShopOperationState } from '@lfd/contracts';
import { ProductAudience } from '../../audience/product-audience.service';
import { StaffProductSuggestion } from '../../suggestions/staff-product-suggestion.service';
import { Router } from '@angular/router';

import { PieceRequest } from '../piece-request.service';
import { ProductSheet } from './product-sheet';

/** La suggestion de la fiche, servie à la main : aucune requête ne part des specs. */
class StaffPickDouble {
  readonly current = signal<ShopSuggestion | null>(null);
  readonly opened: (string | null)[] = [];
  readonly taken: ShopSuggestion[] = [];
  readonly clicked: ShopSuggestion[] = [];
  open(sku: string): void {
    this.opened.push(sku);
  }
  close(): void {
    this.opened.push(null);
  }
  take(view: ShopSuggestion): void {
    this.taken.push(view);
  }
}

function providePick(pick: StaffPickDouble) {
  return {
    provide: StaffProductSuggestion,
    useValue: {
      current: pick.current,
      open: (sku: string) => pick.open(sku),
      close: () => pick.close(),
      taken: (view: ShopSuggestion) => pick.take(view),
      opened: (view: ShopSuggestion) => pick.clicked.push(view),
    },
  };
}

/** 1,40 € HT servi, 1,5556 € HT au tarif boutique : 10 % d'écart. */
const NEGOTIATED: ShopItemView = {
  ...(TEST_ITEMS[0] as ShopItemView),
  catalogPriceMillicents: 155_560,
};

describe('ProductSheet', () => {
  let fixture: ComponentFixture<ProductSheet>;
  let set: number[];

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const cta = (): HTMLButtonElement | null => el().querySelector<HTMLButtonElement>('.cta');
  const plus = (): HTMLButtonElement | null =>
    el().querySelectorAll<HTMLButtonElement>('app-quantity-rail button')[1] ?? null;
  const minus = (): HTMLButtonElement | null =>
    el().querySelectorAll<HTMLButtonElement>('app-quantity-rail button')[0] ?? null;

  /** `pro` : une société est injectée, donc l'assiette est le hors taxe. */
  function mount(product: ShopItemView, quantity: number, pro: boolean): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProductSheet],
      providers: [
        provideHttpClient(),
        providePick(new StaffPickDouble()),
        ...(pro
          ? [
              {
                provide: ClientCompany,
                useValue: { company: signal<Partial<CompanyView>>({ status: 'active' }) },
              },
            ]
          : []),
      ],
    });
    fixture = TestBed.createComponent(ProductSheet);
    fixture.componentRef.setInput('product', product);
    fixture.componentRef.setInput('quantity', quantity);
    set = [];
    fixture.componentInstance.quantitySet.subscribe((n) => set.push(n));
    fixture.detectChanges();
  }

  const click = (button: HTMLButtonElement | null | undefined): void => {
    button?.click();
    fixture.detectChanges();
  };

  // Sans photo, le logo de la maison, décoratif (Hugo, 2026-10-28).
  it('montre le logo de la maison, sans alternative, quand la pièce n’a pas de photo', () => {
    mount({ ...(TEST_ITEMS[0] as ShopItemView), image: null }, 0, false);
    const img = el().querySelector('.photo img');
    expect(img?.getAttribute('src')).toBe('brand/lfc-mark.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.hasAttribute('data-house-mark')).toBe(true);
  });

  it('garde la photo quand la pièce en a une', () => {
    const url = 'https://media.example/products/croissant.jpg';
    mount(
      {
        ...(TEST_ITEMS[0] as ShopItemView),
        image: { url, alt: 'Un croissant', width: null, height: null },
      },
      0,
      false,
    );
    const img = el().querySelector('.photo img');
    expect(img?.getAttribute('src')).toContain('croissant.jpg');
    expect(img?.hasAttribute('data-house-mark')).toBe(false);
  });

  it('part d’une pièce quand rien n’est au panier', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    expect(el().querySelector('app-quantity-rail .qty')?.textContent?.trim()).toBe('1');
    expect(cta()?.textContent).toContain('Ajouter 1');
    // 1 × 1,40 € HT
    expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('1,40 € HT');
  });

  it('part de la quantité au panier quand il y en a', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 4, true);

    expect(el().querySelector('app-quantity-rail .qty')?.textContent?.trim()).toBe('4');
  });

  /**
   * 🔴 Le stepper règle un BROUILLON : il ne touche pas le panier. Seul le bouton
   * du pied émet, et il émet la quantité à POSER, pas un incrément.
   */
  it('ne touche pas le panier au stepper, et pose le brouillon au clic', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    click(plus());
    click(plus());
    expect(set).toEqual([]);

    click(cta());
    expect(set).toEqual([3]);
  });

  it('ne descend pas sous une pièce', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    expect(minus()?.disabled).toBe(true);
  });

  it('dit « Déjà au panier », désactivé, quand le brouillon égale le panier', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 2, true);

    expect(cta()?.textContent).toContain(FR.product.inCart);
    expect(cta()?.disabled).toBe(true);
  });

  it('dit « Mettre à jour » dès que le brouillon s’écarte du panier', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 2, true);

    click(plus());

    expect(cta()?.textContent).toContain(FR.product.update);
    expect(cta()?.disabled).toBe(false);
    click(cta());
    expect(set).toEqual([3]);
  });

  it('propose les lots × 6 · × 12 · × 24 au professionnel, et met en avant celui choisi', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);
    const batches = (): HTMLButtonElement[] =>
      Array.from(el().querySelectorAll<HTMLButtonElement>('.batch'));

    expect(batches().map((b) => b.textContent?.trim())).toEqual(['× 6', '× 12', '× 24']);

    click(batches()[1]);

    expect(batches()[1]?.classList.contains('current')).toBe(true);
    expect(cta()?.textContent).toContain('Ajouter 12');
    // 12 × 1,40 € HT
    expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('16,80 € HT');
  });

  it('ne propose AUCUN lot à un particulier', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, false);

    expect(el().querySelector('.batch')).toBeNull();
  });

  it('garde l’assiette TTC du particulier, mention comprise', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, false);

    expect(el().querySelector('.amount')?.textContent?.trim()).toBe('1,48 €');
    expect(el().querySelector('.per')?.textContent).toContain(FR.shop.ttcSuffix);
    expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('1,48 € TTC');
  });

  it('écrit finement le prix au kilo sous le prix d’une pièce, dans l’assiette du lecteur', () => {
    mount({ ...(TEST_ITEMS[0] as ShopItemView), publicPricePerKgTtcCents: 1_590 }, 0, false);

    expect(el().querySelector('.amount')?.textContent?.trim()).toBe('1,48 €');
    expect(el().querySelector('.per-kilo')?.textContent?.trim()).toBe('15,90 € / kg TTC');
  });

  it('ne redit pas le prix au kilo d’un article au poids', () => {
    mount(
      {
        ...(TEST_ITEMS[0] as ShopItemView),
        saleUnit: 'weight',
        weightStepGrams: 50,
        weightMinGrams: null,
        publicPricePerKgTtcCents: 1_590,
      },
      0,
      false,
    );

    expect(el().querySelector('.per-kilo')).toBeNull();
  });

  /** P4 de `vente-au-poids.md` : le saumon se vend au poids, par 50 g, dès 200 g. */
  describe('un article au poids', () => {
    // 12,40 € TTC le kilo pour un particulier ; 11,75 € HT le kilo pour un pro.
    const SALMON: ShopItemView = {
      ...(TEST_ITEMS[0] as ShopItemView),
      sku: 'SAU-001',
      name: 'Saumon gravlax',
      unitPriceMillicents: 1_175_000,
      unitPriceTtcCents: 1_240,
      saleUnit: 'weight',
      weightStepGrams: 50,
      weightMinGrams: 200,
    };
    const qty = (): string =>
      el().querySelector('app-quantity-rail .qty')?.textContent?.trim() ?? '';

    it('dit le prix au kilo, dans l’assiette du lecteur', () => {
      mount(SALMON, 0, false);

      expect(el().querySelector('.amount')?.textContent?.trim()).toBe('12,40 €');
      expect(el().querySelector('.per')?.textContent?.trim()).toBe('TTC / kg');
    });

    it('part du minimum, et le bouton dit « Ajouter 200 g » avec le total au poids', () => {
      mount(SALMON, 0, false);

      expect(qty()).toBe('200 g');
      expect(minus()?.disabled).toBe(true);
      expect(cta()?.textContent).toContain('Ajouter 200 g');
      // 12,40 € × 200 g / 1000
      expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('2,48 € TTC');
    });

    it('avance au pas de l’article, et pose des grammes au panier', () => {
      mount(SALMON, 0, false);

      click(plus());
      click(plus());
      expect(qty()).toBe('300 g');

      click(cta());
      expect(set).toEqual([300]);
    });

    it('dit les kilos au-delà du kilo', () => {
      mount(SALMON, 1250, false);

      expect(qty()).toBe('1,25 kg');
    });

    it('ne propose aucun lot de pièces, même à un professionnel', () => {
      mount(SALMON, 0, true);

      expect(el().querySelector('.batch')).toBeNull();
      expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('2,35 € HT');
    });
  });

  it('dérive « Prix pro −10 % » des deux montants servis', () => {
    mount(NEGOTIATED, 0, true);

    expect(el().querySelector('.price-was')).not.toBeNull();
    expect(el().querySelector('.discount')?.textContent?.trim()).toBe('Prix pro −10 %');
  });

  /** RGAA 3.1 (lot A5) : la rature ne s'entend pas, une phrase la dit. */
  it('dit l’ancien et le nouveau prix au lecteur d’écran, et cache le doublon', () => {
    mount(NEGOTIATED, 0, true);

    expect(el().querySelector('.pricing .sr-only')?.textContent?.trim()).toBe(
      'Ancien prix : 1,56 €, nouveau prix : 1,40 € HT / pièce',
    );
    expect(el().querySelector('.price-was')?.getAttribute('aria-hidden')).toBe('true');
    expect(el().querySelector('.amount')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sans tarif barré, ni rature ni pourcentage', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    expect(el().querySelector('.price-was')).toBeNull();
    expect(el().querySelector('.discount')).toBeNull();
  });

  /** La fournée a cédé sa place aux allergènes (Hugo, 2026-10-27) : plus de ligne. */
  it('ne montre plus la fournée entre les filets', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    expect(el().querySelectorAll('.fact dt')).toHaveLength(0);
  });

  /** D8 : la fiche ne propose pas d'ajouter tant que l'opération n'est pas ouverte. */
  describe('un article réservé à une opération', () => {
    function mountOperation(state: ShopOperationState): void {
      mount(testOperationItem(state), 0, false);
      hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue(state));
      fixture.detectChanges();
    }

    const facts = (): string[] =>
      Array.from(el().querySelectorAll('.fact')).map(
        (fact) =>
          `${fact.querySelector('dt')?.textContent?.trim() ?? ''} ${fact.querySelector('dd')?.textContent?.trim() ?? ''}`,
      );

    it('annoncée : dit la date d’ouverture, sans geste d’ajout', () => {
      mountOperation('announced');

      expect(el().querySelector('.soon')?.textContent?.trim()).toBe('Ouvre le 15 nov.');
      expect(cta()).toBeNull();
    });

    it('close : « Commandes closes », sans geste d’ajout', () => {
      mountOperation('closed');

      expect(el().querySelector('.soon')?.textContent?.trim()).toBe(FR.shop.operationClosed);
      expect(cta()).toBeNull();
    });

    it('ouverte : l’ajout, et les jours de retrait en ligne discrète', () => {
      mountOperation('open');

      expect(cta()).not.toBeNull();
      expect(facts()).toContain('Retrait du 20 au 24 déc.');
    });

    it('un article courant ne porte aucune ligne de retrait', () => {
      mount(TEST_ITEMS[0] as ShopItemView, 0, false);

      expect(cta()).not.toBeNull();
      expect(facts().some((fact) => fact.startsWith(FR.product.operationPickup))).toBe(false);
    });
  });
  /** La limite propre de la pièce, quand le serveur la sert (Hugo, 2026-10-21). */
  it('dit « Préparé sur commande » quand la pièce porte une limite plus stricte', () => {
    mount(
      { ...(TEST_ITEMS[0] as ShopItemView), orderTimeLimit: { daysBefore: 2, time: '12:00' } },
      0,
      false,
    );

    expect(el().querySelector('[data-made-to-order]')?.textContent?.trim()).toBe(
      'Préparé sur commande — à commander 2 jours à l’avance, avant 12\u00a0h',
    );
  });

  it('ne dit rien quand la pièce suit la règle générale', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, false);

    expect(el().querySelector('[data-made-to-order]')).toBeNull();
  });

  /** Les allergènes (`plan-allergenes-en-boutique.md`, Hugo, 2026-10-27). */
  const withAllergens = (allergens: ShopItemView['allergens']): ShopItemView => ({
    ...(TEST_ITEMS[0] as ShopItemView),
    ...(allergens === undefined ? {} : { allergens }),
  });
  const lists = (): string[][] =>
    [...el().querySelectorAll('[data-allergens] ul')].map((list) =>
      [...list.querySelectorAll('li')].map((item) => item.textContent?.trim() ?? ''),
    );

  it('liste les allergènes, puis « Peut contenir » et ses traces', () => {
    mount(
      withAllergens({ state: 'declared', contains: ['Gluten', 'Lait'], mayContain: ['Sésame'] }),
      0,
      false,
    );

    // Replié par défaut, derrière son titre (Hugo, 2026-10-27).
    expect(el().querySelector('[data-allergens] .allergens-title')?.textContent?.trim()).toBe(
      'Consulter les allergènes',
    );
    expect(lists()).toEqual([['Gluten', 'Lait'], ['Sésame']]);
    expect(el().querySelector('[data-may-contain]')?.textContent?.trim()).toBe('Peut contenir');
  });

  it('dit « Aucun allergène » quand c’est déclaré, et rien d’autre sans trace', () => {
    mount(withAllergens({ state: 'none', contains: [], mayContain: [] }), 0, false);

    expect(el().querySelector('[data-allergens-none]')?.textContent?.trim()).toBe(
      'Aucun allergène',
    );
    expect(el().querySelector('[data-may-contain]')).toBeNull();
    expect(lists()).toEqual([]);
  });

  it('sous précaution, encadre l’avertissement puis les traces complètes', () => {
    mount(
      withAllergens({ state: 'precautionary', contains: [], mayContain: ['Gluten', 'Lait'] }),
      0,
      false,
    );

    const callout = el().querySelector('[data-precautionary]');
    expect(callout?.textContent).toContain('Information précise non disponible');
    expect(callout?.querySelector('[data-may-contain]')?.textContent?.trim()).toBe('Peut contenir');
    expect(el().querySelector('[data-allergens-none]')).toBeNull();
    expect(lists()).toEqual([['Gluten', 'Lait']]);
  });

  it('ne dit rien des allergènes quand le serveur ne les sert pas', () => {
    mount(withAllergens(undefined), 0, false);

    expect(el().querySelector('[data-allergens]')).toBeNull();
  });
});

describe('ProductSheet — la suggestion du staff (RS2, fiche)', () => {
  let fixture: ComponentFixture<ProductSheet>;
  let pick: StaffPickDouble;
  let recorded: { sku: string; event: string }[];

  const card = (): HTMLElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.suggestion');
  const button = (name: 'add' | 'pitch'): HTMLButtonElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`.suggestion .${name}`);

  const croissant = TEST_ITEMS[0] as ShopItemView;
  const other = TEST_ITEMS.find((item) => item.sku !== croissant.sku);
  if (other === undefined) {
    throw new RangeError('la fixture du catalogue n’a qu’un article');
  }
  const VIEW: ShopSuggestion = {
    sku: other.sku,
    item: other,
    reason: { source: 'staff', ruleId: '01jrule', phrase: null },
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    pick = new StaffPickDouble();
    recorded = [];
    TestBed.configureTestingModule({
      imports: [ProductSheet],
      providers: [
        provideHttpClient(),
        providePick(pick),
        {
          provide: ProductAudience,
          useValue: { record: (sku: string, event: string) => recorded.push({ sku, event }) },
        },
      ],
    });
    fixture = TestBed.createComponent(ProductSheet);
    fixture.componentRef.setInput('product', croissant);
    fixture.detectChanges();
  });

  it('ouvre la demande pour la pièce ouverte, et la ferme avec la fiche', () => {
    expect(pick.opened).toEqual([croissant.sku]);

    fixture.componentRef.setInput('product', null);
    fixture.detectChanges();

    expect(pick.opened).toEqual([croissant.sku, null]);
  });

  it('sans règle applicable, aucune carte', () => {
    expect(card()).toBeNull();
  });

  it('montre la suggestion, « Vous aimerez aussi » sans phrase, et l’ajoute au « + »', () => {
    pick.current.set(VIEW);
    fixture.detectChanges();

    expect(card()?.textContent).toContain(FR.shop.alsoLike);
    expect(card()?.textContent).toContain(other.name);
    button('add')?.click();

    expect(pick.taken).toEqual([VIEW]);
    expect(pick.clicked).toEqual([]);
    expect(recorded).toEqual([{ sku: other.sku, event: 'added_to_cart' }]);
  });

  it('un clic sur la carte demande la fiche de l’article suggéré, sans l’ajouter', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    pick.current.set(VIEW);
    fixture.detectChanges();

    button('pitch')?.click();

    expect(pick.clicked).toEqual([VIEW]);
    expect(pick.taken).toEqual([]);
    expect(TestBed.inject(PieceRequest).latest()?.sku).toBe(other.sku);
    expect(recorded).toEqual([]);
  });

  it('ne se suggère jamais la pièce ouverte', () => {
    pick.current.set({ ...VIEW, sku: croissant.sku, item: croissant });
    fixture.detectChanges();

    expect(card()).toBeNull();
  });
});
