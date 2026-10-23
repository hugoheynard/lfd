import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  OrderChangeDetailsView,
  OrderRevisionQuoteView,
  StaffPermission,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { CustomerRequestsInbox } from '../customer-requests-inbox.store';
import { CustomerRequestsService } from '../customer-requests.service';
import { OrderChangeDetails } from './order-change-details';

/** Une demande de modification : l'écart, puis « Appliquer » ou « Refuser » avec un mot. */

const DETAILS: OrderChangeDetailsView = {
  kind: 'order_change',
  orderId: 'o_42',
  orderNumber: 'C-0042',
  baseRevision: 1,
  change: {
    fulfillmentMethod: 'pickup',
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: 'p_1',
    requestedDeliveryDate: '2030-01-02',
    requestedWindow: null,
    note: '',
    lines: [{ sku: 'SKU-1', quantity: 3 }],
  },
  decision: null,
};

const QUOTE: OrderRevisionQuoteView = {
  revision: 1,
  lines: [
    {
      sku: 'SKU-1',
      productName: 'Pain de campagne',
      quantity: 3,
      unitPriceMillicents: 400_000,
      vatRate: 5.5,
      lineTotalCents: 1200,
      priceFrozen: true,
    },
  ],
  subtotalCents: 1200,
  discountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  voucherDiscountCents: 0,
  vatCents: 66,
  totalCents: 1266,
  previousTotalCents: 844,
  differenceCents: 422,
  changes: ['lines'],
};

interface Wire {
  quote: () => Promise<OrderRevisionQuoteView>;
  apply: () => Promise<{ readonly revision: number }>;
}

async function mount(
  details: OrderChangeDetailsView,
  wire: Partial<Wire> = {},
  grants: readonly StaffPermission[] = ['b2b_contact:read', 'b2b_contact:write'],
): Promise<{
  fixture: ComponentFixture<OrderChangeDetails>;
  calls: string[];
  inbox: CustomerRequestsInbox;
}> {
  const calls: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderChangeDetails],
    providers: [
      provideRouter([]),
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => grants.includes(p) } },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: CustomerRequestsService,
        useValue: {
          orderChangeQuote: (id: string) => {
            calls.push(`quote ${id}`);
            return (wire.quote ?? (() => Promise.resolve(QUOTE)))();
          },
          applyOrderChange: (id: string) => {
            calls.push(`apply ${id}`);
            return (wire.apply ?? (() => Promise.resolve({ revision: 2 })))();
          },
          refuseOrderChange: (id: string, reason: string) => {
            calls.push(`refuse ${id} ${reason}`);
            return Promise.resolve();
          },
        } satisfies Pick<
          CustomerRequestsService,
          'orderChangeQuote' | 'applyOrderChange' | 'refuseOrderChange'
        >,
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderChangeDetails);
  fixture.componentRef.setInput('requestId', 'cr_1');
  fixture.componentRef.setInput('details', details);
  await settle(fixture);
  return { fixture, calls, inbox: TestBed.inject(CustomerRequestsInbox) };
}

async function settle(fixture: ComponentFixture<OrderChangeDetails>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const host = (fixture: ComponentFixture<OrderChangeDetails>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function click(fixture: ComponentFixture<OrderChangeDetails>, selector: string): void {
  host(fixture).querySelector<HTMLButtonElement>(`${selector} button, button${selector}`)?.click();
}

describe('OrderChangeDetails', () => {
  it('en attente : lit le devis et montre l’écart, les lignes, ce qui change', async () => {
    const { fixture, calls } = await mount(DETAILS);
    expect(calls).toEqual(['quote cr_1']);
    const text = host(fixture).textContent ?? '';
    expect(host(fixture).querySelector('[data-difference]')?.textContent).toContain('+');
    expect(text).toContain('Pain de campagne');
    expect(text).toContain('prix d’origine');
    expect(host(fixture).querySelector('[data-stale]')).toBeNull();
  });

  it('« Appliquer » applique, puis le dit à la boîte', async () => {
    const { fixture, calls, inbox } = await mount(DETAILS);
    click(fixture, '[data-apply]');
    await settle(fixture);
    expect(calls).toContain('apply cr_1');
    expect(inbox.answered()).toBe(1);
  });

  it('inscrite au plan entre-temps : la phrase du serveur à la place de l’écart, « Appliquer » fermé', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'La commande C-0042 est déjà en préparation.' },
    });
    const { fixture } = await mount(DETAILS, { quote: () => Promise.reject(refusal) });
    expect(host(fixture).querySelector('[data-quote-refusal]')?.textContent).toContain(
      'déjà en préparation',
    );
    expect(host(fixture).querySelector<HTMLButtonElement>('button[data-apply]')?.disabled).toBe(
      true,
    );
  });

  it('modifiée depuis la demande : prévient, « Appliquer » fermé', async () => {
    const { fixture } = await mount(DETAILS, {
      quote: () => Promise.resolve({ ...QUOTE, revision: 2 }),
    });
    expect(host(fixture).querySelector('[data-stale]')).not.toBeNull();
    expect(host(fixture).querySelector<HTMLButtonElement>('button[data-apply]')?.disabled).toBe(
      true,
    );
  });

  it('un refus d’appliquer se dit par la phrase du serveur', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'Commande inscrite.' },
    });
    const { fixture, inbox } = await mount(DETAILS, { apply: () => Promise.reject(refusal) });
    click(fixture, '[data-apply]');
    await settle(fixture);
    expect(host(fixture).querySelector('[data-answer-error]')?.textContent).toContain(
      'Commande inscrite.',
    );
    expect(inbox.answered()).toBe(0);
  });

  it('« Refuser » demande un mot, puis l’envoie', async () => {
    const { fixture, calls, inbox } = await mount(DETAILS);
    click(fixture, '[data-refuse]');
    await settle(fixture);
    const confirm = host(fixture).querySelector<HTMLButtonElement>('button[data-confirm-refuse]');
    expect(confirm?.disabled).toBe(true);
    const area = host(fixture).querySelector('fold-textarea textarea');
    if (!(area instanceof HTMLTextAreaElement)) throw new Error('Champ introuvable.');
    area.value = 'La fournée est lancée.';
    area.dispatchEvent(new Event('input'));
    await settle(fixture);
    confirm?.click();
    await settle(fixture);
    expect(calls).toContain('refuse cr_1 La fournée est lancée.');
    expect(inbox.answered()).toBe(1);
  });

  it('sans droit d’écrire : l’écart, sans bouton', async () => {
    const { fixture } = await mount(DETAILS, {}, ['b2b_contact:read']);
    expect(host(fixture).querySelector('[data-difference]')).not.toBeNull();
    expect(host(fixture).querySelector('button[data-apply]')).toBeNull();
  });

  it('répondue : la réponse, sans devis', async () => {
    const applied = await mount({ ...DETAILS, decision: { kind: 'applied', revision: 2 } });
    expect(applied.calls).toEqual([]);
    expect(host(applied.fixture).querySelector('[data-applied]')?.textContent).toContain(
      'révision 2',
    );
    const refused = await mount({
      ...DETAILS,
      decision: { kind: 'refused', reason: 'Trop tard.' },
    });
    expect(host(refused.fixture).querySelector('[data-refused]')?.textContent).toContain(
      'Trop tard.',
    );
  });
});
