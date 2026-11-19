import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ChorusInvoiceView, StaffPermission } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { ChorusDepositsService, type ChorusQueue } from '../../chorus-deposits.service';
import { ChorusProPage } from './chorus-pro-page';

const requestedPdfs: string[] = [];

// Des jours seulement affichés : aucun n'est comparé à l'horloge.
const row = (over: Partial<ChorusInvoiceView['chorus']>, number: string): ChorusInvoiceView => ({
  invoiceId: number,
  number,
  legalEntityId: 'le_1',
  legalEntityName: 'La Folie Douce',
  payerCompanyId: 'co_1',
  payerName: 'Régiment de test',
  issuedOn: '2026-11-02',
  totalTtcCents: 12_000,
  budgetCommitmentNumber: '1234567890',
  budgetCommitmentServiceCode: 'SERV1',
  documentAvailable: true,
  chorus: {
    state: 'to_deposit',
    paymentDeadlineDays: 30,
    depositedOn: null,
    rejectedOn: null,
    rejectionReason: null,
    acceptedOn: null,
    effectiveDueOn: null,
    ...over,
  },
});

async function render(
  lists: Record<ChorusQueue, readonly ChorusInvoiceView[]> | 'fail',
  permissions: readonly StaffPermission[],
) {
  TestBed.configureTestingModule({
    imports: [ChorusProPage],
    providers: [
      provideRouter([]),
      {
        provide: ChorusDepositsService,
        useValue: {
          list: (queue: ChorusQueue) =>
            lists === 'fail'
              ? Promise.reject(new Error('down'))
              : Promise.resolve({ invoices: lists[queue] }),
          depositPdf: (invoiceId: string) => {
            requestedPdfs.push(invoiceId);
            return Promise.reject(new Error('pas de téléchargement en test'));
          },
        },
      },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(ChorusProPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ChorusProPage', () => {
  it('la file « À déposer » montre la facture, son engagement et le geste', async () => {
    const page = await render({ 'to-deposit': [row({}, 'FA-1')], deposited: [] }, [
      'b2b_accounting:read',
      'b2b_accounting:write',
    ]);

    expect(page.textContent).toContain('chorus-pro.gouv.fr');
    expect(page.textContent).toContain('Régiment de test');
    expect(page.textContent).toContain('1234567890 · service SERV1');
    expect(page.querySelector('[data-chorus-pdf]')).not.toBeNull();
    expect(page.querySelector('[data-chorus-deposit]')).not.toBeNull();
  });

  it('le PDF à déposer est demandé à la route Chorus, jamais la Factur-X gardée', async () => {
    requestedPdfs.length = 0;
    const page = await render({ 'to-deposit': [row({}, 'FA-1')], deposited: [] }, [
      'b2b_accounting:read',
    ]);

    const button = page.querySelector<HTMLButtonElement>('[data-chorus-pdf]');
    expect(button?.textContent).toContain('PDF à déposer');
    button?.click();
    await Promise.resolve();

    expect(requestedPdfs).toEqual(['FA-1']);
  });

  it('sans le droit d’écrire, aucun geste', async () => {
    const page = await render({ 'to-deposit': [row({}, 'FA-1')], deposited: [] }, [
      'b2b_accounting:read',
    ]);

    expect(page.querySelector('[data-chorus-deposit]')).toBeNull();
    expect(page.querySelector('[data-chorus-pdf]')).not.toBeNull();
  });

  it('une lecture refusée se dit, avec « Réessayer »', async () => {
    const page = await render('fail', ['b2b_accounting:read']);

    expect(page.textContent).toContain('Impossible de lire les factures Chorus');
    expect(page.textContent).toContain('Réessayer');
  });
});
