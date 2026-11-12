import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { LegalEntityView, StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { BankTransfersService } from '../../comptabilite/bank-transfers.service';
import { NotifyService } from '../../notify.service';
import { BankTransferMeans } from './bank-transfer-means';

type EntityFacts = Pick<
  LegalEntityView,
  | 'name'
  | 'creditorAccountLast4'
  | 'creditorAccountHolder'
  | 'creditorBic'
  | 'pendingCreditorAccount'
  | 'collectionDaysAfterClosure'
  | 'preNotificationDays'
>;

const CONFIRMED: EntityFacts = {
  name: 'La Folie Douce',
  creditorAccountLast4: '0189',
  creditorAccountHolder: 'LA FOLIE DOUCE SAS',
  creditorBic: 'AGRIFRPP882',
  pendingCreditorAccount: null,
  collectionDaysAfterClosure: null,
  preNotificationDays: 14,
};

async function boot(entity: EntityFacts): Promise<ComponentFixture<BankTransferMeans>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BankTransferMeans],
    providers: [
      provideRouter([]),
      {
        provide: BankTransfersService,
        useValue: { unpaid: () => Promise.resolve({ invoices: [], overdueCents: 0 }) },
      },
      { provide: FoldPanelHostService, useValue: {} },
      { provide: NotifyService, useValue: { success: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (_: StaffPermission): boolean => true },
      },
    ],
  });
  const fixture = TestBed.createComponent(BankTransferMeans);
  fixture.componentRef.setInput('entity', entity);
  fixture.componentRef.setInput('companyId', 'c1');
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const find = (fixture: ComponentFixture<BankTransferMeans>, selector: string) =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);

describe('BankTransferMeans — ce que le virement demande', () => {
  it('nos coordonnées : le titulaire, le BIC, et l’IBAN par ses quatre derniers caractères', async () => {
    const fixture = await boot(CONFIRMED);
    const said = find(fixture, '[data-transfer-coordinates]')?.textContent ?? '';

    expect(said).toContain('LA FOLIE DOUCE SAS');
    expect(said).toContain('AGRIFRPP882');
    expect(said).toContain('se termine par 0189');
    expect(find(fixture, '[data-transfer-pending-account]')).toBeNull();
  });

  it('l’échéance suit le délai de pré-notification quand l’entité n’en règle pas d’autre', async () => {
    const fixture = await boot(CONFIRMED);
    expect(find(fixture, '[data-transfer-due]')?.textContent).toContain(
      '14 jours après la clôture',
    );
  });

  it('l’échéance suit le délai réglé sur l’entité', async () => {
    const fixture = await boot({ ...CONFIRMED, collectionDaysAfterClosure: 10 });
    expect(find(fixture, '[data-transfer-due]')?.textContent).toContain(
      '10 jours après la clôture',
    );
  });

  it('un compte en attente de confirmation : les factures gardent le confirmé, l’écran le dit', async () => {
    const fixture = await boot({
      ...CONFIRMED,
      pendingCreditorAccount: {
        id: 'pending_1',
        last4: '4321',
        bic: 'AGRIFRPP882',
        holder: 'LA FOLIE DOUCE SAS',
        line1: '',
        line2: '',
        postalCode: '',
        city: '',
        countryCode: 'FR',
        proposedByStaffId: 'staff_1',
        proposedByName: null,
        proposedAt: '2026-11-12T10:00:00.000Z',
      },
    });
    expect(find(fixture, '[data-transfer-pending-account]')).not.toBeNull();
  });

  it('sans compte saisi, l’écran avertit qu’une facture au virement n’aurait pas de coordonnées', async () => {
    const fixture = await boot({ ...CONFIRMED, creditorAccountLast4: '' });
    expect(find(fixture, '[data-transfer-no-account]')).not.toBeNull();
    expect(find(fixture, '[data-transfer-coordinates]')).toBeNull();
  });
});
