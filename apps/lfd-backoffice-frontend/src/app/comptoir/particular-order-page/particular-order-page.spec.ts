import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  NO_PICKUP_DISCOUNTS,
  type AdminOrderEstimateView,
  type CatalogItemView,
  type CounterParticularCard,
  type CustomerShelfPricesView,
  type PickupAddressView,
  type StaffPermission,
} from '@lfd/contracts';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { AdminCatalogService } from '../../commandes/catalog.service';
import { CounterParticularsService } from '../counter-particulars.service';
import { OfferedParticularOrdersService } from '../offered-particular-orders.service';
import { ParticularOrderPage } from './particular-order-page';

function point(id: string, b2c = true): PickupAddressView {
  return {
    id,
    label: id,
    ligne1: '1 rue',
    ligne2: '',
    codePostal: '73000',
    ville: 'Chambéry',
    pays: 'FR',
    discounts: NO_PICKUP_DISCOUNTS,
    pickupAudiences: { b2b: true, b2c },
    opening: { publicOpening: { start: '08:00', end: '10:00' }, proPickup: null },
  };
}

const JEANNE: CounterParticularCard = {
  id: 'u1',
  firstName: 'Jeanne',
  lastName: '',
  maskedEmail: 'j***@exemple.fr',
  maskedPhone: '',
  connectable: false,
  noShowCount: 0,
};

const ESTIMATE: AdminOrderEstimateView = {
  amounts: {
    vatMethod: 'line_ht',
    lines: [],
    subtotalCents: 500,
    discountCents: 0,
    discountTtcCents: null,
    discounts: [],
    deliveryFeeCents: 0,
    deliveryFeeTtcCents: null,
    lateFeeCents: 0,
    lateFeeVatRatePercent: null,
    vatCents: 28,
    vatShares: [],
    pretaxCents: 500,
    totalCents: 528,
  },
  cutoff: null,
  refusal: null,
  warnings: [],
};

/** Offerte, motif écrit : total nul, et la valeur offerte que le serveur rend. */
const OFFERED_ESTIMATE: AdminOrderEstimateView = {
  ...ESTIMATE,
  amounts:
    ESTIMATE.amounts === null
      ? null
      : { ...ESTIMATE.amounts, totalCents: 0, offeredTotalCents: 528 },
};

function catalogItem(sku: string, name: string): CatalogItemView {
  return { sku, name, unitPriceMillicents: 100_000, vatRate: 5.5, family: null, category: null };
}

/** Le catalogue de l'équipe : un article ouvert, un article réservé aux pros. */
const CATALOGUE = [catalogItem('OPEN', 'Croissant'), catalogItem('PRO', 'Pain réservé')];

/** Le rayon public : le seul croissant, à son TTC barré par une promotion publique. */
const SHELF: CustomerShelfPricesView = {
  audience: 'public',
  items: [
    {
      sku: 'OPEN',
      unitPriceMillicents: 90_000,
      struckFromMillicents: 100_000,
      unitPriceTtcCents: 95,
      struckFromTtcCents: 106,
      lockedReason: null,
    },
  ],
};

function mount(
  granted: readonly StaffPermission[] = ['handover_counter:read'],
  shelfPrices: () => Promise<CustomerShelfPricesView> = () => Promise.resolve(SHELF),
) {
  const place = vi.fn(() => Promise.resolve({ id: 'o1', orderNumber: 'CMD-1', totalCents: 528 }));
  const estimate = vi.fn(() => of(ESTIMATE));
  const offeredEstimate = vi.fn(() => of(OFFERED_ESTIMATE));
  const offeredPlace = vi.fn(() =>
    Promise.resolve({ id: 'o2', orderNumber: 'CMD-2', totalCents: 0, offeredTotalCents: 528 }),
  );
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: CounterParticularsService,
        useValue: { place, estimate, shelfPrices, search: vi.fn() },
      },
      {
        provide: OfferedParticularOrdersService,
        useValue: { estimate: offeredEstimate, place: offeredPlace },
      },
      { provide: AdminCatalogService, useValue: { list: () => Promise.resolve(CATALOGUE) } },
      {
        provide: PickupAddressesService,
        useValue: { list: () => Promise.resolve([point('a'), point('b'), point('pro', false)]) },
      },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(ParticularOrderPage);
  // Le comptoir a ouvert la saisie depuis son point « b » (`?retour=/comptoir&point=b`).
  fixture.componentRef.setInput('retour', '/comptoir');
  fixture.componentRef.setInput('point', 'b');
  return { fixture, place, estimate, offeredEstimate, offeredPlace };
}

