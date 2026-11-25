import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type {
  AdminBackorderView,
  AdminOrderEstimateView,
  PickupAddressView,
  StaffPermission,
} from '@lfd/contracts';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { NotifyService } from '../../notify.service';
import { AdminBackordersService } from '../backorders.service';
import { AdminOrdersService } from '../orders.service';
import { ParticularBackorderConversionPage } from './particular-backorder-conversion-page';

/** Le temps d'accalmie de l'estimation (400 ms), et un peu plus. */
const AFTER_DEBOUNCE_MS = 450;

const OPEN: AdminBackorderView = {
  id: 'bo_1',
  state: 'open',
  createdAt: '2030-01-10T09:15:00.000Z',
  origin: { orderId: 'ord_1', orderNumber: 'ORD-0042' },
  company: null,
  buyer: { userId: 'u_1', name: 'Léa Martin' },
  lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 2, saleUnit: 'piece' }],
  convertedOrder: null,
  closedAt: null,
};

/** Le seul point ouvert aux particuliers : il se choisit seul. */
const LABO: PickupAddressView = {
  id: 'pickup_1',
  label: 'Le Labo',
  ligne1: '5 rue du Four',
  ligne2: '',
  codePostal: '75002',
  ville: 'Paris',
  pays: 'France',
  discounts: { b2b: null, b2c: null },
  opening: { publicOpening: { start: '08:00', end: '10:00' }, proPickup: null },
};

const ESTIMATE: AdminOrderEstimateView = {
  amounts: {
    vatMethod: 'exact_ht',
    lines: [],
    subtotalCents: 300,
    discountCents: 0,
    discountTtcCents: null,
    discounts: [],
    deliveryFeeCents: 0,
    deliveryFeeTtcCents: null,
    lateFeeCents: 0,
    lateFeeVatRatePercent: null,
    vatCents: 17,
    vatShares: [],
    pretaxCents: 300,
    totalCents: 317,
  },
  cutoff: null,
  refusal: null,
  warnings: [],
};

async function mount(
  venue: string | undefined,
  backorder: AdminBackorderView | null = OPEN,
  permissions: readonly StaffPermission[] = ['b2b_place_order:write', 'b2b_offer_order:write'],
) {
  TestBed.resetTestingModule();
  const quote = vi.fn((_id: string, _payload: unknown) => of(ESTIMATE));
  const convertParticular = vi.fn(async (_id: string, _payload: unknown, _key: string) => ({
    id: 'ord_2',
    orderNumber: 'ORD-0099',
    venue: venue === 'offered' ? 'offered' : 'shop_till',
    totalCents: 317,
  }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClientTesting(),
      { provide: AdminOrdersService, useValue: { byId: vi.fn(async () => ({ backorder })) } },
      { provide: AdminBackordersService, useValue: { quote, convertParticular } },
      { provide: PickupAddressesService, useValue: { list: vi.fn(async () => [LABO]) } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      {
        provide: NotifyService,
        useValue: { success: vi.fn(), info: vi.fn(), error: vi.fn(), refused: vi.fn() },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ParticularBackorderConversionPage);
  fixture.componentRef.setInput('orderId', 'ord_1');
  if (venue !== undefined) {
    fixture.componentRef.setInput('venue', venue);
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, quote, convertParticular, navigate };
}

type Fixture = ComponentFixture<ParticularBackorderConversionPage>;
const el = (f: Fixture) => f.nativeElement as HTMLElement;
const text = (f: Fixture) => (el(f).textContent ?? '').replace(/\s+/gu, ' ');

/** Le premier créneau public du point : la saisie se compose, l'estimation part. */
async function pickSlot(fixture: Fixture): Promise<void> {
  const [slot] = fixture.componentInstance['slots']();
  fixture.componentInstance['window'].set(
    slot === undefined ? null : { start: slot.start, end: slot.end },
  );
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, AFTER_DEBOUNCE_MS));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function confirm(fixture: Fixture): Promise<void> {
  el(fixture).querySelector<HTMLButtonElement>('[data-backorder-convert]')?.click();
  fixture.detectChanges();
  [...el(fixture).querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => (button.textContent ?? '').trim() === 'Confirmer')
    ?.click();
  await fixture.whenStable();
}

describe('ParticularBackorderConversionPage — réglée en boutique', () => {
  it('montre les lignes du reliquat en lecture, et le point seul choisi', async () => {
    const { fixture } = await mount(undefined);
    expect(text(fixture)).toContain('Reliquat de ORD-0042 : commande réglée en boutique');
    expect(text(fixture)).toContain('2 × Croissant');
    expect(fixture.componentInstance['pickupId']()).toBe('pickup_1');
  });

  it('estime par /quote avec le venue, sans lignes ni acheteur', async () => {
    const { fixture, quote } = await mount(undefined);
    await pickSlot(fixture);
    const [id, payload] = quote.mock.lastCall ?? [];
    expect(id).toBe('bo_1');
    expect(payload).toMatchObject({ venue: 'shop_till', pickupAddressId: 'pickup_1' });
    expect(payload).not.toHaveProperty('lines');
    expect(payload).not.toHaveProperty('offer');
  });

  it('transforme avec la clé d’intention et le total vu, puis ouvre la commande', async () => {
    const { fixture, convertParticular, navigate } = await mount(undefined);
    await pickSlot(fixture);
    await confirm(fixture);

    expect(convertParticular).toHaveBeenCalledTimes(1);
    const [id, payload, key] = convertParticular.mock.lastCall ?? [];
    expect(id).toBe('bo_1');
    expect(payload).toMatchObject({ venue: 'shop_till', expectedTotalCents: 317 });
    expect(String(key).length).toBeGreaterThan(0);
    expect(navigate).toHaveBeenCalledWith(['/commandes', 'ord_2']);
  });
});

describe('ParticularBackorderConversionPage — offerte', () => {
  it('retient tant que le motif manque, puis le joint au corps', async () => {
    const { fixture, quote } = await mount('offered');
    await pickSlot(fixture);
    expect(text(fixture)).toContain('choisissez sa nature');

    fixture.componentInstance['offerNature'].set('goodwill');
    fixture.componentInstance['offerNote'].set('Le reste');
    await pickSlot(fixture);

    expect(quote.mock.lastCall?.[1]).toMatchObject({
      venue: 'offered',
      offer: { nature: 'goodwill', note: 'Le reste' },
    });
  });

  it('sans le droit d’offrir, l’écran ne s’ouvre pas', async () => {
    const { fixture } = await mount('offered', OPEN, ['b2b_place_order:write']);
    expect(text(fixture)).toContain('droit d’offrir');
  });
});

describe('ParticularBackorderConversionPage — refus d’ouvrir', () => {
  it('un reliquat fermé, ou celui d’une société', async () => {
    expect(text((await mount(undefined, { ...OPEN, state: 'converted' })).fixture)).toContain(
      'déjà transformé ou abandonné',
    );
    expect(
      text((await mount(undefined, { ...OPEN, company: { id: 'c', name: 'C' } })).fixture),
    ).toContain('Transformer');
  });
});
