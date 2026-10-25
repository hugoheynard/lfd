import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { StaffNote } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../notify.service';
import { DeliveryNotesService } from '../delivery-notes.service';
import { OrderDeliveryNotesCard } from './order-delivery-notes-card';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const NOTE: StaffNote = {
  audience: 'staff',
  number: 'BL-1042-1',
  orderId: 'o_1',
  orderReference: 'ORD-1042',
  orderPlacedAt: '2026-09-07T06:00:00.000Z',
  requestedFor: '2026-09-08',
  receivedOn: '2026-09-08',
  customer: { tradeName: 'Trois Ponts', legalName: 'SARL Trois Ponts' },
  fulfillment: {
    method: 'pickup',
    address: null,
    pickupLabel: null,
    window: null,
    contact: null,
    signatureRequired: false,
  },
  note: '',
  issuedAt: '2026-09-08T07:00:00.000Z',
  variant: 'pro',
  customerPhone: null,
  lines: [],
  money: {
    subtotalCents: 1_000,
    discountCents: 0,
    discountAdjustment: null,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    vatCents: 55,
    vatShares: null,
    totalCents: 1_055,
    currency: 'EUR',
    settlement: 'account',
  },
  status: 'handed_over',
  plannedAt: '2026-09-07T20:00:00.000Z',
  preparedAt: '2026-09-08T06:00:00.000Z',
  handedOverAt: '2026-09-08T07:00:00.000Z',
  voidedAt: null,
  reprintNeeded: false,
};

interface Booted {
  readonly fixture: ComponentFixture<OrderDeliveryNotesCard>;
  readonly element: HTMLElement;
}

async function boot(read: () => Promise<readonly StaffNote[]>): Promise<Booted> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DeliveryNotesService,
        useValue: {
          ofOrder: () => read(),
          carrierPdf: () => Promise.resolve(new Blob()),
          clientPdf: () => Promise.resolve(new Blob()),
          openCarrier: () => Promise.resolve(),
        } satisfies Pick<
          DeliveryNotesService,
          'ofOrder' | 'carrierPdf' | 'clientPdf' | 'openCarrier'
        >,
      },
      {
        provide: NotifyService,
        useValue: { error: () => undefined } satisfies Pick<NotifyService, 'error'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderDeliveryNotesCard);
  fixture.componentRef.setInput('orderId', 'o_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('OrderDeliveryNotesCard', () => {
  it('liste chaque BL avec son état, et les deux gestes', async () => {
    const { element } = await boot(() => Promise.resolve([NOTE]));

    const row = element.querySelector('[data-delivery-note="BL-1042-1"]');
    expect(row?.textContent).toContain('Remis');
    expect(row?.querySelector('[data-print-carrier]')).not.toBeNull();
    expect(row?.querySelector('[data-download-client]')).not.toBeNull();
  });

  it("n'offre pas le chiffré d'un BL sans totaux", async () => {
    const { element } = await boot(() => Promise.resolve([{ ...NOTE, money: null }]));

    expect(element.querySelector('[data-print-carrier]')).not.toBeNull();
    expect(element.querySelector('[data-download-client]')).toBeNull();
  });

  it('ne rend rien sans BL', async () => {
    const { element } = await boot(() => Promise.resolve([]));

    expect(element.querySelector('[data-order-delivery-notes]')).toBeNull();
  });

  it("dit l'échec de lecture au lieu d'une carte vide", async () => {
    const { element } = await boot(() => Promise.reject(new Error('500')));

    expect(element.querySelector('[data-order-delivery-notes-error]')).not.toBeNull();
  });

  it('dit « réimprimez-le » sur un BL imprimé puis changé (plan E6, § 14)', async () => {
    const { element } = await boot(() => Promise.resolve([{ ...NOTE, reprintNeeded: true }]));

    expect(element.querySelector('[data-reprint-needed="BL-1042-1"]')?.textContent).toContain(
      'Le bon de livraison a changé depuis son impression — réimprimez-le.',
    );
  });

  it('ne dit rien sur un BL jamais imprimé ou à jour', async () => {
    const { element } = await boot(() => Promise.resolve([NOTE]));

    expect(element.querySelector('[data-reprint-needed]')).toBeNull();
  });
});
