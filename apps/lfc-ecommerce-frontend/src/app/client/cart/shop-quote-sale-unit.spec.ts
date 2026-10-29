import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ShopQuoteView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartStore } from './cart.store';
import { ShopQuote } from './shop-quote.service';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { loyaltyDouble, provideLoyalty } from '../client-loyalty.fixture';

/**
 * **L'unité d'une ligne, figée à l'ajout, et la ligne que le devis retire**
 * (`documentation/pricing/plan-changer-l-unite-de-vente.md`, § 8).
 *
 * Régression : le panier recalculait l'unité depuis le catalogue courant ; un
 * article passé au poids faisait partir « 3 » pièces en 3 g.
 */

const ITEM = TEST_ITEMS[0];
const SKU = ITEM?.sku ?? '';

const EMPTY_ANSWER: ShopQuoteView = {
  lines: [],
  subtotalHtCents: 0,
  discountCents: 0,
  discountAdjustment: null,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  deliveryVatMode: 'standard',
  vat: [],
  totalCents: 0,
};

const QUOTE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/quote') || request.url.endsWith('/shop/quote/mine');

function boot() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideWorkspace(workspaceDouble()),
      provideLoyalty(loyaltyDouble()),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const catalogue = TestBed.inject(ShopCatalogue);
  hydrateWith(catalogue, TEST_CATALOGUE);
  return {
    catalogue,
    quote: TestBed.inject(ShopQuote),
    cart: TestBed.inject(CartStore),
    http: TestBed.inject(HttpTestingController),
  };
}

function quiet(): void {
  TestBed.tick();
  vi.advanceTimersByTime(400);
  TestBed.tick();
}

/** Le même catalogue, où l'article se vend désormais au poids. */
function soldByWeight() {
  return {
    ...TEST_CATALOGUE,
    items: TEST_CATALOGUE.items.map((item) =>
      item.sku === SKU ? { ...item, saleUnit: 'weight' as const, weightStepGrams: 100 } : item,
    ),
  };
}

describe('ShopQuote — l’unité d’une ligne', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('une ligne ajoutée à la pièce part à la pièce, même si le catalogue est passé au poids', () => {
    const { catalogue, cart, http } = boot();
    cart.setQuantity(SKU, 3, undefined, 'piece');
    hydrateWith(catalogue, soldByWeight());
    quiet();

    const [asked] = http.match(QUOTE);
    expect((asked?.request.body as { lines: unknown[] }).lines).toEqual([
      { sku: SKU, quantity: 3 },
    ]);
    asked?.flush(EMPTY_ANSWER);
  });

  it('une ligne retirée par le serveur quitte le panier, et son motif reste jusqu’à ce qu’on la rajoute', () => {
    const { cart, quote, http } = boot();
    cart.setQuantity(SKU, 3, undefined, 'piece');
    quiet();

    http.match(QUOTE)[0]?.flush({
      ...EMPTY_ANSWER,
      removedLines: [
        { sku: SKU, name: ITEM?.name ?? '', reason: 'sale_unit_changed', saleUnit: 'weight' },
      ],
    });
    TestBed.tick();

    expect(cart.quantityOf(SKU)).toBe(0);
    expect(quote.removedLines().map((line) => line.sku)).toEqual([SKU]);

    cart.setQuantity(SKU, 100, undefined, 'weight');
    expect(quote.removedLines()).toEqual([]);
    expect(cart.units()[SKU]).toBe('weight');
  });
});
