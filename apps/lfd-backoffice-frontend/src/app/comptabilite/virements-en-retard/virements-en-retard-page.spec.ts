import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { UnpaidTransferInvoicesView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { BankTransfersService } from '../bank-transfers.service';
import { VirementsEnRetardPage } from './virements-en-retard-page';

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
  ],
  overdueCents: 12_000,
};

async function render(view: UnpaidTransferInvoicesView, asked: unknown[] = []): Promise<string> {
  TestBed.configureTestingModule({
    imports: [VirementsEnRetardPage],
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
    ],
  });
  const fixture = TestBed.createComponent(VirementsEnRetardPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('VirementsEnRetardPage', () => {
  it('rend chaque colonne des seules factures en retard', async () => {
    const asked: unknown[] = [];
    const text = await render(VIEW, asked);

    expect(asked).toEqual([{ overdueOnly: true }]);
    expect(text).toContain('Le Bistrot');
    expect(text).toContain('FA-LFD-2026-000001');
    expect(text).toContain('La Folie Douce');
    expect(text).toContain('6 j');
    expect(text).toContain('120,00');
  });

  it('sans retard : l’état vide le dit', async () => {
    const text = await render({ invoices: [], overdueCents: 0 });

    expect(text).toContain('Aucun virement en retard');
  });
});
