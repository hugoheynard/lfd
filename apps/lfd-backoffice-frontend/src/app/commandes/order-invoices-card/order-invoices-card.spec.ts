import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { IssuedInvoiceSummaryView, OrderInvoicesView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { IssuedInvoicesService } from '../../comptabilite/issued-invoices.service';
import { OrderInvoicesCard } from './order-invoices-card';

/** Des dates seulement affichées : aucune n'est comparée à l'horloge. */
const INVOICE: IssuedInvoiceSummaryView = {
  invoiceId: 'inv_1',
  number: 'FA-2026-000007',
  kind: 'invoice',
  correctedInvoiceNumber: null,
  issuedOn: '2026-09-30',
  dueOn: '2026-09-30',
  period: null,
  totalHtCents: 1_000,
  totalVatCents: 55,
  totalTtcCents: 1_055,
  documentAvailable: true,
};
const CREDIT: IssuedInvoiceSummaryView = {
  ...INVOICE,
  invoiceId: 'cn_1',
  number: 'FA-2026-000008',
  kind: 'credit_note',
  correctedInvoiceNumber: 'FA-2026-000007',
  dueOn: null,
  totalTtcCents: 400,
};

async function boot(
  read: () => Promise<OrderInvoicesView>,
  allowed = true,
): Promise<{ fixture: ComponentFixture<OrderInvoicesCard>; asked: string[] }> {
  const asked: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: IssuedInvoicesService,
        useValue: {
          ofOrder: (orderId: string) => {
            asked.push(orderId);
            return read();
          },
        } satisfies Pick<IssuedInvoicesService, 'ofOrder'>,
      },
      {
        provide: PermissionsStore,
        useValue: { can: () => allowed } satisfies Pick<PermissionsStore, 'can'>,
      },
    ],
  });
  const fixture = TestBed.createComponent(OrderInvoicesCard);
  fixture.componentRef.setInput('orderId', 'o_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, asked };
}

describe('OrderInvoicesCard', () => {
  it('liste la facture et ses avoirs, chacun lié à sa pièce dans la comptabilité', async () => {
    const { fixture } = await boot(() => Promise.resolve({ invoices: [INVOICE, CREDIT] }));
    const element = fixture.nativeElement as HTMLElement;

    const rows = element.querySelectorAll('[data-order-invoice]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe('/comptabilite/factures/inv_1');
    expect(rows[1]?.textContent).toContain('corrige FA-2026-000007');
    expect(rows[1]?.textContent).toContain('4,00');
  });

  it('ne rend rien sans pièce', async () => {
    const { fixture } = await boot(() => Promise.resolve({ invoices: [] }));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-order-invoices]'),
    ).toBeNull();
  });

  it("sans le droit de lecture comptable, n'appelle rien et ne rend rien", async () => {
    const { fixture, asked } = await boot(() => Promise.resolve({ invoices: [INVOICE] }), false);
    expect(asked).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

  it('dit un échec de lecture, et propose de réessayer', async () => {
    const { fixture } = await boot(() => Promise.reject(new Error('500')));
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-order-invoices-error]'),
    ).not.toBeNull();
  });
});
