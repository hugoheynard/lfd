import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type {
  CollectionTestDebtorsView,
  CollectionTestView,
  StaffPermission,
} from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { CollectionTestsService } from '../collection-tests.service';
import { eligibleDebtors } from './generate-test-panel/generate-test-panel';
import { PrelevementDEssaiPage } from './prelevement-d-essai-page';

/**
 * Ce que ces cas tiennent : chaque colonne de la liste rend quelque chose ;
 * « Marqué remboursé » ne s'offre que sur un essai « à rembourser » ; un
 * établissement refusé s'affiche avec les mots du serveur ; sans
 * `collection_test:write`, aucun geste.
 */

const TOOL: CollectionTestDebtorsView = {
  maxAmountCents: 100,
  defaultRemittance: 'ESSAI PRELEVEMENT',
  debtors: [
    {
      companyId: 'c1',
      companyName: 'Folie Douce Val',
      mandate: { reference: 'RUM-1', scheme: 'B2B', paymentType: 'recurrent', ibanLast4: '0143' },
      sequences: ['RCUR', 'FRST'],
      earliestCollectionDay: '2026-11-05',
      refusal: null,
    },
    {
      companyId: 'c2',
      companyName: 'Folie Douce Plage',
      mandate: null,
      sequences: [],
      earliestCollectionDay: null,
      refusal: 'Aucun mandat signé.',
    },
  ],
};

function test(over: Partial<CollectionTestView> = {}): CollectionTestView {
  return {
    id: 't1',
    messageId: 'ESS-T1',
    debtorName: 'Folie Douce Val',
    mandateReference: 'RUM-1',
    scheme: 'B2B',
    sequence: 'FRST',
    amountCents: 42,
    requestedCollectionDay: '2026-11-05',
    remittance: 'ESSAI PRELEVEMENT',
    createdAt: '2026-10-22T08:00:00.000Z',
    createdByName: 'Camille Compta',
    status: 'to_refund',
    bankReturn: null,
    refundedOn: null,
    refundedByName: null,
    ...over,
  };
}

class FakeApi {
  tests: readonly CollectionTestView[] = [
    test(),
    test({ id: 't2', messageId: 'ESS-T2', status: 'awaiting_due_date' }),
  ];
  debtors(): Promise<CollectionTestDebtorsView> {
    return Promise.resolve(TOOL);
  }
  list(): Promise<{ tests: readonly CollectionTestView[] }> {
    return Promise.resolve({ tests: this.tests });
  }
}

async function render(
  permissions: readonly StaffPermission[],
): Promise<ComponentFixture<PrelevementDEssaiPage>> {
  TestBed.configureTestingModule({
    imports: [PrelevementDEssaiPage],
    providers: [
      provideRouter([]),
      { provide: CollectionTestsService, useValue: new FakeApi() },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
      {
        provide: FoldPanelHostService,
        useValue: { open: () => ({ closed: Promise.resolve(undefined) }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PrelevementDEssaiPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<PrelevementDEssaiPage>): string =>
  (fixture.nativeElement as HTMLElement).textContent ?? '';

function buttons(fixture: ComponentFixture<PrelevementDEssaiPage>, label: string): HTMLElement[] {
  const all = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button');
  return Array.from(all).filter((b) => b.textContent?.trim() === label);
}

describe('PrelevementDEssaiPage', () => {
  it('rend chaque colonne : établissement, fichier, montant, échéance, état', async () => {
    const body = text(await render(['collection_test:read']));

    expect(body).toContain('Folie Douce Val');
    expect(body).toContain('ESS-T1');
    expect(body).toContain('FRST');
    expect(body).toContain('0,42');
    expect(body).toContain('À rembourser');
    expect(body).toContain("Avant l'échéance");
  });

  it('dit pourquoi un établissement n’est pas essayable, avec les mots du serveur', async () => {
    const body = text(await render(['collection_test:read']));

    expect(body).toContain('Folie Douce Plage');
    expect(body).toContain('Aucun mandat signé.');
  });

  it('« Marqué remboursé » ne s’offre que sur l’essai « à rembourser »', async () => {
    const fixture = await render(['collection_test:read', 'collection_test:write']);

    expect(buttons(fixture, 'Marqué remboursé')).toHaveLength(1);
    expect(buttons(fixture, 'Télécharger')).toHaveLength(2);
    expect(buttons(fixture, 'Générer un essai')).toHaveLength(1);
  });

  it('sans `collection_test:write`, aucun geste', async () => {
    const fixture = await render(['collection_test:read', 'b2b_accounting:write']);

    expect(buttons(fixture, 'Marqué remboursé')).toHaveLength(0);
    expect(buttons(fixture, 'Télécharger')).toHaveLength(0);
    expect(buttons(fixture, 'Générer un essai')).toHaveLength(0);
  });

  it('seuls les établissements non refusés sont proposés à la génération', () => {
    expect(eligibleDebtors(TOOL).map((debtor) => debtor.companyId)).toEqual(['c1']);
  });
});
