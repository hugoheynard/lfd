import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type {
  AdminBackorderView,
  AdminOrderEstimateView,
  DeliveryAddressView,
  DeliveryZoneView,
  StaffPermission,
} from '@lfd/contracts';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryZonesService } from '../../b2b/reglages/delivery-zones.service';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { NotifyService } from '../../notify.service';
import { withFreeDelivery } from '../backorder-words';
import { AdminBackordersService } from '../backorders.service';
import type { OrderEntryCustomer } from '../nouvelle-commande/order-entry-customer';
import { CommercialOrderEntrySource } from '../order-entry-sources';
import { AdminOrdersService } from '../orders.service';
import { BackorderConversionPage } from './backorder-conversion-page';

/** Le temps d'accalmie de l'estimation (400 ms), et un peu plus. */
const AFTER_DEBOUNCE_MS = 450;

const OPEN: AdminBackorderView = {
  id: 'bo_1',
  state: 'open',
  createdAt: '2030-01-10T09:15:00.000Z',
  origin: { orderId: 'ord_1', orderNumber: 'ORD-0042' },
  company: { id: 'co_1', name: 'Café du Port' },
  buyer: { userId: 'u_1', name: 'Léa Martin' },
  lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 3, saleUnit: 'piece' }],
  convertedOrder: null,
  closedAt: null,
};

/** Une adresse du carnet, dans une zone servie : la livraison se résout seule. */
const ADRESSE: DeliveryAddressView = {
  id: 'addr_1',
  label: 'Boutique',
  ligne1: '12 avenue Foch',
  ligne2: '',
  codePostal: '92100',
  ville: 'Boulogne',
  pays: 'France',
  isDefault: true,
  procedureStepCount: 0,
  depositAllowed: false,
  specs: {
    note: '',
    slotList: { mode: 'everyday', slots: [{ start: '07:00', end: '08:00' }] },
    deliveryContact: null,
    gps: null,
    signatureRequired: false,
  },
};

const ZONE_92: DeliveryZoneView = {
  id: 'zone_1',
  label: 'Ouest',
  postalPrefixes: ['92'],
  fee: { mode: 'amount', cents: 800 },
};

const CUSTOMER: OrderEntryCustomer = {
  displayName: 'Café du Port',
  status: 'active',
  settlesOnAccount: true,
  payerIsPublic: false,
  payerIsInHouse: false,
  addresses: [ADRESSE],
  buyers: [
    { userId: 'u_1', firstName: 'Léa', lastName: 'Martin', email: 'lea@exemple.fr', role: 'owner' },
    {
      userId: 'u_2',
      firstName: 'Paul',
      lastName: 'Durand',
      email: 'paul@exemple.fr',
      role: 'orders',
    },
  ],
  preferredPickupId: null,
};

const ESTIMATE: AdminOrderEstimateView = {
  amounts: {
    vatMethod: 'line_ht',
    lines: [],
    subtotalCents: 360,
    discountCents: 0,
    discountTtcCents: null,
    discounts: [],
    deliveryFeeCents: 0,
    deliveryFeeTtcCents: null,
    lateFeeCents: 0,
    lateFeeVatRatePercent: null,
    vatCents: 20,
    vatShares: [],
    pretaxCents: 360,
    totalCents: 380,
  },
  cutoff: null,
  refusal: null,
  warnings: [],
};

interface Mounted {
  readonly fixture: ComponentFixture<BackorderConversionPage>;
  readonly quote: ReturnType<typeof vi.fn>;
  readonly convert: ReturnType<typeof vi.fn>;
  readonly placeOrder: ReturnType<typeof vi.fn>;
  readonly navigate: ReturnType<typeof vi.spyOn>;
}

async function mount(
  backorder: AdminBackorderView | null = OPEN,
  customer: OrderEntryCustomer = CUSTOMER,
): Promise<Mounted> {
  TestBed.resetTestingModule();
  const quote = vi.fn(() => of(ESTIMATE));
  const convert = vi.fn(async () => ({
    id: 'ord_2',
    orderNumber: 'ORD-0099',
    settlement: 'account',
    totalCents: 380,
  }));
  const placeOrder = vi.fn();
  const permissions: readonly StaffPermission[] = ['b2b_place_order:write'];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AdminOrdersService,
        useValue: { byId: vi.fn(async () => ({ backorder })), place: placeOrder },
      },
      { provide: AdminBackordersService, useValue: { quote, convert } },
      {
        provide: CommercialOrderEntrySource,
        useValue: {
          customer: vi.fn(async () => customer),
          deliveryAvailability: vi.fn(async () => ({
            openToB2b: true,
            openToB2c: true,
            windowMode: 'slot',
            updatedAt: null,
            updatedBy: null,
          })),
          keepsAddresses: false,
        },
      },
      { provide: PickupAddressesService, useValue: { listFor: vi.fn(async () => []) } },
      { provide: DeliveryZonesService, useValue: { listFor: vi.fn(async () => [ZONE_92]) } },
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
  const fixture = TestBed.createComponent(BackorderConversionPage);
  fixture.componentRef.setInput('orderId', 'ord_1');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, quote, convert, placeOrder, navigate };
}

