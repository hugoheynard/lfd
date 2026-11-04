import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ShopQuotePayload, ShopQuoteView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartStore } from './cart.store';
import { ShopQuote } from './shop-quote.service';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { loyaltyDouble, provideLoyalty } from '../client-loyalty.fixture';
import { OrderContextStore, type ServiceChoice } from '../order-context.store';

/**
 * **Le créneau part avec le devis** (décision du 2026-10-31, `promotions.md`,
 * § 2.18) : une promotion jugée « au créneau » se chiffre au panier comme à la
 * passation, et changer de créneau redemande le décompte.
 */
const SKU = TEST_ITEMS[0]?.sku ?? '';
const ANSWER: ShopQuoteView = {
  lines: [],
  subtotalHtCents: 1_200,
  discountCents: 0,
  discountAdjustment: null,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  deliveryVatMode: 'standard',
  vat: [{ rate: 5.5, amountCents: 66 }],
  pretaxCents: 1200,
  totalCents: 1_266,
};
const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '17 h 30 – 18 h',
  window: { start: '17:30', end: '18:00' },
  date: '2099-01-05',
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
  hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  TestBed.inject(ShopQuote);
  return {
    cart: TestBed.inject(CartStore),
    order: TestBed.inject(OrderContextStore),
    http: TestBed.inject(HttpTestingController),
  };
}

function quiet(): void {
  TestBed.tick();
  vi.advanceTimersByTime(400);
  TestBed.tick();
}

describe('le créneau au devis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('envoie le jour et le créneau choisis, sous les champs de la passation', () => {
    const { cart, order, http } = boot();
    order.choice.set(AU_LABO);
    cart.setQuantity(SKU, 1);
    quiet();

    const body = http.expectOne(QUOTE).request.body as ShopQuotePayload;
    expect(body.requestedWindow).toEqual({ start: '17:30', end: '18:00' });
    expect(body.requestedDeliveryDate).toBe(order.choice()?.date);
    http.verify();
  });

  it('redemande le décompte quand le créneau change', () => {
    const { cart, order, http } = boot();
    order.choice.set(AU_LABO);
    cart.setQuantity(SKU, 1);
    quiet();
    http.expectOne(QUOTE).flush(ANSWER);

    order.choice.set({ ...AU_LABO, window: { start: '09:00', end: '10:00' } });
    quiet();

    const body = http.expectOne(QUOTE).request.body as ShopQuotePayload;
    expect(body.requestedWindow).toEqual({ start: '09:00', end: '10:00' });
    http.verify();
  });

  it('sans créneau, les deux champs sont absents — le devis d’avant', () => {
    const { cart, order, http } = boot();
    order.choice.set({ ...AU_LABO, window: null });
    cart.setQuantity(SKU, 1);
    quiet();

    const body = http.expectOne(QUOTE).request.body as ShopQuotePayload;
    expect(body).not.toHaveProperty('requestedWindow');
    expect(body).not.toHaveProperty('requestedDeliveryDate');
    http.verify();
  });
});
