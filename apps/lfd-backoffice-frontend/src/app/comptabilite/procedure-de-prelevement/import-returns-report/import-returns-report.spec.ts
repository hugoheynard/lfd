import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CollectionReturnImportReportView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ImportReturnsReport } from './import-returns-report';

/**
 * Le compte rendu d'un import (Hugo, 2026-10-23) : combien lues, rapprochées,
 * déjà enregistrées, introuvables — et chaque introuvable nommé pour qu'on le
 * cherche.
 */
const REPORT: CollectionReturnImportReportView = {
  format: 'pain002',
  readCount: 4,
  recordedCount: 1,
  alreadyRecordedCount: 1,
  notFound: [
    {
      endToEndId: 'E2E-PERDUE',
      mandateReference: 'RUM-0042',
      amountCents: 12_345,
      returnedOn: '2026-11-17',
    },
  ],
  setAside: [
    {
      endToEndId: 'E2E-ECART',
      mandateReference: null,
      amountCents: 100,
      returnedOn: '2026-11-17',
      problem: 'le montant diffère de celui de la ligne',
    },
  ],
};

async function render(
  report: CollectionReturnImportReportView,
): Promise<ComponentFixture<ImportReturnsReport>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ImportReturnsReport] });
  const fixture = TestBed.createComponent(ImportReturnsReport);
  fixture.componentRef.setInput('report', report);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const host = (fixture: ComponentFixture<ImportReturnsReport>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

describe('le compte rendu d’un import de retours', () => {
  it('dit combien de lignes lues, rapprochées, déjà enregistrées et introuvables', async () => {
    const fixture = await render(REPORT);

    const figure = (key: string): string =>
      host(fixture).querySelector(`[data-report-figure="${key}"]`)?.textContent ?? '';
    expect(figure('read')).toContain('4');
    expect(figure('recorded')).toContain('rapprochées et enregistrées');
    expect(figure('already')).toContain('doublon ignoré');
    expect(figure('not-found')).toContain('1');
  });

  it('nomme chaque introuvable par son EndToEndId, sa RUM et son montant', async () => {
    const fixture = await render(REPORT);

    const text = host(fixture).textContent ?? '';
    expect(text).toContain('E2E-PERDUE');
    expect(text).toContain('RUM-0042');
    expect(text).toContain('123,45');
    expect(host(fixture).querySelector('[data-report-not-found]')).not.toBeNull();
  });

  it('dit pourquoi une transaction rapprochée a été écartée', async () => {
    const fixture = await render(REPORT);

    expect(host(fixture).querySelector('[data-report-set-aside]')?.textContent).toContain(
      'le montant diffère de celui de la ligne',
    );
  });

  it('sans introuvable ni écartée : les chiffres seuls', async () => {
    const fixture = await render({ ...REPORT, notFound: [], setAside: [] });

    expect(host(fixture).querySelector('[data-report-not-found]')).toBeNull();
    expect(host(fixture).querySelector('[data-report-set-aside]')).toBeNull();
  });
});