/** Le commercial choisit la livraison : la saisie se compose, l'estimation part. */
async function deliver(fixture: ComponentFixture<BackorderConversionPage>): Promise<void> {
  const draft = fixture.componentInstance['draft'];
  draft.method.set('delivery');
  draft.window.set({ start: '07:00', end: '08:00' });
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, AFTER_DEBOUNCE_MS));
  await fixture.whenStable();
  fixture.detectChanges();
}

const el = (f: ComponentFixture<BackorderConversionPage>) => f.nativeElement as HTMLElement;
const text = (f: ComponentFixture<BackorderConversionPage>) =>
  (el(f).textContent ?? '').replace(/\s+/gu, ' ');

describe('BackorderConversionPage — transformer un reliquat', () => {
  it('montre les lignes du reliquat en lecture', async () => {
    const { fixture } = await mount();
    expect(text(fixture)).toContain('Transformer le reliquat de ORD-0042');
    expect(text(fixture)).toContain('3 × Croissant');
    expect(el(fixture).querySelector('lfd-cart-row')).toBeNull();
  });

  it('estime par /quote, sans société ni lignes', async () => {
    const { fixture, quote } = await mount();
    await deliver(fixture);
    expect(quote).toHaveBeenCalled();
    const [id, payload] = quote.mock.lastCall ?? [];
    expect(id).toBe('bo_1');
    expect(payload).toMatchObject({
      buyerUserId: 'u_1',
      settlement: 'account',
      fulfillmentMethod: 'delivery',
    });
    expect(payload).not.toHaveProperty('companyId');
    expect(payload).not.toHaveProperty('lines');
  });

  it('dit « Livraison offerte » dans le récapitulatif, jamais « encore 0 € »', async () => {
    const { fixture } = await mount();
    await deliver(fixture);
    const amounts = el(fixture).querySelector('[data-backorder-amounts]');
    expect(amounts?.textContent).toContain('Livraison offerte');
    expect(text(fixture)).not.toMatch(/encore\s*0/u);
  });

  it('transforme par /convert avec la clé d’intention et le total vu — jamais POST /admin/orders', async () => {
    const { fixture, convert, placeOrder, navigate } = await mount();
    await deliver(fixture);
    el(fixture).querySelector<HTMLButtonElement>('[data-backorder-convert]')?.click();
    fixture.detectChanges();
    const confirm = [...el(fixture).querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => (button.textContent ?? '').trim() === 'Confirmer',
    );
    confirm?.click();
    await fixture.whenStable();

    expect(convert).toHaveBeenCalledTimes(1);
    const [id, payload, intentKey] = convert.mock.lastCall ?? [];
    expect(id).toBe('bo_1');
    expect(payload).toMatchObject({ expectedTotalCents: 380, fulfillmentMethod: 'delivery' });
    expect(typeof intentKey).toBe('string');
    expect(String(intentKey).length).toBeGreaterThan(0);
    expect(placeOrder).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/commandes', 'ord_2']);
  });

  it('propose un autre interlocuteur quand l’acheteur d’origine n’a plus d’accès', async () => {
    const { fixture, quote } = await mount({
      ...OPEN,
      buyer: { userId: 'u_gone', name: 'Ancien' },
    });
    expect(el(fixture).querySelector('[data-origin-buyer-gone]')?.textContent).toContain('Ancien');
    await deliver(fixture);
    expect(quote.mock.lastCall?.[1]).toMatchObject({ buyerUserId: 'u_1' });
  });

  it('refuse d’ouvrir un reliquat déjà fermé ou de particulier', async () => {
    expect(text((await mount({ ...OPEN, state: 'abandoned' })).fixture)).toContain(
      'déjà transformé ou abandonné',
    );
    expect(text((await mount({ ...OPEN, company: null })).fixture)).toContain('particulier');
    expect(text((await mount(null)).fixture)).toContain('n’a pas de reliquat');
  });
});

describe('withFreeDelivery', () => {
  const rows = [
    { key: 'subtotal', label: 'Sous-total HT', value: '3,60 €', strong: false },
    { key: 'total', label: 'Total HT', value: '3,60 €', strong: true },
  ];
  it('pose « Livraison offerte » avant le total, en livraison seulement', () => {
    expect(withFreeDelivery(rows, 'delivery').map((row) => row.key)).toEqual([
      'subtotal',
      'free-delivery',
      'total',
    ]);
    expect(withFreeDelivery(rows, 'pickup')).toBe(rows);
  });
});
