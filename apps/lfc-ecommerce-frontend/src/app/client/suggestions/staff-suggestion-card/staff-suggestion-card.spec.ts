import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CartSuggestionView } from '@lfd/contracts';

import { ProductAudience } from '../../audience/product-audience.service';
import { ClientCart } from '../../cart/client-cart.service';
import { formatCents } from '../../format-money';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { shelfPriceLabel, ShopPriceBasis } from '../../shop/shop-price-basis.service';
import { StaffSuggestionCard } from './staff-suggestion-card';

const BAGUETTE = TEST_ITEMS.find((item) => item.sku === 'PAI-001');
if (BAGUETTE === undefined) {
  throw new RangeError('la fixture du catalogue n’a plus de PAI-001');
}

const VIEW: CartSuggestionView = {
  sku: 'PAI-001',
  item: BAGUETTE,
  reason: { source: 'staff', ruleId: '01jrule', phrase: { fr: 'Avec le pain, la terrine' } },
};

describe('StaffSuggestionCard', () => {
  let fixture: ComponentFixture<StaffSuggestionCard>;
  let recorded: { sku: string; event: string }[];
  let taken: CartSuggestionView[];
  const showsTtc = signal(true);

  const button = (): HTMLButtonElement | null =>
    (fixture.nativeElement as HTMLElement).querySelector('button.suggestion');

  function mount(view: CartSuggestionView, fallbackTitle: string): void {
    TestBed.resetTestingModule();
    localStorage.clear();
    recorded = [];
    taken = [];
    TestBed.configureTestingModule({
      imports: [StaffSuggestionCard],
      providers: [
        provideHttpClient(),
        { provide: ShopPriceBasis, useValue: { showsTtc } },
        {
          provide: ProductAudience,
          useValue: { record: (sku: string, event: string) => recorded.push({ sku, event }) },
        },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    fixture = TestBed.createComponent(StaffSuggestionCard);
    fixture.componentRef.setInput('view', view);
    fixture.componentRef.setInput('fallbackTitle', fallbackTitle);
    fixture.componentInstance.taken.subscribe((v) => taken.push(v));
    fixture.detectChanges();
  }

  beforeEach(() => showsTtc.set(true));

  it('écrit la phrase du staff, le nom et le prix TTC d’un particulier', () => {
    mount(VIEW, 'Vous aimerez aussi');

    expect(button()?.textContent).toContain('Avec le pain, la terrine');
    expect(button()?.textContent).toContain(BAGUETTE.name);
    expect(button()?.textContent).toContain(`${formatCents(BAGUETTE.unitPriceTtcCents)} TTC`);
  });

  it('sans phrase, le titre par défaut de l’emplacement ; le HT à un pro', () => {
    showsTtc.set(false);
    mount({ ...VIEW, reason: { ...VIEW.reason, phrase: null } }, 'Vous aimerez aussi');

    expect(button()?.textContent).toContain('Vous aimerez aussi');
    expect(button()?.textContent).toContain(`${shelfPriceLabel(BAGUETTE, false)} HT`);
  });

  it('le « + » émet la prise, compte added_to_cart et ajoute une pièce', () => {
    mount(VIEW, 'Vous aimerez aussi');

    button()?.click();

    expect(taken).toEqual([VIEW]);
    expect(recorded).toEqual([{ sku: 'PAI-001', event: 'added_to_cart' }]);
    expect(TestBed.inject(ClientCart).quantityOf('PAI-001')).toBe(1);
  });
});
