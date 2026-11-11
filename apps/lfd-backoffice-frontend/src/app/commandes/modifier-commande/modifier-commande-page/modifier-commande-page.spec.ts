import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  DEFAULT_DELIVERY_AVAILABILITY,
  type OrderRevisionQuoteView,
  type PickupAddressView,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  discountRefusals: [],
  settlement: { kind: 'as_placed' },
};

/** Le devis que rend le serveur — le règlement change selon le test (plan S2). */
let quoted: OrderRevisionQuoteView = QUOTE;

/** Le strict nécessaire d'un client pro actif : ce que la page lit au chargement. */
const PRO_CUSTOMER = { status: 'active', addresses: [] } as const;

interface Harness {
  readonly fixture: ComponentFixture<ModifierCommandePage>;
  readonly page: ModifierCommandePage;
  readonly quoteRevision: ReturnType<typeof vi.fn>;
  readonly revise: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.spyOn>;
}

/** La lecture des zones, épiée : l'audience qu'elle porte est le sujet du 0c. */
let zonesList = vi.fn(async (_audience?: string) => []);

/** La table des prix du client (L2b) : vide et lisible par défaut. */
let shelfPricesOf = vi.fn(async (_companyId: string): Promise<unknown> => ({
  items: [],
  audience: 'pro',
}));

