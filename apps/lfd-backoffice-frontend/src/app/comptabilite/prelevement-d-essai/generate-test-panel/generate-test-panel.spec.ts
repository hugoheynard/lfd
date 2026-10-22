import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CollectionTestDebtorsView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionTestsService } from '../../collection-tests.service';
import { GenerateTestPanel } from './generate-test-panel';

/**
 * Ce que ces cas tiennent : l'échéance proposée est celle du serveur (J + 2
 * jours ouvrés), et le bouton « Exporter le mandat pour la banque » demande
 * le CSV de l'établissement CHOISI, sous un nom qui dit l'essai — un refus
 * s'affiche avec les mots du serveur.
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

class FakeApi {
  readonly asked: string[] = [];
  refusal: string | null = null;
  mandateFile(companyId: string): Promise<Blob> {
    this.asked.push(companyId);
    if (this.refusal !== null) {
      return Promise.reject(
        new HttpErrorResponse({ status: 409, error: { message: this.refusal } }),
      );
    }
    return Promise.resolve(new Blob(['RUM-1;'], { type: 'text/csv' }));
  }
}

function mount(api: FakeApi): ComponentFixture<GenerateTestPanel> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: CollectionTestsService, useValue: api },
      { provide: FoldPanelRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(GenerateTestPanel);
  fixture.componentRef.setInput('data', { tool: TOOL });
  fixture.detectChanges();
  return fixture;
}

function downloads(): string[] {
  const names: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mandat');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return names;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GenerateTestPanel', () => {
  it('propose l’échéance la plus proche du serveur', () => {
    const fixture = mount(new FakeApi());

    expect(fixture.componentInstance['collectionDay']()).toBe(EARLIEST);
    expect(fixture.componentInstance['earliestDay']()).toBe(EARLIEST);
  });

  it('exporte le mandat de l’établissement choisi, seul', async () => {
    const api = new FakeApi();
    const names = downloads();
    const fixture = mount(api);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-export-mandate]',
    );

    expect(button?.textContent).toContain('Exporter le mandat pour la banque');
    await fixture.componentInstance['exportMandate']();

    expect(api.asked).toEqual(['c1']);
    expect(names).toEqual(['ESSAI-mandat-banque-RUM-1.csv']);
  });

  it('affiche le refus du serveur, sans rien télécharger', async () => {
    const api = new FakeApi();
    api.refusal = 'Le mandat RUM-1 ne peut pas partir dans le fichier de la banque.';
    const names = downloads();
    const fixture = mount(api);

    await fixture.componentInstance['exportMandate']();
    fixture.detectChanges();

    expect(names).toEqual([]);
    expect(String(fixture.nativeElement.textContent)).toContain(api.refusal);
  });
});
