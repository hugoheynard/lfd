import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffPermission, UnpaidTransferInvoicesView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { BankTransfersService } from '../../comptabilite/bank-transfers.service';
import { NotifyService } from '../../notify.service';
import { TransferInvoicesCard } from './transfer-invoices-card';

/** Des jours seulement affichés : aucun n'est comparé à l'horloge. */
const VIEW: UnpaidTransferInvoicesView = {
  invoices: [
    {
      invoiceId: 'inv_1',
      number: 'FA-LFD-2026-000001',
      legalEntityId: 'le_1',
      legalEntityName: 'La Folie Douce',
      payerCompanyId: 'co_1',
      payerName: 'Le Bistrot',
      issuedOn: '2026-10-31',
      dueOn: '2026-11-14',
      amountCents: 12_000,
      overdue: true,
      daysLate: 6,
    },
    {
      invoiceId: 'inv_2',
      number: 'FA-LFD-2026-000002',
      legalEntityId: 'le_1',
      legalEntityName: 'La Folie Douce',
      payerCompanyId: 'co_1',
      payerName: 'Le Bistrot',
      issuedOn: '2026-11-15',
      dueOn: '2026-11-30',
      amountCents: 3_455,
      overdue: false,
      daysLate: 0,
    },
  ],
  overdueCents: 12_000,
};

async function boot(
  view: UnpaidTransferInvoicesView,
  permissions: readonly StaffPermission[],
  asked: unknown[] = [],
): Promise<ComponentFixture<TransferInvoicesCard>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: BankTransfersService,
        useValue: {
          unpaid: (filter: unknown) => {
            asked.push(filter);
            return Promise.resolve(view);
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
      { provide: FoldPanelHostService, useValue: { open: () => ({ closed: Promise.resolve() }) } },
    ],
  });
  const fixture = TestBed.createComponent(TransferInvoicesCard);
  fixture.componentRef.setInput('companyId', 'co_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const root = (fixture: ComponentFixture<TransferInvoicesCard>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('TransferInvoicesCard', () => {
  it('liste les factures du payeur, le retard signalé, et le geste pour qui écrit', async () => {
    const asked: unknown[] = [];
    const fixture = await boot(VIEW, ['b2b_accounting:write'], asked);

    expect(asked).toEqual([{ payerCompanyId: 'co_1' }]);
    const text = root(fixture).textContent ?? '';
    expect(text).toContain('FA-LFD-2026-000001');
    expect(text).toContain('1 en retard');
    expect(root(fixture).querySelector('[data-record-transfer]')).not.toBeNull();
  });

  it('sans écriture comptable, la liste sans le geste', async () => {
    const fixture = await boot(VIEW, ['b2b_companies:read']);

    expect(root(fixture).querySelector('[data-transfer-invoices]')).not.toBeNull();
    expect(root(fixture).querySelector('[data-record-transfer]')).toBeNull();
  });

  it('muette pour un payeur sans facture au virement à régler', async () => {
    const fixture = await boot({ invoices: [], overdueCents: 0 }, ['b2b_accounting:write']);

    expect(root(fixture).querySelector('[data-transfer-invoices]')).toBeNull();
  });
});