async function mount(
  revise: () => Promise<unknown> = async () => ({ totalCents: 1583 }),
  order: object = ORDER,
): Promise<Harness> {
  zonesList = vi.fn(async (_audience?: string) => []);
  const quoteRevision = vi.fn(async () => quoted);
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
        useValue: { list: async () => [], habitsOf: async () => [], shelfPricesOf },
      },
      {
        provide: CommercialOrderEntrySource,
        useValue: {
          deliveryAvailability: async () => DEFAULT_DELIVERY_AVAILABILITY,
          customer: async () => ({ ...PRO_CUSTOMER }),
        },
      },
      {
        provide: PickupAddressesService,
        useValue: { list: async () => [POINT], listFor: async () => [POINT] },
      },
      { provide: DeliveryZonesService, useValue: { listFor: zonesList } },
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
    quoted = QUOTE;
  });

  describe('une commande payée par carte (plan S2, R15)', () => {
    const STAFF =
      "Cette commande est payée par carte : l'équipe ne peut pas l'augmenter. Demandez au client de modifier sa commande, ou passez une seconde commande.";

    it('dit le refus du serveur avant la saisie', async () => {
      const { fixture } = await mount(undefined, {
        ...ORDER,
        revisability: { revisable: false, reason: STAFF },
      });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-revisability-blocked]')?.textContent).toContain(
        "l'équipe ne peut pas l'augmenter",
      );
    });

    it('un devis de hausse carte : la phrase de l’équipe, et « Valider » reste fermé', async () => {
      quoted = { ...QUOTE, settlement: { kind: 'card_complement', complementCents: 380 } };
      const { fixture, page, revise } = await mount();
      await page['askQuote']();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-settlement-refusal]')?.textContent).toContain(
        'Demandez au client de modifier sa commande',
      );
      expect(el.querySelector<HTMLButtonElement>('[data-validate]')?.disabled).toBe(true);
      await page['validate']();
      expect(revise).not.toHaveBeenCalled();
    });

    it('une baisse carte (plan S1) : le remboursement dit, et l’équipe valide', async () => {
      quoted = { ...QUOTE, settlement: { kind: 'card_refund', refundCents: 800 } };
      const { fixture, page, revise } = await mount();
      await page['askQuote']();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-settlement-refund]')?.textContent).toContain(
        'seront remboursés sur la carte du client',
      );
      expect(el.querySelector('[data-settlement-refusal]')).toBeNull();
      await page['validate']();
      expect(revise).toHaveBeenCalled();
    });

    it('une carte déjà remboursée : la phrase, et « Valider » reste fermé', async () => {
      quoted = { ...QUOTE, settlement: { kind: 'card_not_revisable', reason: 'refunded' } };
      const { fixture, page, revise } = await mount();
      await page['askQuote']();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-settlement-refusal]')?.textContent).toContain(
        'déjà été remboursée',
      );
      await page['validate']();
      expect(revise).not.toHaveBeenCalled();
    });
  });

  describe('les prix du rayon du client (plan liste au prix du client, L2b)', () => {
    afterEach(() => {
      shelfPricesOf = vi.fn(async () => ({ items: [], audience: 'pro' }));
    });

    it('lit la table de la société de la commande, sans bandeau quand elle répond', async () => {
      const { fixture } = await mount(undefined, { ...ORDER, companyId: 'co_1' });
      expect(shelfPricesOf).toHaveBeenCalledWith('co_1');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-shelf-prices-unavailable]')).toBeNull();
    });

    it('une table en échec : la liste reste au prix d’étiquette, et le bandeau le dit', async () => {
      shelfPricesOf = vi.fn(async () => {
        throw new HttpErrorResponse({ status: 500 });
      });
      const { fixture } = await mount(undefined, { ...ORDER, companyId: 'co_1' });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-shelf-prices-unavailable]')?.textContent).toContain(
        'Prix de ce client indisponibles : le panier fait foi.',
      );
    });

    it('un particulier, sans société : aucune lecture, aucun bandeau', async () => {
      const { fixture } = await mount();
      expect(shelfPricesOf).not.toHaveBeenCalled();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-shelf-prices-unavailable]')).toBeNull();
    });
  });

  /**
   * Plan `plan-livraison-offerte.md`, 0c (2026-11-05) : le frais d'une zone
   * est celui de la clientèle du client pour qui l'on commande.
   */
  it('lit les zones pour un particulier en b2c', async () => {
    await mount();
    expect(zonesList).toHaveBeenCalledWith('b2c');
  });

  it('lit les zones pour une société active en b2b', async () => {
    await mount(undefined, { ...ORDER, companyId: 'co_1' });
    expect(zonesList).toHaveBeenCalledWith('b2b');
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
      expect.objectContaining({
        expectedRevision: 3,
        expectedTotalCents: QUOTE.totalCents,
        lines: [{ sku: 'BAG', quantity: 15 }],
      }),
    );
    expect(navigate).toHaveBeenCalledWith(['/commandes', 'ord_1']);
  });

  it('dit la remise perdue à côté de la ligne, et ferme « Valider »', async () => {
    const { fixture, page, quoteRevision, revise } = await mount();
    quoteRevision.mockResolvedValueOnce({
      ...QUOTE,
      discountRefusals: [
        {
          kind: 'below_threshold',
          label: { fr: 'Douze achetées', en: 'Twelve', it: 'Dodici' },
          minQuantity: 12,
          sku: 'BAG',
          quantity: 10,
        },
      ],
    });
    page['cart'].setQuantity('BAG', 10);
    await page['askQuote']();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.mc-line [data-line-refusal]')?.textContent).toContain(
      'la remise « Douze achetées » (dès 12)',
    );
    expect(el.querySelector<HTMLButtonElement>('[data-validate]')?.disabled).toBe(true);
    await page['validate']();
    expect(revise).not.toHaveBeenCalled();
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

  it('le total refusé (409 orders.total_changed) : relit le devis, dit le nouveau total, revalide', async () => {
    const changed = new HttpErrorResponse({
      status: 409,
      error: { code: 'orders.total_changed', message: 'Le total a changé.' },
    });
    const { fixture, page, quoteRevision, revise } = await mount(() => Promise.reject(changed));
    await page['askQuote']();
    quoteRevision.mockResolvedValueOnce({ ...QUOTE, totalCents: QUOTE.totalCents + 150 });
    await page['validate']();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(revise).toHaveBeenCalledWith(
      'ord_1',
      expect.objectContaining({ expectedTotalCents: QUOTE.totalCents }),
    );
    expect(quoteRevision).toHaveBeenCalledTimes(2);
    expect(page['refusal']()).toBeNull();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-total-changed]')?.textContent).toContain(
      'Le total TTC est passé',
    );
    expect(el.querySelector<HTMLButtonElement>('[data-validate]')?.disabled).toBe(false);
    revise.mockResolvedValueOnce({ totalCents: QUOTE.totalCents + 150 });
    await page['validate']();
    expect(revise).toHaveBeenLastCalledWith(
      'ord_1',
      expect.objectContaining({ expectedTotalCents: QUOTE.totalCents + 150 }),
    );
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
