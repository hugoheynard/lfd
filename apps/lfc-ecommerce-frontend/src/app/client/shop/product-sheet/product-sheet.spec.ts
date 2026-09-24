import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyView, ShopItemView } from '@lfd/contracts';

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
import { ProductSheet } from './product-sheet';

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

  it('part d’une pièce quand rien n’est au panier', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    expect(el().querySelector('app-quantity-rail .qty')?.textContent?.trim()).toBe('1');
    expect(cta()?.textContent).toContain('Ajouter 1');
    // 1 × 1,40 € HT
    expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('1,40 €');
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
    expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('16,80 €');
  });

  it('ne propose AUCUN lot à un particulier', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, false);

    expect(el().querySelector('.batch')).toBeNull();
  });

  it('garde l’assiette TTC du particulier, mention comprise', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, false);

    expect(el().querySelector('.amount')?.textContent?.trim()).toBe('1,48 €');
    expect(el().querySelector('.per')?.textContent).toContain(FR.shop.ttcSuffix);
    expect(cta()?.querySelector('.cta-total')?.textContent?.trim()).toBe('1,48 €');
  });

  it('dérive « Prix pro −10 % » des deux montants servis', () => {
    mount(NEGOTIATED, 0, true);

    expect(el().querySelector('.price-was')).not.toBeNull();
    expect(el().querySelector('.discount')?.textContent?.trim()).toBe('Prix pro −10 %');
  });

  it('sans tarif barré, ni rature ni pourcentage', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    expect(el().querySelector('.price-was')).toBeNull();
    expect(el().querySelector('.discount')).toBeNull();
  });

  /** Ce que le serveur ne sert pas n'a pas de ligne : ni pièce, ni allergènes. */
  it('ne montre que la fournée entre les filets', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);

    const keys = Array.from(el().querySelectorAll('.fact dt')).map((dt) => dt.textContent?.trim());
    expect(keys).toEqual([FR.product.oven]);
  });

  it('au niveau `browse`, remplace le geste par la mention', () => {
    mount(TEST_ITEMS[0] as ShopItemView, 0, true);
    fixture.componentRef.setInput('orderable', false);
    fixture.detectChanges();

    expect(cta()).toBeNull();
    expect(el().textContent).toContain(FR.shop.orderingSoon);
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
});
