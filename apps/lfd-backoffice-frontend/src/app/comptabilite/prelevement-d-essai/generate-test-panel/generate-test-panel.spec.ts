import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CollectionTestDebtorsView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { CollectionTestsService } from '../../collection-tests.service';
import { GenerateTestPanel, defaultSequence } from './generate-test-panel';

/**
 * Ce que ces cas tiennent : l'échéance proposée est celle du serveur (J + 2
 * jours ouvrés), et la séquence proposée d'office. Les téléchargements (RIB,
 * mandat) ont quitté le panneau pour la table des essais le 2026-10-26.
 */

const EARLIEST = '2026-10-26';

const TOOL: CollectionTestDebtorsView = {
  maxAmountCents: 100,
  defaultRemittance: 'ESSAI PRELEVEMENT',
  debtors: [
    {
      companyId: 'c1',
      companyName: 'Folie Douce Val',
      mandate: { reference: 'RUM-1', scheme: 'B2B', paymentType: 'recurrent', ibanLast4: '0143' },
      sequences: ['RCUR', 'FRST'],
      earliestCollectionDay: EARLIEST,
      refusal: null,
    },
  ],
};

/** Le panneau n'appelle le serveur qu'à la génération, que ces cas ne jouent pas. */
class FakeApi {}

function mount(
  api: FakeApi,
  tool: CollectionTestDebtorsView = TOOL,
): ComponentFixture<GenerateTestPanel> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: CollectionTestsService, useValue: api },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(GenerateTestPanel);
  fixture.componentRef.setInput('data', { tool });
  fixture.detectChanges();
  return fixture;
}

describe('GenerateTestPanel', () => {
  it('propose l’échéance la plus proche du serveur', () => {
    const fixture = mount(new FakeApi());

    expect(fixture.componentInstance['collectionDay']()).toBe(EARLIEST);
    expect(fixture.componentInstance['earliestDay']()).toBe(EARLIEST);
  });

  it('propose RCUR d’office, même quand le serveur l’offre en second (D3)', () => {
    const tool: CollectionTestDebtorsView = {
      ...TOOL,
      debtors: TOOL.debtors.map((debtor) => ({ ...debtor, sequences: ['FRST', 'RCUR'] })),
    };
    const fixture = mount(new FakeApi(), tool);

    expect(fixture.componentInstance['sequence']()).toBe('RCUR');
  });

  it('propose la seule séquence d’un mandat ponctuel', () => {
    expect(defaultSequence(['OOFF'])).toBe('OOFF');
    expect(defaultSequence([])).toBeNull();
  });
});
