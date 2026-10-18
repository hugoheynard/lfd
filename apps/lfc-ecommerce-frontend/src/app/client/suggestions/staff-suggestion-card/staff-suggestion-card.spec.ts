import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CartSuggestionView } from '@lfd/contracts';

import { ProductAudience } from '../../audience/product-audience.service';
import { ClientCart } from '../../cart/client-cart.service';
import { formatCents } from '../../format-money';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { PieceRequest } from '../../shop/piece-request.service';
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
  let opened: CartSuggestionView[];
  let asked: string[];
  const showsTtc = signal(true);

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const card = (): HTMLElement | null => root().querySelector('.suggestion');
  const pitch = (): HTMLButtonElement | null => root().querySelector('button.pitch');
  const plus = (): HTMLButtonElement | null => root().querySelector('button.add');

  function mount(view: CartSuggestionView, fallbackTitle: string): void {
    TestBed.resetTestingModule();
    localStorage.clear();
    recorded = [];
    taken = [];
    opened = [];
    asked = [];
    TestBed.configureTestingModule({
      imports: [StaffSuggestionCard],
      providers: [
        provideHttpClient(),
        { provide: ShopPriceBasis, useValue: { showsTtc } },
        {
          provide: ProductAudience,
          useValue: { record: (sku: string, event: string) => recorded.push({ sku, event }) },
        },
        { provide: PieceRequest, useValue: { open: (sku: string) => asked.push(sku) } },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    fixture = TestBed.createComponent(StaffSuggestionCard);
    fixture.componentRef.setInput('view', view);
    fixture.componentRef.setInput('fallbackTitle', fallbackTitle);
    fixture.componentInstance.taken.subscribe((v) => taken.push(v));
    fixture.componentInstance.opened.subscribe((v) => opened.push(v));
    fixture.detectChanges();
  }

  beforeEach(() => showsTtc.set(true));

  it('écrit la phrase du staff, le nom et le prix TTC d’un particulier', () => {
    mount(VIEW, 'Vous aimerez aussi');

    expect(card()?.textContent).toContain('Avec le pain, la terrine');
    expect(card()?.textContent).toContain(BAGUETTE.name);
    expect(card()?.textContent).toContain(`${formatCents(BAGUETTE.unitPriceTtcCents)} TTC`);
  });

  it('sans phrase, le titre par défaut de l’emplacement ; le HT à un pro', () => {
    showsTtc.set(false);
    mount({ ...VIEW, reason: { ...VIEW.reason, phrase: null } }, 'Vous aimerez aussi');

    expect(card()?.textContent).toContain('Vous aimerez aussi');
    expect(card()?.textContent).toContain(`${shelfPriceLabel(BAGUETTE, false)} HT`);
  });

  it('un clic sur la carte ouvre la fiche de l’article, et n’ajoute rien', () => {
    mount(VIEW, 'Vous aimerez aussi');

    pitch()?.click();

    expect(opened).toEqual([VIEW]);
    expect(asked).toEqual(['PAI-001']);
    expect(taken).toEqual([]);
    expect(recorded).toEqual([]);
    expect(TestBed.inject(ClientCart).quantityOf('PAI-001')).toBe(0);
  });

  it('le « + » émet la prise, compte added_to_cart, ajoute une pièce, et n’ouvre rien', () => {
    mount(VIEW, 'Vous aimerez aussi');

    plus()?.click();

    expect(taken).toEqual([VIEW]);
    expect(opened).toEqual([]);
    expect(asked).toEqual([]);
    expect(recorded).toEqual([{ sku: 'PAI-001', event: 'added_to_cart' }]);
    expect(TestBed.inject(ClientCart).quantityOf('PAI-001')).toBe(1);
  });

  it('deux boutons distincts, chacun nommé : la carte par ce qu’elle montre, le « + » par son geste', () => {
    mount(VIEW, 'Vous aimerez aussi');

    expect(pitch()?.contains(plus())).toBe(false);
    expect(pitch()?.textContent).toContain(BAGUETTE.name);
    expect(plus()?.getAttribute('aria-label')).toBe(`Ajouter ${BAGUETTE.name}`);
  });
});
