import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type OrderRevisionQuoteView,
  type PickupAddressView,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryZonesService } from '../../../b2b/reglages/delivery-zones.service';
import { PickupAddressesService } from '../../../b2b/reglages/pickup-addresses.service';
import { NotifyService } from '../../../notify.service';
import { AdminCatalogService } from '../../catalog.service';
import { CommercialOrderEntrySource } from '../../order-entry-sources';
import { AdminOrdersService } from '../../orders.service';
import { ModifierCommandePage } from './modifier-commande-page';

const POINT: PickupAddressView = {
  discounts: { b2b: null, b2c: null },
  opening: { publicOpening: { start: '07:00', end: '10:00' }, proPickup: null },
  id: 'pk_labo',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '73000',
  ville: 'Chambéry',
  pays: 'France',
};

/** La part de la commande que la modification lit — le reste ne sert pas ici. */
const ORDER = {
  id: 'ord_1',
  orderNumber: 'ORD-7',
  companyId: null,
  lines: [{ sku: 'BAG', productName: 'Baguette', unitPriceMillicents: 95_000, quantity: 12 }],
  fulfillmentMethod: 'pickup',
  pickupAddress: POINT,
  pickupAddressId: 'pk_labo',
  deliveryAddress: null,
  fulfillment: {
    window: { value: { start: '08:00', end: '09:00' }, source: 'override' },
    contact: { value: null, source: 'default' },
    signatureRequired: { value: false, source: 'default' },
  },
  requestedDeliveryDate: '2026-11-02',
  note: 'Sans sel',
};

const QUOTE: OrderRevisionQuoteView = {
  revision: 3,
  lines: [],
  subtotalCents: 1500,
  discountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  voucherDiscountCents: 0,
  vatCents: 83,
  totalCents: 1583,
  previousTotalCents: 1203,
  differenceCents: 380,
  changes: ['lines'],
};

interface Harness {
  readonly fixture: ComponentFixture<ModifierCommandePage>;
  readonly page: ModifierCommandePage;
  readonly quoteRevision: ReturnType<typeof vi.fn>;
  readonly revise: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.spyOn>;
}

async function mount(
  revise: () => Promise<unknown> = async () => ({ totalCents: 1583 }),
  order: object = ORDER,
): Promise<Harness> {
  const quoteRevision = vi.fn(async () => QUOTE);
  const reviseFn = vi.fn(revise);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AdminOrdersService,
        useValue: { byId: async () => order, quoteRevision, revise: reviseFn },
      },
      {
        provide: AdminCatalogService,
        useValue: { list: async () => [], habitsOf: async () => [] },
      },
      {
        provide: CommercialOrderEntrySource,
        useValue: { deliveryAvailability: async () => DEFAULT_DELIVERY_AVAILABILITY },
      },
      { provide: PickupAddressesService, useValue: { list: async () => [POINT] } },
      { provide: DeliveryZonesService, useValue: { list: async () => [] } },
      { provide: NotifyService, useValue: { success: vi.fn() } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ModifierCommandePage);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.detectChanges();
  // Le chargement enchaîne deux lectures : on l'attend pour de bon.
  await fixture.componentInstance['load']();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, quoteRevision, revise: reviseFn, navigate };
}

describe('modifier une commande depuis le back-office', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ouvre la saisie préremplie avec la commande', async () => {
    const { page } = await mount();
    expect(page['cart'].lines()).toEqual([
      { sku: 'BAG', name: 'Baguette', unitPriceMillicents: 95_000, quantity: 12 },
    ]);
    expect(page['draft'].pickupId()).toBe('pk_labo');
    expect(page['draft'].requestedDate()).toBe('2026-11-02');
    expect(page['draft'].note()).toBe('Sans sel');
    expect(page['blockers']()).toEqual([]);
    expect(page['content']()).not.toBeNull();
  });

  it('montre le devis, puis valide avec la révision qu’il a rendue', async () => {
    const { fixture, page, revise, navigate } = await mount();
    page['cart'].setQuantity('BAG', 15);
    await page['askQuote']();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Articles et quantités');
    expect(page['difference']()).toMatch(/^\+ /u);

    await page['validate']();
    expect(revise).toHaveBeenCalledWith(
      'ord_1',
      expect.objectContaining({ expectedRevision: 3, lines: [{ sku: 'BAG', quantity: 15 }] }),
    );
    expect(navigate).toHaveBeenCalledWith(['/commandes', 'ord_1']);
  });

  it('oublie le devis dès que la commande voulue change', async () => {
    const { page } = await mount();
    await page['askQuote']();
    expect(page['quote']()).not.toBeNull();
    page['draft'].note.set('Avec sel');
    expect(page['quote']()).toBeNull();
  });

  it('propose de relire quand la commande a été modifiée ailleurs (409)', async () => {
    const stale = new HttpErrorResponse({
      status: 409,
      error: {
        code: 'orders.revise.stale_revision',
        message: 'La commande a été modifiée ailleurs.',
      },
    });
    const { fixture, page } = await mount(() => Promise.reject(stale));
    await page['askQuote']();
    await page['validate']();
    fixture.detectChanges();
    expect(page['stale']()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-revise-refusal]')?.textContent).toContain('modifiée ailleurs');
    expect(el.querySelector('[data-revise-refusal]')?.textContent).toContain('Relire la commande');
  });

  it('affiche le refus du serveur dans ses mots', async () => {
    const refused = new HttpErrorResponse({
      status: 409,
      error: { code: 'orders.revise.card_settled', message: 'Commande réglée par carte.' },
    });
    const { page } = await mount(() => Promise.reject(refused));
    await page['askQuote']();
    await page['validate']();
    expect(page['refusal']()).toBe('Commande réglée par carte.');
    expect(page['stale']()).toBe(false);
  });

  describe('après l’arrêt du plan (plan A2) : les quantités seulement', () => {
    const NOTE =
      'Le plan du fournil est arrêté pour cette commande : seules les quantités changent.';
    const INSCRIBED = { ...ORDER, revisability: { revisable: true, quantitiesOnly: NOTE } };

    it('dit pourquoi, retire les sources d’articles et verrouille le reste', async () => {
      const { fixture } = await mount(undefined, INSCRIBED);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-quantities-only]')?.textContent).toContain(NOTE);
      expect(el.querySelector('app-source-produits')).toBeNull();
      expect(el.querySelector<HTMLFieldSetElement>('fieldset.mc-locked')?.disabled).toBe(true);
    });

    it('une quantité change : le devis se demande', async () => {
      const { page } = await mount(undefined, INSCRIBED);
      page['cart'].setQuantity('BAG', 15);
      expect(page['blockers']()).toEqual([]);
      expect(page['content']()).not.toBeNull();
    });

    it('un article retiré : refusé avant le serveur, nommé', async () => {
      const { page } = await mount(undefined, INSCRIBED);
      page['cart'].remove('BAG');
      expect(page['blockers']().join(' ')).toContain('« Baguette » retiré');
    });

    it('avant l’arrêt, rien n’est verrouillé', async () => {
      const { fixture } = await mount();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-quantities-only]')).toBeNull();
      expect(el.querySelector<HTMLFieldSetElement>('fieldset.mc-locked')?.disabled).toBe(false);
    });
  });
});