async function settle(fixture: ComponentFixture<ParticularOrderPage>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ParticularOrderPage — la commande d’un particulier au comptoir', () => {
  it('commence par chercher la personne, et ne propose que les points des particuliers', async () => {
    const { fixture } = mount();
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-particular-picker')).not.toBeNull();
    expect(fixture.componentInstance['pickups']().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('prend par défaut le point du comptoir qui saisit', async () => {
    const { fixture } = mount();
    await settle(fixture);
    expect(fixture.componentInstance['pickupId']()).toBe('b');
  });

  it('note la commande sous une clé d’intention, au total du devis, puis la confirme', async () => {
    const { fixture, place } = mount();
    await settle(fixture);
    const page = fixture.componentInstance;
    page['choose'](JEANNE);
    page['cart'].add({ sku: 'S1', name: 'Baguette', unitPriceMillicents: 100_000 }, 2);
    page['window'].set({ start: '08:00', end: '09:00' });
    fixture.detectChanges();
    TestBed.tick();
    // L'accalmie du devis (400 ms), en vrai temps.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(page['estimateReady']()).toBe(true);

    await page['onPlace']();
    fixture.detectChanges();

    expect(place).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerUserId: 'u1',
        fulfillmentMethod: 'pickup',
        pickupAddressId: 'b',
        expectedTotalCents: 528,
      }),
      expect.any(String),
    );
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-placed]')?.textContent).toContain('CMD-1');
    expect(el.querySelector('[data-placed-link]')?.getAttribute('href')).toBe('/commandes/o1');
  });

  it('ne propose que son rayon, à son TTC — jamais un article réservé aux pros', async () => {
    const { fixture } = mount();
    await settle(fixture);
    fixture.componentInstance['choose'](JEANNE);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance['catalogue']().map((item) => item.sku)).toEqual(['OPEN']);
    expect(el.textContent).toContain('Croissant');
    expect(el.textContent).not.toContain('Pain réservé');
    expect(el.textContent).toContain('0,95');
    expect(el.querySelector('[data-list-prices]')).toBeNull();
  });

  it('sans son rayon, n’ouvre pas la saisie : jamais le catalogue entier en repli', async () => {
    const { fixture } = mount(['handover_counter:read'], () => Promise.reject(new Error('503')));
    await settle(fixture);

    expect(fixture.componentInstance['state']()).toBe('error');
    expect(fixture.componentInstance['catalogue']()).toEqual([]);
  });
});

describe('ParticularOrderPage — offrir la commande (O7c)', () => {
  it('sans le droit d’offrir, la saisie n’en propose rien', async () => {
    const { fixture } = mount();
    await settle(fixture);
    fixture.componentInstance['choose'](JEANNE);
    await settle(fixture);

    expect(fixture.componentInstance['offer']()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-offering]')).toBeNull();
  });

  it('avec le droit, offre par la route offerte : motif, total nul, valeur offerte', async () => {
    const { fixture, place, offeredEstimate, offeredPlace } = mount([
      'handover_counter:read',
      'b2b_offer_order:write',
    ]);
    await settle(fixture);
    const page = fixture.componentInstance;
    page['choose'](JEANNE);
    page['cart'].add({ sku: 'S1', name: 'Baguette', unitPriceMillicents: 100_000 }, 2);
    page['window'].set({ start: '08:00', end: '09:00' });
    const offer = page['offer']();
    offer?.offering.set(true);
    offer?.nature.set('tasting');
    offer?.note.set('Dégustation au salon');
    fixture.detectChanges();
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(offeredEstimate).toHaveBeenCalled();
    expect(page['estimateReady']()).toBe(true);

    await page['onPlace']();
    fixture.detectChanges();

    expect(place).not.toHaveBeenCalled();
    expect(offeredPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerUserId: 'u1',
        offer: { nature: 'tasting', note: 'Dégustation au salon', notifyCustomer: false },
        expectedTotalCents: 0,
      }),
      expect.any(String),
    );
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-placed-offered]')).not.toBeNull();
    expect(el.querySelector('[data-placed]')?.textContent).toContain('5,28');
  });
});
